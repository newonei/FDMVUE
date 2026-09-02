<script lang="ts" setup>
import type { DemandPlanFormModel } from '../form-model';

import type { FdmWaimaoAttachmentApi } from '#/api/fdmwaimao/attachment';
import type { FdmWaimaoDemandPlanApi } from '#/api/fdmwaimao/demand-plan';
import type {
  AiFieldStateMap,
  AiGenerationJob,
  AiValidationIssue,
} from '#/views/fdm-trade-shared/ai-document-generation';

import { computed, nextTick, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { useUserStore } from '@vben/stores';

import { Alert, Button, Input, message, Skeleton, Tag } from 'ant-design-vue';

import { getContractOrder } from '#/api/fdmwaimao/contract-order';
import {
  cancelDemandPlanGeneration,
  confirmDemandPlan,
  createDemandPlan,
  createDemandPlanDirect,
  getDemandPlan,
  getDemandPlanGenerationJob,
  getDemandPlanGenerationOptions,
  regenerateDemandPlanGeneration,
  retryDemandPlanGeneration,
  startDemandPlanGeneration,
  updateDemandPlan,
  validateDemandPlanCreate,
  validateDemandPlanUpdate,
} from '#/api/fdmwaimao/demand-plan';
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
import FdmWaimaoAttachmentEditor from '#/views/fdmwaimao/components/FdmWaimaoAttachmentEditor.vue';

import DemandPlanLineEditor from '../components/DemandPlanLineEditor.vue';
import DemandPlanSourceOrder from '../components/DemandPlanSourceOrder.vue';
import {
  buildDemandPlanMaterializeReq,
  buildDemandPlanUpdateReq,
  clientValidateDemandPlan,
  detailToForm,
  mergeProposalIntoForm,
  proposalToForm,
  setDemandPlanFieldValue,
} from '../form-model';
import {
  adaptDemandPlanGenerationJob,
  adaptDemandPlanRules,
  completeDemandPlanFieldMetas,
  demandPlanDetailFieldMetas,
} from '../generation-adapter';
import {
  generationRunIdFromQuery,
  phaseAfterClosedGenerationRun,
  withGenerationRunIdQuery,
} from '../generation-route';

defineOptions({ name: 'FdmWaimaoDemandPlanForm' });

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const { hasAccessByCodes } = useAccess();

const detail = ref<FdmWaimaoDemandPlanApi.Detail>();
const form = ref<DemandPlanFormModel>();
const generationOptions = ref<FdmWaimaoDemandPlanApi.GenerationOptions>();
const rawJob = ref<FdmWaimaoDemandPlanApi.GenerationJob>();
const fields = ref<AiFieldStateMap>({});
const serverIssues = ref<AiValidationIssue[]>([]);
const loading = ref(false);
const saving = ref(false);
const confirming = ref(false);
const directCreating = ref(false);
const instruction = ref('');
const attachments = ref<FdmWaimaoAttachmentApi.Attachment[]>([]);
const attachmentUploading = ref(false);
const attachmentUploadError = ref(false);
const attachmentEditorVisible = ref(true);
const phase = ref<'GENERATING' | 'READY' | 'START'>('START');
const catalogOrderId = ref('');
let loadVersion = 0;
let appliedProposalKey = '';

const planId = computed(() => String(route.params.id || ''));
const createOrderId = computed(() => {
  const value = Array.isArray(route.query.orderId)
    ? route.query.orderId[0]
    : route.query.orderId;
  return typeof value === 'string' ? value : '';
});
const editing = computed(() => Boolean(planId.value));
const sourceOrder = computed(
  () => generationOptions.value?.sourceOrder || detailSourceOrder(detail.value),
);
const sourceSnapshotHash = computed(
  () =>
    generationOptions.value?.sourceSnapshotHash ||
    detail.value?.sourceSnapshotHash ||
    '',
);
function hasAllAccess(codes: string[]) {
  return codes.every((code) => hasAccessByCodes([code]));
}

const canGenerate = computed(() =>
  editing.value
    ? Boolean(detail.value?.generationRunId) &&
      hasAllAccess([
        'fdmwaimao:ai:use',
        'fdmwaimao:demand-plan:query',
        'fdmwaimao:demand-plan:generate',
        'fdmwaimao:demand-plan:update',
        'fdmdocflow:generation:query',
        'fdmdocflow:generation:create',
        'fdmdocflow:generation:retry',
      ])
    : hasAllAccess([
        'fdmwaimao:ai:use',
        'fdmwaimao:contract-order:query',
        'fdmwaimao:demand-plan:create',
        'fdmwaimao:demand-plan:generate',
        'fdmwaimao:demand-plan:query',
        'fdmdocflow:generation:query',
        'fdmdocflow:generation:create',
        'fdmdocflow:generation:retry',
      ]),
);
const canSave = computed(() =>
  hasAccessByCodes([
    editing.value
      ? 'fdmwaimao:demand-plan:update'
      : 'fdmwaimao:demand-plan:create',
  ]),
);
const canCreateDirect = computed(
  () =>
    !editing.value &&
    hasAllAccess([
      'fdmwaimao:contract-order:query',
      'fdmwaimao:demand-plan:create',
      'fdmwaimao:demand-plan:query',
    ]),
);
const canConfirm = computed(
  () =>
    editing.value &&
    detail.value?.status === 'DRAFT' &&
    hasAccessByCodes(['fdmwaimao:demand-plan:confirm']),
);

const modelCatalog = useAiModelCatalog({
  actionCode: 'fdmwaimao:demand-plan:generate',
  async load() {
    if (!catalogOrderId.value) throw new Error('缺少来源合同，无法读取模型。');
    const result = await getDemandPlanGenerationOptions(catalogOrderId.value);
    generationOptions.value = result;
    return result.models.map((model) => ({
      ...model,
      enabled: model.enabled !== false,
    }));
  },
  userIdentity: () => String(userStore.userInfo?.id || 'anonymous'),
});

useFdmWaimaoAiContext(() => ({
  // Page AI businessId is always the persisted demand-plan identity. The
  // source contract id must never be interpreted as a demand-plan id while a
  // new form is still unsaved.
  businessId: planId.value,
  context: {
    editing: editing.value,
    fieldStates: fields.value,
    form: form.value,
    generationJob: rawJob.value,
    instruction: instruction.value,
    loading: loading.value,
    sourceOrder: sourceOrder.value,
    validationIssues: serverIssues.value,
  },
  contextMode: 'form',
  entityLabel:
    detail.value?.planNo || sourceOrder.value?.orderNo || '履约需求计划',
  surfaceKey: 'demand-plan',
}));

type DemandGenerationCommand =
  | {
      data: FdmWaimaoDemandPlanApi.GenerationRegenerateReq;
      type: 'REGENERATE';
    }
  | {
      data: FdmWaimaoDemandPlanApi.GenerationStartReq;
      type: 'START';
    };

function recordRawJob(result: FdmWaimaoDemandPlanApi.GenerationJob) {
  if (
    catalogOrderId.value &&
    String(result.sourceId) !== String(catalogOrderId.value)
  ) {
    throw new Error('生成任务与当前来源合同不匹配，请重新发起生成。');
  }
  rawJob.value = result;
  return adaptDemandPlanGenerationJob(result);
}

async function rememberGenerationRun(id?: string) {
  await router.replace({
    query: withGenerationRunIdQuery(route.query, id),
  });
}

const generation = useAiGenerationJob<
  DemandGenerationCommand,
  FdmWaimaoDemandPlanApi.GenerationProposal
>({
  dataSource: {
    async cancel(id, expectedVersion) {
      return recordRawJob(
        await cancelDemandPlanGeneration({
          expectedVersion: String(expectedVersion),
          id,
        }),
      );
    },
    async getJob(id) {
      return recordRawJob(await getDemandPlanGenerationJob(id));
    },
    async start(command) {
      const result =
        command.type === 'REGENERATE'
          ? await regenerateDemandPlanGeneration(command.data)
          : await startDemandPlanGeneration(command.data);
      await rememberGenerationRun(result.id);
      return recordRawJob(result);
    },
    async retry(id, expectedVersion) {
      return recordRawJob(
        await retryDemandPlanGeneration({
          expectedVersion: String(expectedVersion),
          id,
        }),
      );
    },
  },
});

const generationJob = computed(
  () =>
    generation.job.value as
      | AiGenerationJob<FdmWaimaoDemandPlanApi.GenerationProposal>
      | undefined,
);
const startBlockers = computed(() => {
  const blockers: Array<{ code: string; message: string }> = [];
  if (!canGenerate.value) {
    blockers.push({
      code: 'NO_PERMISSION',
      message: '当前账号没有 AI 生成权限。',
    });
  }
  const options = generationOptions.value;
  if (!options) return blockers;
  if (!editing.value && !options.source.generationEligible) {
    blockers.push({
      code: options.source.generationBlockerCode || 'SOURCE_NOT_ELIGIBLE',
      message:
        options.source.generationBlockerMessage ||
        (options.source.latestPlanId
          ? '该合同已经存在需求计划，请打开现有计划。'
          : '当前合同状态不允许生成需求计划，请先确认合同。'),
    });
  }
  return blockers;
});
const clientIssues = computed(() =>
  form.value ? clientValidateDemandPlan(form.value, 'DRAFT', fields.value) : [],
);
const allIssues = computed(() => [
  ...clientIssues.value,
  ...serverIssues.value,
]);

function detailSourceOrder(
  value?: FdmWaimaoDemandPlanApi.Detail,
): FdmWaimaoDemandPlanApi.SourceOrder | undefined {
  if (!value) return undefined;
  return {
    companyName: value.companyName,
    currency: undefined,
    customerName: value.customerName,
    id: value.contractOrderId,
    items: value.lines.map((line) => ({
      code: line.productCode,
      entrySource: line.contractEntrySource,
      id: line.sourceContractOrderItemId,
      lineNo: line.lineNo,
      mappingStatus: line.mappingStatus,
      name: line.productName,
      productId: line.productId,
      quantity: line.contractQuantity,
      skuId: line.skuId,
      unit: line.unit,
    })),
    orderNo: value.contractOrderNo,
    ownerUserName: value.ownerUserName,
    requiredDeliveryDate: value.customerRequiredDeliveryDate,
    status: 'CONFIRMED',
    subject: value.contractSubject,
    version: value.contractOrderVersion,
  };
}

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

async function load() {
  const version = ++loadVersion;
  if (
    attachments.value.length > 0 ||
    attachmentUploading.value ||
    attachmentUploadError.value
  ) {
    attachmentEditorVisible.value = false;
    await nextTick();
    attachments.value = [];
    attachmentUploading.value = false;
    attachmentUploadError.value = false;
    attachmentEditorVisible.value = true;
  }
  generation.stop();
  loading.value = true;
  detail.value = undefined;
  form.value = undefined;
  rawJob.value = undefined;
  appliedProposalKey = '';
  fields.value = {};
  serverIssues.value = [];
  generationOptions.value = undefined;
  try {
    if (editing.value) {
      const result = await getDemandPlan(planId.value);
      if (version !== loadVersion) return;
      if (result.status !== 'DRAFT') {
        message.warning('只有草稿需求计划可以编辑。');
        await router.replace(`/fdmwaimao/demand-analysis/detail/${result.id}`);
        return;
      }
      detail.value = result;
      form.value = detailToForm(result);
      fields.value = createAiFieldStateMap(demandPlanDetailFieldMetas(result));
      phase.value = 'READY';
      catalogOrderId.value = result.contractOrderId;
      if (result.generationRunId) await modelCatalog.load();
    } else {
      if (!createOrderId.value) return;
      catalogOrderId.value = createOrderId.value;
      phase.value = 'START';
      await modelCatalog.load();
    }
    const runId = generationRunIdFromQuery(route.query);
    if (runId) {
      phase.value = 'GENERATING';
      rawJob.value = undefined;
      await generation.resume(runId);
      if (!rawJob.value) await rememberGenerationRun();
    }
  } finally {
    if (version === loadVersion) loading.value = false;
  }
}

async function startGeneration() {
  const options = generationOptions.value;
  const modelId = modelCatalog.selectedModelId.value;
  if (!options || !modelId || startBlockers.value.length > 0) return;
  serverIssues.value = [];
  phase.value = 'GENERATING';
  const reusableCreateRun =
    !editing.value &&
    rawJob.value &&
    ['READY', 'RULE_BLOCKED'].includes(rawJob.value.status)
      ? rawJob.value.id
      : undefined;
  const regenerateRunId = editing.value
    ? detail.value?.generationRunId
    : reusableCreateRun;
  if (editing.value || regenerateRunId) {
    const runId = regenerateRunId;
    if (!runId) {
      phase.value = 'READY';
      message.error('该草稿缺少生成运行记录，无法重新生成；仍可继续人工编辑。');
      return;
    }
    let currentJob: FdmWaimaoDemandPlanApi.GenerationJob;
    try {
      currentJob = await getDemandPlanGenerationJob(runId);
      recordRawJob(currentJob);
    } catch {
      phase.value = 'READY';
      message.error('生成运行状态读取失败，无法重新生成。');
      return;
    }
    await generation.start({
      data: {
        expectedVersion: currentJob.version,
        id: runId,
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
      expectedOrderVersion: options.sourceOrder.version,
      idempotencyKey: idempotencyKey(),
      instruction: instruction.value.trim() || undefined,
      modelId,
      orderId: options.sourceOrder.id,
    },
    type: 'START',
  });
}

function directDraftSuccessMessage(created: boolean, mode: 'MANUAL' | 'RULE') {
  if (!created) return '该合同已存在需求计划，正在打开';
  if (mode === 'RULE') return '规则草稿已建立，请继续核实 UNKNOWN 分配';
  return '人工草稿已建立，请填写履约分配';
}

async function createDirectDraft(mode: 'MANUAL' | 'RULE') {
  if (!canCreateDirect.value || editing.value) return;
  if (!ensureAttachmentsReady()) return;
  const orderId =
    generationOptions.value?.sourceOrder.id || createOrderId.value;
  if (!orderId) return;
  directCreating.value = true;
  try {
    let orderVersion = generationOptions.value?.sourceOrder.version;
    if (orderVersion === undefined || orderVersion === null) {
      const contract = await getContractOrder(orderId);
      if (contract.status !== 'CONFIRMED') {
        message.warning('合同尚未确认，不能建立履约需求草稿。');
        return;
      }
      orderVersion = contract.version;
    }
    const expectedOrderVersion = Number(orderVersion);
    if (!Number.isInteger(expectedOrderVersion) || expectedOrderVersion < 0) {
      message.error('合同版本无效，请刷新合同详情后重试。');
      return;
    }
    const result = await createDemandPlanDirect({
      attachmentIds: attachments.value.map((attachment) => attachment.id),
      creationMode: mode,
      expectedOrderVersion,
      idempotencyKey: idempotencyKey(),
      orderId,
      remark: instruction.value.trim() || undefined,
    });
    if (result.created) {
      attachments.value = [];
      await nextTick();
    }
    message.success(directDraftSuccessMessage(result.created, mode));
    await router.push(`/fdmwaimao/demand-analysis/edit/${result.id}`);
  } catch (error) {
    message.error(
      error instanceof Error
        ? error.message
        : '履约需求草稿建立失败，请稍后重试。',
    );
  } finally {
    directCreating.value = false;
  }
}

function ensureAttachmentsReady() {
  if (attachmentUploading.value) {
    message.warning('附件仍在上传，请等待上传完成后再保存。');
    return false;
  }
  if (attachmentUploadError.value) {
    message.warning('存在上传失败的附件，请重试或移除后再保存。');
    return false;
  }
  return true;
}

function applyReadyJob(job: FdmWaimaoDemandPlanApi.GenerationJob) {
  const options = generationOptions.value;
  if (job.status !== 'READY' || !job.proposal || !options) return;
  const key = `${job.id}:${job.proposalVersion ?? ''}`;
  if (key === appliedProposalKey) return;
  if (job.proposalVersion === null || job.proposalVersion === undefined) {
    message.error('生成结果缺少提案版本，请重新生成。');
    return;
  }
  const incoming = proposalToForm(job.proposal, options.sourceOrder, job);
  const incomingMetas = completeDemandPlanFieldMetas(job, options.sourceOrder);
  if (form.value) {
    form.value = mergeProposalIntoForm(form.value, incoming, fields.value);
    fields.value = mergeAiFieldStateMaps(fields.value, incomingMetas);
  } else {
    form.value = incoming;
    fields.value = createAiFieldStateMap(incomingMetas);
  }
  serverIssues.value = [
    ...adaptDemandPlanRules(job.rules, job.proposal.lines),
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
  phase.value = 'READY';
}

function markManual(fieldKey: string, value: string) {
  fields.value = markAiFieldManual(fields.value, fieldKey, value);
  serverIssues.value = serverIssues.value.filter(
    (issue) => issue.fieldKey !== fieldKey,
  );
}

function editField(fieldKey: string, value: string) {
  if (!form.value) return;
  setDemandPlanFieldValue(form.value, fieldKey, value);
  markManual(fieldKey, value);
}

function editRemark(value: unknown) {
  if (!form.value) return;
  form.value.remark = String(value ?? '');
  markManual('remark', form.value.remark);
}

function restoreField(fieldKey: string) {
  if (!form.value) return;
  const restored = restoreAiField(fields.value, fieldKey);
  if (!restored) return;
  fields.value = restored.fields;
  setDemandPlanFieldValue(form.value, fieldKey, restored.value);
}

function adoptAlternative(fieldKey: string, alternativeId: string) {
  if (!form.value) return;
  const adopted = adoptAiAlternative(fields.value, fieldKey, alternativeId);
  if (!adopted) return;
  fields.value = adopted.fields;
  setDemandPlanFieldValue(form.value, fieldKey, adopted.value);
}

function locateField(fieldKey: string) {
  const id = `demand-field-${fieldKey.replaceAll(/[^A-Za-z0-9_-]/g, '-')}`;
  document
    .querySelector(`#${id}`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function ensureClientValid(mode: 'CONFIRM' | 'DRAFT') {
  if (!form.value) return false;
  const issues = clientValidateDemandPlan(form.value, mode, fields.value);
  serverIssues.value = issues;
  const blocker = issues.find((issue) => issue.severity === 'BLOCKER');
  if (blocker) {
    message.warning(blocker.message);
    if (blocker.fieldKey) locateField(blocker.fieldKey);
    return false;
  }
  return true;
}

async function validateWithServer(
  request:
    | FdmWaimaoDemandPlanApi.MaterializeReq
    | FdmWaimaoDemandPlanApi.UpdateReq,
) {
  const result =
    'id' in request
      ? await validateDemandPlanUpdate(request)
      : await validateDemandPlanCreate(request);
  serverIssues.value = adaptDemandPlanRules(
    result.rules,
    form.value?.lines || [],
  );
  if (!result.valid) {
    message.warning(
      serverIssues.value.find((issue) => issue.severity === 'BLOCKER')
        ?.message || '需求计划未通过服务端规则校验。',
    );
  }
  return result.valid;
}

async function saveDraft(navigate = true) {
  if (
    !form.value ||
    !canSave.value ||
    !ensureAttachmentsReady() ||
    !ensureClientValid('DRAFT')
  )
    return false;
  saving.value = true;
  try {
    if (editing.value) {
      const request = buildDemandPlanUpdateReq(form.value);
      if (!(await validateWithServer(request))) return false;
      await updateDemandPlan(request);
      message.success('需求计划草稿已保存');
      if (navigate) {
        await router.push(`/fdmwaimao/demand-analysis/detail/${form.value.id}`);
      }
      return true;
    }
    const request = buildDemandPlanMaterializeReq(form.value);
    request.attachmentIds = attachments.value.map(
      (attachment) => attachment.id,
    );
    if (!(await validateWithServer(request))) return false;
    const result = await createDemandPlan(request);
    if (result.created) {
      attachments.value = [];
      await nextTick();
    }
    message.success(
      result.created ? '需求计划草稿已创建' : '已打开现有需求计划',
    );
    if (navigate) {
      await router.push(`/fdmwaimao/demand-analysis/detail/${result.id}`);
    }
    return true;
  } catch (error) {
    message.error(error instanceof Error ? error.message : '保存需求计划失败');
    return false;
  } finally {
    saving.value = false;
  }
}

async function confirmPlan() {
  if (!form.value || !canConfirm.value || !ensureClientValid('CONFIRM')) return;
  confirming.value = true;
  try {
    const updateRequest = buildDemandPlanUpdateReq(form.value);
    if (!(await validateWithServer(updateRequest))) return;
    await updateDemandPlan(updateRequest);
    const latest = await getDemandPlan(form.value.id!);
    const confirmIssues = clientValidateDemandPlan(
      detailToForm(latest),
      'CONFIRM',
    );
    if (confirmIssues.some((issue) => issue.severity === 'BLOCKER')) {
      serverIssues.value = confirmIssues;
      message.warning('最新计划仍有确认阻断，请修正后重试。');
      return;
    }
    await confirmDemandPlan({ id: latest.id, expectedVersion: latest.version });
    message.success('需求计划已确认，可进入后续履约流程');
    await router.push(`/fdmwaimao/demand-analysis/detail/${latest.id}`);
  } finally {
    confirming.value = false;
  }
}

function back() {
  if (detail.value) {
    void router.push(`/fdmwaimao/demand-analysis/detail/${detail.value.id}`);
  } else {
    void router.push('/fdmwaimao/demand-analysis');
  }
}

function openExisting() {
  const id = generationOptions.value?.source.latestPlanId;
  if (id) void router.push(`/fdmwaimao/demand-analysis/detail/${id}`);
}

function retryGeneration() {
  if (['CANCELLED', 'EXPIRED', 'STALE'].includes(rawJob.value?.status || '')) {
    void rememberGenerationRun();
    phase.value = 'START';
    return;
  }
  if (rawJob.value?.status === 'RULE_BLOCKED') {
    phase.value = 'START';
    return;
  }
  if (!rawJob.value) {
    if (generationRunIdFromQuery(route.query)) {
      void generation.retry();
    } else {
      phase.value = 'START';
    }
  } else if (rawJob.value.status === 'FAILED') {
    void generation.retry();
  } else if (rawJob.value?.id) {
    void generation.resume(rawJob.value.id);
  }
}

async function cancelGeneration() {
  await generation.cancel();
}

watch(rawJob, (value) => {
  if (!value) return;
  if (
    ['CANCELLED', 'EXPIRED', 'MATERIALIZED', 'STALE'].includes(value.status)
  ) {
    void rememberGenerationRun();
  }
  if (['CANCELLED', 'MATERIALIZED'].includes(value.status)) {
    // A stale URL may point at the run that originally materialized this
    // editable draft. Clearing the recovery query must not hide the draft
    // editor and send the user back to the generation start screen.
    phase.value = phaseAfterClosedGenerationRun(
      editing.value,
      Boolean(form.value),
    );
  }
  applyReadyJob(value);
});
watch([planId, createOrderId], load, { immediate: true });
</script>

<template>
  <Page
    :auto-content-height="false"
    :description="
      editing
        ? detail?.planNo || '需求计划草稿'
        : '从已确认合同生成可审阅、可修改的需求计划'
    "
    :title="editing ? '编辑需求计划' : 'AI 生成需求计划'"
  >
    <Skeleton v-if="loading" active :paragraph="{ rows: 12 }" />

    <Alert
      v-else-if="!editing && !createOrderId"
      message="缺少来源合同"
      description="请从已确认合同详情进入 AI 需求计划，页面只接受 orderId 作为来源标识。"
      show-icon
      type="error"
    >
      <template #action><Button @click="back">返回计划列表</Button></template>
    </Alert>

    <AiGenerationWorkspace
      v-else
      :confirming="confirming"
      :fields="fields"
      :issues="allIssues"
      :saving="saving || attachmentUploading"
      :show-confirm="canConfirm && phase === 'READY'"
      :show-save="Boolean(form && canSave && phase === 'READY')"
      :source-subtitle="
        sourceOrder
          ? `${sourceOrder.orderNo} · 版本 ${sourceOrder.version}`
          : '正在读取来源合同'
      "
      :title="
        editing ? `${detail?.planNo || ''} 草稿审阅` : '合同 → 履约需求计划'
      "
      @adopt="adoptAlternative"
      @cancel="back"
      @confirm="confirmPlan"
      @locate="locateField"
      @restore="restoreField"
      @save="saveDraft()"
    >
      <template #source>
        <DemandPlanSourceOrder
          :order="sourceOrder"
          :snapshot-hash="sourceSnapshotHash"
        />
        <Alert
          v-if="generationOptions?.missingData?.length"
          class="demand-plan-form__missing"
          :description="generationOptions.missingData.join('；')"
          message="来源数据存在缺失"
          show-icon
          type="warning"
        />
        <section v-if="!editing" class="demand-plan-form__attachments">
          <header>
            <strong>单据附件</strong>
            <span>附件将在需求计划创建成功时一并保存</span>
          </header>
          <FdmWaimaoAttachmentEditor
            v-if="attachmentEditorVisible"
            v-model="attachments"
            business-type="FULFILLMENT_PLAN"
            :disabled="saving || directCreating"
            @error-change="attachmentUploadError = $event"
            @uploading-change="attachmentUploading = $event"
          />
        </section>
      </template>

      <template #editor>
        <div v-if="phase === 'START'" class="demand-plan-form__phase">
          <AiGenerationStartPanel
            v-model:instruction="instruction"
            v-model:model-id="modelCatalog.selectedModelId.value"
            :blockers="startBlockers"
            :disabled="!canGenerate"
            :loading-models="modelCatalog.loading.value"
            :manual-disabled="
              !canCreateDirect || attachmentUploading || attachmentUploadError
            "
            :manual-starting="directCreating"
            :model-error="modelCatalog.error.value"
            :models="modelCatalog.compatibleModels.value"
            :show-manual-fallback="!editing"
            :source-description="
              sourceOrder
                ? `${sourceOrder.customerName || '未提供客户'} · ${sourceOrder.items.length} 行合同产品`
                : '正在读取来源合同'
            "
            :source-title="sourceOrder?.orderNo || '来源合同'"
            :starting="generation.loading.value"
            target-title="履约需求计划"
            @direct-start="createDirectDraft"
            @reload-models="modelCatalog.load"
            @start="startGeneration"
          />
          <Button
            v-if="generationOptions?.source.latestPlanId"
            block
            type="link"
            @click="openExisting"
          >
            打开现有计划 {{ generationOptions.source.latestPlanNo }}
          </Button>
        </div>

        <AiGenerationProgress
          v-else-if="phase === 'GENERATING'"
          :cancelling="generation.cancelling.value"
          :error="generation.error.value"
          :job="generationJob"
          @cancel="cancelGeneration"
          @retry="retryGeneration"
        />

        <div v-else-if="form" class="demand-plan-form__editor">
          <header>
            <div>
              <Tag color="purple">
                {{
                  editing
                    ? detail?.creationMode === 'RULE'
                      ? '规则草稿编辑'
                      : detail?.creationMode === 'MANUAL'
                        ? '人工草稿编辑'
                        : 'AI 草稿编辑'
                    : 'AI 建议已回填'
                }}
              </Tag>
              <h2>履约需求拆分</h2>
              <p>合同数量为只读权威值；空数量保存为 UNKNOWN，不会被转成 0。</p>
              <p v-if="editing && !detail?.generationRunId">
                本草稿没有 AI 运行记录，保留纯人工审阅；不会伪造模型或生成任务。
              </p>
            </div>
            <Button v-if="canGenerate" @click="phase = 'START'">
              <template #icon>
                <IconifyIcon icon="lucide:refresh-cw" aria-hidden="true" />
              </template>
              重新生成建议
            </Button>
          </header>

          <label id="demand-field-remark" class="demand-plan-form__remark">
            <span>计划备注</span>
            <Input.TextArea
              :auto-size="{ minRows: 2, maxRows: 5 }"
              :maxlength="2000"
              placeholder="记录本计划的整体假设、限制条件或人工决策"
              show-count
              :value="form.remark"
              @update:value="editRemark"
            />
          </label>

          <DemandPlanLineEditor
            v-for="line in form.lines"
            :key="line.sourceContractOrderItemId"
            :fields="fields"
            :line="line"
            @edit="editField"
          />
        </div>
      </template>
    </AiGenerationWorkspace>
  </Page>
</template>

<style scoped>
.demand-plan-form__phase {
  display: grid;
  gap: 8px;
}

.demand-plan-form__missing {
  margin-top: 14px;
}

.demand-plan-form__attachments {
  display: grid;
  gap: 10px;
  margin-top: 14px;
}

.demand-plan-form__attachments > header {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.demand-plan-form__attachments > header span {
  font-size: 12px;
  color: #8c8c8c;
}

.demand-plan-form__editor {
  display: grid;
  gap: 14px;
}

.demand-plan-form__editor > header {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  justify-content: space-between;
}

.demand-plan-form__editor > header h2 {
  margin: 5px 0 2px;
  font-size: 20px;
  color: #172033;
}

.demand-plan-form__editor > header p {
  margin: 0;
  font-size: 12px;
  color: #64748b;
}

.demand-plan-form__remark {
  display: grid;
  gap: 6px;
  padding: 12px;
  background: #f8fafc;
  border: 1px solid #e5eaf1;
  border-radius: 8px;
}

.demand-plan-form__remark > span {
  font-size: 12px;
  font-weight: 600;
  color: #475569;
}
</style>
