<script lang="ts" setup>
import type { FactoryTaskProposalDraft } from '../generation-policy';

import type { FdmWaimaoDemandPlanApi } from '#/api/fdmwaimao/demand-plan';
import type { MesFactorySupplyTaskApi } from '#/api/mes/factory-supply-task';
import type { AiGenerationJob } from '#/views/fdm-trade-shared/ai-document-generation';

import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { useAccess } from '@vben/access';
import { IconifyIcon } from '@vben/icons';
import { useUserStore } from '@vben/stores';

import {
  Alert,
  Button,
  Card,
  Descriptions,
  Divider,
  Drawer,
  Empty,
  Input,
  message,
  Select,
  Skeleton,
  Tag,
} from 'ant-design-vue';

import {
  getFactoryTaskGeneration,
  materializeFactoryTaskGeneration,
  regenerateFactoryTaskGeneration,
  retryFactoryTaskGeneration,
  searchFactoryTaskAiModels,
  startFactoryTaskGeneration,
} from '#/api/mes/factory-supply-task';
import {
  AiGenerationProgress,
  AiGenerationStartPanel,
  AiModelPicker,
  useAiModelCatalog,
} from '#/views/fdm-trade-shared/ai-document-generation';

import {
  atpStatusMeta,
  canGenerateFactorySupplyTask,
  parseFactoryTaskProposal,
  proposalDraft,
  validateFactoryTaskProposalDraft,
} from '../generation-policy';

defineOptions({ name: 'MesFactoryTaskGenerationDrawer' });

const props = defineProps<{
  open: boolean;
  plan?: FdmWaimaoDemandPlanApi.Detail;
}>();
const emit = defineEmits<{
  created: [batchId: string];
  'update:open': [value: boolean];
}>();

const router = useRouter();
const userStore = useUserStore();
const { hasAccessByCodes } = useAccess();
const instruction = ref('');
const run = ref<MesFactorySupplyTaskApi.GenerationDetail>();
const draft = ref<FactoryTaskProposalDraft>();
const overrideReason = ref('');
const loadingRun = ref(false);
const generationError = ref('');
const materializing = ref(false);
const materializeCommand = ref<{ key: string; signature: string }>();
let pollTimer: ReturnType<typeof setTimeout> | undefined;
let requestVersion = 0;

const drawerOpen = computed({
  get: () => props.open,
  set: (value) => emit('update:open', value),
});
const canUse = computed(() =>
  canGenerateFactorySupplyTask(props.plan, (code) => hasAccessByCodes([code])),
);
const modelCatalog = useAiModelCatalog({
  actionCode: 'mes.demand-to-factory-task',
  load: searchFactoryTaskAiModels,
  requiredCapabilities: ['CHAT', 'STRUCTURED_OUTPUT'],
  userIdentity: () => String(userStore.userInfo?.id || 'anonymous'),
});

const stage = computed(() => {
  const values: Partial<
    Record<MesFactorySupplyTaskApi.GenerationStatus, AiGenerationJob['stage']>
  > = {
    CONTEXT_BUILDING: 'EVIDENCE',
    CREATED: 'CONTEXT',
    GENERATING: 'MODEL',
    PARSING: 'PARSING',
    QUEUED: 'CONTEXT',
    VALIDATING: 'VALIDATION',
  };
  return run.value ? values[run.value.status] : undefined;
});
const progressJob = computed<AiGenerationJob | undefined>(() => {
  const value = run.value;
  if (!value) return undefined;
  return {
    errorMessage: value.errorMessage,
    generatedAt: value.completedAt || undefined,
    id: value.runId,
    modelId: value.modelId,
    modelName: modelCatalog.models.value.find(
      (model) => model.id === value.modelId,
    )?.name,
    proposalVersion: value.proposal?.version,
    sourceVersion: value.source.version,
    stage: stage.value,
    status: value.status,
    traceId: value.traceId,
    version: value.version,
  };
});
const ready = computed(
  () => run.value?.status === 'READY' && Boolean(draft.value),
);
const candidateLines = computed(
  () => run.value?.proposal?.evidence.candidateLines || [],
);
const draftValidation = computed(() => {
  if (!run.value || !draft.value || !props.plan) return undefined;
  return validateFactoryTaskProposalDraft({
    detail: run.value,
    draft: draft.value,
    overrideReason: overrideReason.value,
    sourcePlanId: props.plan.id,
    sourcePlanVersion: props.plan.version,
  });
});
const canMaterialize = computed(
  () =>
    canUse.value &&
    ready.value &&
    !materializing.value &&
    draftValidation.value?.issues.length === 0,
);

function clearPoll() {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = undefined;
}

function terminal(status: MesFactorySupplyTaskApi.GenerationStatus) {
  return [
    'CANCELLED',
    'EXPIRED',
    'FAILED',
    'MATERIALIZED',
    'READY',
    'RULE_BLOCKED',
    'STALE',
  ].includes(status);
}

function initializeDraft(value: MesFactorySupplyTaskApi.GenerationDetail) {
  if (value.status !== 'READY') return;
  overrideReason.value = '';
  const parsed = parseFactoryTaskProposal(value.proposal?.normalizedJson);
  if (!parsed) {
    draft.value = undefined;
    generationError.value = '服务端返回的 READY 提案格式无效，已禁止物化。';
    return;
  }
  draft.value = proposalDraft(parsed);
  materializeCommand.value = undefined;
}

async function loadRun(runId: string, version = requestVersion) {
  try {
    const result = await getFactoryTaskGeneration(runId);
    if (version !== requestVersion || !props.open) return;
    run.value = result;
    generationError.value = result.errorMessage?.trim() || '';
    if (terminal(result.status)) {
      loadingRun.value = false;
      initializeDraft(result);
      return;
    }
    pollTimer = setTimeout(() => void loadRun(runId, version), 1200);
  } catch (error) {
    if (version !== requestVersion) return;
    loadingRun.value = false;
    generationError.value =
      error instanceof Error && error.message.trim()
        ? error.message
        : '生成任务读取失败，请稍后重试。';
  }
}

function commandKey(prefix: string) {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`.slice(0, 128);
}

async function start() {
  if (!props.plan || !canUse.value || !modelCatalog.selectedModelId.value)
    return;
  clearPoll();
  const version = ++requestVersion;
  loadingRun.value = true;
  generationError.value = '';
  draft.value = undefined;
  try {
    const ticket = await startFactoryTaskGeneration({
      generationType: 'DEMAND_TO_FACTORY_TASK',
      idempotencyKey: commandKey('factory-task-start'),
      modelId: modelCatalog.selectedModelId.value,
      options: instruction.value.trim()
        ? { instruction: instruction.value.trim() }
        : {},
      source: {
        id: props.plan.id,
        type: 'FULFILLMENT_PLAN',
        version: String(props.plan.version),
      },
    });
    if (version !== requestVersion) return;
    await loadRun(ticket.runId, version);
  } catch (error) {
    if (version !== requestVersion) return;
    loadingRun.value = false;
    generationError.value =
      error instanceof Error && error.message.trim()
        ? error.message
        : 'AI 工厂任务生成启动失败。';
  }
}

async function retry() {
  if (!run.value || !canUse.value) return;
  if (!['FAILED'].includes(run.value.status)) {
    run.value = undefined;
    draft.value = undefined;
    generationError.value = '';
    return;
  }
  clearPoll();
  const version = ++requestVersion;
  loadingRun.value = true;
  try {
    const ticket = await retryFactoryTaskGeneration(
      run.value.runId,
      run.value.version,
    );
    await loadRun(ticket.runId, version);
  } catch (error) {
    loadingRun.value = false;
    generationError.value =
      error instanceof Error ? error.message : '重试生成失败。';
  }
}

async function regenerate() {
  if (!run.value || !canUse.value || !modelCatalog.selectedModelId.value)
    return;
  clearPoll();
  const version = ++requestVersion;
  loadingRun.value = true;
  generationError.value = '';
  draft.value = undefined;
  try {
    const ticket = await regenerateFactoryTaskGeneration(run.value.runId, {
      expectedVersion: run.value.version,
      idempotencyKey: commandKey('factory-task-regenerate'),
      modelId: modelCatalog.selectedModelId.value,
      options: instruction.value.trim()
        ? { instruction: instruction.value.trim() }
        : {},
    });
    await loadRun(ticket.runId, version);
  } catch (error) {
    loadingRun.value = false;
    generationError.value =
      error instanceof Error ? error.message : '重新生成失败。';
  }
}

function updateSelection(
  index: number,
  patch: Partial<FactoryTaskProposalDraft['selections'][number]>,
) {
  const selection = draft.value?.selections[index];
  if (!selection) return;
  Object.assign(selection, patch);
  materializeCommand.value = undefined;
}

function selectedCandidate(lineToken: string, factoryToken: string) {
  return candidateLines.value
    .find((line) => line.lineToken === lineToken)
    ?.candidates.find((candidate) => candidate.factoryToken === factoryToken);
}

function selectableOptions(lineToken: string) {
  return (
    candidateLines.value.find((line) => line.lineToken === lineToken)
      ?.candidates || []
  )
    .filter((candidate) => candidate.selectable)
    .map((candidate) => ({
      label: `${candidate.factoryName || candidate.factoryCode || candidate.factoryToken} · 能力 ${capabilityStatusMeta(candidate.factoryCapabilityStatus).label}/${candidate.factoryCapabilityDecisionCode || '未判定'} · ATP ${candidate.atpAvailableQuantity ?? '未提供'} ${candidate.atpUnit || ''}`,
      value: candidate.factoryToken,
    }));
}

function capabilityStatusMeta(value?: null | string) {
  if (value === 'ELIGIBLE') return { color: 'green', label: '可生产' };
  if (value === 'INELIGIBLE') return { color: 'red', label: '不可生产' };
  if (!value || value === 'UNKNOWN') {
    return { color: 'orange', label: '能力未知' };
  }
  return { color: 'orange', label: value };
}

function capabilityAuthority(
  candidate: MesFactorySupplyTaskApi.FactoryCandidateEvidence,
) {
  const value = candidate.factoryCapabilityEvidence;
  if (!value || !('capabilityId' in value) || !value.capabilityId) {
    return undefined;
  }
  return value as MesFactorySupplyTaskApi.FactoryCapabilityAuthoritySnapshot;
}

function capabilityMissingReason(
  candidate: MesFactorySupplyTaskApi.FactoryCandidateEvidence,
) {
  const value = candidate.factoryCapabilityEvidence;
  if (!value || 'capabilityId' in value) return undefined;
  return value.reason;
}

function capabilityHashMatches(
  candidate: MesFactorySupplyTaskApi.FactoryCandidateEvidence,
) {
  const authority = capabilityAuthority(candidate);
  if (!authority || !candidate.factoryCapabilityAuthorityHash) return undefined;
  return authority.authorityHash === candidate.factoryCapabilityAuthorityHash;
}

function capabilityRequirementGroups(
  authority?: MesFactorySupplyTaskApi.FactoryCapabilityAuthoritySnapshot,
) {
  if (!authority) return [];
  return [
    ['包装支持', authority.supportedPackagingRequirements],
    ['认证支持', authority.supportedCertificationRequirements],
    ['国家合规支持', authority.supportedCountryComplianceRequirements],
    ['客户合规支持', authority.supportedCustomerComplianceRequirements],
  ] as const;
}

async function materialize() {
  if (
    !run.value ||
    !run.value.proposal ||
    !props.plan ||
    !draftValidation.value ||
    draftValidation.value.issues.length > 0 ||
    !canMaterialize.value
  ) {
    return;
  }
  const signature = JSON.stringify({
    proposalVersion: run.value.proposal.version,
    runId: run.value.runId,
    selections: draftValidation.value.selections,
    summary: draftValidation.value.summary,
    overrideReason: draftValidation.value.overrideReason,
  });
  if (materializeCommand.value?.signature !== signature) {
    materializeCommand.value = {
      key: commandKey('factory-task-materialize'),
      signature,
    };
  }
  materializing.value = true;
  try {
    const result = await materializeFactoryTaskGeneration({
      expectedProposalVersion: run.value.proposal.version,
      expectedRunVersion: run.value.version,
      idempotencyKey: materializeCommand.value.key,
      overrideReason: draftValidation.value.overrideReason,
      runId: run.value.runId,
      selections: draftValidation.value.selections,
      sourcePlanId: props.plan.id,
      sourcePlanVersion: props.plan.version,
      summary: draftValidation.value.summary,
    });
    message.success(
      result.created
        ? '工厂供货任务草稿已建立'
        : '已打开同一生成结果建立的任务草稿',
    );
    emit('created', result.batch.id);
    drawerOpen.value = false;
    await router.push(`/mes/factory-supply-task/detail/${result.batch.id}`);
  } finally {
    materializing.value = false;
  }
}

function reset() {
  requestVersion += 1;
  clearPoll();
  run.value = undefined;
  draft.value = undefined;
  loadingRun.value = false;
  generationError.value = '';
  materializeCommand.value = undefined;
  overrideReason.value = '';
}

watch(
  () => props.open,
  async (open) => {
    if (!open) {
      reset();
      return;
    }
    if (!canUse.value) return;
    await modelCatalog.load();
  },
);
onBeforeUnmount(reset);
</script>

<template>
  <Drawer
    v-model:open="drawerOpen"
    class="factory-task-generation-drawer"
    destroy-on-close
    width="min(1180px, 96vw)"
  >
    <template #title>
      <div class="factory-task-generation__title">
        <IconifyIcon icon="lucide:factory" aria-hidden="true" />
        <div>
          <strong>AI 生成内部工厂供货任务</strong>
          <span>{{ plan?.planNo }} · 只建立可审阅的任务草稿</span>
        </div>
      </div>
    </template>

    <Alert
      v-if="!canUse"
      description="需要履约计划已确认、存在正数的内部工厂分配，并同时拥有工厂任务 query/create/ai-generate/update 及单据生成 query/create/retry 权限。"
      message="当前条件或权限不足"
      show-icon
      type="error"
    />

    <div v-else class="factory-task-generation">
      <Alert
        description="产品、SKU、数量、单位、交期、MES 映射和 ATP 上限均由服务端冻结。AI 与人工只能在服务端签发的可用工厂 Token 中选择并补充理由、风险和信心；确认后不会直接下达正式生产工单。"
        message="权威数据不可编辑，物化结果仅为 DRAFT"
        show-icon
        type="info"
      />

      <AiGenerationStartPanel
        v-if="!run && !loadingRun"
        v-model:instruction="instruction"
        v-model:model-id="modelCatalog.selectedModelId.value"
        :disabled="!canUse"
        :loading-models="modelCatalog.loading.value"
        :model-error="modelCatalog.error.value"
        :models="modelCatalog.compatibleModels.value"
        source-description="重新读取当前已确认履约计划、MES SKU 映射、内部工厂准入和 WMS 工厂 ATP，再由所选模型提出工厂选择建议。"
        source-title="已确认履约需求"
        start-label="生成工厂任务建议"
        :starting="loadingRun"
        target-title="内部工厂供货任务"
        @reload-models="modelCatalog.load"
        @start="start"
      />

      <AiGenerationProgress
        v-else-if="!ready"
        :error="generationError"
        :job="progressJob"
        :show-cancel="false"
        source-title="履约需求"
        target-title="工厂供货任务"
        @retry="retry"
      />

      <Skeleton v-if="loadingRun && !run" active :paragraph="{ rows: 12 }" />

      <template v-if="ready && run && draft">
        <section class="factory-task-generation__ready-header">
          <div>
            <Tag color="green">READY</Tag>
            <h2>逐行复核服务端签发的工厂选择</h2>
            <p>
              生成任务 {{ run.runId }} · 提案 v{{ run.proposal?.version }} ·
              来源计划 v{{ run.source.version }}
            </p>
          </div>
          <Tag color="blue">{{ draft.selections.length }} 条内部生产需求</Tag>
        </section>

        <Card size="small" title="方案摘要">
          <Input.TextArea
            v-model:value="draft.summary"
            :auto-size="{ minRows: 2, maxRows: 6 }"
            :maxlength="2000"
            placeholder="记录本次工厂选择的整体说明"
            show-count
            @change="materializeCommand = undefined"
          />
        </Card>

        <Card
          v-for="(selection, index) in draft.selections"
          :key="selection.lineToken"
          class="factory-task-generation__line"
          size="small"
        >
          <template #title>
            <div class="factory-task-generation__line-title">
              <Tag color="blue">{{ selection.lineToken }}</Tag>
              <strong>
                {{
                  candidateLines.find(
                    (line) => line.lineToken === selection.lineToken,
                  )?.productName || '内部生产需求'
                }}
              </strong>
            </div>
          </template>

          <Descriptions :column="4" size="small">
            <Descriptions.Item label="冻结数量">
              {{
                candidateLines.find(
                  (line) => line.lineToken === selection.lineToken,
                )?.quantity
              }}
              {{
                candidateLines.find(
                  (line) => line.lineToken === selection.lineToken,
                )?.unit
              }}
            </Descriptions.Item>
            <Descriptions.Item label="ATP 对比数量">
              {{
                candidateLines.find(
                  (line) => line.lineToken === selection.lineToken,
                )?.capacityQuantity ?? '未提供'
              }}
              {{
                candidateLines.find(
                  (line) => line.lineToken === selection.lineToken,
                )?.capacityUnit || ''
              }}
            </Descriptions.Item>
            <Descriptions.Item label="要求日期">
              {{
                candidateLines.find(
                  (line) => line.lineToken === selection.lineToken,
                )?.requiredDate
              }}
            </Descriptions.Item>
            <Descriptions.Item label="MES 物料">
              {{
                candidateLines.find(
                  (line) => line.lineToken === selection.lineToken,
                )?.mesItemCode ||
                candidateLines.find(
                  (line) => line.lineToken === selection.lineToken,
                )?.mesItemId
              }}
            </Descriptions.Item>
            <Descriptions.Item label="映射版本">
              {{
                candidateLines.find(
                  (line) => line.lineToken === selection.lineToken,
                )?.mesMappingVersion || '未提供'
              }}
            </Descriptions.Item>
            <Descriptions.Item label="单位换算版本">
              {{
                candidateLines.find(
                  (line) => line.lineToken === selection.lineToken,
                )?.unitConversionVersion || '无需换算或未提供'
              }}
            </Descriptions.Item>
          </Descriptions>

          <div class="factory-task-generation__editor-grid">
            <label>
              <strong>选择工厂 <b>*</b></strong>
              <Select
                :options="selectableOptions(selection.lineToken)"
                :value="selection.factoryToken"
                @update:value="
                  updateSelection(index, { factoryToken: String($event) })
                "
              />
            </label>
            <label>
              <strong>信心等级 <b>*</b></strong>
              <Select
                :options="[
                  { label: '高', value: 'HIGH' },
                  { label: '中', value: 'MEDIUM' },
                  { label: '低', value: 'LOW' },
                ]"
                :value="selection.confidence"
                @update:value="
                  updateSelection(index, {
                    confidence: $event as MesFactorySupplyTaskApi.Confidence,
                  })
                "
              />
            </label>
            <label class="factory-task-generation__wide">
              <strong>风险代码</strong>
              <Select
                mode="tags"
                :open="false"
                placeholder="输入大写风险代码并回车，如 DELIVERY_WINDOW"
                :token-separators="[',', ' ']"
                :value="selection.riskCodes"
                @update:value="
                  updateSelection(index, {
                    riskCodes: ($event as string[]).map((item) =>
                      String(item).trim().toUpperCase(),
                    ),
                  })
                "
              />
            </label>
            <label class="factory-task-generation__wide">
              <strong>选择理由</strong>
              <Input.TextArea
                :auto-size="{ minRows: 2, maxRows: 5 }"
                :maxlength="1000"
                placeholder="说明采用或调整工厂的人工判断"
                show-count
                :value="selection.reason"
                @update:value="
                  updateSelection(index, { reason: String($event ?? '') })
                "
              />
            </label>
          </div>

          <Divider orientation="left" plain>候选合规门禁与 ATP 证据</Divider>
          <div class="factory-task-generation__candidates">
            <article
              v-for="candidate in candidateLines.find(
                (line) => line.lineToken === selection.lineToken,
              )?.candidates || []"
              :key="candidate.factoryToken"
              :class="{
                'factory-task-generation__candidate--selected':
                  candidate.factoryToken === selection.factoryToken,
              }"
            >
              <header>
                <div>
                  <strong>
                    {{
                      candidate.factoryName ||
                      candidate.factoryCode ||
                      candidate.factoryToken
                    }}
                  </strong>
                  <span>
                    {{ candidate.factoryCode }} · {{ candidate.factoryToken }}
                  </span>
                </div>
                <div>
                  <Tag
                    :color="
                      capabilityStatusMeta(candidate.factoryCapabilityStatus)
                        .color
                    "
                  >
                    能力
                    {{
                      capabilityStatusMeta(candidate.factoryCapabilityStatus)
                        .label
                    }}
                  </Tag>
                  <Tag :color="atpStatusMeta(candidate.atpStatus).color">
                    {{ atpStatusMeta(candidate.atpStatus).label }}
                  </Tag>
                  <Tag :color="candidate.selectable ? 'green' : 'red'">
                    {{ candidate.selectable ? '可选择' : '不可选择' }}
                  </Tag>
                </div>
              </header>

              <section class="factory-task-generation__capability-gate">
                <div class="factory-task-generation__gate-header">
                  <div>
                    <strong>工厂产品能力合规门禁</strong>
                    <span>
                      {{
                        candidate.factoryCapabilityDecisionCode ||
                        'CAPABILITY_DECISION_MISSING'
                      }}
                    </span>
                  </div>
                  <Tag
                    :color="
                      candidate.factoryCapabilityDecisionCode ===
                      'CAPABILITY_ELIGIBLE'
                        ? 'green'
                        : 'red'
                    "
                  >
                    {{
                      candidate.factoryCapabilityDecisionCode ===
                      'CAPABILITY_ELIGIBLE'
                        ? '合规门禁通过'
                        : '合规门禁未通过'
                    }}
                  </Tag>
                </div>
                <Descriptions :column="3" size="small">
                  <Descriptions.Item label="能力状态">
                    {{
                      capabilityStatusMeta(candidate.factoryCapabilityStatus)
                        .label
                    }}
                  </Descriptions.Item>
                  <Descriptions.Item label="能力版本">
                    v{{ candidate.factoryCapabilityVersion ?? '—' }}
                  </Descriptions.Item>
                  <Descriptions.Item label="直发能力">
                    {{
                      capabilityAuthority(candidate)?.directShipSupported ===
                      true
                        ? '支持'
                        : capabilityAuthority(candidate)
                              ?.directShipSupported === false
                          ? '不支持'
                          : '未提供'
                    }}
                  </Descriptions.Item>
                  <Descriptions.Item label="权威 Hash" :span="3">
                    <span class="factory-task-generation__hash">
                      {{
                        candidate.factoryCapabilityAuthorityHash ||
                        capabilityAuthority(candidate)?.authorityHash ||
                        '未提供'
                      }}
                    </span>
                    <Tag
                      v-if="capabilityHashMatches(candidate) !== undefined"
                      :color="
                        capabilityHashMatches(candidate) ? 'green' : 'red'
                      "
                    >
                      {{
                        capabilityHashMatches(candidate)
                          ? '证据 Hash 一致'
                          : '证据 Hash 不一致'
                      }}
                    </Tag>
                  </Descriptions.Item>
                </Descriptions>

                <details
                  v-if="capabilityAuthority(candidate)"
                  class="factory-task-generation__capability-evidence"
                >
                  <summary>展开能力证据与支持范围</summary>
                  <Descriptions :column="2" size="small">
                    <Descriptions.Item label="能力 / SKU ID">
                      {{ capabilityAuthority(candidate)?.capabilityId }} /
                      {{ capabilityAuthority(candidate)?.productSkuId }}
                    </Descriptions.Item>
                    <Descriptions.Item label="产品版本">
                      {{ capabilityAuthority(candidate)?.productVersionToken }}
                    </Descriptions.Item>
                    <Descriptions.Item label="能力有效期">
                      {{ capabilityAuthority(candidate)?.validFrom }} 至
                      {{
                        capabilityAuthority(candidate)?.validUntil || '长期有效'
                      }}
                    </Descriptions.Item>
                    <Descriptions.Item label="证据有效至">
                      {{ capabilityAuthority(candidate)?.evidenceValidUntil }}
                    </Descriptions.Item>
                    <Descriptions.Item label="证据模式">
                      {{ capabilityAuthority(candidate)?.evidenceMode }}
                    </Descriptions.Item>
                    <Descriptions.Item label="证据时间">
                      {{ capabilityAuthority(candidate)?.evidenceTime }}
                    </Descriptions.Item>
                    <template
                      v-if="
                        capabilityAuthority(candidate)?.evidenceMode ===
                        'AUTHORITATIVE'
                      "
                    >
                      <Descriptions.Item label="权威来源">
                        {{
                          capabilityAuthority(candidate)?.evidenceSourceName ||
                          '未提供'
                        }}
                      </Descriptions.Item>
                      <Descriptions.Item label="来源系统 / 版本">
                        {{
                          capabilityAuthority(candidate)
                            ?.evidenceSourceSystem || '未提供'
                        }}
                        /
                        {{
                          capabilityAuthority(candidate)
                            ?.evidenceSourceVersion || '未提供'
                        }}
                      </Descriptions.Item>
                      <Descriptions.Item label="来源引用" :span="2">
                        {{
                          capabilityAuthority(candidate)?.evidenceSourceRefId ||
                          '未提供'
                        }}
                      </Descriptions.Item>
                    </template>
                    <template v-else>
                      <Descriptions.Item label="人工确认人">
                        {{
                          capabilityAuthority(candidate)?.evidenceByUserId ||
                          '未提供'
                        }}
                      </Descriptions.Item>
                      <Descriptions.Item label="确认说明">
                        {{
                          capabilityAuthority(candidate)?.evidenceNote ||
                          '未提供'
                        }}
                      </Descriptions.Item>
                    </template>
                  </Descriptions>
                  <div class="factory-task-generation__capability-requirements">
                    <div
                      v-for="(
                        [label, values], groupIndex
                      ) in capabilityRequirementGroups(
                        capabilityAuthority(candidate),
                      )"
                      :key="label"
                    >
                      <small>{{ label }}</small>
                      <span v-if="!values.length">未声明</span>
                      <template v-else>
                        <Tag
                          v-for="(value, valueIndex) in values"
                          :key="`${groupIndex}-${valueIndex}-${value}`"
                          color="blue"
                        >
                          {{ value }}
                        </Tag>
                      </template>
                    </div>
                  </div>
                  <Alert
                    description="支持范围与当前履约约束的包含关系由服务端判定；页面展示的是受控权威快照，人工不能改写门禁结论。"
                    message="覆盖判定来源"
                    show-icon
                    type="info"
                  />
                </details>
                <Alert
                  v-else
                  :description="`服务端未返回能力权威：${capabilityMissingReason(candidate) || 'MISSING_AUTHORITY'}`"
                  message="缺少工厂产品能力证据"
                  show-icon
                  type="error"
                />
              </section>

              <Descriptions :column="3" size="small">
                <Descriptions.Item label="可承诺量">
                  {{ candidate.atpAvailableQuantity ?? '未提供' }}
                  {{ candidate.atpUnit || '' }}
                </Descriptions.Item>
                <Descriptions.Item label="已预留">
                  {{ candidate.atpReservedQuantity ?? '未提供' }}
                  {{ candidate.atpUnit || '' }}
                </Descriptions.Item>
                <Descriptions.Item label="有效入库">
                  {{ candidate.atpEligibleInboundQuantity ?? '未提供' }}
                  {{ candidate.atpUnit || '' }}
                </Descriptions.Item>
                <Descriptions.Item label="承诺截止">
                  {{ candidate.atpPromiseThroughDate || '未提供' }}
                </Descriptions.Item>
                <Descriptions.Item label="证据有效期">
                  {{ candidate.atpValidUntil || '未提供' }}
                </Descriptions.Item>
                <Descriptions.Item label="证据版本">
                  {{ candidate.atpSourceSystem || '未提供' }} /
                  {{ candidate.atpSourceVersion || '未提供' }}
                </Descriptions.Item>
                <Descriptions.Item label="产品版本">
                  {{ candidate.atpProductVersionToken || '未提供' }}
                </Descriptions.Item>
                <Descriptions.Item label="发布序列">
                  {{ candidate.atpSourceSequence || '未提供' }}
                </Descriptions.Item>
                <Descriptions.Item label="载荷 Hash">
                  <span class="factory-task-generation__hash">
                    {{ candidate.atpSourcePayloadHash || '未提供' }}
                  </span>
                </Descriptions.Item>
              </Descriptions>
              <small v-if="candidate.decisionCode">
                判定：{{ candidate.decisionCode }}
              </small>
            </article>
          </div>

          <Alert
            v-if="
              !selectedCandidate(selection.lineToken, selection.factoryToken)
                ?.selectable
            "
            message="当前选择不是服务端签发的可用工厂，已禁止物化。"
            show-icon
            type="error"
          />
        </Card>

        <Card size="small" title="确定性规则与物化">
          <div class="factory-task-generation__issues">
            <Alert
              v-for="issue in draftValidation?.issues || []"
              :key="issue"
              :message="issue"
              show-icon
              type="error"
            />
            <Alert
              v-for="rule in run.rules.filter(
                (item) => !item.passed || item.severity !== 'INFO',
              )"
              :key="rule.ruleCode"
              :message="`${rule.ruleCode} · ${rule.message}`"
              show-icon
              :type="rule.passed ? 'success' : 'error'"
            />
            <Empty
              v-if="!(draftValidation?.issues.length || run.rules.length)"
              :image="Empty.PRESENTED_IMAGE_SIMPLE"
              description="没有阻断规则"
            />
          </div>

          <label
            v-if="draftValidation?.hasHumanOverrides"
            class="factory-task-generation__override-reason"
          >
            <strong>人工调整原因 <b>*</b></strong>
            <Input.TextArea
              v-model:value="overrideReason"
              :auto-size="{ minRows: 2, maxRows: 5 }"
              :maxlength="1000"
              placeholder="说明为什么调整 AI 原提案，该内容将连同变更前后值记入审计记录"
              show-count
              @change="materializeCommand = undefined"
            />
          </label>
          <div class="factory-task-generation__materialize">
            <div>
              <strong>人工确认只创建 DRAFT 工厂供货任务</strong>
              <span>
                服务端会重新读取来源、工厂准入、MES 映射和当前
                ATP；不会直接下达正式生产工单。
              </span>
            </div>
            <Button
              :disabled="!canMaterialize"
              :loading="materializing"
              size="large"
              type="primary"
              @click="materialize"
            >
              确认建立任务草稿
            </Button>
          </div>
        </Card>

        <Card size="small" title="重新生成建议">
          <div class="factory-task-generation__regenerate">
            <AiModelPicker
              v-model:model-value="modelCatalog.selectedModelId.value"
              :loading="modelCatalog.loading.value"
              :models="modelCatalog.compatibleModels.value"
            />
            <Input
              v-model:value="instruction"
              :maxlength="1000"
              placeholder="可选：补充新的工厂选择偏好，不能覆盖硬规则"
            />
            <Button :loading="loadingRun" @click="regenerate">
              重新生成
            </Button>
          </div>
        </Card>
      </template>
    </div>
  </Drawer>
</template>

<style scoped>
.factory-task-generation,
.factory-task-generation__issues,
.factory-task-generation__candidates {
  display: grid;
  gap: 14px;
}

.factory-task-generation__title,
.factory-task-generation__line-title,
.factory-task-generation__ready-header,
.factory-task-generation__candidate > header,
.factory-task-generation__materialize {
  display: flex;
  gap: 10px;
  align-items: center;
}

.factory-task-generation__override-reason {
  display: grid;
  gap: 8px;
  margin: 16px 0;
}

.factory-task-generation__override-reason b {
  color: #ff4d4f;
}

.factory-task-generation__title > div,
.factory-task-generation__ready-header > div,
.factory-task-generation__candidate header > div:first-child,
.factory-task-generation__materialize > div {
  display: grid;
  gap: 3px;
}

.factory-task-generation__title span,
.factory-task-generation__ready-header p,
.factory-task-generation__candidate span,
.factory-task-generation__candidate small,
.factory-task-generation__materialize span {
  margin: 0;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.factory-task-generation__ready-header,
.factory-task-generation__candidate > header,
.factory-task-generation__materialize {
  justify-content: space-between;
}

.factory-task-generation__ready-header h2 {
  margin: 6px 0 2px;
  font-size: 20px;
}

.factory-task-generation__editor-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 14px;
}

.factory-task-generation__editor-grid label {
  display: grid;
  gap: 6px;
}

.factory-task-generation__editor-grid b {
  color: #dc2626;
}

.factory-task-generation__wide {
  grid-column: 1 / -1;
}

.factory-task-generation__candidate {
  display: grid;
  gap: 10px;
  padding: 12px;
  background: hsl(var(--muted) / 25%);
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.factory-task-generation__candidate--selected {
  background: rgb(239 246 255);
  border-color: rgb(147 197 253);
}

.factory-task-generation__hash {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  overflow-wrap: anywhere;
}

.factory-task-generation__capability-gate {
  display: grid;
  gap: 10px;
  padding: 10px;
  background: hsl(var(--background));
  border: 1px solid hsl(var(--border));
  border-left: 3px solid #722ed1;
  border-radius: 6px;
}

.factory-task-generation__gate-header,
.factory-task-generation__gate-header > div {
  display: flex;
  gap: 8px;
  align-items: center;
}

.factory-task-generation__gate-header {
  justify-content: space-between;
}

.factory-task-generation__gate-header > div {
  flex-wrap: wrap;
}

.factory-task-generation__capability-evidence summary {
  font-size: 12px;
  color: #1677ff;
  cursor: pointer;
}

.factory-task-generation__capability-evidence > :not(summary) {
  margin-top: 10px;
}

.factory-task-generation__capability-requirements {
  display: grid;
  gap: 7px;
}

.factory-task-generation__capability-requirements > div {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.factory-task-generation__capability-requirements small {
  min-width: 88px;
}

.factory-task-generation__regenerate {
  display: grid;
  grid-template-columns: minmax(240px, 0.8fr) minmax(280px, 1.4fr) auto;
  gap: 10px;
  align-items: start;
}

@media (max-width: 760px) {
  .factory-task-generation__editor-grid,
  .factory-task-generation__regenerate {
    grid-template-columns: 1fr;
  }

  .factory-task-generation__wide {
    grid-column: auto;
  }

  .factory-task-generation__materialize,
  .factory-task-generation__ready-header {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
