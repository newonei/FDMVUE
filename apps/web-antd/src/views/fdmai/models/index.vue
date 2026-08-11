<script lang="ts" setup>
import type { TableColumnsType } from 'ant-design-vue';

import type { FdmAiApi } from '#/api/fdmai';

import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';

import { useAccess } from '@vben/access';

import {
  Alert,
  Button,
  Collapse,
  Descriptions,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Popconfirm,
  Progress,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Textarea,
} from 'ant-design-vue';

import {
  createFdmAiModel,
  deleteFdmAiModel,
  discoverFdmAiProviderModels,
  getFdmAiAdapters,
  getFdmAiInvocation,
  getFdmAiModels,
  getFdmAiProviders,
  importFdmAiProviderModels,
  submitFdmAiInvocation,
  updateFdmAiModel,
} from '#/api/fdmai';

import AiCenterShell from '../shared/AiCenterShell.vue';

defineOptions({ name: 'FdmAiModels' });

const MODALITIES: FdmAiApi.Modality[] = [
  'TEXT',
  'IMAGE',
  'VIDEO',
  'AUDIO',
  'EMBEDDING',
  'RERANK',
  'MUSIC',
];
const CAPABILITIES: FdmAiApi.Capability[] = [
  'CHAT',
  'STRUCTURED_OUTPUT',
  'IMAGE_INPUT',
  'TEXT_TO_IMAGE',
  'IMAGE_TO_IMAGE',
  'MULTI_REFERENCE',
  'IMAGE_EDIT',
  'TEXT_TO_VIDEO',
  'FIRST_FRAME_TO_VIDEO',
  'FIRST_LAST_FRAME_TO_VIDEO',
  'TEXT_TO_AUDIO',
  'EMBEDDING',
  'RERANK',
  'TEXT_TO_MUSIC',
];
const TERMINAL_STATUSES = new Set([
  'CANCELED',
  'FAILED',
  'SUBMISSION_UNKNOWN',
  'SUCCEEDED',
]);
const PREFERRED_CAPABILITIES: Partial<
  Record<FdmAiApi.Modality, FdmAiApi.Capability[]>
> = {
  AUDIO: ['TEXT_TO_AUDIO'],
  EMBEDDING: ['EMBEDDING'],
  IMAGE: ['TEXT_TO_IMAGE', 'IMAGE_TO_IMAGE', 'IMAGE_EDIT', 'MULTI_REFERENCE'],
  MUSIC: ['TEXT_TO_MUSIC'],
  RERANK: ['RERANK'],
  TEXT: ['CHAT', 'STRUCTURED_OUTPUT'],
  VIDEO: ['TEXT_TO_VIDEO', 'FIRST_FRAME_TO_VIDEO', 'FIRST_LAST_FRAME_TO_VIDEO'],
};
const CAPABILITIES_BY_MODALITY: Record<
  FdmAiApi.Modality,
  FdmAiApi.Capability[]
> = {
  AUDIO: ['TEXT_TO_AUDIO'],
  EMBEDDING: ['EMBEDDING'],
  IMAGE: ['TEXT_TO_IMAGE', 'IMAGE_TO_IMAGE', 'MULTI_REFERENCE', 'IMAGE_EDIT'],
  MUSIC: ['TEXT_TO_MUSIC'],
  RERANK: ['RERANK'],
  TEXT: ['CHAT', 'STRUCTURED_OUTPUT', 'IMAGE_INPUT'],
  VIDEO: ['TEXT_TO_VIDEO', 'FIRST_FRAME_TO_VIDEO', 'FIRST_LAST_FRAME_TO_VIDEO'],
};
const MODALITY_LABELS: Record<FdmAiApi.Modality, string> = {
  AUDIO: '语音生成',
  EMBEDDING: '向量',
  IMAGE: '图片生成',
  MUSIC: '音乐生成',
  RERANK: '重排序',
  TEXT: '文本对话',
  VIDEO: '视频生成',
};
const CAPABILITY_LABELS: Record<FdmAiApi.Capability, string> = {
  CHAT: '对话/文本生成',
  EMBEDDING: '生成向量',
  FIRST_FRAME_TO_VIDEO: '首帧生视频',
  FIRST_LAST_FRAME_TO_VIDEO: '首尾帧生视频',
  IMAGE_EDIT: '图片编辑',
  IMAGE_INPUT: '图片理解',
  IMAGE_TO_IMAGE: '参考图生图',
  MULTI_REFERENCE: '多参考图',
  RERANK: '文本重排序',
  STRUCTURED_OUTPUT: '结构化 JSON',
  TEXT_TO_AUDIO: '文本生成语音',
  TEXT_TO_IMAGE: '文生图',
  TEXT_TO_MUSIC: '文本生成音乐',
  TEXT_TO_VIDEO: '文生视频',
};

interface SyncProviderModel extends FdmAiApi.ProviderModelInfo {
  userConfirmed: boolean;
}

const { hasAccessByCodes } = useAccess();
const canManagePlatform = hasAccessByCodes(['fdmai:platform:manage']);
const canTestModel =
  hasAccessByCodes(['fdmai:invocation:create']) &&
  hasAccessByCodes(['fdmai:invocation:query']);
const loading = ref(false);
const saving = ref(false);
const modalOpen = ref(false);
const syncOpen = ref(false);
const discovering = ref(false);
const importing = ref(false);
const testOpen = ref(false);
const testSubmitting = ref(false);
const testPolling = ref(false);
const testElapsedMillis = ref(0);
const testModel = ref<FdmAiApi.ModelDefinition>();
const testSnapshot = ref<FdmAiApi.InvocationSnapshot>();
const testInvocationId = ref('');
const editingId = ref<number>();
const rows = ref<FdmAiApi.ModelDefinition[]>([]);
const providers = ref<FdmAiApi.ProviderAccount[]>([]);
const adapters = ref<FdmAiApi.AdapterDescriptor[]>([]);
const filterModality = ref<FdmAiApi.Modality>();
const syncProviderId = ref<number>();
const discoveredModels = ref<SyncProviderModel[]>([]);
const selectedModelIds = ref<string[]>([]);
const manualProviderModel = ref('');
const adjustOpen = ref(false);
const adjustingModelId = ref('');
const adjustment = reactive<{
  capabilities: FdmAiApi.Capability[];
  modality?: FdmAiApi.Modality;
}>({
  capabilities: [],
  modality: undefined,
});
const commonParametersJson = ref('{}');
const testForm = reactive<{
  capability?: FdmAiApi.Capability;
  negativePrompt: string;
  prompt: string;
  referenceUrl: string;
}>({
  capability: undefined,
  negativePrompt: '',
  prompt: '',
  referenceUrl: '',
});
const form = reactive<FdmAiApi.ModelSaveReq>({
  capabilities: ['CHAT'],
  code: '',
  currency: 'CNY',
  enabled: true,
  modality: 'TEXT',
  name: '',
  parameterSchema: '{\n  "type": "object",\n  "properties": {}\n}',
  unitPrice: 0,
});

const filteredRows = computed(() =>
  filterModality.value
    ? rows.value.filter((row) => row.modality === filterModality.value)
    : rows.value,
);
const activeSyncProvider = computed(() =>
  providers.value.find((item) => item.id === syncProviderId.value),
);
const activeSyncAdapter = computed(() =>
  adapters.value.find(
    (item) => item.code === activeSyncProvider.value?.adapterCode,
  ),
);
const syncAdapterCapabilityUnavailable = computed(
  () =>
    Boolean(syncProviderId.value) &&
    (!activeSyncAdapter.value ||
      !Array.isArray(activeSyncAdapter.value.capabilities) ||
      activeSyncAdapter.value.capabilities.length === 0),
);
const providerOptions = computed(() =>
  providers.value
    .filter((item) => item.enabled)
    .map((item) => ({
      label: `${item.name} · ${item.adapterCode}${item.platform ? ' · 平台' : ''}`,
      value: item.id,
    })),
);
const rowSelection = computed(() => ({
  getCheckboxProps: (record: SyncProviderModel) => {
    const ready = isSyncModelReady(record);
    let title: string | undefined;
    if (!ready) {
      title =
        record.importable === false
          ? '该模型不支持当前服务商接入方式'
          : '模型类型尚未确认，请先点击“确认类型”';
    }
    return { disabled: !ready, title };
  },
  onChange: (keys: Array<number | string>) => {
    selectedModelIds.value = keys.map(String);
  },
  selectedRowKeys: selectedModelIds.value,
}));
const pendingConfirmationCount = computed(
  () => discoveredModels.value.filter((item) => !isSyncModelReady(item)).length,
);
const readyModelCount = computed(
  () => discoveredModels.value.length - pendingConfirmationCount.value,
);
const syncModalityOptions = computed(() => {
  const modalities = activeSyncAdapter.value?.modalities?.length
    ? activeSyncAdapter.value.modalities
    : MODALITIES;
  return modalities
    .filter((value) => supportedCapabilities(value).length > 0)
    .map((value) => ({
      label: `${MODALITY_LABELS[value]}（${value}）`,
      value,
    }));
});
const adjustmentCapabilityOptions = computed(() =>
  adjustment.modality
    ? supportedCapabilities(adjustment.modality).map((value) => ({
        label: `${CAPABILITY_LABELS[value]}（${value}）`,
        value,
      }))
    : [],
);
const testCapabilityOptions = computed(() =>
  (testModel.value?.capabilities ?? [])
    .filter(
      (capability) =>
        !(testModel.value?.modality === 'TEXT' && capability === 'IMAGE_INPUT'),
    )
    .map((value) => ({
      label: `${CAPABILITY_LABELS[value]}（${value}）`,
      value,
    })),
);

const columns: TableColumnsType<FdmAiApi.ModelDefinition> = [
  { dataIndex: 'name', title: '模型名称', width: 190 },
  { dataIndex: 'code', title: '模型编码', width: 190 },
  { dataIndex: 'modality', title: '模态', width: 100 },
  { dataIndex: 'capabilities', title: '能力' },
  { dataIndex: 'unitPrice', title: '参考单价', width: 120 },
  { dataIndex: 'enabled', title: '状态', width: 90 },
  { dataIndex: 'action', fixed: 'right', title: '操作', width: 210 },
];
const discoveryColumns: TableColumnsType<SyncProviderModel> = [
  { dataIndex: 'id', title: '上游模型', width: 220 },
  { dataIndex: 'modality', title: '输出类型', width: 130 },
  { dataIndex: 'capabilities', title: '支持的调用方式', width: 280 },
  { dataIndex: 'classification', title: '识别依据', width: 170 },
  { dataIndex: 'syncAction', fixed: 'right', title: '操作', width: 100 },
];

async function load() {
  loading.value = true;
  try {
    [rows.value, providers.value, adapters.value] = await Promise.all([
      getFdmAiModels(),
      getFdmAiProviders(canManagePlatform),
      getFdmAiAdapters(),
    ]);
  } finally {
    loading.value = false;
  }
}

function resetForm() {
  editingId.value = undefined;
  Object.assign(form, {
    capabilities: ['CHAT'],
    code: '',
    currency: 'CNY',
    enabled: true,
    modality: 'TEXT',
    name: '',
    parameterSchema: '{\n  "type": "object",\n  "properties": {}\n}',
    unitPrice: 0,
  });
}

function openCreate() {
  resetForm();
  modalOpen.value = true;
}

function openEdit(record: unknown) {
  const model = record as FdmAiApi.ModelDefinition;
  editingId.value = model.id;
  Object.assign(form, {
    capabilities: [...model.capabilities],
    code: model.code,
    currency: model.currency || 'CNY',
    enabled: model.enabled,
    modality: model.modality,
    name: model.name,
    parameterSchema: model.parameterSchema || '{}',
    unitPrice: model.unitPrice || 0,
  });
  modalOpen.value = true;
}

async function save() {
  if (
    !form.name.trim() ||
    !form.code.trim() ||
    form.capabilities.length === 0
  ) {
    message.warning('请填写模型名称、编码并至少选择一项能力');
    return;
  }
  try {
    JSON.parse(form.parameterSchema || '{}');
  } catch {
    message.error('参数 Schema 不是有效 JSON');
    return;
  }
  saving.value = true;
  try {
    await (editingId.value
      ? updateFdmAiModel(editingId.value, form)
      : createFdmAiModel(form));
    modalOpen.value = false;
    message.success('模型已保存');
    await load();
  } finally {
    saving.value = false;
  }
}

function openSync() {
  syncProviderId.value = providerOptions.value[0]?.value;
  discoveredModels.value = [];
  selectedModelIds.value = [];
  manualProviderModel.value = '';
  syncOpen.value = true;
  if (syncProviderId.value) void discoverModels();
}

async function changeSyncProvider() {
  discoveredModels.value = [];
  selectedModelIds.value = [];
  await discoverModels();
}

function isSyncModelReady(record: unknown) {
  const model = record as SyncProviderModel;
  if (model.importable === false) return false;
  if (!model.modality || !model.capabilities?.length) return false;
  const modalityCapabilities = supportedCapabilities(model.modality);
  if (
    !model.capabilities.every((capability) =>
      modalityCapabilities.includes(capability),
    )
  ) {
    return false;
  }
  return !model.requiresConfirmation || model.userConfirmed;
}

function supportedCapabilities(modality: FdmAiApi.Modality) {
  const modalityCapabilities = CAPABILITIES_BY_MODALITY[modality];
  const adapterCapabilities = activeSyncAdapter.value?.capabilities;
  if (!adapterCapabilities?.length) return [];
  return modalityCapabilities.filter((capability) =>
    adapterCapabilities.includes(capability),
  );
}

function normalizeDiscoveredModel(
  model: FdmAiApi.ProviderModelInfo,
): SyncProviderModel {
  const allowed = model.modality
    ? supportedCapabilities(model.modality)
    : ([] as FdmAiApi.Capability[]);
  const originalCapabilities = model.capabilities ?? [];
  const capabilities = originalCapabilities.filter((capability) =>
    allowed.includes(capability),
  );
  const capabilitiesReduced =
    capabilities.length !== originalCapabilities.length;
  return {
    ...model,
    capabilities,
    classificationNote: capabilitiesReduced
      ? model.classificationNote ||
        '服务商声明的部分能力未被当前适配器实现，已仅保留可执行能力'
      : model.classificationNote,
    metadata: model.metadata || {},
    requiresConfirmation:
      Boolean(model.requiresConfirmation) || capabilitiesReduced,
    userConfirmed: false,
  };
}

async function discoverModels() {
  if (!syncProviderId.value) {
    message.warning('请先选择服务商账号');
    return;
  }
  discovering.value = true;
  try {
    const models = await discoverFdmAiProviderModels(syncProviderId.value);
    discoveredModels.value = models.map((item) =>
      normalizeDiscoveredModel(item),
    );
    selectedModelIds.value = discoveredModels.value
      .filter((item) => isSyncModelReady(item))
      .map((item) => item.id);
    if (discoveredModels.value.length === 0) {
      message.info('该服务商未返回模型目录，可在下方手动添加模型 ID');
    }
  } finally {
    discovering.value = false;
  }
}

function firstCapability(modality: FdmAiApi.Modality) {
  return supportedCapabilities(modality)[0];
}

function inferManualModel(id: string): SyncProviderModel {
  const normalized = id.toLowerCase();
  const candidates: Array<{
    capability: FdmAiApi.Capability;
    modality: FdmAiApi.Modality;
    pattern: RegExp;
  }> = [
    {
      capability: 'EMBEDDING',
      modality: 'EMBEDDING',
      pattern: /embed|embedding/,
    },
    { capability: 'RERANK', modality: 'RERANK', pattern: /rerank/ },
    {
      capability: 'TEXT_TO_IMAGE',
      modality: 'IMAGE',
      pattern: /dall[-_]?e|flux|gpt[-_]?image|image|sdxl|seedream/,
    },
    {
      capability: 'TEXT_TO_VIDEO',
      modality: 'VIDEO',
      pattern: /kling|sora|veo|video/,
    },
    {
      capability: 'TEXT_TO_MUSIC',
      modality: 'MUSIC',
      pattern: /music|suno/,
    },
    {
      capability: 'TEXT_TO_AUDIO',
      modality: 'AUDIO',
      pattern: /audio|speech|tts|voice/,
    },
    {
      capability: 'CHAT',
      modality: 'TEXT',
      pattern: /claude|codex|deepseek|gemini|gpt|llama|qwen/,
    },
  ];
  const adapterModalities = activeSyncAdapter.value?.modalities ?? MODALITIES;
  const candidate = candidates.find(
    (item) =>
      item.pattern.test(normalized) &&
      adapterModalities.includes(item.modality),
  );
  const onlyAdapterModality =
    adapterModalities.length === 1 ? adapterModalities[0] : undefined;
  const modality = candidate?.modality ?? onlyAdapterModality;
  const capability =
    candidate?.capability ?? (modality ? firstCapability(modality) : undefined);
  return {
    capabilities: capability ? [capability] : [],
    classificationConfidence: candidate ? 'MEDIUM' : 'LOW',
    classificationSource: candidate ? 'MODEL_PATTERN' : 'FALLBACK',
    id,
    importable: true,
    metadata: { manual: true },
    modality,
    name: id,
    requiresConfirmation: true,
    userConfirmed: false,
  };
}

function addManualModel() {
  const id = manualProviderModel.value.trim();
  if (!id) return;
  if (discoveredModels.value.some((item) => item.id === id)) {
    message.info('该模型已经在列表中');
    return;
  }
  discoveredModels.value = [inferManualModel(id), ...discoveredModels.value];
  manualProviderModel.value = '';
  message.info('已添加，请确认模型类型后再导入');
}

function openModelAdjustment(record: unknown) {
  const model = record as SyncProviderModel;
  adjustingModelId.value = model.id;
  adjustment.modality = model.modality;
  adjustment.capabilities = model.capabilities ? [...model.capabilities] : [];
  adjustOpen.value = true;
}

function handleAdjustmentModalityChange(value: unknown) {
  if (
    typeof value !== 'string' ||
    !MODALITIES.includes(value as FdmAiApi.Modality)
  ) {
    return;
  }
  const modality = value as FdmAiApi.Modality;
  const allowed = supportedCapabilities(modality);
  adjustment.capabilities = adjustment.capabilities.filter((capability) =>
    allowed.includes(capability),
  );
  if (adjustment.capabilities.length === 0) {
    const defaultCapability = allowed[0];
    if (defaultCapability) adjustment.capabilities = [defaultCapability];
  }
}

function confirmModelAdjustment() {
  if (!adjustment.modality || adjustment.capabilities.length === 0) {
    message.warning('请选择模型模态和至少一项能力');
    return;
  }
  const allowed = supportedCapabilities(adjustment.modality);
  const unsupported = adjustment.capabilities.filter(
    (capability) => !allowed.includes(capability),
  );
  if (unsupported.length > 0) {
    message.error(
      `当前服务商接入方式不支持：${unsupported.map((capability) => capabilityLabel(capability)).join('、')}`,
    );
    return;
  }
  const modelIndex = discoveredModels.value.findIndex(
    (item) => item.id === adjustingModelId.value,
  );
  if (modelIndex === -1) return;
  const model = discoveredModels.value[modelIndex];
  if (!model) return;
  const updated: SyncProviderModel = {
    ...model,
    capabilities: [...adjustment.capabilities],
    modality: adjustment.modality,
    userConfirmed: true,
  };
  discoveredModels.value = discoveredModels.value.map((item, index) =>
    index === modelIndex ? updated : item,
  );
  if (!selectedModelIds.value.includes(updated.id)) {
    selectedModelIds.value = [...selectedModelIds.value, updated.id];
  }
  adjustOpen.value = false;
  message.success('模型类型已确认并选中');
}

function confidenceLabel(confidence?: string) {
  return (
    {
      HIGH: '高置信',
      LOW: '低置信',
      MEDIUM: '中置信',
    }[confidence || ''] || '未识别'
  );
}

function confidenceColor(confidence?: string) {
  if (confidence === 'HIGH') return 'green';
  if (confidence === 'MEDIUM') return 'blue';
  return 'orange';
}

function classificationSourceLabel(source?: string) {
  return (
    {
      FALLBACK: '保守推断',
      MODEL_PATTERN: '模型名称规则',
      PROVIDER_METADATA: '服务商元数据',
    }[source || ''] || '无可靠依据'
  );
}

function modalityLabel(value: unknown) {
  return typeof value === 'string' && value in MODALITY_LABELS
    ? MODALITY_LABELS[value as FdmAiApi.Modality]
    : String(value || '待确认');
}

function capabilityLabel(value: unknown) {
  return typeof value === 'string' && value in CAPABILITY_LABELS
    ? CAPABILITY_LABELS[value as FdmAiApi.Capability]
    : String(value || '待确认');
}

async function importSelectedModels() {
  if (!syncProviderId.value || selectedModelIds.value.length === 0) {
    message.warning('请至少选择一个上游模型');
    return;
  }
  const selected = new Set(selectedModelIds.value);
  const selectedModels = discoveredModels.value.filter((item) =>
    selected.has(item.id),
  );
  if (selectedModels.some((item) => !isSyncModelReady(item))) {
    message.warning('存在尚未确认类型的模型，请先完成确认');
    return;
  }
  const unsupportedModel = selectedModels.find((item) => {
    if (!item.modality) return true;
    const allowed = supportedCapabilities(item.modality);
    return !(item.capabilities ?? []).every((capability) =>
      allowed.includes(capability),
    );
  });
  if (unsupportedModel) {
    message.error(
      `模型 ${unsupportedModel.id} 包含当前适配器无法执行的能力，请重新确认类型`,
    );
    return;
  }
  const models = selectedModels.map((item) => ({
    capabilities: [...(item.capabilities ?? [])],
    modality: item.modality,
    name: item.name || item.id,
    providerModel: item.id,
  }));
  importing.value = true;
  try {
    const result = await importFdmAiProviderModels({
      models,
      providerAccountId: syncProviderId.value,
    });
    const created = result.filter((item) => item.created).length;
    message.success(
      `已处理 ${result.length} 个模型：新建 ${created} 个，复用 ${result.length - created} 个`,
    );
    syncOpen.value = false;
    await load();
  } finally {
    importing.value = false;
  }
}

let testPollTimer: ReturnType<typeof setTimeout> | undefined;
let testPollVersion = 0;
let testStartedAt = 0;

function isTerminalStatus(status?: string) {
  return TERMINAL_STATUSES.has(String(status || '').toUpperCase());
}

function testStatusLabel(status?: string) {
  const labels: Record<string, string> = {
    CANCELED: '已取消',
    CANCELING: '取消中',
    CANCEL_REQUESTED: '等待取消',
    CREATED: '已创建',
    DOWNLOADING: '结果归档中',
    FAILED: '失败',
    QUEUED: '排队中',
    RESULT_RECEIVED: '结果已接收',
    RUNNING: '运行中',
    SUBMISSION_UNKNOWN: '提交状态未知',
    SUBMITTING: '提交中',
    SUCCEEDED: '成功',
    WAITING_PROVIDER: '等待服务商',
  };
  return labels[String(status || '').toUpperCase()] || status || '未提交';
}

function testStatusColor(status?: string) {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'SUCCEEDED') return 'success';
  if (normalized === 'FAILED') return 'error';
  if (normalized === 'SUBMISSION_UNKNOWN') return 'orange';
  if (normalized === 'CANCELED') return 'default';
  if (normalized.startsWith('CANCEL')) return 'warning';
  if (['DOWNLOADING', 'RESULT_RECEIVED', 'RUNNING'].includes(normalized))
    return 'processing';
  return 'blue';
}

function elapsedText(millis: number) {
  if (millis < 1000) return `${millis} ms`;
  if (millis < 60_000) return `${(millis / 1000).toFixed(1)} 秒`;
  return `${(millis / 60_000).toFixed(1)} 分钟`;
}

function preferredCapability(model: FdmAiApi.ModelDefinition) {
  const primaryCapabilities = model.capabilities.filter(
    (capability) =>
      !(model.modality === 'TEXT' && capability === 'IMAGE_INPUT'),
  );
  const preferred = PREFERRED_CAPABILITIES[model.modality] ?? [];
  return (
    preferred.find((capability) => primaryCapabilities.includes(capability)) ??
    primaryCapabilities[0]
  );
}

function createTestIdempotencyKey(modelId: number) {
  const random =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `fdmai-model-test-${modelId}-${random}`;
}

function stopTestPolling() {
  testPollVersion += 1;
  if (testPollTimer) globalThis.clearTimeout(testPollTimer);
  testPollTimer = undefined;
  testPolling.value = false;
}

async function pollTestInvocation(invocationId: string, version: number) {
  if (version !== testPollVersion || !testOpen.value) return;
  try {
    const snapshot = await getFdmAiInvocation(invocationId);
    if (version !== testPollVersion || !testOpen.value) return;
    testSnapshot.value = snapshot;
    testElapsedMillis.value = Math.max(0, Date.now() - testStartedAt);
    if (isTerminalStatus(snapshot.status)) {
      stopTestPolling();
      return;
    }
    testPollTimer = globalThis.setTimeout(
      () => void pollTestInvocation(invocationId, version),
      1000,
    );
  } catch {
    if (version !== testPollVersion) return;
    stopTestPolling();
    message.warning('状态查询失败，已停止自动刷新，可点击“继续查询”重试');
  }
}

function startTestPolling() {
  if (!testInvocationId.value) return;
  stopTestPolling();
  testPolling.value = true;
  const version = testPollVersion;
  void pollTestInvocation(testInvocationId.value, version);
}

function openModelTest(record: unknown) {
  const model = record as FdmAiApi.ModelDefinition;
  stopTestPolling();
  testModel.value = model;
  testSnapshot.value = undefined;
  testInvocationId.value = '';
  testElapsedMillis.value = 0;
  commonParametersJson.value = '{}';
  Object.assign(testForm, {
    capability: preferredCapability(model),
    negativePrompt: '',
    prompt: '',
    referenceUrl: '',
  });
  testOpen.value = true;
}

function parseCommonParameters() {
  try {
    const value: unknown = JSON.parse(commonParametersJson.value || '{}');
    if (!value || Array.isArray(value) || typeof value !== 'object') {
      message.error('通用参数必须是 JSON 对象');
      return undefined;
    }
    return value as Record<string, unknown>;
  } catch {
    message.error('通用参数不是有效 JSON');
    return undefined;
  }
}

async function submitModelTest() {
  const model = testModel.value;
  if (!model || !testForm.capability) {
    message.warning('当前模型没有可用于测试的主能力');
    return;
  }
  if (!testForm.prompt.trim()) {
    message.warning('请输入测试提示词');
    return;
  }
  const referenceUrl = testForm.referenceUrl.trim();
  if (
    model.modality === 'TEXT' &&
    referenceUrl &&
    !model.capabilities.includes('IMAGE_INPUT')
  ) {
    message.warning('该文本模型未声明图片输入能力，不能填写参考 URL');
    return;
  }
  const commonParameters = parseCommonParameters();
  if (!commonParameters) return;

  stopTestPolling();
  testSubmitting.value = true;
  testSnapshot.value = undefined;
  testInvocationId.value = '';
  testElapsedMillis.value = 0;
  testStartedAt = Date.now();
  try {
    const ticket = await submitFdmAiInvocation({
      additionalRequiredCapabilities:
        model.modality === 'TEXT' && referenceUrl ? ['IMAGE_INPUT'] : [],
      businessId: `${model.id}:${model.code}`,
      businessType: 'MODEL_TEST',
      caller: 'fdmai-model-console',
      capability: testForm.capability,
      commonParameters,
      idempotencyKey: createTestIdempotencyKey(model.id),
      input: {
        negativePrompt: testForm.negativePrompt.trim() || undefined,
        prompt: testForm.prompt.trim(),
        referenceUrls: referenceUrl ? [referenceUrl] : [],
        variables: {},
      },
      logicalModelId: model.id,
      modality: model.modality,
      providerOptions: {},
    });
    if (!testOpen.value) return;
    testInvocationId.value = ticket.invocationId;
    testSnapshot.value = {
      invocationId: ticket.invocationId,
      logicalModelId: model.id,
      outputs: [],
      progress: 0,
      status: ticket.status,
    };
    startTestPolling();
  } finally {
    testSubmitting.value = false;
  }
}

function closeModelTest() {
  stopTestPolling();
  testOpen.value = false;
}

function handleTestOpenChange(open: boolean) {
  if (!open) stopTestPolling();
}

function isImageOutput(output: FdmAiApi.InvocationOutput) {
  return (
    output.type?.toUpperCase() === 'IMAGE' ||
    output.mimeType?.startsWith('image/')
  );
}

function isVideoOutput(output: FdmAiApi.InvocationOutput) {
  return (
    output.type?.toUpperCase() === 'VIDEO' ||
    output.mimeType?.startsWith('video/')
  );
}

async function remove(id: number) {
  await deleteFdmAiModel(id);
  message.success('模型已下线');
  await load();
}

onMounted(load);
onBeforeUnmount(stopTestPolling);
</script>

<template>
  <AiCenterShell
    description="接入模型用于把工作台选择与具体平台模型 ID 关联，更换地址或密钥无需修改工作流"
    title="模型管理"
  >
    <template #actions>
      <Space>
        <Button
          v-if="canManagePlatform"
          v-access:code="['fdmai:model:create', 'fdmai:route:create']"
          type="primary"
          @click="openSync"
        >
          从服务商同步模型
        </Button>
        <Button v-access:code="['fdmai:model:create']" @click="openCreate">
          手动新增（高级）
        </Button>
      </Space>
    </template>

    <Alert
      message="同步模型会同时创建对应调用路由；重复同步同一服务商模型时会复用已有配置。"
      show-icon
      type="info"
    />

    <div class="filter-bar">
      <Select
        v-model:value="filterModality"
        allow-clear
        :options="
          MODALITIES.map((value) => ({
            label: `${MODALITY_LABELS[value]}（${value}）`,
            value,
          }))
        "
        placeholder="筛选模态"
      />
      <span>共 {{ filteredRows.length }} 个已接入模型</span>
    </div>
    <Table
      :columns="columns"
      :data-source="filteredRows"
      :loading="loading"
      row-key="id"
      :scroll="{ x: 1060 }"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.dataIndex === 'modality'">
          <div class="model-type-cell">
            <Tag color="geekblue" :title="record.modality">
              {{ modalityLabel(record.modality) }}
            </Tag>
            <small>{{ record.modality }}</small>
          </div>
        </template>
        <template v-else-if="column.dataIndex === 'capabilities'">
          <Space :size="4" wrap>
            <Tag
              v-for="capability in record.capabilities"
              :key="capability"
              :title="capability"
            >
              {{ capabilityLabel(capability) }}
            </Tag>
          </Space>
        </template>
        <template v-else-if="column.dataIndex === 'unitPrice'">
          {{ record.unitPrice ?? 0 }} {{ record.currency || 'CNY' }}
        </template>
        <template v-else-if="column.dataIndex === 'enabled'">
          <Tag :color="record.enabled ? 'green' : 'default'">
            {{ record.enabled ? '启用' : '停用' }}
          </Tag>
        </template>
        <template v-else-if="column.dataIndex === 'action'">
          <Space>
            <Button
              v-if="canTestModel"
              :disabled="!record.enabled"
              size="small"
              type="link"
              @click="openModelTest(record)"
            >
              测试调用
            </Button>
            <Button
              v-access:code="['fdmai:model:update']"
              size="small"
              type="link"
              @click="openEdit(record)"
            >
              编辑
            </Button>
            <Popconfirm
              title="确认下线该模型？历史调用仍会保留。"
              @confirm="remove(record.id)"
            >
              <Button
                v-access:code="['fdmai:model:delete']"
                danger
                size="small"
                type="link"
              >
                下线
              </Button>
            </Popconfirm>
          </Space>
        </template>
      </template>
    </Table>

    <Modal
      v-model:open="testOpen"
      destroy-on-close
      :title="`测试调用 · ${testModel?.name || ''}`"
      :width="780"
      @after-open-change="handleTestOpenChange"
      @cancel="closeModelTest"
    >
      <Alert
        class="test-alert"
        :message="
          testModel
            ? `${testModel.name} · ${testModel.modality} · ${testModel.code}`
            : '请选择模型'
        "
        show-icon
        type="info"
      />

      <Form layout="vertical">
        <Form.Item label="请求动作" required>
          <Select
            v-model:value="testForm.capability"
            :options="testCapabilityOptions"
            placeholder="选择模型能力"
          />
          <small class="test-hint">
            文本模型的 IMAGE_INPUT 会在填写参考 URL 时自动作为附加能力提交。
          </small>
        </Form.Item>
        <Form.Item label="提示词" required>
          <Textarea
            v-model:value="testForm.prompt"
            placeholder="输入一条用于验证模型连通性和输出效果的提示词"
            :rows="4"
          />
        </Form.Item>
        <div class="two-columns">
          <Form.Item label="负面提示词（可选）">
            <Textarea
              v-model:value="testForm.negativePrompt"
              placeholder="图片或视频模型可填写不希望出现的内容"
              :rows="2"
            />
          </Form.Item>
          <Form.Item label="参考 URL（可选）">
            <Input
              v-model:value="testForm.referenceUrl"
              placeholder="https://example.com/reference.png"
            />
          </Form.Item>
        </div>
        <Collapse class="advanced-collapse" ghost>
          <Collapse.Panel key="test-advanced" header="高级参数">
            <Form.Item label="通用参数（JSON）">
              <Textarea v-model:value="commonParametersJson" :rows="6" />
            </Form.Item>
          </Collapse.Panel>
        </Collapse>
      </Form>

      <section v-if="testSnapshot" class="test-result">
        <Descriptions bordered :column="2" size="small">
          <Descriptions.Item label="调用编号" :span="2">
            <code>{{ testSnapshot.invocationId }}</code>
          </Descriptions.Item>
          <Descriptions.Item label="状态">
            <Tag :color="testStatusColor(testSnapshot.status)">
              {{ testStatusLabel(testSnapshot.status) }}
            </Tag>
            <Tag v-if="testPolling" color="processing">自动刷新中</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="耗时">
            {{ elapsedText(testElapsedMillis) }}
          </Descriptions.Item>
          <Descriptions.Item label="服务商">
            {{ testSnapshot.providerCode || '-' }}
          </Descriptions.Item>
          <Descriptions.Item label="进度">
            {{ testSnapshot.progress ?? 0 }}%
          </Descriptions.Item>
        </Descriptions>
        <Progress
          class="test-progress"
          :percent="testSnapshot.progress ?? 0"
          :status="
            testSnapshot.status === 'FAILED'
              ? 'exception'
              : testSnapshot.status === 'SUCCEEDED'
                ? 'success'
                : 'active'
          "
        />
        <Alert
          v-if="testSnapshot.errorMessage || testSnapshot.errorCode"
          class="test-alert"
          :description="testSnapshot.errorMessage"
          :message="testSnapshot.errorCode || '模型调用失败'"
          show-icon
          type="error"
        />

        <div v-if="testSnapshot.outputs.length" class="test-outputs">
          <article
            v-for="(output, index) in testSnapshot.outputs"
            :key="`${output.type}-${index}`"
            class="test-output-card"
          >
            <div class="test-output-heading">
              <Tag color="blue">{{ output.type }}</Tag>
              <span>{{ output.mimeType || '-' }}</span>
              <a
                v-if="output.url"
                :href="output.url"
                rel="noopener noreferrer"
                target="_blank"
              >
                打开原文件
              </a>
            </div>
            <img
              v-if="isImageOutput(output) && output.url"
              :alt="`测试输出 ${index + 1}`"
              class="test-media"
              :src="output.url"
            />
            <video
              v-else-if="isVideoOutput(output) && output.url"
              class="test-media"
              controls
              :src="output.url"
            ></video>
            <pre v-else-if="output.text" class="test-text-output">{{
              output.text
            }}</pre>
          </article>
        </div>
      </section>

      <template #footer>
        <Button @click="closeModelTest">关闭</Button>
        <Button v-if="testPolling" @click="stopTestPolling">停止轮询</Button>
        <Button
          v-else-if="
            testInvocationId && !isTerminalStatus(testSnapshot?.status)
          "
          @click="startTestPolling"
        >
          继续查询
        </Button>
        <Button
          :disabled="testCapabilityOptions.length === 0"
          :loading="testSubmitting"
          type="primary"
          @click="submitModelTest"
        >
          {{ testInvocationId ? '再次测试' : '开始测试' }}
        </Button>
      </template>
    </Modal>

    <Modal v-model:open="syncOpen" title="从服务商同步模型" :width="1080">
      <Form layout="vertical">
        <div class="sync-provider-row">
          <Form.Item class="provider-field" label="服务商账号" required>
            <Select
              v-model:value="syncProviderId"
              option-filter-prop="label"
              :options="providerOptions"
              placeholder="选择已接入的服务商"
              show-search
              @change="changeSyncProvider"
            />
          </Form.Item>
          <Button
            :disabled="!syncProviderId"
            :loading="discovering"
            @click="discoverModels"
          >
            重新拉取
          </Button>
        </div>

        <Alert
          v-if="syncAdapterCapabilityUnavailable"
          class="sync-alert"
          description="当前运行中的后端尚未返回适配器能力清单。请重启 FDMServer 后刷新页面，再重新拉取模型；为避免导入无法调用的能力，本页已暂时禁止导入。"
          message="服务端版本尚未生效"
          show-icon
          type="error"
        />

        <Alert
          class="sync-alert"
          :description="
            discoveredModels.length
              ? pendingConfirmationCount
                ? '低置信、缺少类型信息或不受当前接入方式支持的模型不会自动选中。点击对应模型的“确认类型”即可调整。同步目录与自动识别不会调用模型、不产生模型费用；导入后可点击“测试调用”验证。'
                : '所有模型均已识别，可以直接导入。同步目录与自动识别不会调用模型、不产生模型费用；导入后可点击“测试调用”验证。'
              : undefined
          "
          :message="
            discoveredModels.length
              ? `已获取 ${discoveredModels.length} 个模型，可直接导入 ${readyModelCount} 个，待处理 ${pendingConfirmationCount} 个。`
              : '如果平台不支持模型目录接口，可以手动添加准确的上游模型 ID。'
          "
          show-icon
          :type="
            discoveredModels.length > 0 && pendingConfirmationCount === 0
              ? 'success'
              : 'warning'
          "
        />

        <div class="manual-model-row">
          <Input
            v-model:value="manualProviderModel"
            placeholder="手动添加模型 ID，例如 gpt-5.2"
            @press-enter="addManualModel"
          />
          <Button @click="addManualModel">添加</Button>
        </div>

        <Table
          :columns="discoveryColumns"
          :data-source="discoveredModels"
          :loading="discovering"
          :pagination="{ pageSize: 6 }"
          :row-selection="rowSelection"
          row-key="id"
          :scroll="{ x: 900 }"
          size="small"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.dataIndex === 'id'">
              <div class="sync-model-name">{{ record.name || record.id }}</div>
              <code class="sync-model-id">{{ record.id }}</code>
              <div v-if="record.ownedBy" class="sync-model-owner">
                {{ record.ownedBy }}
              </div>
            </template>
            <template v-else-if="column.dataIndex === 'modality'">
              <div v-if="record.modality" class="model-type-cell">
                <Tag color="geekblue" :title="record.modality">
                  {{ modalityLabel(record.modality) }}
                </Tag>
                <small>{{ record.modality }}</small>
              </div>
              <Tag v-else color="orange">待确认</Tag>
            </template>
            <template v-else-if="column.dataIndex === 'capabilities'">
              <Space v-if="record.capabilities?.length" :size="4" wrap>
                <Tag
                  v-for="capability in record.capabilities"
                  :key="capability"
                  :title="capability"
                >
                  {{ capabilityLabel(capability) }}
                </Tag>
              </Space>
              <span v-else class="muted-text">待确认</span>
            </template>
            <template v-else-if="column.dataIndex === 'classification'">
              <div class="classification-cell">
                <Tag v-if="record.importable === false" color="red">
                  当前接入不支持
                </Tag>
                <Tag v-else-if="record.userConfirmed" color="green">
                  已人工确认
                </Tag>
                <Tag
                  v-else
                  :color="confidenceColor(record.classificationConfidence)"
                >
                  {{ confidenceLabel(record.classificationConfidence) }}
                </Tag>
                <span>{{
                  classificationSourceLabel(record.classificationSource)
                }}</span>
                <small v-if="record.classificationNote">
                  {{ record.classificationNote }}
                </small>
              </div>
            </template>
            <template v-else-if="column.dataIndex === 'syncAction'">
              <Button
                :disabled="record.importable === false"
                size="small"
                type="link"
                @click="openModelAdjustment(record)"
              >
                {{ isSyncModelReady(record) ? '调整类型' : '确认类型' }}
              </Button>
            </template>
          </template>
        </Table>
      </Form>
      <template #footer>
        <Button @click="syncOpen = false">取消</Button>
        <Button
          :disabled="
            selectedModelIds.length === 0 || syncAdapterCapabilityUnavailable
          "
          :loading="importing"
          type="primary"
          @click="importSelectedModels"
        >
          导入 {{ selectedModelIds.length }} 个模型
        </Button>
      </template>
    </Modal>

    <Modal
      v-model:open="adjustOpen"
      :title="`确认模型类型 · ${adjustingModelId}`"
      :width="600"
      @ok="confirmModelAdjustment"
    >
      <Alert
        class="test-alert"
        description="模型目录通常只返回 ID，系统会先自动识别；不确定的模型需要您确认一次，避免把图片模型当成文本模型调用。"
        message="请选择这个模型实际支持的输入输出类型"
        show-icon
        type="info"
      />
      <Form layout="vertical">
        <Form.Item label="输出类型" required>
          <Select
            v-model:value="adjustment.modality"
            :options="syncModalityOptions"
            placeholder="选择 TEXT、IMAGE、VIDEO 等类型"
            @change="handleAdjustmentModalityChange"
          />
        </Form.Item>
        <Form.Item label="调用方式" required>
          <Select
            v-model:value="adjustment.capabilities"
            :disabled="!adjustment.modality"
            mode="multiple"
            :options="adjustmentCapabilityOptions"
            placeholder="选择该模型实际支持的调用方式"
          />
        </Form.Item>
      </Form>
    </Modal>

    <Modal
      v-model:open="modalOpen"
      :confirm-loading="saving"
      :title="editingId ? '编辑模型' : '手动新增模型'"
      :width="720"
      @ok="save"
    >
      <Form layout="vertical">
        <div class="two-columns">
          <Form.Item label="模型名称" required>
            <Input v-model:value="form.name" />
          </Form.Item>
          <Form.Item label="模型编码" required>
            <Input v-model:value="form.code" placeholder="creative-image-v1" />
          </Form.Item>
          <Form.Item label="模态" required>
            <Select
              v-model:value="form.modality"
              :options="
                MODALITIES.map((value) => ({
                  label: `${MODALITY_LABELS[value]}（${value}）`,
                  value,
                }))
              "
            />
          </Form.Item>
          <Form.Item label="能力" required>
            <Select
              v-model:value="form.capabilities"
              mode="multiple"
              :options="
                CAPABILITIES.map((value) => ({
                  label: `${CAPABILITY_LABELS[value]}（${value}）`,
                  value,
                }))
              "
            />
          </Form.Item>
        </div>
        <label><Switch v-model:checked="form.enabled" /> 启用模型</label>

        <Collapse class="advanced-collapse" ghost>
          <Collapse.Panel key="advanced" header="高级设置">
            <div class="two-columns">
              <Form.Item label="参考单价">
                <InputNumber
                  v-model:value="form.unitPrice"
                  :min="0"
                  class="full"
                />
              </Form.Item>
              <Form.Item label="币种">
                <Input v-model:value="form.currency" />
              </Form.Item>
            </div>
            <Form.Item label="参数 JSON Schema">
              <Textarea v-model:value="form.parameterSchema" :rows="8" />
            </Form.Item>
          </Collapse.Panel>
        </Collapse>
      </Form>
    </Modal>
  </AiCenterShell>
</template>

<style scoped>
.filter-bar {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 10px 12px;
  color: #64748b;
  background: white;
  border: 1px solid #e7edf5;
  border-radius: 10px;
}

.filter-bar :deep(.ant-select) {
  width: 180px;
}

.two-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 12px;
}

.full {
  width: 100%;
}

.sync-provider-row,
.manual-model-row {
  display: flex;
  gap: 10px;
  align-items: flex-end;
}

.provider-field {
  flex: 1;
}

.sync-alert,
.manual-model-row,
.advanced-collapse {
  margin-top: 12px;
}

.sync-model-name {
  font-weight: 600;
  color: #1e293b;
}

.sync-model-id,
.sync-model-owner,
.muted-text,
.classification-cell span,
.classification-cell small {
  color: #64748b;
}

.sync-model-id {
  font-size: 12px;
  overflow-wrap: anywhere;
}

.sync-model-owner {
  margin-top: 2px;
  font-size: 12px;
}

.model-type-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: flex-start;
}

.model-type-cell small {
  font-size: 11px;
  color: #94a3b8;
}

.classification-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
}

.classification-cell small {
  line-height: 1.4;
}

.test-alert {
  margin-bottom: 12px;
}

.test-hint {
  display: block;
  margin-top: 5px;
  color: #64748b;
}

.test-result {
  padding-top: 14px;
  margin-top: 8px;
  border-top: 1px solid #e2e8f0;
}

.test-progress {
  margin: 12px 0;
}

.test-outputs {
  display: grid;
  gap: 12px;
}

.test-output-card {
  padding: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
}

.test-output-heading {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 10px;
  color: #64748b;
}

.test-output-heading a {
  margin-left: auto;
}

.test-media {
  display: block;
  max-width: 100%;
  max-height: 420px;
  margin: 0 auto;
  object-fit: contain;
  border-radius: 8px;
}

.test-text-output {
  max-height: 320px;
  padding: 12px;
  overflow: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  color: #334155;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}

@media (max-width: 720px) {
  .two-columns {
    grid-template-columns: 1fr;
  }
}
</style>
