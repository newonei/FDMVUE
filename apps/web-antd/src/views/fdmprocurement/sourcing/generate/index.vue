<script lang="ts" setup>
import type { SourcingGenerationSelectionDraft } from '../generation-concurrency';

import type { FdmProcurementRequisitionApi } from '#/api/fdmprocurement/requisition';
import type { FdmProcurementSourcingGenerationApi } from '#/api/fdmprocurement/sourcing/generation';
import type { AiGenerationDataSource } from '#/views/fdm-trade-shared/ai-document-generation';

import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { useUserStore } from '@vben/stores';

import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  Input,
  message,
  Radio,
  Select,
  Skeleton,
  Tag,
  Tooltip,
} from 'ant-design-vue';

import { getProcurementRequisition } from '#/api/fdmprocurement/requisition';
import {
  cancelSourcingGeneration,
  getSourcingGenerationJob,
  getSourcingGenerationOptions,
  materializeSourcingGeneration,
  regenerateSourcingGeneration,
  retrySourcingGeneration,
  startSourcingGeneration,
} from '#/api/fdmprocurement/sourcing/generation';
import { useFdmWaimaoAiContext } from '#/views/fdm-trade-shared/ai-assistant/context';
import {
  AiGenerationProgress,
  AiGenerationStartPanel,
  useAiGenerationJob,
  useAiModelCatalog,
} from '#/views/fdm-trade-shared/ai-document-generation';

import {
  eligibilityPresentation,
  scoreDimensions,
  scorePercent,
  usesNeedsConfirmation,
} from '../candidate-presentation';
import SourcingCandidateEvidence from '../components/SourcingCandidateEvidence.vue';
import {
  adaptSourcingGenerationJob,
  adaptSourcingGenerationRules,
  sourcingPlanByToken,
} from '../generation-adapter';
import {
  editSourcingGenerationDraft,
  mergeSourcingGenerationDraft,
  proposalSelectionDraft,
} from '../generation-concurrency';
import {
  sourcingGenerationContextFromQuery,
  sourcingGenerationRunIdFromQuery,
  withSourcingGenerationRunIdQuery,
} from '../generation-route';
import {
  generationCandidateQuantitiesById,
  selectionCandidateFactsFromPrepared,
  validateSourcingGenerationSelection,
} from '../generation-selection';
import { sourcingLineQuantitySummaryFromCandidates } from '../selection-model';

defineOptions({ name: 'FdmProcurementSourcingGenerate' });

type StartCommand =
  | {
      expectedRequisitionVersion: number;
      idempotencyKey: string;
      instruction?: string;
      kind: 'START';
      modelId: string;
      requisitionId: string;
    }
  | {
      expectedVersion: number;
      id: string;
      idempotencyKey: string;
      instruction?: string;
      kind: 'REGENERATE';
      modelId: string;
    };

const AI_PERMISSION_CODES = [
  'fdmprocurement:sourcing:query',
  'fdmprocurement:sourcing:view-sensitive',
  'fdmprocurement:sourcing:select',
  'fdmprocurement:sourcing:ai-generate',
  'fdmdocflow:generation:create',
  'fdmdocflow:generation:retry',
] as const;
const READ_PERMISSION_CODES = [
  'fdmprocurement:sourcing:query',
  'fdmprocurement:sourcing:view-sensitive',
  'fdmdocflow:generation:query',
] as const;

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const { hasAccessByCodes } = useAccess();

const loading = ref(false);
const pageError = ref('');
const optionsError = ref('');
const requisition = ref<FdmProcurementRequisitionApi.Requisition>();
const generationOptions = ref<FdmProcurementSourcingGenerationApi.Options>();
const rawJob = ref<FdmProcurementSourcingGenerationApi.Job>();
const instruction = ref('');
const selectionDraft = ref<SourcingGenerationSelectionDraft>();
const materializing = ref(false);
const rawJobs = new Map<string, FdmProcurementSourcingGenerationApi.Job>();
const commandKeys = new Map<string, string>();
let loadSequence = 0;

const routeContext = computed(() =>
  sourcingGenerationContextFromQuery(route.query),
);
const hasReadPermission = computed(() =>
  READ_PERMISSION_CODES.every((code) => hasAccessByCodes([code])),
);
const hasAiPermission = computed(() =>
  AI_PERMISSION_CODES.every((code) => hasAccessByCodes([code])),
);

function rawJobKey(id: string, version: number | string | undefined) {
  return `${id}:${String(version ?? '')}`;
}

function rememberRawJob(value: FdmProcurementSourcingGenerationApi.Job) {
  rawJobs.set(rawJobKey(value.id, value.version), value);
  return adaptSourcingGenerationJob(value);
}

function numericVersion(value: number | string) {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < 0) {
    throw new TypeError('生成任务版本不是有效的非负安全整数');
  }
  return normalized;
}

const generationDataSource: AiGenerationDataSource<
  StartCommand,
  FdmProcurementSourcingGenerationApi.Proposal
> = {
  async cancel(id, expectedVersion) {
    return rememberRawJob(
      await cancelSourcingGeneration({
        expectedVersion: numericVersion(expectedVersion),
        id,
      }),
    );
  },
  async getJob(id) {
    return rememberRawJob(await getSourcingGenerationJob(id));
  },
  async retry(id, expectedVersion) {
    return rememberRawJob(
      await retrySourcingGeneration({
        expectedVersion: numericVersion(expectedVersion),
        id,
      }),
    );
  },
  async start(command) {
    if (command.kind === 'REGENERATE') {
      return rememberRawJob(await regenerateSourcingGeneration(command));
    }
    const { kind: _kind, ...request } = command;
    return rememberRawJob(await startSourcingGeneration(request));
  },
};

const {
  cancel: cancelGeneration,
  cancelling,
  error: generationError,
  job,
  loading: generationLoading,
  resume,
  retry: retryFailedGeneration,
  start,
  stop,
} = useAiGenerationJob({ dataSource: generationDataSource });

const modelCatalog = useAiModelCatalog({
  actionCode: 'fdmprocurement:sourcing:ai-generate',
  async load() {
    return generationOptions.value?.models || [];
  },
  userIdentity: () => String(userStore.userInfo?.id || 'anonymous'),
});
const models = modelCatalog.compatibleModels;
const selectedModelId = modelCatalog.selectedModelId;
const optionsBlockers = computed(() => [
  ...(generationOptions.value?.facts.blockers || []),
  ...(generationOptions.value?.facts.missingData || []).map((item, index) => ({
    code: `MISSING_DATA_${index + 1}`,
    message: item,
  })),
]);
const readyJob = computed(() =>
  rawJob.value?.status === 'READY' ? rawJob.value : undefined,
);
const readyFacts = computed(() => readyJob.value?.facts || undefined);
const displayFacts = computed(() => {
  if (job.value?.status === 'READY') return readyFacts.value;
  return generationOptions.value?.facts;
});
const displaySourceSnapshotHash = computed(() =>
  job.value?.status === 'READY'
    ? readyJob.value?.sourceSnapshotHash
    : generationOptions.value?.sourceSnapshotHash,
);
const proposal = computed(() => readyJob.value?.proposal || undefined);
const proposalVersion = computed(() => readyJob.value?.proposalVersion);
const ruleIssues = computed(() =>
  adaptSourcingGenerationRules(rawJob.value?.rules || []),
);
const selectionResult = computed(() => {
  if (!selectionDraft.value || !readyFacts.value || !requisition.value) {
    return undefined;
  }
  return validateSourcingGenerationSelection({
    draft: selectionDraft.value,
    facts: readyFacts.value,
    proposal: proposal.value,
    requisition: requisition.value,
  });
});
const canMaterialize = computed(
  () =>
    hasAiPermission.value &&
    readyJob.value?.status === 'READY' &&
    typeof proposalVersion.value === 'number' &&
    Boolean(readyFacts.value && proposal.value && selectionDraft.value) &&
    selectionResult.value?.issues.length === 0 &&
    !materializing.value,
);
const selectedNeedsConfirmation = computed(() => {
  if (!readyFacts.value || !selectionDraft.value) return false;
  return readyFacts.value.candidates.some(
    (candidate) =>
      usesNeedsConfirmation(candidate.eligibilityStatus) &&
      Boolean(
        selectionDraft.value?.quantities[candidate.candidateToken]?.trim(),
      ) &&
      selectionDraft.value?.quantities[candidate.candidateToken] !== '0',
  );
});

useFdmWaimaoAiContext(() => ({
  businessId: routeContext.value?.requisitionId,
  companyId: requisition.value?.companyId,
  context: {
    generation: {
      modelName: rawJob.value?.modelName,
      proposalVersion: rawJob.value?.proposalVersion,
      runId: rawJob.value?.id,
      status: rawJob.value?.status,
    },
    loading: loading.value,
    requisition: requisition.value
      ? {
          id: requisition.value.id,
          itemCount: requisition.value.items.length,
          requisitionNo: requisition.value.requisitionNo,
          status: requisition.value.status,
          version: requisition.value.version,
        }
      : undefined,
    sourcingFacts: displayFacts.value
      ? {
          blockerCount: displayFacts.value.blockers.length,
          candidateCounts: displayFacts.value.candidateCounts,
          comparableCostComplete: displayFacts.value.comparableCostComplete,
          feasiblePlanCount: displayFacts.value.feasiblePlans.length,
          missingDataCount: displayFacts.value.missingData.length,
          warningCount: displayFacts.value.warnings.length,
        }
      : undefined,
  },
  contextMode: 'form',
  entityLabel: requisition.value?.requisitionNo,
  surfaceKey: 'procurement-sourcing',
}));

function errorText(cause: unknown) {
  return cause instanceof Error && cause.message.trim()
    ? cause.message
    : '请求失败，请稍后重试。';
}

function randomKey(scope: string, identity: string) {
  const fingerprint = `${scope}:${identity}`;
  const existing = commandKeys.get(fingerprint);
  if (existing) return existing;
  const suffix =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const created = `procurement:${scope}:${suffix}`.slice(0, 128);
  commandKeys.set(fingerprint, created);
  return created;
}

async function loadPage() {
  const context = routeContext.value;
  const sequence = ++loadSequence;
  stop();
  rawJob.value = undefined;
  job.value = undefined;
  generationError.value = '';
  selectionDraft.value = undefined;
  requisition.value = undefined;
  generationOptions.value = undefined;
  pageError.value = '';
  optionsError.value = '';
  if (!context || !hasReadPermission.value) return;
  loading.value = true;
  try {
    if (hasAiPermission.value) {
      const [source, optionsResult] = await Promise.all([
        getProcurementRequisition(context.requisitionId),
        getSourcingGenerationOptions(
          context.requisitionId,
          context.expectedRequisitionVersion,
        ).then(
          (value) => ({ value }),
          (error: unknown) => ({ error }),
        ),
      ]);
      if (sequence !== loadSequence) return;
      requisition.value = source;
      if ('value' in optionsResult) {
        generationOptions.value = optionsResult.value;
        await modelCatalog.load();
      } else {
        optionsError.value = errorText(optionsResult.error);
      }
    } else {
      requisition.value = await getProcurementRequisition(
        context.requisitionId,
      );
    }
    const runId = sourcingGenerationRunIdFromQuery(route.query);
    if (sequence === loadSequence && runId) await resume(runId);
  } catch (error) {
    if (sequence === loadSequence) pageError.value = errorText(error);
  } finally {
    if (sequence === loadSequence) loading.value = false;
  }
}

async function startGeneration() {
  const context = routeContext.value;
  if (!context || !selectedModelId.value || !hasAiPermission.value) return;
  const identity = [
    context.requisitionId,
    context.expectedRequisitionVersion,
    selectedModelId.value,
    instruction.value.trim(),
    generationOptions.value?.sourceSnapshotHash || '',
  ].join('|');
  await start({
    expectedRequisitionVersion: context.expectedRequisitionVersion,
    idempotencyKey: randomKey('sourcing-generation-start', identity),
    instruction: instruction.value.trim() || undefined,
    kind: 'START',
    modelId: selectedModelId.value,
    requisitionId: context.requisitionId,
  });
}

async function regenerate() {
  const current = rawJob.value;
  if (!current || !selectedModelId.value || !hasAiPermission.value) return;
  const identity = [
    current.id,
    current.version,
    current.proposalVersion || '',
    selectedModelId.value,
    instruction.value.trim(),
  ].join('|');
  await start({
    expectedVersion: current.version,
    id: current.id,
    idempotencyKey: randomKey('sourcing-generation-regenerate', identity),
    instruction: instruction.value.trim() || undefined,
    kind: 'REGENERATE',
    modelId: selectedModelId.value,
  });
}

async function retryGeneration() {
  const status = job.value?.status;
  if (status && !hasAiPermission.value) {
    message.warning('当前只有任务读取权限，不能重试或重生成 AI 寻源');
    return;
  }
  if (status === 'FAILED') {
    await retryFailedGeneration();
    return;
  }
  if (status === 'RULE_BLOCKED') {
    await regenerate();
    return;
  }
  if (['CANCELLED', 'EXPIRED', 'STALE'].includes(status || '')) {
    stop();
    job.value = undefined;
    rawJob.value = undefined;
    selectionDraft.value = undefined;
    await router.replace({
      query: withSourcingGenerationRunIdQuery(route.query, undefined),
    });
    await loadPage();
    return;
  }
  if (job.value?.id) await resume(job.value.id);
}

async function cancelCurrentGeneration() {
  if (!hasAiPermission.value) {
    message.warning('当前只有任务读取权限，不能取消 AI 寻源');
    return;
  }
  await cancelGeneration();
}

function editDraft(
  patch: Partial<
    Omit<SourcingGenerationSelectionDraft, 'bindingKey' | 'origin'>
  >,
) {
  if (!selectionDraft.value) return;
  selectionDraft.value = editSourcingGenerationDraft(
    selectionDraft.value,
    patch,
  );
}

function changeSelectionMode(
  selectionMode: FdmProcurementSourcingGenerationApi.SelectionMode,
) {
  if (!selectionDraft.value || !readyFacts.value) return;
  let selectedPlanToken: string | undefined;
  if (selectionMode === 'AI_PLAN') {
    selectedPlanToken = proposal.value?.recommendedPlanToken;
  } else if (selectionMode === 'SERVER_PLAN') {
    selectedPlanToken = readyFacts.value.feasiblePlans.find(
      (plan) => plan.planToken !== 'NO_AUTOMATIC_PLAN',
    )?.planToken;
  }
  editDraft({ selectedPlanToken, selectionMode });
}

function changePlanToken(value: unknown) {
  editDraft({ selectedPlanToken: value ? String(value) : undefined });
}

function changeCandidateQuantity(candidateToken: string, value: unknown) {
  if (!selectionDraft.value) return;
  editDraft({
    quantities: {
      ...selectionDraft.value.quantities,
      [candidateToken]: String(value ?? ''),
    },
  });
}

function changeReason(value: unknown) {
  editDraft({ reason: String(value ?? '') });
}

function candidateCanAllocate(
  candidate: FdmProcurementSourcingGenerationApi.Candidate,
) {
  const status = eligibilityPresentation(candidate.eligibilityStatus).status;
  if (status === 'ELIGIBLE') return true;
  if (status !== 'NEEDS_CONFIRMATION') return false;
  return readyFacts.value?.policy.needsConfirmationSelectionAllowed !== false;
}

function candidatesForLine(lineToken: string) {
  return (
    readyFacts.value?.candidates.filter(
      (candidate) => candidate.lineToken === lineToken,
    ) || []
  );
}

function sourceLineName(lineToken: string) {
  const line = displayFacts.value?.source.lines.find(
    (item) => item.lineToken === lineToken,
  );
  return line ? `第 ${line.lineNo} 行 · ${line.productName}` : lineToken;
}

function lineQuantitySummary(
  line: FdmProcurementSourcingGenerationApi.SourceLine,
) {
  const facts = readyFacts.value;
  const source = requisition.value;
  const draft = selectionDraft.value;
  const item = source?.items.find(
    (candidate) => String(candidate.id) === String(line.requisitionItemId),
  );
  if (!facts || !source || !draft || !item) {
    return { balanced: false, complete: false };
  }
  return sourcingLineQuantitySummaryFromCandidates(
    facts.candidates.map(selectionCandidateFactsFromPrepared),
    item,
    generationCandidateQuantitiesById(facts, draft.quantities),
  );
}

function totalScoreText(
  candidate: FdmProcurementSourcingGenerationApi.Candidate,
) {
  const score = scorePercent(candidate.totalScore);
  return score === undefined ? '未评分（不是 0 分）' : score.toFixed(2);
}

function displayValue(value: null | number | string | undefined) {
  return value === undefined || value === null || value === ''
    ? '—'
    : String(value);
}

async function materialize() {
  const current = readyJob.value;
  const context = routeContext.value;
  const selection = selectionResult.value;
  if (
    !current ||
    !context ||
    !selection ||
    !canMaterialize.value ||
    typeof current.proposalVersion !== 'number'
  ) {
    return;
  }
  const identity = JSON.stringify({
    allocations: selection.allocations,
    expectedRequisitionVersion: context.expectedRequisitionVersion,
    expectedRunVersion: current.version,
    generationRunId: current.id,
    proposalVersion: current.proposalVersion,
    reason: selection.reason,
    selectedPlanToken: selection.selectedPlanToken,
    selectionMode: selection.selectionMode,
  });
  materializing.value = true;
  try {
    const result = await materializeSourcingGeneration({
      allocations: selection.allocations,
      expectedRequisitionVersion: context.expectedRequisitionVersion,
      expectedRunVersion: current.version,
      generationRunId: current.id,
      idempotencyKey: randomKey('sourcing-materialize', identity),
      proposalVersion: current.proposalVersion,
      reason: selection.reason,
      requisitionId: context.requisitionId,
      selectedPlanToken: selection.selectedPlanToken,
      selectionMode: selection.selectionMode,
    });
    message.success(
      result.created
        ? '供应方案已物化；采购申请仍未提交，请继续人工核对'
        : '该选择已物化，已打开现有供应评估；采购申请仍未提交',
    );
    void router.push({
      path: `/fdmprocurement/sourcing/${result.assessment.id}`,
      query: { requisitionId: context.requisitionId },
    });
  } catch (error) {
    message.error(errorText(error));
  } finally {
    materializing.value = false;
  }
}

function backToRequisition() {
  const context = routeContext.value;
  if (!context) return void router.push('/fdmprocurement/requisition');
  return void router.push(
    `/fdmprocurement/requisition/detail/${context.requisitionId}`,
  );
}

watch(
  job,
  (accepted) => {
    if (!accepted) {
      rawJob.value = undefined;
      return;
    }
    const raw = rawJobs.get(rawJobKey(accepted.id, accepted.version));
    if (!raw) return;
    rawJob.value = raw;
    const routeRunId = sourcingGenerationRunIdFromQuery(route.query);
    if (routeRunId !== raw.id) {
      void router.replace({
        query: withSourcingGenerationRunIdQuery(route.query, raw.id),
      });
    }
    if (
      raw.status === 'READY' &&
      raw.proposal &&
      typeof raw.proposalVersion === 'number'
    ) {
      selectionDraft.value = mergeSourcingGenerationDraft(
        selectionDraft.value,
        proposalSelectionDraft(raw.id, raw.proposalVersion, raw.proposal),
      );
    }
  },
  { immediate: true },
);

watch(
  () => {
    const context = routeContext.value;
    return context
      ? `${context.requisitionId}:${context.expectedRequisitionVersion}`
      : 'invalid';
  },
  () => void loadPage(),
  { immediate: true },
);

onBeforeUnmount(() => {
  ++loadSequence;
  stop();
});
</script>

<template>
  <Page
    :auto-content-height="false"
    description="AI 只能解释并推荐服务端可行 PLAN；资格、分数、报价、汇率和数量始终由后端权威规则决定。"
    title="采购申请 · AI 供应商寻源"
  >
    <template #extra>
      <Button @click="backToRequisition">
        <template #icon><IconifyIcon icon="lucide:arrow-left" /></template>
        返回采购申请
      </Button>
      <Tag color="purple">人工确认后才物化</Tag>
    </template>

    <Skeleton v-if="loading" active :paragraph="{ rows: 16 }" />
    <Alert
      v-else-if="!routeContext"
      description="必须同时携带 requisitionId 和 expectedRequisitionVersion，页面不会猜测来源版本。"
      message="AI 寻源地址无效"
      show-icon
      type="error"
    />
    <Alert
      v-else-if="!hasReadPermission"
      description="需要供应寻源查询和敏感证据查看权限。页面未发起任何来源或任务读取请求。"
      message="无权查看 AI 寻源工作台"
      show-icon
      type="error"
    />
    <Alert v-else-if="pageError" :message="pageError" show-icon type="error">
      <template #action>
        <Button size="small" @click="loadPage">重新读取</Button>
      </template>
    </Alert>

    <div v-else class="sourcing-ai-page">
      <Alert
        v-if="!hasAiPermission"
        description="可以读取已有任务，但启动、重试、重生成、取消和物化还需要 sourcing:select 与 sourcing:ai-generate 权限。"
        message="当前为只读模式"
        show-icon
        type="warning"
      />

      <Alert
        v-if="optionsError"
        :description="optionsError"
        message="当前生成选项读取失败"
        show-icon
        type="error"
      >
        <template #action>
          <Button size="small" @click="loadPage">重新读取</Button>
        </template>
      </Alert>

      <Card v-if="displayFacts" size="small" title="来源申请与冻结策略">
        <div class="source-grid">
          <Descriptions :column="2" bordered size="small">
            <Descriptions.Item label="采购申请">
              {{ displayFacts.source.requisitionNo }} · ID
              {{ displayFacts.source.requisitionId }}
            </Descriptions.Item>
            <Descriptions.Item label="来源状态">
              {{ displayFacts.source.status }} /
              {{ displayFacts.source.validationStatus }} · v{{
                displayFacts.source.version
              }}
            </Descriptions.Item>
            <Descriptions.Item label="公司">
              公司 {{ displayFacts.source.companyId }}
            </Descriptions.Item>
            <Descriptions.Item label="要求日期">
              {{ displayValue(displayFacts.source.requiredDate) }}
            </Descriptions.Item>
            <Descriptions.Item label="冻结策略">
              #{{ displayFacts.policy.id }} · v{{ displayFacts.policy.version }}
              ·
              {{ displayValue(displayFacts.policy.formulaVersion) }}
            </Descriptions.Item>
            <Descriptions.Item label="证据日期">
              {{ displayValue(displayFacts.evidenceDate) }}
            </Descriptions.Item>
            <Descriptions.Item label="供应商上限">
              {{ displayValue(displayFacts.policy.maximumSupplierCount) }} 家 /
              单家
              {{
                displayFacts.policy.maximumSupplierConcentration == null
                  ? '未返回限制'
                  : `${Number(displayFacts.policy.maximumSupplierConcentration) * 100}%`
              }}
            </Descriptions.Item>
            <Descriptions.Item label="需确认候选">
              {{
                displayFacts.policy.needsConfirmationSelectionAllowed === false
                  ? '冻结策略禁止选择'
                  : displayFacts.policy.needsConfirmationSelectionAllowed ===
                      true
                    ? `允许；理由至少 ${displayFacts.policy.overrideReasonMinLength ?? '由服务端校验'} 字`
                    : '旧响应未返回策略；至少填写理由并由服务端最终校验'
              }}
            </Descriptions.Item>
          </Descriptions>
          <div class="hash-evidence">
            <Tooltip :title="displaySourceSnapshotHash">
              <span>来源快照 Hash：{{ displaySourceSnapshotHash }}</span>
            </Tooltip>
            <Tooltip :title="displayFacts.inputHash">
              <span>寻源输入 Hash：{{ displayFacts.inputHash }}</span>
            </Tooltip>
            <Tooltip :title="displayFacts.fullCandidateSetHash">
              <span>候选集合 Hash：{{ displayFacts.fullCandidateSetHash }}</span>
            </Tooltip>
            <Tooltip :title="displayFacts.policy.hash">
              <span>策略 Hash：{{ displayFacts.policy.hash }}</span>
            </Tooltip>
          </div>
        </div>

        <div class="source-lines">
          <article
            v-for="line in displayFacts.source.lines"
            :key="line.lineToken"
            class="source-line"
          >
            <div>
              <Tag color="blue">{{ line.lineToken }}</Tag>
              <strong>第 {{ line.lineNo }} 行 · {{ line.productName }}</strong>
              <span>{{ line.productCode || '无产品编码' }} ·
                {{ line.specification || '无规格' }}</span>
            </div>
            <div>
              <strong>{{ line.requestedQty }} {{ line.purchaseUnit }}</strong>
              <span>× {{ line.unitConversionFactor }} =
                {{ line.requiredBaseQty }} 基础数量</span>
              <span>映射 {{ line.productMappingStatus || '未返回' }}</span>
            </div>
          </article>
        </div>
      </Card>

      <Card v-if="displayFacts" size="small" title="确定性候选与证据">
        <Alert
          v-if="!displayFacts.comparableCostComplete"
          description="页面不会宣称已比较完整到岸成本；报价缺项或不可比项也不会被补成 0。"
          message="完整可比成本证据尚不齐全"
          show-icon
          type="warning"
        />
        <div class="status-counts">
          <div class="status-counts__item status-counts__item--eligible">
            <span>ELIGIBLE</span>
            <strong>{{ displayFacts.candidateCounts.eligible }}</strong>
            <small>可直接选择</small>
          </div>
          <div class="status-counts__item status-counts__item--review">
            <span>NEEDS_CONFIRMATION</span>
            <strong>{{
              displayFacts.candidateCounts.needsConfirmation
            }}</strong>
            <small>按冻结策略人工确认</small>
          </div>
          <div class="status-counts__item status-counts__item--unknown">
            <span>UNKNOWN</span>
            <strong>{{ displayFacts.candidateCounts.unknown }}</strong>
            <small>证据未知，禁止选择</small>
          </div>
          <div class="status-counts__item status-counts__item--blocked">
            <span>INELIGIBLE</span>
            <strong>{{ displayFacts.candidateCounts.ineligible }}</strong>
            <small>硬规则不合格</small>
          </div>
        </div>

        <div class="candidate-list">
          <article
            v-for="candidate in displayFacts.candidates"
            :key="candidate.candidateToken"
            class="candidate-card"
          >
            <header>
              <div>
                <Tag
                  :color="
                    eligibilityPresentation(candidate.eligibilityStatus).color
                  "
                >
                  {{
                    eligibilityPresentation(candidate.eligibilityStatus).label
                  }}
                </Tag>
                <strong>{{ candidate.candidateToken }}</strong>
                <span>{{ sourceLineName(candidate.lineToken) }}</span>
              </div>
              <div class="candidate-score">
                <span>总分</span>
                <strong>{{ totalScoreText(candidate) }}</strong>
              </div>
            </header>
            <div class="candidate-card__body">
              <div class="candidate-facts">
                <span>供应商 {{ candidate.supplierId }}</span>
                <span>供应商产品 {{ candidate.supplierProductId }}</span>
                <span>
                  报价 {{ displayValue(candidate.quotedUnitPrice) }}
                  {{ candidate.currency || '币种未提供' }} /
                  {{ candidate.purchaseUnit || '单位未提供' }}
                </span>
                <span>可比人民币成本
                  {{ displayValue(candidate.comparableUnitCost) }}</span>
                <span>承诺日期 {{ displayValue(candidate.promisedDate) }}</span>
                <span>置信度 {{ displayValue(candidate.confidence) }}</span>
              </div>
              <div class="candidate-constraints">
                <span>MOQ {{ displayValue(candidate.minOrderQty) }}</span>
                <span>包装倍数 {{ displayValue(candidate.packageMultiple) }}</span>
                <span>
                  报价阶梯 {{ displayValue(candidate.quoteTierMinQty) }} –
                  {{ displayValue(candidate.quoteTierMaxQty) }}
                </span>
                <span>最大可分配
                  {{ displayValue(candidate.maxAllocatableQty) }}</span>
                <span>单位换算 ×
                  {{ displayValue(candidate.unitConversionFactor) }}</span>
              </div>
              <div class="dimension-scores">
                <span
                  v-for="dimension in scoreDimensions(candidate)"
                  :key="dimension.key"
                >
                  {{ dimension.label }}：{{
                    dimension.value === undefined ? '未评分' : dimension.value
                  }}
                </span>
                <Tag
                  v-for="code in candidate.evidenceCodes"
                  :key="code"
                  color="green"
                >
                  {{ code }}
                </Tag>
              </div>
              <SourcingCandidateEvidence :candidate="candidate" />
            </div>
          </article>
        </div>
      </Card>

      <Card v-if="displayFacts" size="small" title="服务端确定性可行 PLAN">
        <Empty
          v-if="!displayFacts.feasiblePlans.length"
          :image="Empty.PRESENTED_IMAGE_SIMPLE"
          description="后端未返回可行计划；页面不会自行拼装自动方案"
        />
        <div v-else class="plan-list">
          <article
            v-for="plan in displayFacts.feasiblePlans"
            :key="plan.planToken"
            class="plan-card"
          >
            <header>
              <div>
                <Tag color="cyan">{{ plan.planToken }}</Tag>
                <strong>确定性排名 {{ plan.objectiveRank ?? '未返回' }}</strong>
              </div>
              <span>
                {{
                  displayFacts.comparableCostComplete &&
                  plan.comparableTotalCost != null
                    ? `可比总成本 ${plan.comparableTotalCost}`
                    : '成本不可完整比较'
                }}
                · 最晚承诺 {{ displayValue(plan.latestPromisedDate) }}
              </span>
            </header>
            <div class="plan-allocations">
              <span
                v-for="allocation in plan.allocations"
                :key="`${plan.planToken}:${allocation.lineToken}:${allocation.candidateToken}`"
              >
                {{ allocation.lineToken }} → {{ allocation.candidateToken }} ·
                {{ allocation.quantity }}（基础量
                {{ allocation.allocatedBaseQty }}）
              </span>
            </div>
            <div class="plan-evidence">
              <Tag v-for="code in plan.riskCodes" :key="code">{{ code }}</Tag>
            </div>
          </article>
        </div>
      </Card>

      <div v-if="generationOptions" class="option-notices">
        <Alert
          v-for="warning in generationOptions.facts.warnings"
          :key="warning"
          :message="warning"
          show-icon
          type="warning"
        />
      </div>

      <Alert
        v-if="rawJob?.sourceStale"
        description="服务端拒绝把旧 Run 的 Token 绑定到新候选排序；请重新读取当前采购申请版本后发起新任务。"
        message="来源或冻结证据已经变化"
        show-icon
        type="error"
      />

      <AiGenerationStartPanel
        v-if="!job && generationOptions && hasAiPermission"
        :blockers="optionsBlockers"
        :disabled="generationLoading"
        :instruction="instruction"
        :loading-models="loading"
        :model-error="optionsError || generationError"
        :model-id="selectedModelId"
        :models="models"
        source-description="后端将读取当前采购申请版本、冻结策略、报价、绩效与汇率证据，并生成只含 PLAN token 的建议。"
        :source-title="generationOptions.facts.source.requisitionNo"
        :starting="generationLoading"
        start-label="开始 AI 寻源"
        target-title="供应商计划"
        @reload-models="loadPage"
        @start="startGeneration"
        @update:instruction="instruction = $event"
        @update:model-id="selectedModelId = $event"
      />

      <AiGenerationProgress
        v-else-if="
          job && job.status !== 'READY' && job.status !== 'MATERIALIZED'
        "
        :cancelling="cancelling"
        :error="generationError"
        :job="job"
        source-title="采购申请"
        target-title="供应商计划"
        @cancel="cancelCurrentGeneration"
        @retry="retryGeneration"
      />

      <Alert
        v-else-if="job?.status === 'MATERIALIZED'"
        description="该任务已完成供应评估物化。物化不等于提交采购申请，也不会创建采购订单或 ERP 单据。"
        message="供应方案已经物化"
        show-icon
        type="success"
      />

      <template v-if="job?.status === 'READY'">
        <Alert
          v-if="!readyFacts || !proposal || typeof proposalVersion !== 'number'"
          description="READY 任务必须返回经过 Hash 复核的安全事实、规范化 Proposal 和 proposalVersion；前端不会回退到旧 options 绑定 Token。"
          message="READY 响应不完整，禁止物化"
          show-icon
          type="error"
        />
        <template v-else>
          <Card size="small" title="AI 推荐与逐行解释">
            <Alert
              description="AI 只选择了服务端 PLAN token 并解释原因；资格、分数、报价、汇率和数量没有由模型生成。"
              message="这是建议，不是供应商选择结果"
              show-icon
              type="info"
            />
            <div class="proposal-hero">
              <div>
                <Tag color="purple">
                  推荐 {{ proposal.recommendedPlanToken }}
                </Tag>
                <h3>{{ proposal.summary }}</h3>
                <p>{{ proposal.planReason }}</p>
              </div>
              <div>
                <span>任务 {{ readyJob?.id }} · Proposal v{{
                    proposalVersion
                  }}</span>
                <span>人工编辑绑定
                  {{ selectionDraft?.bindingKey || '尚未建立' }}</span>
                <span v-if="selectionDraft?.origin === 'HUMAN_EDIT'">
                  <Tag color="blue">HUMAN_EDIT 已保护</Tag>
                </span>
              </div>
            </div>
            <div
              v-if="proposal.alternativePlanTokens.length"
              class="alternative-plans"
            >
              <span>AI 备选：</span>
              <Tag v-for="token in proposal.alternativePlanTokens" :key="token">
                {{ token }}
              </Tag>
            </div>
            <div class="line-explanations">
              <article
                v-for="line in proposal.lineExplanations"
                :key="line.lineToken"
              >
                <strong>{{ sourceLineName(line.lineToken) }}</strong>
                <p>{{ line.reason }}</p>
                <div>
                  <Tag
                    v-for="token in line.candidateTokens"
                    :key="token"
                    color="blue"
                  >
                    {{ token }}
                  </Tag>
                  <Tag
                    v-for="code in line.highlightedEvidenceCodes"
                    :key="code"
                    color="green"
                  >
                    {{ code }}
                  </Tag>
                </div>
              </article>
            </div>
            <div v-if="ruleIssues.length" class="rule-issues">
              <Alert
                v-for="issue in ruleIssues"
                :key="`${issue.code}:${issue.fieldKey || ''}`"
                :message="`${issue.code} · ${issue.message}`"
                show-icon
                :type="
                  issue.severity === 'BLOCKER'
                    ? 'error'
                    : issue.severity === 'WARNING'
                      ? 'warning'
                      : 'info'
                "
              />
            </div>
          </Card>

          <Card size="small" title="人工确认物化方式">
            <Radio.Group
              :value="selectionDraft?.selectionMode"
              @update:value="changeSelectionMode($event)"
            >
              <Radio.Button value="AI_PLAN">采用 AI 推荐 PLAN</Radio.Button>
              <Radio.Button value="SERVER_PLAN">选择服务端 PLAN</Radio.Button>
              <Radio.Button value="CUSTOM">人工分配候选</Radio.Button>
            </Radio.Group>

            <div
              v-if="selectionDraft?.selectionMode === 'AI_PLAN'"
              class="selection-panel"
            >
              <strong>{{ proposal.recommendedPlanToken }}</strong>
              <span>
                {{
                  sourcingPlanByToken(readyFacts, proposal.recommendedPlanToken)
                    ? '该 Token 仍属于本次 READY 安全事实'
                    : '该 Token 不属于当前可行计划，禁止物化'
                }}
              </span>
            </div>

            <div
              v-else-if="selectionDraft?.selectionMode === 'SERVER_PLAN'"
              class="selection-panel"
            >
              <Select
                class="plan-select"
                placeholder="选择后端返回的可行 PLAN"
                :value="selectionDraft.selectedPlanToken"
                @update:value="changePlanToken"
              >
                <Select.Option
                  v-for="plan in readyFacts.feasiblePlans"
                  :key="plan.planToken"
                  :value="plan.planToken"
                >
                  {{ plan.planToken }} · {{ plan.allocations.length }} 条分配
                </Select.Option>
              </Select>
              <span>页面不会把候选或数量改写进该 PLAN。</span>
            </div>

            <div
              v-else-if="selectionDraft?.selectionMode === 'CUSTOM'"
              class="custom-selection"
            >
              <Alert
                message="CUSTOM 仍使用相同的资格、MOQ、包装倍数、报价阶梯、容量、集中度和数量守恒校验；服务端会在物化事务中最终重校验。"
                show-icon
                type="info"
              />
              <section
                v-for="line in readyFacts.source.lines"
                :key="line.lineToken"
                class="custom-line"
              >
                <header>
                  <div>
                    <Tag color="blue">{{ line.lineToken }}</Tag>
                    <strong>第 {{ line.lineNo }} 行 · {{ line.productName }}</strong>
                  </div>
                  <div class="quantity-conservation">
                    <span>
                      申请基础量
                      {{
                        lineQuantitySummary(line).requiredBase ??
                        line.requiredBaseQty
                      }}
                    </span>
                    <strong
                      :class="{
                        'quantity-conservation--ok':
                          lineQuantitySummary(line).balanced,
                        'quantity-conservation--warning':
                          !lineQuantitySummary(line).balanced,
                      }"
                    >
                      已分配基础量
                      {{
                        lineQuantitySummary(line).allocatedBase ?? '证据不完整'
                      }}
                    </strong>
                  </div>
                </header>
                <div class="custom-candidates">
                  <label
                    v-for="candidate in candidatesForLine(line.lineToken)"
                    :key="candidate.candidateToken"
                    :class="{
                      'custom-candidate--disabled':
                        !candidateCanAllocate(candidate),
                    }"
                    class="custom-candidate"
                  >
                    <div>
                      <Tag
                        :color="
                          eligibilityPresentation(candidate.eligibilityStatus)
                            .color
                        "
                      >
                        {{
                          eligibilityPresentation(candidate.eligibilityStatus)
                            .label
                        }}
                      </Tag>
                      <strong>{{ candidate.candidateToken }}</strong>
                      <span>供应商 {{ candidate.supplierId }}</span>
                    </div>
                    <div>
                      <span>
                        MOQ {{ displayValue(candidate.minOrderQty) }} · 包装
                        {{ displayValue(candidate.packageMultiple) }} · 可分配
                        {{ displayValue(candidate.maxAllocatableQty) }}
                      </span>
                      <Input
                        :addon-after="
                          candidate.purchaseUnit || line.purchaseUnit
                        "
                        :disabled="!candidateCanAllocate(candidate)"
                        placeholder="0"
                        :value="
                          selectionDraft.quantities[candidate.candidateToken]
                        "
                        @update:value="
                          changeCandidateQuantity(
                            candidate.candidateToken,
                            $event,
                          )
                        "
                      />
                    </div>
                  </label>
                </div>
              </section>
            </div>

            <label class="selection-reason">
              <strong>
                人工确认说明
                <b v-if="selectedNeedsConfirmation">*</b>
              </strong>
              <Input.TextArea
                :auto-size="{ minRows: 3, maxRows: 7 }"
                :maxlength="2000"
                :placeholder="
                  selectedNeedsConfirmation
                    ? readyFacts.policy.overrideReasonMinLength
                      ? `选用了需人工确认候选，至少填写 ${readyFacts.policy.overrideReasonMinLength} 个字符`
                      : '选用了需人工确认候选，必须填写理由；具体规则由服务端最终校验'
                    : '可记录采用或调整方案的人工判断（可选）'
                "
                show-count
                :value="selectionDraft?.reason"
                @update:value="changeReason"
              />
            </label>

            <div v-if="selectionResult?.issues.length" class="selection-issues">
              <Alert
                v-for="issue in selectionResult.issues"
                :key="issue"
                :message="issue"
                show-icon
                type="error"
              />
            </div>

            <div class="materialize-actions">
              <div>
                <strong>物化只会创建并选择供应评估</strong>
                <span>不会提交采购申请，不会发起 BPM，也不会创建采购订单或 ERP
                  单据。</span>
              </div>
              <Button
                :disabled="!canMaterialize"
                :loading="materializing"
                size="large"
                type="primary"
                @click="materialize"
              >
                确认物化供应方案
              </Button>
            </div>
          </Card>

          <Card size="small" title="重新生成建议">
            <div class="regenerate-panel">
              <Select
                v-model:value="selectedModelId"
                :disabled="generationLoading || !hasAiPermission"
                placeholder="选择当前路由可用模型"
              >
                <Select.Option
                  v-for="model in models"
                  :key="model.id"
                  :disabled="!model.enabled"
                  :value="model.id"
                >
                  {{ model.name }} · {{ model.code }}
                </Select.Option>
              </Select>
              <Input
                v-model:value="instruction"
                :maxlength="1000"
                placeholder="本次重生成说明（可选）"
              />
              <Button
                :disabled="!selectedModelId || !hasAiPermission"
                :loading="generationLoading"
                @click="regenerate"
              >
                重生成 Proposal
              </Button>
            </div>
            <p class="regenerate-note">
              已有 HUMAN_EDIT 不会被轮询或新 Proposal 静默覆盖；新 Proposal
              到达后会重新绑定并再次校验 Token。
            </p>
          </Card>
        </template>
      </template>
    </div>
  </Page>
</template>

<style scoped>
.sourcing-ai-page,
.option-notices,
.rule-issues,
.selection-issues {
  display: grid;
  gap: 14px;
}

.source-grid {
  display: grid;
  gap: 12px;
}

.hash-evidence {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px 14px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.hash-evidence span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-lines,
.candidate-list,
.plan-list,
.line-explanations,
.custom-selection,
.custom-candidates {
  display: grid;
  gap: 10px;
}

.source-lines {
  margin-top: 14px;
}

.source-line,
.candidate-card,
.plan-card,
.line-explanations article,
.custom-line,
.selection-panel {
  padding: 12px;
  background: hsl(var(--muted) / 25%);
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.source-line,
.candidate-card header,
.plan-card header,
.custom-line > header,
.materialize-actions,
.proposal-hero {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
}

.source-line > div,
.candidate-card header > div,
.proposal-hero > div,
.materialize-actions > div,
.quantity-conservation {
  display: grid;
  gap: 3px;
}

.source-line span,
.candidate-card span,
.plan-card span,
.proposal-hero span,
.proposal-hero p,
.line-explanations p,
.selection-panel span,
.materialize-actions span,
.regenerate-note,
.custom-candidate span {
  margin: 0;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.status-counts {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-top: 12px;
}

.status-counts__item {
  display: grid;
  gap: 3px;
  padding: 12px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.status-counts__item strong {
  font-size: 24px;
}

.status-counts__item small {
  color: hsl(var(--muted-foreground));
}

.status-counts__item--eligible {
  background: rgb(240 253 244);
}

.status-counts__item--review {
  background: rgb(255 251 235);
}

.status-counts__item--unknown {
  background: rgb(255 247 237);
}

.status-counts__item--blocked {
  background: rgb(254 242 242);
}

.candidate-list,
.plan-list {
  margin-top: 12px;
}

.candidate-score {
  min-width: 145px;
  text-align: right;
}

.candidate-card__body {
  display: grid;
  grid-template-columns: 1fr 1fr 1.2fr minmax(240px, 1.2fr);
  gap: 14px;
  padding-top: 10px;
}

.candidate-facts,
.candidate-constraints,
.dimension-scores,
.plan-allocations {
  display: grid;
  gap: 5px;
}

.dimension-scores span {
  padding: 3px 6px;
  background: hsl(var(--background));
  border-radius: 4px;
}

.plan-evidence,
.alternative-plans,
.line-explanations article > div {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 8px;
}

.proposal-hero {
  padding: 16px 0;
}

.proposal-hero h3 {
  margin: 6px 0 3px;
}

.line-explanations {
  margin-top: 14px;
}

.selection-panel,
.custom-selection,
.selection-reason,
.materialize-actions {
  margin-top: 14px;
}

.selection-panel,
.selection-reason {
  display: grid;
  gap: 8px;
}

.plan-select {
  width: min(520px, 100%);
}

.custom-line > header {
  margin-bottom: 10px;
}

.quantity-conservation {
  text-align: right;
}

.quantity-conservation--ok {
  color: #15803d;
}

.quantity-conservation--warning,
.selection-reason b {
  color: #dc2626;
}

.custom-candidate {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) minmax(300px, 1fr);
  gap: 12px;
  align-items: center;
  padding: 10px;
  background: hsl(var(--background));
  border: 1px solid hsl(var(--border));
  border-radius: 7px;
}

.custom-candidate > div {
  display: grid;
  gap: 5px;
}

.custom-candidate--disabled {
  opacity: 0.68;
}

.selection-issues {
  margin-top: 12px;
}

.materialize-actions {
  padding-top: 14px;
  border-top: 1px solid hsl(var(--border));
}

.regenerate-panel {
  display: grid;
  grid-template-columns: minmax(200px, 0.8fr) minmax(260px, 1.5fr) auto;
  gap: 10px;
}

.regenerate-note {
  margin: 8px 0 0;
}

@media (max-width: 1100px) {
  .candidate-card__body {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .hash-evidence,
  .status-counts,
  .candidate-card__body,
  .custom-candidate,
  .regenerate-panel {
    grid-template-columns: 1fr;
  }

  .quantity-conservation,
  .candidate-score {
    text-align: left;
  }
}
</style>
