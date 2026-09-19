<script lang="ts" setup>
import type { TableColumnsType } from 'ant-design-vue';

import type { FdmAiApi } from '#/api/fdmai';

import {
  computed,
  onActivated,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue';

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
  Progress,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Textarea,
} from 'ant-design-vue';

import {
  cancelFdmAiInvocation,
  createFdmAiModel,
  discoverFdmAiProviderModels,
  getFdmAiAdapters,
  getFdmAiInvocation,
  getFdmAiModels,
  getFdmAiProviders,
  getFdmAiRoutes,
  importFdmAiProviderModels,
  submitFdmAiModelTest,
  updateFdmAiModel,
  updateFdmAiRoute,
} from '#/api/fdmai';

import {
  filterLibraryModels,
  findProviderModelConnection,
  getChannelCatalogDiff,
  getModelChannels,
  getProviderModelImportStatus,
  inferProviderModelType,
  limitModelSelection,
  MODEL_IMPORT_LIMIT,
  modelSaveRequest,
  sameModelLibraryId,
  selectLibraryModelIds,
} from './model-library';
import {
  CAPABILITIES,
  CAPABILITIES_BY_MODALITY,
  CAPABILITY_LABELS,
  MODALITIES,
  MODALITY_LABELS,
} from './model-types';
import {
  modelTestReferenceUrls,
  modelTestVideoParameters,
  modelTestVideoResolutions,
} from './model-test-input';
import ModelTypeDialog from './ModelTypeDialog.vue';

defineOptions({ name: 'FdmAiModelLibrary' });

const emit = defineEmits<{
  back: [];
  changed: [];
  tested: [
    modelId: number,
    success: boolean,
    routeKey: string | undefined,
    context: SubmittedTestContext,
  ];
}>();

type SubmittedTestContext = {
  capability: FdmAiApi.Capability;
};

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

interface SyncProviderModel extends FdmAiApi.ProviderModelInfo {
  userConfirmed: boolean;
}

const { hasAccessByCodes } = useAccess();
const canManagePlatform = hasAccessByCodes(['fdmai:platform:manage']);
const canUpdateModel = hasAccessByCodes(['fdmai:model:update']);
const canUpdateRoute = hasAccessByCodes(['fdmai:route:update']);
const canCancelInvocation = hasAccessByCodes(['fdmai:invocation:cancel']);
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
const testCancelling = ref(false);
const testPolling = ref(false);
const testElapsedMillis = ref(0);
const testModel = ref<FdmAiApi.ModelDefinition>();
const testSnapshot = ref<FdmAiApi.InvocationSnapshot>();
const testInvocationId = ref('');
const testHasActiveInvocation = computed(() =>
  Boolean(testInvocationId.value) && !isTerminalStatus(testSnapshot.value?.status),
);
const testCancellationPending = computed(() =>
  ['CANCEL_REQUESTED', 'CANCELING'].includes(testSnapshot.value?.status || ''),
);
const testIsArchiving = computed(() =>
  ['RESULT_RECEIVED', 'DOWNLOADING'].includes(testSnapshot.value?.status || ''),
);
const testRouteKey = ref<string>();
const activeTestSubmission = ref<{
  context: SubmittedTestContext;
  modelId: number;
  routeKey?: string;
}>();
const editingId = ref<number>();
const rows = ref<FdmAiApi.ModelDefinition[]>([]);
const providers = ref<FdmAiApi.ProviderAccount[]>([]);
const adapters = ref<FdmAiApi.AdapterDescriptor[]>([]);
const routes = ref<FdmAiApi.RouteDefinition[]>([]);
const keyword = ref('');
const filterStatus = ref<'all' | 'disabled' | 'enabled'>('enabled');
const filterModality = ref<FdmAiApi.Modality>();
const filterProviderId = ref<string>();
const selectedLibraryIds = ref<string[]>([]);
const changingStatus = ref(false);
const restoringModelId = ref<string>();
const syncProviderId = ref<number>();
const syncKeyword = ref('');
const syncModality = ref<FdmAiApi.Modality>();
const syncStatus = ref<
  'all' | 'connected' | 'inactive' | 'pending' | 'ready' | 'unsupported'
>('all');
const discoveredModels = ref<SyncProviderModel[]>([]);
const catalogSnapshot = ref<{ providerId: string; upstreamIds: string[] }>();
const selectedModelIds = ref<string[]>([]);
const manualProviderModel = ref('');
const adjustOpen = ref(false);
const adjustingModelId = ref('');
const adjustingModel = computed(() => discoveredModels.value.find((model) =>
  sameModelLibraryId(model.id, adjustingModelId.value),
));
const commonParametersJson = ref('{}');
const testForm = reactive<{
  aspectRatio?: string;
  capability?: FdmAiApi.Capability;
  duration?: number;
  lastFrameUrl: string;
  negativePrompt: string;
  prompt: string;
  referenceUrl: string;
  resolution?: string;
}>({
  capability: undefined,
  lastFrameUrl: '',
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
  filterLibraryModels(
    rows.value,
    {
      keyword: keyword.value,
      modality: filterModality.value,
      providerAccountId: filterProviderId.value,
      status: filterStatus.value,
    },
    routes.value,
  ),
);
const channelOptions = computed(() =>
  providers.value.map((provider) => ({
    label: `${provider.name} · ${provider.adapterCode} · ${provider.platform ? '平台' : '租户'}${provider.enabled ? '' : '（已停用）'}`,
    value: String(provider.id),
  })),
);
const activeFilterProvider = computed(() =>
  providers.value.find((provider) =>
    sameModelLibraryId(provider.id, filterProviderId.value),
  ),
);
const selectedChannelModelCount = computed(() =>
  filterProviderId.value
    ? getChannelCatalogDiff(
        filterProviderId.value,
        [],
        routes.value,
        rows.value,
      ).localIds.length
    : 0,
);
const selectedLibraryModels = computed(() =>
  filteredRows.value.filter((model) =>
    selectedLibraryIds.value.includes(String(model.id)),
  ),
);
const libraryRowSelection = computed(() => ({
  selectedRowKeys: selectedLibraryIds.value,
  onChange: (keys: Array<number | string>) => {
    selectedLibraryIds.value = selectLibraryModelIds(keys, filteredRows.value);
  },
}));
watch([keyword, filterStatus, filterModality, filterProviderId], () => {
  selectedLibraryIds.value = [];
});
const activeSyncProvider = computed(() =>
  providers.value.find((item) =>
    sameModelLibraryId(item.id, syncProviderId.value),
  ),
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
const catalogDiff = computed(() => {
  const snapshot = catalogSnapshot.value;
  if (
    !snapshot ||
    !sameModelLibraryId(snapshot.providerId, syncProviderId.value)
  )
    return undefined;
  return getChannelCatalogDiff(
    snapshot.providerId,
    snapshot.upstreamIds,
    routes.value,
    rows.value,
  );
});
const filteredDiscoveredModels = computed(() => {
  const search = syncKeyword.value.trim().toLocaleLowerCase();
  return discoveredModels.value.filter((model) => {
    if (
      search &&
      !`${model.name || ''} ${model.id}`.toLocaleLowerCase().includes(search)
    )
      return false;
    if (syncModality.value && model.modality !== syncModality.value)
      return false;
    if (syncStatus.value === 'ready')
      return isSyncModelReady(model) && !providerModelConnection(model.id);
    if (syncStatus.value === 'pending' || syncStatus.value === 'unsupported')
      return (
        syncModelImportStatus(model) === syncStatus.value &&
        !providerModelConnection(model.id)
      );
    const connection = providerModelConnection(model.id);
    if (syncStatus.value === 'connected')
      return Boolean(connection?.model.enabled && connection.route.enabled);
    if (syncStatus.value === 'inactive')
      return Boolean(
        connection && (!connection.model.enabled || !connection.route.enabled),
      );
    return true;
  });
});
const eligibleDiscoveredIds = computed(() =>
  filteredDiscoveredModels.value
    .filter(
      (model) => isSyncModelReady(model) && !providerModelConnection(model.id),
    )
    .map((model) => String(model.id)),
);
watch([syncKeyword, syncModality, syncStatus], () => {
  selectedModelIds.value = [];
});
const rowSelection = computed(() => ({
  getCheckboxProps: (record: SyncProviderModel) => {
    const connected = Boolean(providerModelConnection(record.id));
    const ready = isSyncModelReady(record) && !connected;
    let title: string | undefined;
    if (!ready) {
      title = connected
        ? '该模型已接入，无需重复添加；已停用的模型可直接恢复'
        : record.importable === false
          ? '该模型不支持当前服务商接入方式'
          : '模型类型尚未确认，请先点击“确认类型”';
    }
    return { disabled: !ready || importing.value, title };
  },
  onChange: (keys: Array<number | string>) => {
    if (keys.length > MODEL_IMPORT_LIMIT)
      message.warning(`每次最多接入 ${MODEL_IMPORT_LIMIT} 个模型`);
    selectedModelIds.value = limitModelSelection(
      keys,
      eligibleDiscoveredIds.value,
    );
  },
  selectedRowKeys: selectedModelIds.value,
}));
const pendingConfirmationCount = computed(
  () =>
    discoveredModels.value.filter(
      (item) =>
        syncModelImportStatus(item) === 'pending' &&
        !providerModelConnection(item.id),
    ).length,
);
const unsupportedModelCount = computed(
  () =>
    discoveredModels.value.filter(
      (item) =>
        syncModelImportStatus(item) === 'unsupported' &&
        !providerModelConnection(item.id),
    ).length,
);
const readyModelCount = computed(
  () =>
    discoveredModels.value.filter(
      (item) => isSyncModelReady(item) && !providerModelConnection(item.id),
    ).length,
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
const testRoutes = computed(() => routes.value.filter((route) =>
  route.enabled &&
  sameModelLibraryId(route.modelId, testModel.value?.id) &&
  (!testRouteKey.value || route.routeKey === testRouteKey.value),
));
const testUsesGrok = computed(() => testRoutes.value.length > 0 && testRoutes.value.every((route) =>
  providers.value.some((provider) =>
    sameModelLibraryId(provider.id, route.providerAccountId) && provider.adapterCode === 'xai-grok',
  ),
));
const testResolutionOptions = computed(() => modelTestVideoResolutions(
  testUsesGrok.value,
  testRoutes.value.map((route) => route.providerModel),
  testForm.capability,
).map((value) => ({ label: value, value })));
watch(testResolutionOptions, (options) => {
  if (testForm.resolution && !options.some((option) => option.value === testForm.resolution)) {
    testForm.resolution = undefined;
  }
});
const testPromptRequired = computed(() =>
  !testUsesGrok.value || !['FIRST_FRAME_TO_VIDEO', 'FIRST_LAST_FRAME_TO_VIDEO'].includes(testForm.capability || ''),
);

const columns: TableColumnsType<FdmAiApi.ModelDefinition> = [
  { dataIndex: 'name', title: '模型', width: 260 },
  { dataIndex: 'channels', title: '渠道来源', width: 250 },
  { dataIndex: 'modality', title: '用途', width: 120 },
  { dataIndex: 'capabilities', title: '能力' },
  { dataIndex: 'enabled', title: '状态', width: 90 },
  { dataIndex: 'action', fixed: 'right', title: '操作', width: 220 },
];
const discoveryColumns: TableColumnsType<SyncProviderModel> = [
  { dataIndex: 'id', title: '上游模型', width: 220 },
  { dataIndex: 'modality', title: '输出类型', width: 130 },
  { dataIndex: 'capabilities', title: '支持的调用方式', width: 280 },
  { dataIndex: 'connection', title: '接入状态', width: 130 },
  { dataIndex: 'classification', title: '识别依据', width: 170 },
  { dataIndex: 'syncAction', fixed: 'right', title: '操作', width: 100 },
];

let loadingPromise: Promise<void> | undefined;
let discoveryVersion = 0;

function load() {
  if (loadingPromise) return loadingPromise;
  loading.value = true;
  loadingPromise = (async () => {
    try {
      [rows.value, providers.value, adapters.value, routes.value] =
        await Promise.all([
          getFdmAiModels(),
          getFdmAiProviders(canManagePlatform),
          getFdmAiAdapters(),
          getFdmAiRoutes(canManagePlatform),
        ]);
      selectedLibraryIds.value = [];
    } finally {
      loading.value = false;
      loadingPromise = undefined;
    }
  })();
  return loadingPromise;
}

async function refreshAfterChange() {
  try {
    if (loadingPromise) await loadingPromise.catch(() => {});
    await load();
  } finally {
    emit('changed');
  }
}

function providerModelConnection(providerModel: string) {
  return findProviderModelConnection(
    syncProviderId.value,
    providerModel,
    routes.value,
    rows.value,
  );
}

function selectVisibleModels() {
  selectedModelIds.value = limitModelSelection(
    eligibleDiscoveredIds.value,
    eligibleDiscoveredIds.value,
  );
  if (eligibleDiscoveredIds.value.length > MODEL_IMPORT_LIMIT) {
    message.info(`已选择筛选结果的前 ${MODEL_IMPORT_LIMIT} 个模型，可继续调整`);
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
    await refreshAfterChange();
  } finally {
    saving.value = false;
  }
}

async function openSync(
  providerId?: number | string,
  modality?: FdmAiApi.Modality,
) {
  await load();
  const requestedProvider = providerOptions.value.find((provider) =>
    sameModelLibraryId(provider.value, providerId),
  );
  if (providerId != null && !requestedProvider) {
    message.warning('所选渠道已停用或不可见，请先在服务商设置中检查账号');
    return;
  }
  syncProviderId.value =
    requestedProvider?.value ?? providerOptions.value[0]?.value;
  syncKeyword.value = '';
  syncModality.value = modality;
  syncStatus.value = 'all';
  discoveredModels.value = [];
  catalogSnapshot.value = undefined;
  selectedModelIds.value = [];
  manualProviderModel.value = '';
  syncOpen.value = true;
  if (syncProviderId.value) await discoverModels();
}

async function changeSyncProvider() {
  adjustOpen.value = false;
  manualProviderModel.value = '';
  discoveredModels.value = [];
  catalogSnapshot.value = undefined;
  selectedModelIds.value = [];
  await discoverModels();
}

function isSyncModelReady(record: unknown) {
  return syncModelImportStatus(record) === 'ready';
}

function syncModelImportStatus(record: unknown) {
  const model = record as SyncProviderModel;
  return getProviderModelImportStatus(model, activeSyncAdapter.value);
}

function supportedCapabilities(modality: FdmAiApi.Modality) {
  const modalityCapabilities = CAPABILITIES_BY_MODALITY[modality];
  if (!activeSyncAdapter.value?.modalities.includes(modality)) return [];
  const adapterCapabilities = activeSyncAdapter.value?.capabilities;
  if (!adapterCapabilities?.length) return [];
  return modalityCapabilities.filter((capability) =>
    adapterCapabilities.includes(capability),
  );
}

function normalizeDiscoveredModel(
  model: FdmAiApi.ProviderModelInfo,
): SyncProviderModel {
  const needsTypeHint = model.classificationSource === 'FALLBACK' || !model.modality;
  const hint = needsTypeHint ? inferProviderModelType(model.id) : undefined;
  return {
    ...model,
    // Keep the model's own classification, including capabilities unavailable on this channel.
    // Older discovery responses can contain a TEXT fallback for a clearly named video model.
    modality: needsTypeHint ? hint?.modality : model.modality,
    capabilities: needsTypeHint ? [...(hint?.capabilities ?? [])] : [...(model.capabilities ?? [])],
    classificationNote: hint
      ? '根据模型名称提示类型，请核对实际调用方式；渠道支持情况单独显示。'
      : model.classificationNote,
    metadata: model.metadata || {},
    requiresConfirmation: Boolean(model.requiresConfirmation) || needsTypeHint,
    userConfirmed: false,
  };
}

async function discoverModels() {
  catalogSnapshot.value = undefined;
  if (!syncProviderId.value) {
    message.warning('请先选择同步渠道');
    return;
  }
  const providerId = syncProviderId.value;
  const version = ++discoveryVersion;
  discoveredModels.value = [];
  selectedModelIds.value = [];
  adjustOpen.value = false;
  discovering.value = true;
  try {
    const models = await discoverFdmAiProviderModels(providerId);
    if (
      version !== discoveryVersion ||
      !sameModelLibraryId(providerId, syncProviderId.value) ||
      !syncOpen.value
    )
      return;
    discoveredModels.value = models.map((item) =>
      normalizeDiscoveredModel(item),
    );
    catalogSnapshot.value = {
      providerId: String(providerId),
      upstreamIds: [...new Set(models.map((model) => String(model.id)))],
    };
    if (discoveredModels.value.length === 0) {
      message.info(
        '该渠道本次未返回模型目录，可在下方手动添加模型 ID；现有模型不会被删除',
      );
    }
  } finally {
    if (version === discoveryVersion) discovering.value = false;
  }
}

function inferManualModel(id: string): SyncProviderModel {
  const hint = inferProviderModelType(id);
  return {
    capabilities: [...(hint?.capabilities ?? [])],
    classificationConfidence: hint ? 'MEDIUM' : 'LOW',
    classificationSource: hint ? 'MODEL_PATTERN' : 'FALLBACK',
    id,
    importable: true,
    metadata: { manual: true },
    modality: hint?.modality,
    name: id,
    requiresConfirmation: true,
    userConfirmed: false,
  };
}

function addManualModel() {
  const id = manualProviderModel.value.trim();
  if (!id) return;
  if (discoveredModels.value.some((item) => sameModelLibraryId(item.id, id))) {
    message.info('该模型已经在列表中');
    return;
  }
  discoveredModels.value = [inferManualModel(id), ...discoveredModels.value];
  syncStatus.value = 'all';
  syncKeyword.value = id;
  syncModality.value = undefined;
  manualProviderModel.value = '';
  message.info('已添加，请确认模型类型后再导入');
}

function openModelAdjustment(record: unknown) {
  const model = record as SyncProviderModel;
  adjustingModelId.value = model.id;
  adjustOpen.value = true;
}

function confirmModelAdjustment(selection: {
  capabilities: FdmAiApi.Capability[];
  modality: FdmAiApi.Modality;
}) {
  if (!selection.capabilities.length || !selection.capabilities.every((capability) =>
    CAPABILITIES_BY_MODALITY[selection.modality].includes(capability),
  )) return;
  const model = adjustingModel.value;
  if (!model) return;
  const updated: SyncProviderModel = {
    ...model,
    capabilities: [...selection.capabilities],
    modality: selection.modality,
    userConfirmed: true,
  };
  discoveredModels.value = discoveredModels.value.map((item) =>
    sameModelLibraryId(item.id, model.id) ? updated : item,
  );
  if (!isSyncModelReady(updated)) {
    selectedModelIds.value = selectedModelIds.value.filter((id) => !sameModelLibraryId(id, model.id));
  }
  adjustOpen.value = false;
  message.success(isSyncModelReady(updated)
    ? '模型类型已确认，请勾选需要接入的模型'
    : '已确认模型类型；当前渠道暂不可接入，模型仍保留在目录中');
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
  if (selectedModelIds.value.length > MODEL_IMPORT_LIMIT) {
    message.warning(`每次最多接入 ${MODEL_IMPORT_LIMIT} 个模型`);
    return;
  }
  const providerId = syncProviderId.value;
  const selected = new Set(selectedModelIds.value);
  const selectedModels = discoveredModels.value.filter((item) =>
    selected.has(String(item.id)),
  );
  if (
    selectedModels.length !== selected.size ||
    selectedModels.some((item) => providerModelConnection(item.id))
  ) {
    message.warning('选择已变化或包含已接入的模型，请重新选择');
    selectedModelIds.value = [];
    return;
  }
  if (selectedModels.some((item) => !isSyncModelReady(item))) {
    message.warning('所选模型中存在待确认或当前渠道不支持的模型，请检查接入状态');
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
      providerAccountId: providerId,
    });
    const created = result.filter((item) => item.created).length;
    message.success(
      `已处理 ${result.length} 个模型：新建 ${created} 个，复用 ${result.length - created} 个`,
    );
    filterProviderId.value = String(providerId);
    keyword.value = '';
    filterModality.value = undefined;
    filterStatus.value = 'enabled';
    syncOpen.value = false;
    await refreshAfterChange();
  } finally {
    importing.value = false;
  }
}

let testPollTimer: ReturnType<typeof setTimeout> | undefined;
let testPollVersion = 0;
let testRequestVersion = 0;
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
      const submitted = activeTestSubmission.value;
      const modelId = snapshot.logicalModelId ?? submitted?.modelId;
      if (
        submitted &&
        modelId !== undefined &&
        ['FAILED', 'SUCCEEDED'].includes(snapshot.status)
      ) {
        emit(
          'tested',
          modelId,
          snapshot.status === 'SUCCEEDED',
          submitted.routeKey,
          { ...submitted.context },
        );
      }
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

async function cancelModelTest() {
  if (!canCancelInvocation || !testHasActiveInvocation.value || testCancellationPending.value || testCancelling.value) return;
  const invocationId = testInvocationId.value;
  const requestVersion = testRequestVersion;
  testCancelling.value = true;
  try {
    await cancelFdmAiInvocation(invocationId);
    if (!testOpen.value || requestVersion !== testRequestVersion || invocationId !== testInvocationId.value) return;
    message.info('已提交取消请求，正在查询实际状态');
    startTestPolling();
  } finally {
    if (requestVersion === testRequestVersion) testCancelling.value = false;
  }
}

function openTest(
  record: unknown,
  context?: {
    capability?: FdmAiApi.Capability;
    routeKey?: string;
  },
) {
  const model = record as FdmAiApi.ModelDefinition;
  testRequestVersion += 1;
  testSubmitting.value = false;
  testCancelling.value = false;
  stopTestPolling();
  testModel.value = model;
  testSnapshot.value = undefined;
  testInvocationId.value = '';
  activeTestSubmission.value = undefined;
  testElapsedMillis.value = 0;
  commonParametersJson.value = '{}';
  Object.assign(testForm, {
    aspectRatio: undefined,
    capability: context?.capability ?? preferredCapability(model),
    duration: undefined,
    lastFrameUrl: '',
    negativePrompt: '',
    prompt: '',
    referenceUrl: '',
    resolution: undefined,
  });
  testRouteKey.value = context?.routeKey;
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
  if (testSubmitting.value || testCancelling.value || testHasActiveInvocation.value) return;
  const model = testModel.value;
  if (!model || !testForm.capability) {
    message.warning('当前模型没有可用于测试的主能力');
    return;
  }
  if (testPromptRequired.value && !testForm.prompt.trim()) {
    message.warning('请输入测试提示词');
    return;
  }
  let referenceUrls: string[];
  try {
    referenceUrls = modelTestReferenceUrls(testForm.capability, testForm.referenceUrl, testForm.lastFrameUrl);
  } catch (error) {
    message.warning(error instanceof Error ? error.message : '请检查参考图片');
    return;
  }
  if (
    model.modality === 'TEXT' &&
    referenceUrls.length &&
    !model.capabilities.includes('IMAGE_INPUT')
  ) {
    message.warning('该文本模型未声明图片输入能力，不能填写参考 URL');
    return;
  }
  const parsedParameters = parseCommonParameters();
  if (!parsedParameters) return;
  const commonParameters = model.modality === 'VIDEO'
    ? modelTestVideoParameters(parsedParameters, testForm, testUsesGrok.value)
    : parsedParameters;
  const submitted = {
    context: {
      capability: testForm.capability,
    } satisfies SubmittedTestContext,
    modelId: model.id,
    routeKey: testRouteKey.value,
  };

  stopTestPolling();
  testSubmitting.value = true;
  const requestVersion = ++testRequestVersion;
  testSnapshot.value = undefined;
  testInvocationId.value = '';
  activeTestSubmission.value = undefined;
  testElapsedMillis.value = 0;
  testStartedAt = Date.now();
  try {
    const ticket = await submitFdmAiModelTest({
      additionalRequiredCapabilities:
        model.modality === 'TEXT' && referenceUrls.length ? ['IMAGE_INPUT'] : [],
      businessId: `${model.id}:${model.code}`,
      capability: submitted.context.capability,
      commonParameters,
      idempotencyKey: createTestIdempotencyKey(model.id),
      input: {
        negativePrompt: testUsesGrok.value ? undefined : testForm.negativePrompt.trim() || undefined,
        prompt: testForm.prompt.trim(),
        referenceUrls,
        variables: {},
      },
      ...(submitted.routeKey
        ? { routeKey: submitted.routeKey }
        : { logicalModelId: model.id }),
      modality: model.modality,
      providerOptions: {},
    });
    if (!testOpen.value || requestVersion !== testRequestVersion) return;
    activeTestSubmission.value = submitted;
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
    if (requestVersion === testRequestVersion) testSubmitting.value = false;
  }
}

function closeModelTest() {
  testRequestVersion += 1;
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

function requestSingleModelStatusChange(record: unknown) {
  const model = record as FdmAiApi.ModelDefinition;
  requestStatusChange(!model.enabled, [model]);
}

function requestStatusChange(
  enabled: boolean,
  records = selectedLibraryModels.value,
) {
  if (!canUpdateModel || changingStatus.value) return;
  const models = records.filter((model) => model.enabled !== enabled);
  if (!models.length) return;
  Modal.confirm({
    title: `${enabled ? '恢复' : '停用'} ${models.length} 个模型？`,
    content: enabled
      ? '将恢复这些模型的全局启用状态。已停用的调用路由仍需单独恢复，历史配置和调用记录会保留。'
      : '这是全局停用，会影响使用这些模型的所有公司、场景和工作流。配置和历史调用会保留，可以在“已停用”中恢复。',
    okText: enabled ? '确认恢复' : '确认停用',
    cancelText: '取消',
    okButtonProps: { danger: !enabled },
    async onOk() {
      changingStatus.value = true;
      let succeeded = 0;
      const failed: string[] = [];
      try {
        for (const model of models) {
          try {
            await updateFdmAiModel(model.id, modelSaveRequest(model, enabled));
            succeeded += 1;
          } catch {
            failed.push(model.name);
          }
        }
        if (succeeded)
          message.success(`已${enabled ? '恢复' : '停用'} ${succeeded} 个模型`);
        if (failed.length)
          message.error(
            `${failed.length} 个模型处理失败：${failed.slice(0, 3).join('、')}${failed.length > 3 ? '…' : ''}`,
          );
        selectedLibraryIds.value = [];
        if (succeeded) await refreshAfterChange();
      } finally {
        changingStatus.value = false;
      }
    },
  });
}

function canRestoreConnection(providerModel: string) {
  const connection = providerModelConnection(providerModel);
  return Boolean(
    connection &&
    (connection.model.enabled || canUpdateModel) &&
    (connection.route.enabled ||
      (canUpdateRoute && (!connection.route.platform || canManagePlatform))),
  );
}

function restoreConnection(providerModel: string) {
  const connection = providerModelConnection(providerModel);
  if (
    !connection ||
    !canRestoreConnection(providerModel) ||
    restoringModelId.value
  )
    return;
  const { model, route } = connection;
  Modal.confirm({
    title: `恢复 ${model.name} 的接入？`,
    content:
      '将启用此模型及当前服务商的对应调用路由。模型启用状态会影响所有引用它的公司和场景，原有参数与历史记录会保留。',
    okText: '确认恢复',
    cancelText: '取消',
    async onOk() {
      restoringModelId.value = providerModel;
      let changed = false;
      try {
        if (!model.enabled) {
          await updateFdmAiModel(model.id, modelSaveRequest(model, true));
          changed = true;
        }
        if (!route.enabled) {
          await updateFdmAiRoute(route.id, {
            enabled: true,
            modelId: route.modelId,
            platform: route.platform,
            providerAccountId: route.providerAccountId,
            providerModel: route.providerModel,
            providerOptions: route.providerOptions,
            routeKey: route.routeKey,
          });
          changed = true;
        }
        message.success('模型接入已恢复');
      } finally {
        restoringModelId.value = undefined;
        if (changed) await refreshAfterChange();
      }
    },
  });
}

watch(syncOpen, (open) => {
  if (!open) {
    discoveryVersion += 1;
    discovering.value = false;
    adjustOpen.value = false;
    catalogSnapshot.value = undefined;
  }
});

defineExpose({ load, openSync, openTest });

onMounted(load);
onActivated(load);
onBeforeUnmount(() => {
  discoveryVersion += 1;
  testRequestVersion += 1;
  stopTestPolling();
});
</script>

<template>
  <section class="model-library">
    <header class="library-header">
      <div>
        <Button class="back-button" type="link" @click="emit('back')">
          ← 返回场景配置
        </Button>
        <h2>管理全部模型</h2>
        <p>按渠道同步需要的模型并查看来源；日常创作请在场景配置中选择。</p>
      </div>
      <Space>
        <Button
          v-if="canManagePlatform"
          v-access:code="['fdmai:model:create', 'fdmai:route:create']"
          :disabled="
            Boolean(filterProviderId && !activeFilterProvider?.enabled)
          "
          type="primary"
          @click="openSync(filterProviderId, filterModality)"
        >
          从渠道同步
        </Button>
        <Button v-access:code="['fdmai:model:create']" @click="openCreate">
          高级新增
        </Button>
      </Space>
    </header>

    <div class="filter-bar">
      <Input
        v-model:value="keyword"
        allow-clear
        class="model-search"
        placeholder="搜索模型名称或编码"
        aria-label="搜索模型名称或编码"
      />
      <Select
        v-model:value="filterProviderId"
        allow-clear
        show-search
        option-filter-prop="label"
        :options="channelOptions"
        placeholder="全部渠道"
        aria-label="筛选模型渠道"
      />
      <Select
        v-model:value="filterStatus"
        aria-label="模型状态"
        :options="[
          { label: '已启用', value: 'enabled' },
          { label: '已停用', value: 'disabled' },
          { label: '全部状态', value: 'all' },
        ]"
      />
      <Select
        v-model:value="filterModality"
        allow-clear
        :options="
          MODALITIES.map((value) => ({
            label: MODALITY_LABELS[value],
            value,
          }))
        "
        placeholder="全部用途"
        aria-label="筛选模型用途"
      />
      <span class="filter-count">显示 {{ filteredRows.length }} / {{ rows.length }} 个模型</span>
      <Button :loading="loading" @click="load">刷新</Button>
    </div>
    <div v-if="activeFilterProvider" class="channel-summary">
      <span>当前渠道：<strong>{{ activeFilterProvider.name }}</strong></span>
      <span>已关联 {{ selectedChannelModelCount }} 个上游模型</span>
      <span v-if="!activeFilterProvider.enabled" class="muted-text">渠道已停用，可查看已有模型；恢复渠道后才能同步目录。</span>
    </div>
    <div
      v-if="canUpdateModel && selectedLibraryIds.length"
      class="selection-bar"
    >
      <span>已选择 {{ selectedLibraryIds.length }} 个模型</span>
      <Button type="link" @click="selectedLibraryIds = []">清空选择</Button>
      <Button
        :disabled="!selectedLibraryModels.some((model) => model.enabled)"
        :loading="changingStatus"
        danger
        @click="requestStatusChange(false)"
      >
        停用所选
      </Button>
      <Button
        :disabled="!selectedLibraryModels.some((model) => !model.enabled)"
        :loading="changingStatus"
        @click="requestStatusChange(true)"
      >
        恢复所选
      </Button>
      <small>启停会影响使用这些模型的所有公司和场景。</small>
    </div>
    <Table
      :columns="columns"
      :data-source="filteredRows"
      :loading="loading"
      :row-selection="canUpdateModel ? libraryRowSelection : undefined"
      :pagination="{ pageSize: 12, showSizeChanger: true }"
      :row-key="(record) => String(record.id)"
      :scroll="{ x: 1160 }"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.dataIndex === 'name'">
          <div class="sync-model-name">{{ record.name }}</div>
          <code class="sync-model-id">{{ record.code }}</code>
        </template>
        <template v-else-if="column.dataIndex === 'channels'">
          <div class="model-channels">
            <div
              v-for="channel in getModelChannels(record.id, routes, providers)"
              :key="String(channel.provider.id)"
              class="model-channel"
            >
              <div>
                <Tag
                  :title="channel.upstreamModels.join('、')"
                  :color="
                    channel.provider.enabled &&
                    channel.hasEnabledRoute &&
                    record.enabled
                      ? 'blue'
                      : 'default'
                  "
                  >
{{ channel.provider.name }}
</Tag>
                <small>{{
                  !channel.provider.enabled
                    ? '渠道停用'
                    : !record.enabled
                      ? '模型停用'
                      : !channel.hasEnabledRoute
                        ? '路由停用'
                        : '已启用'
                }}</small>
              </div>
              <code class="sync-model-id">{{
                channel.upstreamModels.join('、')
              }}</code>
            </div>
            <span
              v-if="!getModelChannels(record.id, routes, providers).length"
              class="muted-text"
              >未关联渠道</span>
          </div>
        </template>
        <template v-else-if="column.dataIndex === 'modality'">
          <div class="model-type-cell">
            <Tag color="geekblue" :title="record.modality">
              {{ modalityLabel(record.modality) }}
            </Tag>
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
              @click="openTest(record)"
            >
              测试
            </Button>
            <Button
              v-access:code="['fdmai:model:update']"
              size="small"
              type="link"
              @click="openEdit(record)"
            >
              高级编辑
            </Button>
            <Button
              v-if="canUpdateModel"
              :danger="record.enabled"
              :disabled="changingStatus"
              size="small"
              type="link"
              @click="requestSingleModelStatusChange(record)"
            >
              {{ record.enabled ? '停用' : '恢复' }}
            </Button>
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
        <Alert
          v-if="testRouteKey"
          class="test-alert"
          :message="`当前场景：${testRouteKey}`"
          description="按该场景的调用配置执行本次测试。"
          type="info"
          show-icon
        />
        <Form.Item label="请求动作" required>
          <Select
            v-model:value="testForm.capability"
            :options="testCapabilityOptions"
            placeholder="选择模型能力"
          />
          <small class="test-hint">
            包含参考图时，文本模型需要支持图片理解。
          </small>
        </Form.Item>
        <Form.Item label="提示词" :required="testPromptRequired">
          <Textarea
            v-model:value="testForm.prompt"
            placeholder="输入一条用于验证模型连通性和输出效果的提示词"
            :rows="4"
          />
        </Form.Item>
        <div class="two-columns">
          <Form.Item v-if="!testUsesGrok" label="负面提示词（可选）">
            <Textarea
              v-model:value="testForm.negativePrompt"
              placeholder="图片或视频模型可填写不希望出现的内容"
              :rows="2"
            />
          </Form.Item>
          <Form.Item
            v-if="!['TEXT_TO_VIDEO', 'TEXT_TO_IMAGE'].includes(testForm.capability || '')"
            :label="testModel?.modality === 'VIDEO' ? '首帧图片 URL' : '参考图片 URL（每行一张）'"
            :required="['FIRST_FRAME_TO_VIDEO', 'FIRST_LAST_FRAME_TO_VIDEO', 'IMAGE_EDIT', 'IMAGE_TO_IMAGE', 'MULTI_REFERENCE'].includes(testForm.capability || '')"
          >
            <Textarea
              v-if="testModel?.modality === 'IMAGE'"
              v-model:value="testForm.referenceUrl"
              placeholder="https://example.com/reference.png"
              :rows="3"
            />
            <Input
              v-else
              v-model:value="testForm.referenceUrl"
              placeholder="https://example.com/reference.png"
            />
          </Form.Item>
          <Form.Item v-if="testForm.capability === 'FIRST_LAST_FRAME_TO_VIDEO'" label="尾帧图片 URL" required>
            <Input v-model:value="testForm.lastFrameUrl" placeholder="https://example.com/last-frame.png" />
          </Form.Item>
        </div>
        <template v-if="testModel?.modality === 'VIDEO'">
          <Alert
            v-if="testUsesGrok"
            class="test-alert"
            message="Grok 视频生成参数"
            :description="testForm.capability === 'FIRST_LAST_FRAME_TO_VIDEO'
              ? '首尾帧生成需要 grok-imagine-video-1.5，最高 720p，时长 1–15 秒。图片地址需可由服务商访问。'
              : '时长 1–15 秒；经典视频模型支持 480p / 720p，1.5 支持 1080p。首帧图片地址需可由服务商访问。'"
            show-icon
            type="info"
          />
          <div class="two-columns">
            <Form.Item label="视频时长（秒）">
              <InputNumber
                v-model:value="testForm.duration"
                class="full"
                :min="1"
                :max="testUsesGrok ? 15 : undefined"
                :precision="0"
                placeholder="使用模型默认值"
              />
            </Form.Item>
            <Form.Item label="画面比例">
              <Select
                v-model:value="testForm.aspectRatio"
                allow-clear
                :options="['16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3'].map((value) => ({ label: value, value }))"
                placeholder="使用模型默认值"
              />
            </Form.Item>
            <Form.Item label="视频分辨率">
              <Select
                v-model:value="testForm.resolution"
                allow-clear
                :options="testResolutionOptions"
                placeholder="使用模型默认值"
              />
            </Form.Item>
          </div>
        </template>
        <Collapse class="advanced-collapse" ghost>
          <Collapse.Panel key="test-advanced" header="高级参数">
            <Form.Item label="通用参数（JSON）">
              <Textarea v-model:value="commonParametersJson" :rows="6" />
              <small v-if="testModel?.modality === 'VIDEO'" class="test-hint">
                已填写的视频时长、比例和分辨率优先于此处同名参数。
              </small>
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
          v-if="testHasActiveInvocation"
          class="test-alert"
          message="调用仍在进行"
          description="停止轮询或关闭弹窗不会终止调用。提交取消请求后，实际结果以后台状态为准。"
          show-icon
          type="info"
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
          v-if="canCancelInvocation && testHasActiveInvocation"
          :disabled="testCancellationPending"
          :loading="testCancelling"
          danger
          @click="cancelModelTest"
        >
          {{ testIsArchiving ? '停止归档' : '请求取消' }}
        </Button>
        <Button
          :disabled="testCapabilityOptions.length === 0 || testHasActiveInvocation || testCancelling"
          :loading="testSubmitting"
          type="primary"
          @click="submitModelTest"
        >
          {{ testInvocationId ? '再次测试' : '开始测试' }}
        </Button>
      </template>
    </Modal>

    <Modal
      v-model:open="syncOpen"
      title="从渠道同步模型"
      :width="1080"
      :style="{ top: '24px' }"
      :body-style="{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }"
      :closable="!importing"
      :mask-closable="!importing"
      :keyboard="!importing"
    >
      <Form layout="vertical">
        <div class="sync-provider-row">
          <Form.Item class="provider-field" label="同步渠道" required>
            <Select
              v-model:value="syncProviderId"
              :disabled="importing"
              option-filter-prop="label"
              :options="providerOptions"
              placeholder="选择已保存的渠道账号"
              show-search
              @change="changeSyncProvider"
            />
          </Form.Item>
          <Button
            :disabled="!syncProviderId || importing"
            :loading="discovering"
            @click="discoverModels"
          >
            同步上游模型目录
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
          description="只接入您勾选的模型，每次最多 100 个。同步目录不会发起模型调用，也不会自动恢复已停用模型或删除现有模型。"
          :message="
            catalogDiff
              ? `${activeSyncProvider?.name || '当前渠道'} · 已关联 ${catalogDiff.localIds.length} 个上游模型，本次目录返回 ${catalogSnapshot?.upstreamIds.length || 0} 个。`
              : providerOptions.length
                ? '选择渠道后同步模型目录；也可以手动填写上游模型 ID。'
                : '请先在场景配置页接入一个渠道账号。'
          "
          show-icon
          type="info"
        />
        <p class="catalog-note">
          目录按渠道接口返回，部分接入协议仅提供预设目录或需手动添加；模型列表不代表已通过调用验证。
        </p>
        <div v-if="catalogDiff" class="catalog-diff-summary" role="status">
          <span>新增 <strong>{{ catalogDiff.newIds.length }}</strong></span>
          <span>已接入 <strong>{{ catalogDiff.connectedIds.length }}</strong></span>
          <span>已停用 <strong>{{ catalogDiff.inactiveIds.length }}</strong></span>
          <span>待确认类型
            <strong>{{ pendingConfirmationCount }}</strong></span>
          <span>当前接入不支持
            <strong>{{ unsupportedModelCount }}</strong></span>
          <span>可直接接入 <strong>{{ readyModelCount }}</strong></span>
        </div>
        <Alert
          v-if="pendingConfirmationCount > 0"
          class="sync-alert"
          :message="`${pendingConfirmationCount} 个模型待确认类型，确认后可勾选接入`"
          description="点击对应模型的“确认类型”，选择实际支持的用途与能力。标记为“当前接入不支持”的模型需要使用支持该用途的接入方式。"
          show-icon
          type="info"
        />
        <Alert
          v-if="catalogDiff?.missingIds.length"
          class="sync-alert"
          :message="`本地已有 ${catalogDiff.missingIds.length} 个上游模型未在本次目录中返回`"
          :description="`现有配置会保留，不会自动停用或删除。${catalogDiff.missingIds.slice(0, 6).join('、')}${catalogDiff.missingIds.length > 6 ? '…' : ''}`"
          show-icon
          type="warning"
        />

        <div class="filter-bar directory-filters">
          <Input
            v-model:value="syncKeyword"
            :disabled="importing"
            allow-clear
            class="model-search"
            placeholder="搜索模型名称或 ID"
            aria-label="搜索接入目录"
          />
          <Select
            v-model:value="syncModality"
            :disabled="importing"
            allow-clear
            placeholder="全部用途"
            aria-label="目录用途"
            :options="
              MODALITIES.map((value) => ({
                label: MODALITY_LABELS[value],
                value,
              }))
            "
          />
          <Select
            v-model:value="syncStatus"
            :disabled="importing"
            aria-label="目录状态"
            :options="[
              { label: '全部目录', value: 'all' },
              { label: '可直接接入', value: 'ready' },
              { label: '待确认类型', value: 'pending' },
              { label: '当前接入不支持', value: 'unsupported' },
              { label: '已接入', value: 'connected' },
              { label: '已停用', value: 'inactive' },
            ]"
          />
        </div>
        <div class="selection-bar directory-selection">
          <span>显示 {{ filteredDiscoveredModels.length }} 个 · 已选
            {{ selectedModelIds.length }} / {{ MODEL_IMPORT_LIMIT }}</span>
          <Button
            :disabled="
              !eligibleDiscoveredIds.length || discovering || importing
            "
            size="small"
            @click="selectVisibleModels"
          >
            选择筛选结果
          </Button>
          <Button
            :disabled="!selectedModelIds.length || importing"
            size="small"
            type="link"
            @click="selectedModelIds = []"
          >
            清空选择
          </Button>
        </div>

        <Collapse class="advanced-collapse" ghost>
          <Collapse.Panel
            key="manual-model"
            header="目录中找不到？手动添加模型 ID"
          >
            <div class="manual-model-row">
              <Input
                v-model:value="manualProviderModel"
                :disabled="!syncProviderId || importing || discovering"
                placeholder="手动添加模型 ID，例如 gpt-5.2"
                @press-enter="addManualModel"
              />
              <Button
                :disabled="!syncProviderId || importing || discovering"
                @click="addManualModel"
              >
                添加
              </Button>
            </div>
          </Collapse.Panel>
        </Collapse>

        <Table
          :columns="discoveryColumns"
          :data-source="filteredDiscoveredModels"
          :loading="discovering"
          :pagination="{ pageSize: 8 }"
          :row-selection="rowSelection"
          :row-key="(record) => String(record.id)"
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
              </div>
              <Tag v-else color="orange">待确认</Tag>
            </template>
            <template v-else-if="column.dataIndex === 'connection'">
              <template v-if="providerModelConnection(record.id)">
                <Tag
                  :color="
                    providerModelConnection(record.id)?.model.enabled &&
                    providerModelConnection(record.id)?.route.enabled
                      ? 'green'
                      : 'default'
                  "
                >
                  {{
                    providerModelConnection(record.id)?.model.enabled &&
                    providerModelConnection(record.id)?.route.enabled
                      ? '已接入'
                      : '已停用'
                  }}
                </Tag>
                <Button
                  v-if="
                    !(
                      providerModelConnection(record.id)?.model.enabled &&
                      providerModelConnection(record.id)?.route.enabled
                    )
                  "
                  :disabled="
                    !canRestoreConnection(record.id) ||
                    Boolean(restoringModelId) ||
                    importing
                  "
                  :loading="sameModelLibraryId(restoringModelId, record.id)"
                  size="small"
                  type="link"
                  @click="restoreConnection(record.id)"
                >
                  恢复接入
                </Button>
              </template>
              <Tag v-else>未接入</Tag>
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
                <Tag v-if="syncModelImportStatus(record) === 'unsupported'" color="orange">
                  当前接入不支持
                </Tag>
                <Tag v-else-if="record.userConfirmed" color="green">
                  已人工确认
                </Tag>
                <Tag v-else-if="!isSyncModelReady(record)" color="orange">
                  待确认类型
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
                :disabled="
                  Boolean(providerModelConnection(record.id)) ||
                  importing
                "
                size="small"
                type="link"
                @click="openModelAdjustment(record)"
              >
                {{ syncModelImportStatus(record) === 'unsupported' ? '查看类型' : isSyncModelReady(record) ? '调整类型' : '确认类型' }}
              </Button>
            </template>
          </template>
        </Table>
      </Form>
      <template #footer>
        <Button :disabled="importing" @click="syncOpen = false">取消</Button>
        <Button
          :disabled="
            selectedModelIds.length === 0 ||
            syncAdapterCapabilityUnavailable ||
            discovering ||
            Boolean(restoringModelId)
          "
          :loading="importing"
          type="primary"
          @click="importSelectedModels"
        >
          接入已选 {{ selectedModelIds.length }} 个模型
        </Button>
      </template>
    </Modal>

    <ModelTypeDialog
      v-model:open="adjustOpen"
      :model="adjustingModel"
      :adapter="activeSyncAdapter"
      :provider-name="activeSyncProvider?.name"
      @confirm="confirmModelAdjustment"
    />

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
  </section>
</template>

<style scoped>
.model-library {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 24px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
}

.library-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.library-header h2 {
  margin: 4px 0 8px;
  font-size: 22px;
  font-weight: 650;
  color: #172033;
}

.library-header p {
  margin: 0;
  line-height: 1.6;
  color: #64748b;
}

.channel-summary,
.catalog-diff-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
  align-items: center;
  padding: 12px 14px;
  font-size: 13px;
  color: #475569;
  background: #f8fafc;
  border: 1px solid #e8edf3;
  border-radius: 10px;
}

.catalog-diff-summary strong {
  margin-left: 4px;
  color: #172033;
}

.catalog-note {
  margin: 10px 0;
  font-size: 12px;
  line-height: 1.6;
  color: #64748b;
}

.model-channels,
.model-channel {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.model-channels {
  gap: 10px;
}

.model-channel small {
  font-size: 11px;
  color: #64748b;
  white-space: nowrap;
}

.model-channel > div {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 6px;
  align-items: center;
}

.back-button {
  height: auto;
  padding: 0;
  margin-bottom: 12px;
}

.selection-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  padding: 12px 14px;
  font-size: 13px;
  color: #334155;
  background: #f8fafc;
  border-radius: 10px;
}

.selection-bar small {
  color: #64748b;
}

.directory-filters {
  margin-top: 18px;
}

.directory-selection {
  margin: 10px 0;
}

.model-search {
  flex: 1;
  min-width: 220px;
}

.filter-count {
  white-space: nowrap;
}

.filter-bar {
  display: flex;
  flex-wrap: wrap;
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
  .model-library {
    padding: 16px;
  }

  .library-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .two-columns {
    grid-template-columns: 1fr;
  }
}
</style>
