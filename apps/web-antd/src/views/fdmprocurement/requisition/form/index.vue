<script lang="ts" setup>
import type { RequisitionDraftFormModel } from '../form-model';

import type { FdmProcurementRequisitionApi } from '#/api/fdmprocurement/requisition';
import type {
  AiFieldStateMap,
  AiGenerationJob,
  AiValidationIssue,
} from '#/views/fdm-trade-shared/ai-document-generation';

import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { useUserStore } from '@vben/stores';

import {
  Alert,
  Button,
  Card,
  Empty,
  Input,
  message,
  Skeleton,
  Tag,
  Tooltip,
} from 'ant-design-vue';

import {
  cancelRequisitionGeneration,
  createRequisitionFromGeneration,
  getProcurementRequisition,
  getRequisitionGenerationJob,
  getRequisitionGenerationOptions,
  preValidateProcurementRequisition,
  regenerateRequisitionGeneration,
  retryRequisitionGeneration,
  startRequisitionGeneration,
  updateProcurementRequisitionDraft,
} from '#/api/fdmprocurement/requisition';
import { useFdmWaimaoAiContext } from '#/views/fdm-trade-shared/ai-assistant/context';
import {
  adoptAiAlternative,
  AiGenerationProgress,
  AiGenerationStartPanel,
  AiGenerationWorkspace,
  createAiFieldStateMap,
  markAiFieldManual,
  mergeAiFieldStateMaps,
  restoreAiField,
  useAiGenerationJob,
  useAiModelCatalog,
} from '#/views/fdm-trade-shared/ai-document-generation';

import RequisitionSourcePlan from '../components/RequisitionSourcePlan.vue';
import { isProcurementVersionConflict } from '../concurrency';
import {
  buildRequisitionMaterializeReq,
  buildRequisitionUpdateReq,
  detailToRequisitionForm,
  mergeRequisitionProposalIntoForm,
  proposalToRequisitionForm,
  requisitionDetailFieldMetas,
  requisitionLineFieldKey,
  setRequisitionDraftFieldValue,
  validateRequisitionDraft,
} from '../form-model';
import {
  adaptRequisitionGenerationJob,
  adaptRequisitionRules,
  completeRequisitionFieldMetas,
} from '../generation-adapter';
import {
  fulfillmentPlanContextFromQuery,
  generationRunIdFromQuery,
  withGenerationRunIdQuery,
} from '../generation-route';

defineOptions({ name: 'FdmProcurementRequisitionForm' });

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const { hasAccessByCodes } = useAccess();

const detail = ref<FdmProcurementRequisitionApi.Requisition>();
const form = ref<RequisitionDraftFormModel>();
const generationOptions = ref<FdmProcurementRequisitionApi.GenerationOptions>();
const rawJob = ref<FdmProcurementRequisitionApi.GenerationJob>();
const fields = ref<AiFieldStateMap>({});
const serverIssues = ref<AiValidationIssue[]>([]);
const validation = ref<FdmProcurementRequisitionApi.ValidationResult>();
const loading = ref(false);
const saving = ref(false);
const validating = ref(false);
const instruction = ref('');
const dirty = ref(false);
const versionConflict = ref(false);
const phase = ref<'GENERATING' | 'READY' | 'START'>('START');
let loadVersion = 0;
let appliedProposalKey = '';

const requisitionId = computed(() => String(route.params.id || ''));
const editing = computed(() => Boolean(requisitionId.value));
const planContext = computed(() =>
  fulfillmentPlanContextFromQuery(route.query),
);
const sourcePlanId = computed(
  () =>
    planContext.value?.fulfillmentPlanId || detail.value?.sourcePlanId || '',
);
const expectedPlanVersion = computed(
  () =>
    planContext.value?.expectedPlanVersion ?? detail.value?.sourcePlanVersion,
);

function hasAllAccess(codes: string[]) {
  return codes.every((code) => hasAccessByCodes([code]));
}

const canGenerate = computed(
  () =>
    !editing.value &&
    hasAllAccess([
      'fdmprocurement:requisition:query',
      'fdmprocurement:requisition:create',
      'fdmprocurement:requisition:ai-generate',
      'fdmdocflow:generation:query',
      'fdmdocflow:generation:create',
      'fdmdocflow:generation:retry',
    ]),
);
const canSave = computed(() =>
  editing.value
    ? hasAccessByCodes(['fdmprocurement:requisition:update'])
    : canGenerate.value,
);
const canPreValidate = computed(
  () =>
    editing.value &&
    !dirty.value &&
    Boolean(form.value?.id) &&
    hasAccessByCodes(['fdmprocurement:requisition:update']),
);

function detailSource(
  value?: FdmProcurementRequisitionApi.Requisition,
): FdmProcurementRequisitionApi.GenerationSource | undefined {
  if (!value) return undefined;
  return {
    companyId: value.companyId,
    fulfillmentPlanId: value.sourcePlanId,
    fulfillmentPlanNo: value.sourcePlanId,
    lines: value.items.map((item) => ({
      customizationSnapshot:
        item.customizationSnapshot || item.customization || '',
      externalPurchaseQuantity: item.requestedQty,
      lineNo: item.lineNo,
      productCode: item.productCode,
      productId: item.productId,
      productMappingStatus: item.productMappingStatus,
      productName: item.productName,
      productVersionToken: item.productVersionToken,
      requiredDate: item.requiredDate,
      skuId: item.skuId,
      sourceContractLineId: item.sourceContractLineId,
      sourcePlanLineId: item.sourcePlanLineId,
      specification: item.specification,
      unit: item.purchaseUnit || '',
    })),
    orderId: value.sourceOrderId,
    requiredDate: value.requiredDate,
    sourceSnapshotHash: value.sourceSnapshotHash,
    status: 'CONFIRMED',
    version: value.sourcePlanVersion,
  };
}

const source = computed(
  () => generationOptions.value?.source || detailSource(detail.value),
);

useFdmWaimaoAiContext(() => ({
  businessId: requisitionId.value || sourcePlanId.value || undefined,
  companyId: detail.value?.companyId || source.value?.companyId || undefined,
  context: {
    draft: {
      editing: editing.value,
      itemCount: form.value?.lines.length || 0,
      status: detail.value?.status,
      version: detail.value?.version,
    },
    generation: {
      missingDataCount: generationOptions.value?.missingData.length || 0,
      runId: rawJob.value?.id,
      status: rawJob.value?.status,
    },
    loading: loading.value,
    source: source.value
      ? {
          fulfillmentPlanId: source.value.fulfillmentPlanId,
          lineCount: source.value.lines.length,
          status: source.value.status,
          version: source.value.version,
        }
      : undefined,
  },
  contextMode: 'form',
  entityLabel:
    detail.value?.requisitionNo || source.value?.fulfillmentPlanNo || undefined,
  surfaceKey: 'procurement-requisition',
}));

const modelCatalog = useAiModelCatalog({
  actionCode: 'fdmprocurement:requisition:ai-generate',
  async load() {
    const context = planContext.value;
    if (!context) throw new Error('缺少来源履约计划与版本。');
    const result = await getRequisitionGenerationOptions(
      context.fulfillmentPlanId,
      context.expectedPlanVersion,
    );
    if (
      result.source.fulfillmentPlanId !== context.fulfillmentPlanId ||
      result.source.version !== context.expectedPlanVersion
    ) {
      throw new Error('服务端返回的履约计划与当前页面不一致。');
    }
    generationOptions.value = result;
    return result.models.map((model) => ({
      ...model,
      enabled: model.enabled !== false,
    }));
  },
  userIdentity: () => String(userStore.userInfo?.id || 'anonymous'),
});

type GenerationCommand =
  | {
      data: FdmProcurementRequisitionApi.GenerationRegenerateReq;
      type: 'REGENERATE';
    }
  | {
      data: FdmProcurementRequisitionApi.GenerationStartReq;
      type: 'START';
    };

function recordRawJob(result: FdmProcurementRequisitionApi.GenerationJob) {
  if (
    sourcePlanId.value &&
    (result.sourceId !== sourcePlanId.value ||
      Number(result.sourceVersion) !== expectedPlanVersion.value)
  ) {
    throw new Error('生成任务与当前履约计划或版本不匹配。');
  }
  rawJob.value = result;
  return adaptRequisitionGenerationJob(result);
}

async function rememberGenerationRun(id?: string) {
  await router.replace({
    query: withGenerationRunIdQuery(route.query, id),
  });
}

const generation = useAiGenerationJob<
  GenerationCommand,
  FdmProcurementRequisitionApi.GenerationProposal
>({
  dataSource: {
    async cancel(id, expectedVersion) {
      return recordRawJob(
        await cancelRequisitionGeneration({
          expectedVersion: Number(expectedVersion),
          id,
        }),
      );
    },
    async getJob(id) {
      return recordRawJob(await getRequisitionGenerationJob(id));
    },
    async retry(id, expectedVersion) {
      return recordRawJob(
        await retryRequisitionGeneration({
          expectedVersion: Number(expectedVersion),
          id,
        }),
      );
    },
    async start(command) {
      const result =
        command.type === 'REGENERATE'
          ? await regenerateRequisitionGeneration(command.data)
          : await startRequisitionGeneration(command.data);
      await rememberGenerationRun(result.id);
      return recordRawJob(result);
    },
  },
});

const generationJob = computed(
  () =>
    generation.job.value as
      | AiGenerationJob<FdmProcurementRequisitionApi.GenerationProposal>
      | undefined,
);
const startBlockers = computed(() => {
  const blockers: Array<{ code: string; message: string }> = [];
  if (!canGenerate.value) {
    blockers.push({
      code: 'NO_PERMISSION',
      message: '当前账号缺少采购申请查询、创建或 AI 生成权限。',
    });
  }
  const options = generationOptions.value;
  if (!options) return blockers;
  if (options.source.status !== 'CONFIRMED') {
    blockers.push({
      code: 'SOURCE_NOT_CONFIRMED',
      message: '只能从已确认的履约计划生成采购申请。',
    });
  }
  if (options.existingDraft) {
    blockers.push({
      code: 'EXISTING_REQUISITION',
      message: `该履约计划已存在采购申请 ${options.existingDraft.requisitionNo}，不会重复创建。`,
    });
  }
  return blockers;
});
const clientIssues = computed(() =>
  form.value ? validateRequisitionDraft(form.value) : [],
);
const allIssues = computed(() => [
  ...clientIssues.value,
  ...serverIssues.value,
]);

function idempotencyKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replaceAll(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function isEditableStatus(
  status?: FdmProcurementRequisitionApi.RequisitionStatus,
) {
  return status === 'DRAFT' || status === 'DATA_INCOMPLETE';
}

async function load() {
  const version = ++loadVersion;
  generation.stop();
  loading.value = true;
  detail.value = undefined;
  form.value = undefined;
  generationOptions.value = undefined;
  rawJob.value = undefined;
  fields.value = {};
  serverIssues.value = [];
  validation.value = undefined;
  versionConflict.value = false;
  dirty.value = false;
  appliedProposalKey = '';
  try {
    if (editing.value) {
      const result = await getProcurementRequisition(requisitionId.value);
      if (version !== loadVersion) return;
      if (!isEditableStatus(result.status)) {
        message.warning('只有草稿或资料不完整的采购申请可以编辑。');
        await router.replace(`/fdmprocurement/requisition/detail/${result.id}`);
        return;
      }
      detail.value = result;
      form.value = detailToRequisitionForm(result);
      fields.value = createAiFieldStateMap(requisitionDetailFieldMetas(result));
      phase.value = 'READY';
      return;
    }

    if (!planContext.value) return;
    phase.value = 'START';
    await modelCatalog.load();
    if (version !== loadVersion) return;
    const runId = generationRunIdFromQuery(route.query);
    if (runId) {
      phase.value = 'GENERATING';
      await generation.resume(runId);
      if (!rawJob.value) await rememberGenerationRun();
    }
  } catch (error) {
    message.error(
      error instanceof Error ? error.message : '采购申请页面加载失败。',
    );
  } finally {
    if (version === loadVersion) loading.value = false;
  }
}

async function startGeneration() {
  const context = planContext.value;
  const modelId = modelCatalog.selectedModelId.value;
  if (!context || !modelId || startBlockers.value.length > 0) return;
  serverIssues.value = [];
  phase.value = 'GENERATING';
  if (rawJob.value && ['READY', 'RULE_BLOCKED'].includes(rawJob.value.status)) {
    const current = await getRequisitionGenerationJob(rawJob.value.id);
    await generation.start({
      data: {
        expectedVersion: current.version,
        id: current.id,
        idempotencyKey: idempotencyKey(),
        instruction: instruction.value.trim() || undefined,
        modelId,
      },
      type: 'REGENERATE',
    });
    return;
  }
  rawJob.value = undefined;
  await generation.start({
    data: {
      expectedPlanVersion: context.expectedPlanVersion,
      fulfillmentPlanId: context.fulfillmentPlanId,
      idempotencyKey: idempotencyKey(),
      instruction: instruction.value.trim() || undefined,
      modelId,
    },
    type: 'START',
  });
}

function applyReadyJob(job: FdmProcurementRequisitionApi.GenerationJob) {
  const options = generationOptions.value;
  if (job.status !== 'READY' || !job.proposal || !options) return;
  if (job.proposalVersion === null || job.proposalVersion === undefined) {
    message.error('生成结果缺少提案版本，请重新生成。');
    return;
  }
  if (job.sourceSnapshotHash !== options.sourceSnapshotHash) {
    message.error('生成快照与当前履约计划不一致，请重新进入页面。');
    return;
  }
  const key = `${job.id}:${job.proposalVersion}`;
  if (key === appliedProposalKey) return;
  const incoming = proposalToRequisitionForm(job.proposal, options.source, job);
  const incomingMetas = completeRequisitionFieldMetas(job, options.source);
  if (form.value) {
    form.value = mergeRequisitionProposalIntoForm(
      form.value,
      incoming,
      fields.value,
    );
    fields.value = mergeAiFieldStateMaps(fields.value, incomingMetas);
  } else {
    form.value = incoming;
    fields.value = createAiFieldStateMap(incomingMetas);
  }
  serverIssues.value = [
    ...adaptRequisitionRules(job.rules, job.proposal),
    ...(job.missingData || []).map((text, index) => ({
      code: `MISSING_DATA_${index}`,
      message: text,
      severity: 'WARNING' as const,
    })),
    ...(job.warnings || []).map((text, index) => ({
      code: `GENERATION_WARNING_${index}`,
      message: text,
      severity: 'WARNING' as const,
    })),
  ];
  appliedProposalKey = key;
  dirty.value = false;
  phase.value = 'READY';
}

function editField(fieldKey: string, value: unknown) {
  if (
    !form.value ||
    !setRequisitionDraftFieldValue(form.value, fieldKey, value)
  ) {
    return;
  }
  fields.value = markAiFieldManual(fields.value, fieldKey, String(value ?? ''));
  serverIssues.value = serverIssues.value.filter(
    (issue) => issue.fieldKey !== fieldKey,
  );
  validation.value = undefined;
  dirty.value = true;
}

function restoreField(fieldKey: string) {
  if (!form.value) return;
  const restored = restoreAiField(fields.value, fieldKey);
  if (!restored) return;
  fields.value = restored.fields;
  if (setRequisitionDraftFieldValue(form.value, fieldKey, restored.value)) {
    dirty.value = true;
  }
}

function adoptAlternative(fieldKey: string, alternativeId: string) {
  if (!form.value) return;
  const adopted = adoptAiAlternative(fields.value, fieldKey, alternativeId);
  if (!adopted) return;
  fields.value = adopted.fields;
  if (setRequisitionDraftFieldValue(form.value, fieldKey, adopted.value)) {
    dirty.value = true;
  }
}

function locateField(fieldKey: string) {
  const id = `requisition-field-${fieldKey.replaceAll(/[^A-Za-z0-9_-]/g, '-')}`;
  document.querySelector(`#${id}`)?.scrollIntoView({
    behavior: 'smooth',
    block: 'center',
  });
}

function ensureClientValid() {
  if (!form.value) return false;
  const blocker = validateRequisitionDraft(form.value).find(
    (issue) => issue.severity === 'BLOCKER',
  );
  if (!blocker) return true;
  message.warning(blocker.message);
  if (blocker.fieldKey) locateField(blocker.fieldKey);
  return false;
}

function errorMessage(cause: unknown, fallback: string) {
  return cause instanceof Error && cause.message.trim()
    ? cause.message
    : fallback;
}

function handleSaveFailure(cause: unknown) {
  if (
    isProcurementVersionConflict(cause) ||
    /(数据已变化|版本冲突|刷新后重试)/.test(errorMessage(cause, ''))
  ) {
    versionConflict.value = true;
    message.warning('采购申请已被他人修改，本页未覆盖最新数据。');
    return;
  }
  message.error(errorMessage(cause, '保存采购申请草稿失败。'));
}

async function saveDraft() {
  if (!form.value || !canSave.value || !ensureClientValid()) return;
  saving.value = true;
  versionConflict.value = false;
  try {
    if (editing.value) {
      const updated = await updateProcurementRequisitionDraft(
        buildRequisitionUpdateReq(form.value),
      );
      detail.value = updated;
      form.value = detailToRequisitionForm(updated);
      fields.value = createAiFieldStateMap(
        requisitionDetailFieldMetas(updated),
      );
      dirty.value = false;
      message.success('采购申请草稿已保存，未执行预检或提交。');
      await router.push(`/fdmprocurement/requisition/detail/${updated.id}`);
      return;
    }
    const result = await createRequisitionFromGeneration(
      buildRequisitionMaterializeReq(form.value, idempotencyKey()),
    );
    await rememberGenerationRun();
    message.success(
      result.created
        ? '采购申请草稿已创建，尚未预检或提交。'
        : '该履约计划已存在采购申请，正在打开。',
    );
    await router.push(`/fdmprocurement/requisition/detail/${result.id}`);
  } catch (error) {
    handleSaveFailure(error);
  } finally {
    saving.value = false;
  }
}

async function runPreValidation() {
  if (!form.value?.id || !canPreValidate.value) return;
  validating.value = true;
  versionConflict.value = false;
  try {
    const result = await preValidateProcurementRequisition({
      expectedVersion: form.value.version!,
      id: form.value.id,
    });
    const latest = await getProcurementRequisition(form.value.id);
    validation.value = result;
    detail.value = latest;
    form.value = detailToRequisitionForm(latest);
    fields.value = createAiFieldStateMap(requisitionDetailFieldMetas(latest));
    dirty.value = false;
    message.success(
      result.validationStatus === 'PASSED'
        ? '服务端预检通过；提交审批仍需在详情页单独执行。'
        : '预检完成，请先处理阻断项。',
    );
  } catch (error) {
    handleSaveFailure(error);
  } finally {
    validating.value = false;
  }
}

function retryGeneration() {
  if (['CANCELLED', 'EXPIRED', 'STALE'].includes(rawJob.value?.status || '')) {
    void rememberGenerationRun();
    phase.value = 'START';
  } else if (rawJob.value?.status === 'RULE_BLOCKED') {
    phase.value = 'START';
  } else if (rawJob.value?.status === 'FAILED') {
    void generation.retry();
  } else if (rawJob.value?.id) {
    void generation.resume(rawJob.value.id);
  } else if (generationRunIdFromQuery(route.query)) {
    void generation.retry();
  } else {
    phase.value = 'START';
  }
}

async function cancelGeneration() {
  await generation.cancel();
}

function openExisting() {
  const existing = generationOptions.value?.existingDraft;
  if (existing)
    void router.push(`/fdmprocurement/requisition/detail/${existing.id}`);
}

function openSourcePlan() {
  if (sourcePlanId.value) {
    void router.push(`/fdmwaimao/demand-analysis/detail/${sourcePlanId.value}`);
  }
}

function back() {
  if (detail.value) {
    void router.push(`/fdmprocurement/requisition/detail/${detail.value.id}`);
  } else if (sourcePlanId.value) {
    openSourcePlan();
  } else {
    void router.push('/fdmprocurement/requisition');
  }
}

watch(rawJob, (value) => {
  if (!value) return;
  if (
    ['CANCELLED', 'EXPIRED', 'MATERIALIZED', 'STALE'].includes(value.status)
  ) {
    void rememberGenerationRun();
  }
  if (['CANCELLED', 'MATERIALIZED'].includes(value.status)) {
    phase.value = form.value ? 'READY' : 'START';
  }
  applyReadyJob(value);
});
watch([requisitionId, sourcePlanId, expectedPlanVersion], load, {
  immediate: true,
});
</script>

<template>
  <Page
    :auto-content-height="false"
    :description="
      editing
        ? `${detail?.requisitionNo || '采购申请'} · v${detail?.version ?? '—'}`
        : '从已确认履约计划生成可审阅、可修改的采购申请草稿'
    "
    :title="editing ? '编辑采购申请草稿' : 'AI 生成采购申请'"
  >
    <Skeleton v-if="loading" active :paragraph="{ rows: 14 }" />

    <Alert
      v-else-if="!editing && !planContext"
      description="请从已确认履约计划详情进入；页面必须同时获得 fulfillmentPlanId 和 expectedPlanVersion。"
      message="缺少权威来源上下文"
      show-icon
      type="error"
    >
      <template #action><Button @click="back">返回采购申请</Button></template>
    </Alert>

    <Empty
      v-else-if="editing && !detail"
      description="采购申请不存在或无权查看"
    />

    <AiGenerationWorkspace
      v-else
      editor-tab-label="当前草稿"
      :fields="fields"
      :issues="allIssues"
      review-position="CENTER"
      review-tab-label="AI 建议"
      :save-label="editing ? '保存草稿修改' : '建立采购申请草稿'"
      :saving="saving"
      security-notice="AI 只生成结构化建议；保存草稿、服务端预检和提交审批始终分离"
      :show-save="Boolean(form && canSave && phase === 'READY')"
      :source-subtitle="
        source
          ? `${source.fulfillmentPlanNo || source.fulfillmentPlanId} · 版本 ${source.version}`
          : '正在读取履约计划'
      "
      source-tab-label="来源计划"
      source-title="已确认履约计划"
      :title="
        editing
          ? `${detail?.requisitionNo || ''} 草稿审阅`
          : '履约计划 → 采购申请'
      "
      @adopt="adoptAlternative"
      @cancel="back"
      @locate="locateField"
      @restore="restoreField"
      @save="saveDraft"
    >
      <template #source>
        <RequisitionSourcePlan
          :snapshot-hash="
            generationOptions?.sourceSnapshotHash || detail?.sourceSnapshotHash
          "
          :source="source"
        />
        <Alert
          v-if="generationOptions?.missingData?.length"
          class="requisition-form__source-alert"
          :description="generationOptions.missingData.join('；')"
          message="来源资料存在缺失"
          show-icon
          type="warning"
        />
      </template>

      <template #editor>
        <div v-if="phase === 'START'" class="requisition-form__phase">
          <AiGenerationStartPanel
            v-model:instruction="instruction"
            v-model:model-id="modelCatalog.selectedModelId.value"
            :blockers="startBlockers"
            :disabled="!canGenerate"
            :loading-models="modelCatalog.loading.value"
            :model-error="modelCatalog.error.value"
            :models="modelCatalog.compatibleModels.value"
            :source-description="
              source
                ? `${source.lines.length} 条已确认外采行 · 外采数量和产品身份锁定`
                : '正在读取履约计划'
            "
            :source-title="
              source?.fulfillmentPlanNo || sourcePlanId || '履约计划'
            "
            start-label="生成采购申请建议"
            :starting="generation.loading.value"
            target-title="采购申请"
            @reload-models="modelCatalog.load"
            @start="startGeneration"
          />
          <Button
            v-if="generationOptions?.existingDraft"
            block
            type="link"
            @click="openExisting"
          >
            打开现有采购申请
            {{ generationOptions.existingDraft.requisitionNo }}
          </Button>
        </div>

        <AiGenerationProgress
          v-else-if="phase === 'GENERATING'"
          :cancelling="generation.cancelling.value"
          :error="generation.error.value"
          :job="generationJob"
          source-title="履约计划"
          target-title="采购申请"
          @cancel="cancelGeneration"
          @retry="retryGeneration"
        />

        <div v-else-if="form" class="requisition-form__editor">
          <Alert
            v-if="versionConflict"
            description="当前编辑内容没有覆盖他人的最新修改。请刷新后重新核对。"
            message="检测到 expectedVersion 冲突"
            show-icon
            type="error"
          >
            <template #action>
              <Button danger size="small" @click="load">刷新最新版本</Button>
            </template>
          </Alert>

          <Alert
            description="建立/保存草稿不会自动预检，预检不会自动提交。提交审批只能在已保存单据的详情页独立执行。"
            message="三个操作明确分离"
            show-icon
            type="info"
          />

          <header>
            <div>
              <Tag :color="editing ? 'blue' : 'purple'">
                {{
                  editing
                    ? detail?.status === 'DATA_INCOMPLETE'
                      ? '资料不完整草稿'
                      : '可编辑草稿'
                    : 'AI 建议已回填'
                }}
              </Tag>
              <h2>当前采购申请草稿</h2>
              <p>
                只能修改采购属性；产品、来源行、外采总量和定制快照不可修改。
              </p>
            </div>
            <div class="requisition-form__header-actions">
              <Tooltip
                v-if="editing"
                :title="dirty ? '请先保存当前修改，预检不会自动保存。' : ''"
              >
                <Button
                  :disabled="!canPreValidate"
                  :loading="validating"
                  @click="runPreValidation"
                >
                  服务端预检
                </Button>
              </Tooltip>
              <Button v-if="!editing && canGenerate" @click="phase = 'START'">
                <template #icon>
                  <IconifyIcon icon="lucide:refresh-cw" aria-hidden="true" />
                </template>
                重新生成建议
              </Button>
            </div>
          </header>

          <Card title="申请头" size="small">
            <div class="requisition-form__header-grid">
              <label id="requisition-field-requiredDate">
                <span>整单要求日期</span>
                <Input
                  type="date"
                  :value="form.requiredDate"
                  @update:value="editField('requiredDate', $event)"
                />
              </label>
              <label id="requisition-field-remark">
                <span>申请备注</span>
                <Input.TextArea
                  :auto-size="{ minRows: 2, maxRows: 5 }"
                  :maxlength="2000"
                  placeholder="可修改 AI 摘要，记录采购背景和人工决策"
                  show-count
                  :value="form.remark"
                  @update:value="editField('remark', $event)"
                />
              </label>
              <label v-if="editing" id="requisition-field-editReason">
                <span>本次修改说明</span>
                <Input.TextArea
                  :auto-size="{ minRows: 2, maxRows: 4 }"
                  :maxlength="1000"
                  placeholder="可选：说明本次人工调整的原因，便于审计追踪"
                  show-count
                  :value="form.editReason"
                  @update:value="editField('editReason', $event)"
                />
              </label>
            </div>
          </Card>

          <article
            v-for="line in form.lines"
            :key="line.sourcePlanLineId"
            class="requisition-form__line"
          >
            <header>
              <span>{{ line.lineNo || '—' }}</span>
              <div>
                <strong>{{ line.productName }}</strong>
                <small>
                  {{ line.productCode || '无编码' }} ·
                  {{ line.specification || '无规格' }}
                </small>
              </div>
              <Tag
                :color="
                  line.productMappingStatus === 'MAPPED' ? 'green' : 'orange'
                "
              >
                {{ line.productMappingStatus }}
              </Tag>
            </header>

            <div class="requisition-form__authority">
              <div>
                <span>权威外采数量</span>
                <strong>{{ line.requestedQty }}</strong>
              </div>
              <div>
                <span>来源计划行</span>
                <strong>{{ line.sourcePlanLineId }}</strong>
              </div>
              <div>
                <span>产品 / SKU</span>
                <strong>{{ line.productId || '—' }} / {{ line.skuId || '—' }}</strong>
              </div>
            </div>

            <Alert
              v-if="line.customizationSnapshot"
              :description="line.customizationSnapshot"
              message="来源定制要求（只读快照）"
              show-icon
              type="info"
            />

            <Alert
              description="本期尚未接入权威单位换算主数据，采购单位固定沿用来源单位，换算系数固定为 1；服务端会再次核对，当前不可人工修改。"
              message="采购单位与换算规则已锁定"
              show-icon
              type="info"
            />

            <div class="requisition-form__editable-grid">
              <label
                :id="`requisition-field-${requisitionLineFieldKey(line.sourcePlanLineId, 'purchaseUnit').replaceAll('.', '-')}`"
              >
                <span>采购单位 <b>*</b></span>
                <Input disabled :value="line.purchaseUnit" />
              </label>
              <label
                :id="`requisition-field-${requisitionLineFieldKey(line.sourcePlanLineId, 'unitConversionFactor').replaceAll('.', '-')}`"
              >
                <span>单位换算系数 <b>*</b></span>
                <Input disabled :value="line.unitConversionFactor" />
              </label>
              <label
                :id="`requisition-field-${requisitionLineFieldKey(line.sourcePlanLineId, 'requiredDate').replaceAll('.', '-')}`"
              >
                <span>行要求日期</span>
                <Input
                  type="date"
                  :value="line.requiredDate"
                  @update:value="
                    editField(
                      requisitionLineFieldKey(
                        line.sourcePlanLineId,
                        'requiredDate',
                      ),
                      $event,
                    )
                  "
                />
              </label>
              <label
                class="requisition-form__wide"
                :id="`requisition-field-${requisitionLineFieldKey(line.sourcePlanLineId, 'procurementNote').replaceAll('.', '-')}`"
              >
                <span>采购说明（AI 回填后可修改）</span>
                <Input.TextArea
                  :auto-size="{ minRows: 2, maxRows: 5 }"
                  :maxlength="2000"
                  placeholder="记录资料缺失、采购要点、质量或交期风险"
                  show-count
                  :value="line.procurementNote"
                  @update:value="
                    editField(
                      requisitionLineFieldKey(
                        line.sourcePlanLineId,
                        'procurementNote',
                      ),
                      $event,
                    )
                  "
                />
              </label>
            </div>

            <div class="requisition-form__risks">
              <span>AI 风险代码（生成快照）</span>
              <div>
                <Tag v-for="risk in line.riskCodes" :key="risk" color="orange">
                  {{ risk }}
                </Tag>
                <small v-if="!line.riskCodes.length">未识别到结构化风险代码</small>
              </div>
            </div>
          </article>

          <Card v-if="validation" title="本次服务端预检" size="small">
            <Alert
              :message="
                validation.validationStatus === 'PASSED'
                  ? '服务端硬规则已通过'
                  : `发现 ${validation.issues.length} 个问题`
              "
              show-icon
              :type="
                validation.validationStatus === 'PASSED' ? 'success' : 'warning'
              "
            />
            <ul v-if="validation.issues.length">
              <li
                v-for="issue in validation.issues"
                :key="`${issue.code}:${issue.itemId || ''}:${issue.fieldPath || ''}`"
              >
                <strong>{{ issue.code }}</strong>
                <span>{{ issue.fieldPath || '单据级' }}：{{ issue.message }}</span>
              </li>
            </ul>
          </Card>
        </div>
      </template>
    </AiGenerationWorkspace>
  </Page>
</template>

<style scoped>
.requisition-form__phase,
.requisition-form__editor {
  display: grid;
  gap: 14px;
}

.requisition-form__source-alert {
  margin-top: 14px;
}

.requisition-form__editor > header,
.requisition-form__line > header,
.requisition-form__header-actions {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
}

.requisition-form__editor > header h2 {
  margin: 5px 0 2px;
  font-size: 20px;
  color: #172033;
}

.requisition-form__editor > header p,
.requisition-form__line small,
.requisition-form__risks small,
.requisition-form__editor li span {
  margin: 0;
  font-size: 12px;
  color: #64748b;
}

.requisition-form__header-grid,
.requisition-form__editable-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.requisition-form__header-grid label,
.requisition-form__editable-grid label,
.requisition-form__risks {
  display: grid;
  gap: 6px;
}

.requisition-form__header-grid label > span,
.requisition-form__editable-grid label > span,
.requisition-form__risks > span {
  font-size: 12px;
  font-weight: 600;
  color: #475569;
}

.requisition-form__editable-grid label b {
  color: #ef4444;
}

.requisition-form__header-grid label:last-child,
.requisition-form__wide {
  grid-column: 1 / -1;
}

.requisition-form__line {
  display: grid;
  gap: 13px;
  padding: 15px;
  border: 1px solid #dfe7f0;
  border-radius: 10px;
}

.requisition-form__line > header {
  justify-content: flex-start;
}

.requisition-form__line > header > span {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  color: #2563eb;
  background: #eff6ff;
  border-radius: 8px;
}

.requisition-form__line > header > div {
  display: grid;
  flex: 1;
  gap: 2px;
}

.requisition-form__authority {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  padding: 10px 12px;
  background: #f8fafc;
  border: 1px solid #e5eaf1;
  border-radius: 8px;
}

.requisition-form__authority > div {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.requisition-form__authority span {
  font-size: 11px;
  color: #64748b;
}

.requisition-form__authority strong {
  overflow: hidden;
  text-overflow: ellipsis;
}

.requisition-form__risks > div {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.requisition-form__editor ul {
  display: grid;
  gap: 7px;
  padding: 0;
  margin: 12px 0 0;
  list-style: none;
}

.requisition-form__editor li {
  display: grid;
  gap: 2px;
  padding: 8px 10px;
  background: #fff7e6;
  border-radius: 7px;
}

@media (max-width: 760px) {
  .requisition-form__header-grid,
  .requisition-form__editable-grid,
  .requisition-form__authority {
    grid-template-columns: 1fr;
  }

  .requisition-form__header-grid label:last-child,
  .requisition-form__wide {
    grid-column: auto;
  }

  .requisition-form__editor > header {
    flex-direction: column;
  }
}
</style>
