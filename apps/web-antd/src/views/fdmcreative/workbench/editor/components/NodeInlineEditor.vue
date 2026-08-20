<script lang="ts" setup>
import type { ConnectedImageReference } from '../connected-image-references';

import type { FdmAiApi } from '#/api/fdmai';
import type { FdmCreativeApi } from '#/api/fdmcreative';
import type { FileUploadProps } from '#/components/upload/typing';

import { computed, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import {
  Button,
  Input,
  InputNumber,
  Mentions,
  message,
  Progress,
  Select,
  Switch,
  Tag,
  Textarea,
  Tooltip,
} from 'ant-design-vue';

import { FileUpload } from '#/components/upload';

import AssetLibraryPicker from '../../../shared/AssetLibraryPicker.vue';
import PromptLibraryPicker from '../../../shared/PromptLibraryPicker.vue';
import {
  invalidPromptImageReferenceNumbers,
  normalizePromptReferenceBindings,
  reconcilePromptReferenceBindings,
} from '../connected-image-references';
import { CREATIVE_NODE_MAP } from '../graph/catalog';
import { inlineNodeConfigValidationError } from '../inline-node-validation';
import { normalizeModelIdentifier } from '../model-identifier';
import {
  getVideoFrameConfigSlots,
  supportsNodeModel,
} from '../node-model-filter';
import { nodeRunStatusLabel } from '../node-run-status';
import NodeResultVersionsPanel from './NodeResultVersionsPanel.vue';

type InlineEditorPlacement = 'above' | 'below';
type InlineEditorVariant = 'floating' | 'panel';
type SchemaScalar = number | string;

interface PromptLibrarySelection {
  content: string;
  mode: 'append' | 'replace';
  prompt: FdmCreativeApi.CreativePrompt;
}

interface SchemaField {
  description?: string;
  key: string;
  maximum?: number;
  minimum?: number;
  options?: Array<{ label: string; value: SchemaScalar }>;
  required: boolean;
  step?: number;
  title: string;
  type: 'boolean' | 'integer' | 'number' | 'string';
}

interface AssetChangePayload {
  assets: FdmCreativeApi.CreativeAsset[];
  key: string;
  slot?: string;
  value: unknown;
}

interface ResultActionPayload {
  asset: FdmCreativeApi.NodeResultAsset;
  version: FdmCreativeApi.NodeResultVersion;
}

interface ResultToolActionPayload extends ResultActionPayload {
  tool: FdmCreativeApi.MediaToolDescriptor;
}

interface ConnectedTextSource {
  id: string;
  name: string;
  portType: 'creative-brief' | 'prompt-text';
  preview?: string;
  status?: FdmCreativeApi.NodeRunStatus;
}

interface Props {
  busy?: boolean;
  canRun?: boolean;
  connectedReferences?: ConnectedImageReference[];
  connectedPromptInputCount?: number;
  connectedTextSources?: ConnectedTextSource[];
  errorMessage?: string;
  executionStatus?: FdmCreativeApi.ExecutionStatus;
  modelOptions?: FdmAiApi.ModelOption[];
  node: FdmCreativeApi.WorkflowNode;
  nodeRun?: FdmCreativeApi.NodeRun;
  placement?: InlineEditorPlacement;
  progress?: number;
  projectId: number;
  projectAssets?: FdmCreativeApi.CreativeAsset[];
  resultAssets?: FdmCreativeApi.CreativeAsset[];
  resultHistoryAutosaveConflict?: boolean;
  resultHistoryCanEdit?: boolean;
  resultHistoryLoading?: boolean;
  resultMediaTools?: FdmCreativeApi.MediaToolDescriptor[];
  resultVersions?: FdmCreativeApi.NodeResultVersion[];
  resultText?: string;
  readonly?: boolean;
  uploadAccept?: string[];
  uploadApi?: FileUploadProps['api'];
  uploadMaxSize?: number;
  variant?: InlineEditorVariant;
  width?: number;
}

const props = withDefaults(defineProps<Props>(), {
  busy: false,
  canRun: true,
  connectedReferences: () => [],
  connectedPromptInputCount: 0,
  connectedTextSources: () => [],
  errorMessage: undefined,
  executionStatus: undefined,
  modelOptions: () => [],
  nodeRun: undefined,
  placement: 'below',
  progress: undefined,
  projectAssets: () => [],
  resultAssets: () => [],
  resultHistoryAutosaveConflict: false,
  resultHistoryCanEdit: false,
  resultHistoryLoading: false,
  resultMediaTools: () => [],
  resultVersions: () => [],
  resultText: undefined,
  readonly: false,
  uploadAccept: () => [],
  uploadApi: undefined,
  uploadMaxSize: undefined,
  variant: 'floating',
  width: 700,
});

const emit = defineEmits<{
  assetChange: [payload: AssetChangePayload];
  close: [];
  configChange: [key: string, value: unknown];
  nameChange: [value: string];
  resultAdopt: [payload: ResultActionPayload];
  resultPin: [payload: ResultActionPayload];
  resultTool: [payload: ResultToolActionPayload];
  run: [nodeId: string];
  runDownstream: [nodeId: string];
}>();

const advancedOpen = ref(false);
const editingName = ref(false);
const expanded = ref(false);
const negativePromptOpen = ref(false);

watch(
  () => props.node.id,
  () => {
    advancedOpen.value = false;
    editingName.value = false;
    expanded.value = false;
    negativePromptOpen.value = false;
  },
);

const IMAGE_AI_TYPES = new Set([
  'image-edit',
  'image-generate',
  'image-to-image',
]);
const VIDEO_AI_TYPES = new Set([
  'first-last-frame-to-video',
  'image-to-video',
  'video-generate',
]);
const VOICE_AI_TYPES = new Set(['audio-generate']);
const MUSIC_AI_TYPES = new Set(['music-generate']);
const AUDIO_AI_TYPES = new Set([...VOICE_AI_TYPES, ...MUSIC_AI_TYPES]);
const AUDIO_LOCAL_TYPES = new Set([
  'audio-extract',
  'audio-mix',
  'audio-normalize',
  'audio-trim',
  'video-audio-merge',
]);
const VIDEO_TYPES = new Set([
  ...VIDEO_AI_TYPES,
  'video-compose',
  'video-frame-extract',
  'video-input',
  'video-normalize',
  'video-plan-item',
  'video-timeline',
  'video-transition',
  'video-trim',
]);
const AUDIO_TYPES = new Set([
  ...AUDIO_AI_TYPES,
  ...AUDIO_LOCAL_TYPES,
  'audio-collection',
  'audio-input',
]);
const COMPOSE_TYPES = new Set([
  'artifact-collection',
  'asset-library-output',
  'image-collection',
  'output',
  'video-compose',
  'video-timeline',
]);
const LOOP_TYPES = new Set(['image-loop', 'video-loop']);
const MEDIA_SELECTOR_TYPES = new Set(['image-select', 'video-select']);
const ASPECT_RATIO_OPTIONS = ['1:1', '4:3', '3:4', '16:9', '9:16', '21:9'].map(
  (value) => ({ label: value, value }),
);
const DURATION_OPTIONS = [3, 5, 8, 10, 15].map((value) => ({
  label: `${value} 秒`,
  value,
}));
const AUDIO_DURATION_OPTIONS = [3, 5, 10, 15, 30, 60, 120, 300].map(
  (value) => ({ label: `${value} 秒`, value }),
);
const AUDIO_FORMAT_OPTIONS = [
  { label: 'MP3', value: 'mp3' },
  { label: 'WAV', value: 'wav' },
  { label: 'M4A / AAC', value: 'm4a' },
];
const AUDIO_SAMPLE_RATE_OPTIONS = [8000, 16_000, 22_050, 44_100, 48_000].map(
  (value) => ({ label: `${value / 1000} kHz`, value }),
);
const AUDIO_CHANNEL_OPTIONS = [
  { label: '单声道', value: 1 },
  { label: '立体声', value: 2 },
];
const RESOLUTION_OPTIONS = ['720P', '1080P', '2K', '4K'].map((value) => ({
  label: value,
  value,
}));
const PLAYBACK_RATE_OPTIONS = [0.5, 1, 1.5, 2].map((value) => ({
  label: `${value}x`,
  value,
}));
const PLAN_MODE_OPTIONS = [
  { label: '图片', value: 'IMAGE_SET' },
  { label: '视频', value: 'VIDEO_SEQUENCE' },
  { label: '图片 + 视频', value: 'MIXED' },
];
const PROMPT_TARGET_OPTIONS = [
  { label: '通用提示词', value: 'GENERAL' },
  { label: '图片提示词', value: 'IMAGE' },
  { label: '视频提示词', value: 'VIDEO' },
];
const PROMPT_LANGUAGE_OPTIONS = [
  { label: '自动语言', value: 'AUTO' },
  { label: '中文', value: 'ZH_CN' },
  { label: '英文', value: 'EN' },
];
const FRAME_MODE_OPTIONS = [
  { label: '首帧', value: 'FIRST' },
  { label: '指定时间', value: 'TIME' },
  { label: '尾帧', value: 'LAST' },
];
const RESIZE_MODE_OPTIONS = [
  { label: '完整适配', value: 'FIT' },
  { label: '铺满裁切', value: 'FILL' },
  { label: '拉伸填充', value: 'STRETCH' },
];
const SHOT_SIZE_OPTIONS = ['特写', '近景', '中景', '全景', '远景'].map(
  (value) => ({ label: value, value }),
);
const CAMERA_OPTIONS = [
  '固定镜头',
  '缓慢推进',
  '缓慢拉远',
  '水平环绕',
  '横向平移',
  '跟随运动',
].map((value) => ({ label: value, value }));
const TRANSITION_OPTIONS = ['淡化', '叠化', '擦除', '闪白'].map((value) => ({
  label: value,
  value,
}));

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function asNumberList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is number => typeof item === 'number')
    : [];
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function normalizedSelectNumber(value: unknown) {
  return typeof value === 'number' ? value : undefined;
}

const config = computed(() => props.node.config ?? {});
const template = computed(() => CREATIVE_NODE_MAP.get(props.node.type));
const imageConfig = computed(() => asRecord(config.value.image));
const videoConfig = computed(() => asRecord(config.value.video));
const isAssetInput = computed(() =>
  ['audio-input', 'image-input', 'video-input'].includes(props.node.type),
);
const isPlanner = computed(() => props.node.type === 'content-planner');
const isPromptGenerator = computed(
  () => props.node.type === 'prompt-generator',
);
const isPromptInput = computed(() => props.node.type === 'prompt-input');
const isRandomPrompt = computed(() => props.node.type === 'random-prompt');
const isPromptTemplate = computed(() => props.node.type === 'prompt-template');
const isPlanItem = computed(() =>
  ['image-plan-item', 'video-plan-item'].includes(props.node.type),
);
const isImageNode = computed(
  () =>
    IMAGE_AI_TYPES.has(props.node.type) ||
    props.node.type === 'image-plan-item',
);
const isVideoNode = computed(() => VIDEO_TYPES.has(props.node.type));
const isAudioNode = computed(() => AUDIO_TYPES.has(props.node.type));
const isAudioLocalNode = computed(() => AUDIO_LOCAL_TYPES.has(props.node.type));
const inputAssetKind = computed<FdmCreativeApi.CreativeAsset['kind']>(() => {
  if (props.node.type === 'audio-input') return 'AUDIO';
  return props.node.type === 'video-input' ? 'VIDEO' : 'IMAGE';
});
const promptLibraryTarget = computed<FdmCreativeApi.PromptTargetType>(() => {
  if (isImageNode.value) return 'IMAGE';
  if (isVideoNode.value || props.node.type === 'video-plan-item')
    return 'VIDEO';
  return 'GENERAL';
});
const isComposeNode = computed(() => COMPOSE_TYPES.has(props.node.type));
const isLoop = computed(() => LOOP_TYPES.has(props.node.type));
const isMediaSelector = computed(() =>
  MEDIA_SELECTOR_TYPES.has(props.node.type),
);
const configuredRandomPromptCount = computed(
  () =>
    asString(config.value.prompts)
      .split(/\r?\n/)
      .filter((item) => Boolean(item.trim())).length,
);
const isAiNode = computed(
  () =>
    isPlanner.value ||
    isPromptGenerator.value ||
    IMAGE_AI_TYPES.has(props.node.type) ||
    VIDEO_AI_TYPES.has(props.node.type) ||
    AUDIO_AI_TYPES.has(props.node.type),
);
const supportsNegativePrompt = computed(
  () =>
    IMAGE_AI_TYPES.has(props.node.type) ||
    VIDEO_AI_TYPES.has(props.node.type) ||
    isPlanItem.value,
);
const supportsPrompt = computed(() =>
  [
    'audio-generate',
    'brand-input',
    'content-planner',
    'creative-brief',
    'first-last-frame-to-video',
    'image-edit',
    'image-generate',
    'image-plan-item',
    'image-to-image',
    'image-to-video',
    'music-generate',
    'prompt-generator',
    'prompt-input',
    'prompt-template',
    'video-generate',
    'video-plan-item',
  ].includes(props.node.type),
);
const supportsReferences = computed(
  () =>
    isAssetInput.value ||
    isPlanner.value ||
    isPromptGenerator.value ||
    IMAGE_AI_TYPES.has(props.node.type) ||
    VIDEO_AI_TYPES.has(props.node.type),
);

const editorStyle = computed(() => ({
  '--editor-accent': template.value?.color ?? '#6d5dfc',
  width: props.variant === 'panel' ? '100%' : `${props.width}px`,
}));

const effectiveStatus = computed(
  () =>
    (props.busy ? 'RUNNING' : undefined) ??
    props.nodeRun?.status ??
    props.executionStatus ??
    'IDLE',
);
const isRunning = computed(
  () =>
    props.busy ||
    [
      'ARCHIVING_AI',
      'BLOCKED',
      'CANCEL_REQUESTED',
      'CREATED',
      'PENDING',
      'RUNNING',
      'WAITING_AI',
    ].includes(effectiveStatus.value),
);
const statusMeta = computed(() => {
  const map: Record<string, { color?: string; label: string }> = {
    ARCHIVING_AI: { color: 'processing', label: '结果归档中' },
    BLOCKED: { color: 'orange', label: '等待依赖' },
    CANCEL_REQUESTED: { color: 'orange', label: '取消中' },
    CANCELED: { label: '已取消' },
    CREATED: { color: 'blue', label: '已创建' },
    FAILED: { color: 'red', label: '执行失败' },
    IDLE: { label: '待运行' },
    PARTIAL_SUCCESS: { color: 'orange', label: '部分完成' },
    PENDING: { color: 'blue', label: '排队中' },
    RUNNING: { color: 'processing', label: '执行中' },
    SKIPPED: { label: '已跳过' },
    STALE: { color: 'orange', label: '需要更新' },
    SUCCEEDED: { color: 'green', label: '已完成' },
    WAITING_AI: { color: 'processing', label: '模型生成中' },
  };
  return map[effectiveStatus.value] ?? { label: String(effectiveStatus.value) };
});
const visibleError = computed(
  () => props.errorMessage || props.nodeRun?.errorMessage,
);

const expectedModality = computed<FdmAiApi.Modality | undefined>(() => {
  if (isPlanner.value || isPromptGenerator.value) return 'TEXT';
  if (IMAGE_AI_TYPES.has(props.node.type)) return 'IMAGE';
  if (VIDEO_AI_TYPES.has(props.node.type)) return 'VIDEO';
  if (VOICE_AI_TYPES.has(props.node.type)) return 'AUDIO';
  if (MUSIC_AI_TYPES.has(props.node.type)) return 'MUSIC';
  return undefined;
});
const availableModels = computed(() =>
  props.modelOptions.filter((item) => {
    if (
      !item.enabled ||
      (expectedModality.value && item.modality !== expectedModality.value)
    ) {
      return false;
    }
    if (
      !supportsNodeModel(
        item,
        props.node.type,
        Array.from(
          { length: effectiveReferenceCount() },
          (_, index) => index + 1,
        ),
      )
    ) {
      return false;
    }
    if (!isPlanner.value) return true;
    if (!item.capabilities.includes('STRUCTURED_OUTPUT')) return false;
    return !(
      effectiveReferenceCount() > 0 &&
      !item.capabilities.includes('IMAGE_INPUT')
    );
  }),
);
const modelSelectOptions = computed(() =>
  availableModels.value.flatMap((item) => {
    const value = normalizeModelIdentifier(item.id);
    return value ? [{ label: item.name, value }] : [];
  }),
);
const selectedModelId = computed(() =>
  normalizeModelIdentifier(config.value.logicalModelId ?? config.value.modelId),
);

const configuredSelectedModel = computed(() =>
  props.modelOptions.find(
    (item) => normalizeModelIdentifier(item.id) === selectedModelId.value,
  ),
);
const selectedModel = computed(() =>
  availableModels.value.find(
    (item) => normalizeModelIdentifier(item.id) === selectedModelId.value,
  ),
);
const modelSelectionError = computed(() => {
  if (!selectedModelId.value) return undefined;
  const model = configuredSelectedModel.value;
  if (!model) return '已选择的逻辑模型不存在或当前租户不可见，请重新选择';
  if (!model.enabled) return '已选择的逻辑模型已停用，请重新选择';
  if (expectedModality.value && model.modality !== expectedModality.value) {
    return `当前模型模态为 ${model.modality}，此节点需要 ${expectedModality.value}`;
  }
  if (isPromptGenerator.value && !model.capabilities.includes('CHAT')) {
    return '当前模型不支持 CHAT，不能用于提示词生成';
  }
  if (
    (isPromptGenerator.value || isPlanner.value) &&
    effectiveReferenceCount() > 0 &&
    !model.capabilities.includes('IMAGE_INPUT')
  ) {
    return '当前模型不支持图片输入，请移除参考图或选择视觉理解模型';
  }
  if (isPlanner.value && !model.capabilities.includes('STRUCTURED_OUTPUT')) {
    return '当前模型不支持结构化输出，不能用于内容规划';
  }
  if (
    !supportsNodeModel(
      model,
      props.node.type,
      Array.from(
        { length: effectiveReferenceCount() },
        (_, index) => index + 1,
      ),
    )
  ) {
    return '当前模型不具备此节点所需能力，请重新选择';
  }
  return undefined;
});
const frameSlots = computed(() => {
  const capabilities = selectedModel.value?.capabilities ?? [];
  return getVideoFrameConfigSlots(props.node.type, capabilities);
});
const hasFrameSlots = computed(() => frameSlots.value.length > 0);

const assetById = computed(
  () => new Map(props.projectAssets.map((asset) => [asset.id, asset])),
);
const imageAssets = computed(() =>
  props.projectAssets.filter((asset) => asset.kind === 'IMAGE'),
);
const inputAssetOptions = computed(() => {
  return props.projectAssets
    .filter((asset) => asset.kind === inputAssetKind.value)
    .map((asset) => ({ label: asset.name, value: asset.id }));
});
const imageAssetOptions = computed(() =>
  imageAssets.value.map((asset) => ({ label: asset.name, value: asset.id })),
);
// P3 result history keeps identifiers as decimal strings to avoid JavaScript
// precision loss. Resolve the rendered select/preview against the project
// asset list without rewriting the graph configuration back to a number.
const selectedInputAssetId = computed(() => {
  const configuredAssetId = config.value.assetId;
  return props.projectAssets.find(
    (asset) => String(asset.id) === String(configuredAssetId),
  )?.id;
});
const referenceAssetIds = computed(() =>
  asNumberList(config.value.referenceAssetIds),
);
const connectedAssetIds = computed(
  () =>
    new Set(
      props.connectedReferences
        .map((reference) => reference.assetId)
        .filter((id): id is number => typeof id === 'number'),
    ),
);
const manualReferenceAssets = computed(() =>
  referenceAssetIds.value
    .filter((id) => !connectedAssetIds.value.has(id))
    .map((id) => assetById.value.get(id))
    .filter(
      (asset): asset is FdmCreativeApi.CreativeAsset => asset !== undefined,
    ),
);
const manualReferenceAssetOptions = computed(() =>
  imageAssetOptions.value.filter(
    (option) => !connectedAssetIds.value.has(option.value),
  ),
);
const storedPromptReferenceBindings = computed(() =>
  normalizePromptReferenceBindings(config.value.promptReferenceBindings),
);
const activeReferenceCandidates = computed(() => [
  ...props.connectedReferences.map((reference) => ({
    assetId: reference.assetId,
    bindingKey: reference.bindingKey,
    connected: true,
    key: reference.key,
    mimeType: reference.mimeType,
    name: reference.name,
    sourceNodeName: reference.sourceNodeName,
    url: reference.url,
  })),
  ...manualReferenceAssets.value.map((asset) => ({
    assetId: asset.id,
    bindingKey: `ASSET:${asset.id}`,
    connected: false,
    key: `manual:${asset.id}`,
    mimeType: asset.mimeType,
    name: asset.name,
    sourceNodeName: undefined,
    url: asset.url,
  })),
]);
const synchronizedPromptReferenceBindings = computed(() =>
  reconcilePromptReferenceBindings(
    activeReferenceCandidates.value.map((reference) => reference.bindingKey),
    storedPromptReferenceBindings.value,
  ),
);
const displayedReferences = computed(() =>
  activeReferenceCandidates.value.map((reference) => ({
    ...reference,
    alias:
      synchronizedPromptReferenceBindings.value.find(
        (binding) => binding.bindingKey === reference.bindingKey,
      )?.alias ?? '图片',
  })),
);
const promptMentionOptions = computed(() =>
  displayedReferences.value.map((reference) => ({
    label: `${reference.alias} · ${reference.name}`,
    value: reference.alias,
  })),
);
const promptReferenceError = computed(() => {
  const invalid = invalidPromptImageReferenceNumbers(
    asString(config.value.prompt),
    displayedReferences.value.map((reference) =>
      Number(reference.alias.replace('图片', '')),
    ),
  );
  return invalid.length > 0
    ? `提示词中的 ${invalid.map((index) => `@图片${index}`).join('、')} 没有对应的参考图片，请重新选择或连接图片`
    : undefined;
});
const promptTemplateError = computed(() => {
  if (!isPromptGenerator.value && !isPromptTemplate.value) return undefined;
  const prompt = asString(config.value.prompt);
  const variablePattern = /\{\{([^{}]+)\}\}/g;
  const variables = [...prompt.matchAll(variablePattern)].map((match) =>
    match[1]?.trim().toLowerCase(),
  );
  const invalid = variables.filter(
    (variable) => variable && !['brief', 'context', 'input'].includes(variable),
  );
  if (invalid.length > 0) {
    return `不支持的模板变量：${[...new Set(invalid)].map((item) => `{{${item}}}`).join('、')}`;
  }
  const unmatched = prompt.replace(variablePattern, '');
  if (unmatched.includes('{{') || unmatched.includes('}}')) {
    return '模板变量格式不完整，请使用 {{input}}、{{context}} 或 {{brief}}';
  }
  return undefined;
});
const nodeValidationError = computed(
  () =>
    promptReferenceError.value ||
    modelSelectionError.value ||
    promptTemplateError.value ||
    inlineNodeConfigValidationError(props.node.type, config.value) ||
    (isPromptGenerator.value &&
    !asString(config.value.prompt).trim() &&
    props.connectedTextSources.length === 0
      ? '请填写提示词生成要求，或连接创作需求 / 上游提示词节点'
      : undefined),
);

function effectiveReferenceCount() {
  return displayedReferences.value.length;
}

watch(
  [availableModels, selectedModelId],
  () => {
    if (props.readonly || !isAiNode.value || selectedModelId.value) return;
    const defaultModel = availableModels.value[0];
    const logicalModelId = normalizeModelIdentifier(defaultModel?.id);
    if (logicalModelId) emit('configChange', 'logicalModelId', logicalModelId);
  },
  { immediate: true },
);

watch(
  synchronizedPromptReferenceBindings,
  (bindings) => {
    if (
      props.readonly ||
      JSON.stringify(bindings) ===
        JSON.stringify(storedPromptReferenceBindings.value)
    ) {
      return;
    }
    emit('configChange', 'promptReferenceBindings', bindings);
  },
  { flush: 'post', immediate: true },
);

function frameAssetId(slot: 'firstFrameAssetId' | 'lastFrameAssetId') {
  return asNumber(config.value[slot] ?? videoConfig.value[slot]);
}

function assetPreview(asset?: FdmCreativeApi.CreativeAsset) {
  return asset?.url;
}

function emitConfig(key: string, value: unknown) {
  if (!props.readonly) emit('configChange', key, value);
}

function changePrompt(value: string) {
  const normalized = value.replaceAll(
    /\{\{\s*(input|context|brief)\s*\}\}/gi,
    (_, variable: string) => `{{${variable.toLowerCase()}}}`,
  );
  emitConfig('prompt', normalized.slice(0, 1000));
}

function mergedLibraryText(
  current: string,
  selection: PromptLibrarySelection,
  separator = '\n',
) {
  if (selection.mode === 'replace' || !current.trim()) return selection.content;
  return `${current.trimEnd()}${separator}${selection.content}`;
}

function applyPromptFromLibrary(selection: PromptLibrarySelection) {
  changePrompt(mergedLibraryText(asString(config.value.prompt), selection));
}

function applyLibraryText(
  key:
    | 'negativePrompt'
    | 'prompts'
    | 'promptTemplate'
    | 'systemPrompt'
    | 'variations',
  selection: PromptLibrarySelection,
) {
  emitConfig(
    key,
    mergedLibraryText(asString(config.value[key]), selection).slice(0, 10_000),
  );
}

function appendPromptVariable(variable: 'brief' | 'context' | 'input') {
  const prompt = asString(config.value.prompt).trimEnd();
  const separator = prompt ? ' ' : '';
  changePrompt(`${prompt}${separator}{{${variable}}}`);
}

function emitNestedConfig(
  section: 'image' | 'video',
  key: string,
  value: unknown,
) {
  const current = section === 'image' ? imageConfig.value : videoConfig.value;
  emitConfig(section, { ...current, [key]: value });
}

function emitMediaConfig(key: string, value: unknown) {
  emitNestedConfig(isVideoNode.value ? 'video' : 'image', key, value);
}

function changeAudioTrimStart(value: unknown) {
  const start = asNumber(value);
  emitConfig('startSeconds', start);
  const end = asNumber(config.value.endSeconds);
  if (start !== undefined && end !== undefined && end > start) {
    emitConfig('durationSeconds', Number((end - start).toFixed(3)));
  }
}

function changeAudioTrimDuration(value: unknown) {
  emitConfig('durationSeconds', asNumber(value));
  // A manually chosen duration becomes the source of truth until an explicit end is entered again.
  if (config.value.endSeconds !== undefined)
    emitConfig('endSeconds', undefined);
}

function changeAudioTrimEnd(value: unknown) {
  const end = asNumber(value);
  if (end === undefined) {
    emitConfig('endSeconds', undefined);
    return;
  }
  const start = asNumber(config.value.startSeconds) ?? 0;
  emitConfig('endSeconds', end);
  if (end > start)
    emitConfig('durationSeconds', Number((end - start).toFixed(3)));
}

function changeAudioOrder(event: Event) {
  const value = (event.target as HTMLTextAreaElement | null)?.value ?? '';
  const order = value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 16);
  emitConfig('audioOrder', order.length > 0 ? order : undefined);
}

function audioOrderText() {
  return Array.isArray(config.value.audioOrder)
    ? config.value.audioOrder
        .filter((item): item is string => typeof item === 'string')
        .join('\n')
    : '';
}

function emitAssetChange(key: string, value: unknown, slot?: string) {
  if (props.readonly) return;
  const ids = Array.isArray(value) ? asNumberList(value) : [asNumber(value)];
  const assets = ids
    .filter((id): id is number => typeof id === 'number')
    .map((id) => assetById.value.get(id))
    .filter(
      (asset): asset is FdmCreativeApi.CreativeAsset => asset !== undefined,
    );
  emit('assetChange', { assets, key, slot, value });
}

function selectInputAssetFromLibrary(assets: FdmCreativeApi.CreativeAsset[]) {
  const asset = assets[0];
  if (asset)
    emit('assetChange', { assets: [asset], key: 'assetId', value: asset.id });
}

function selectReferenceAssetsFromLibrary(
  assets: FdmCreativeApi.CreativeAsset[],
) {
  const ids = [
    ...new Set([
      ...referenceAssetIds.value,
      ...assets.map((asset) => asset.id),
    ]),
  ];
  emit('assetChange', { assets, key: 'referenceAssetIds', value: ids });
}

function selectFrameAssetFromLibrary(
  slot: 'firstFrameAssetId' | 'lastFrameAssetId',
  assets: FdmCreativeApi.CreativeAsset[],
) {
  const asset = assets[0];
  if (!asset) return;
  if (isPlanItem.value) {
    emit('assetChange', {
      assets: [asset],
      key: 'video',
      slot,
      value: { ...videoConfig.value, [slot]: asset.id },
    });
  } else {
    emit('assetChange', { assets: [asset], key: slot, slot, value: asset.id });
  }
}

function changeInputAsset(value: unknown) {
  emitAssetChange('assetId', normalizedSelectNumber(value));
}

function changeReferenceAssets(value: unknown) {
  emitAssetChange('referenceAssetIds', asNumberList(value));
}

function removeReferenceAsset(id: number) {
  changeReferenceAssets(referenceAssetIds.value.filter((item) => item !== id));
}

function changeFrameAsset(
  slot: 'firstFrameAssetId' | 'lastFrameAssetId',
  value: unknown,
) {
  const assetId = normalizedSelectNumber(value);
  if (isPlanItem.value) {
    const nextVideo = { ...videoConfig.value, [slot]: assetId };
    emitAssetChange('video', nextVideo, slot);
  } else {
    emitAssetChange(slot, assetId, slot);
  }
}

function currentMediaValue(key: string, fallback?: unknown) {
  return (
    (isVideoNode.value ? videoConfig.value[key] : imageConfig.value[key]) ??
    config.value[key] ??
    fallback
  );
}

function commitName(value: string) {
  const normalized = value.trim() || props.node.name || '未命名节点';
  editingName.value = false;
  if (!props.readonly && normalized !== props.node.name) {
    emit('nameChange', normalized);
  }
}

function commitNameEvent(event: Event) {
  commitName((event.target as HTMLInputElement | null)?.value ?? '');
}

function runNode() {
  if (props.canRun && !isRunning.value && !nodeValidationError.value) {
    emit('run', props.node.id);
  }
}

function runDownstream() {
  if (props.canRun && !isRunning.value && !nodeValidationError.value) {
    emit('runDownstream', props.node.id);
  }
}

function promptLabel() {
  if (isPlanner.value) return '创作总提示词';
  if (isPromptGenerator.value) return '提示词生成要求';
  if (isPromptTemplate.value) return '提示词模板';
  if (props.node.type === 'video-plan-item') return '片段脚本';
  if (props.node.type === 'image-plan-item') return '图片提示词';
  if (isVideoNode.value) return '视频提示词';
  if (isImageNode.value) return '图片提示词';
  if (isAudioNode.value) return '音频提示词';
  return '节点提示词';
}

function promptPlaceholder() {
  if (isPlanner.value) return '描述创作目标、商品卖点、受众与整体视觉风格…';
  if (isPromptGenerator.value)
    return '例如：把 {{input}} 扩写为可直接用于图片模型的专业提示词，并保持主体和风格一致…';
  if (isPromptTemplate.value)
    return '例如：{{brief}}\n{{input}}；未写变量时会自动追加上游文本…';
  if (isVideoNode.value) return '描述主体动作、场景变化、镜头运动与画面连续性…';
  if (isImageNode.value) return '描述主体、场景、构图、光线、材质和画面风格…';
  if (isAudioNode.value)
    return '描述音色、情绪、语速、节奏、乐器或需要保留的声音特征…';
  return '输入该节点需要处理的内容…';
}

async function copyResultText() {
  const text = props.resultText?.trim();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    message.success('提示词已复制');
  } catch {
    message.error('复制失败，请手动选择文本复制');
  }
}

function parseSchemaFields(schemaText?: string): SchemaField[] {
  if (!schemaText) return [];
  try {
    const root = asRecord(JSON.parse(schemaText));
    const properties = asRecord(root.properties);
    const required = new Set(
      Array.isArray(root.required) ? root.required.map(String) : [],
    );
    return Object.entries(properties)
      .map(([key, rawProperty]) => {
        const property = asRecord(rawProperty);
        const rawType = Array.isArray(property.type)
          ? property.type.find((item) => item !== 'null')
          : property.type;
        const type = ['boolean', 'integer', 'number', 'string'].includes(
          String(rawType),
        )
          ? (String(rawType) as SchemaField['type'])
          : 'string';
        const enumValues = Array.isArray(property.enum)
          ? property.enum.filter((item): item is SchemaScalar =>
              ['number', 'string'].includes(typeof item),
            )
          : [];
        return {
          description: asString(property.description) || undefined,
          key,
          maximum: asNumber(property.maximum),
          minimum: asNumber(property.minimum),
          options:
            enumValues.length > 0
              ? enumValues.map((item) => ({ label: String(item), value: item }))
              : undefined,
          required: required.has(key),
          step: asNumber(property.multipleOf),
          title: asString(property.title, key),
          type,
        } satisfies SchemaField;
      })
      .slice(0, 12);
  } catch {
    return [];
  }
}

const schemaFields = computed(() =>
  parseSchemaFields(selectedModel.value?.parameterSchema),
);
const modelParameters = computed(() => asRecord(config.value.modelParameters));

function updateModelParameter(key: string, value: unknown) {
  emitConfig('modelParameters', { ...modelParameters.value, [key]: value });
}

function schemaSelectValue(key: string) {
  const value = modelParameters.value[key];
  return typeof value === 'string' || typeof value === 'number'
    ? value
    : undefined;
}

function formatReferenceMeta(reference: {
  connected: boolean;
  mimeType?: string;
  sourceNodeName?: string;
}) {
  if (reference.connected) {
    return reference.sourceNodeName
      ? `来自连线 · ${reference.sourceNodeName}`
      : '来自连线';
  }
  return reference.mimeType
    ? reference.mimeType.replace('image/', '').toUpperCase()
    : '补充素材';
}

function hasOpenPopup() {
  return Boolean(
    document.querySelector(
      '.ant-select-dropdown:not(.ant-select-dropdown-hidden), .ant-picker-dropdown:not(.ant-picker-dropdown-hidden), .ant-modal-wrap',
    ),
  );
}

function handleEditorEscape() {
  if (!hasOpenPopup()) emit('close');
}
</script>

<template>
  <section
    class="node-inline-editor"
    :class="[
      `node-inline-editor--${placement}`,
      `node-inline-editor--${variant}`,
      { 'is-expanded': expanded, 'is-readonly': readonly },
    ]"
    :data-node-id="node.id"
    :data-node-type="node.type"
    data-testid="node-inline-editor"
    :style="editorStyle"
    tabindex="-1"
    @click.stop
    @contextmenu.stop
    @dblclick.stop
    @keydown.esc.stop="handleEditorEscape"
    @keydown.stop
    @keyup.stop
    @mousedown.stop
    @pointerdown.stop
    @wheel.stop
  >
    <header class="editor-header">
      <span class="editor-node-icon">
        <IconifyIcon :icon="template?.icon ?? 'lucide:box'" />
      </span>
      <Input
        v-if="editingName"
        autofocus
        class="node-name-input"
        :disabled="readonly"
        :value="node.name"
        @blur="commitNameEvent"
        @press-enter="commitNameEvent"
      />
      <button
        v-else
        class="node-name"
        :disabled="readonly"
        type="button"
        @click="editingName = true"
      >
        <strong>{{ node.name }}</strong>
        <IconifyIcon v-if="!readonly" icon="lucide:pencil" />
      </button>
      <Tag :color="statusMeta.color" class="status-tag">
        {{ statusMeta.label }}
      </Tag>
      <span
        v-if="isRunning && typeof progress === 'number'"
        class="header-progress"
      >
        {{ Math.round(progress) }}%
      </span>
      <Tooltip :title="expanded ? '收起更多内容' : '展开更多内容'">
        <Button
          class="header-action header-expand"
          size="small"
          type="text"
          @click="expanded = !expanded"
        >
          <span>{{ expanded ? '收起' : '展开' }}</span>
          <IconifyIcon
            :icon="expanded ? 'lucide:minimize-2' : 'lucide:maximize-2'"
          />
        </Button>
      </Tooltip>
      <Tooltip title="关闭">
        <Button
          class="header-action"
          size="small"
          type="text"
          @click="emit('close')"
        >
          <IconifyIcon icon="lucide:x" />
        </Button>
      </Tooltip>
    </header>

    <Progress
      v-if="isRunning && typeof progress === 'number'"
      class="running-progress"
      :percent="progress"
      :show-info="false"
      size="small"
      status="active"
    />

    <main class="editor-content">
      <section
        v-if="supportsReferences"
        class="editor-section reference-section"
      >
        <div class="section-heading">
          <strong>
            {{ isAssetInput ? '素材' : hasFrameSlots ? '参考帧' : '参考素材' }}
          </strong>
          <span v-if="isPlanner">用于保持角色、商品和视觉风格一致</span>
          <span v-else-if="!isAssetInput">
            可选，模型能力不支持时会在执行前提示
          </span>
        </div>

        <div v-if="isAssetInput" class="single-asset-row">
          <div class="asset-preview asset-preview--large">
            <template v-if="assetById.get(selectedInputAssetId || -1)">
              <img
                v-if="
                  assetById.get(selectedInputAssetId || -1)?.kind === 'IMAGE'
                "
                :alt="assetById.get(selectedInputAssetId || -1)?.name"
                :src="assetPreview(assetById.get(selectedInputAssetId || -1))"
              />
              <video
                v-else-if="
                  assetById.get(selectedInputAssetId || -1)?.kind === 'VIDEO'
                "
                muted
                playsinline
                preload="metadata"
                :src="assetPreview(assetById.get(selectedInputAssetId || -1))"
              ></video>
              <audio
                v-else
                controls
                preload="metadata"
                :src="assetPreview(assetById.get(selectedInputAssetId || -1))"
              ></audio>
            </template>
            <div v-else class="asset-empty">
              <IconifyIcon
                :icon="
                  node.type === 'audio-input'
                    ? 'lucide:audio-lines'
                    : node.type === 'video-input'
                      ? 'lucide:film'
                      : 'lucide:image-plus'
                "
              />
              <span>尚未选择素材</span>
            </div>
          </div>
          <div class="single-asset-control">
            <Select
              allow-clear
              :disabled="readonly"
              :options="inputAssetOptions"
              placeholder="从项目素材库选择"
              show-search
              :value="selectedInputAssetId"
              @change="changeInputAsset"
            />
            <AssetLibraryPicker
              button-text="浏览全部资产"
              :disabled="readonly"
              :kinds="[inputAssetKind]"
              :project-id="projectId"
              @select="selectInputAssetFromLibrary"
            />
            <p>
              {{
                assetById.get(selectedInputAssetId || -1)?.name ||
                '选择已有素材，或通过上传入口加入项目素材库'
              }}
            </p>
            <FileUpload
              v-if="uploadApi"
              :key="`inline-editor-upload-${node.id}`"
              :accept="uploadAccept"
              :api="uploadApi"
              directory="fdmcreative"
              :disabled="readonly"
              :help-text="`支持 ${uploadAccept.join(' / ') || '常用素材格式'}，最大 ${uploadMaxSize || 25} MB`"
              :max-number="1"
              :max-size="uploadMaxSize"
              :show-description="false"
            />
            <slot name="asset-actions" :node="node"></slot>
          </div>
        </div>

        <div v-else-if="hasFrameSlots" class="frame-grid">
          <article
            v-for="slot in frameSlots"
            :key="slot.key"
            class="frame-card"
          >
            <div class="frame-preview">
              <img
                v-if="assetById.get(frameAssetId(slot.key) || -1)?.url"
                :alt="assetById.get(frameAssetId(slot.key) || -1)?.name"
                :src="assetById.get(frameAssetId(slot.key) || -1)?.url"
              />
              <IconifyIcon v-else icon="lucide:image-plus" />
              <span>{{ slot.label }}</span>
            </div>
            <Select
              allow-clear
              :disabled="readonly"
              :options="imageAssetOptions"
              :placeholder="`选择${slot.label}`"
              show-search
              :value="frameAssetId(slot.key)"
              @change="changeFrameAsset(slot.key, $event)"
            />
            <AssetLibraryPicker
              button-text="资产库"
              :disabled="readonly"
              :kinds="['IMAGE']"
              :project-id="projectId"
              @select="selectFrameAssetFromLibrary(slot.key, $event)"
            />
          </article>
          <div v-if="node.type === 'image-to-video'" class="frame-tip">
            <IconifyIcon icon="lucide:info" />
            图生视频只要求首帧；尾帧未配置时由模型自然续写。
          </div>
        </div>

        <div v-else class="reference-strip">
          <article
            v-for="reference in displayedReferences"
            :key="reference.key"
            class="reference-card"
            :class="{ 'reference-card--connected': reference.connected }"
          >
            <div class="reference-image">
              <img
                v-if="reference.url"
                :alt="reference.name"
                :src="reference.url"
              />
              <IconifyIcon v-else icon="lucide:image" />
              <span class="reference-alias">@{{ reference.alias }}</span>
              <button
                v-if="!readonly && !reference.connected && reference.assetId"
                aria-label="移除参考素材"
                type="button"
                @click="removeReferenceAsset(reference.assetId)"
              >
                <IconifyIcon icon="lucide:x" />
              </button>
            </div>
            <strong :title="reference.name">{{ reference.name }}</strong>
            <span class="reference-origin">
              <IconifyIcon v-if="reference.connected" icon="lucide:link-2" />
              {{ formatReferenceMeta(reference) }}
            </span>
          </article>
          <Select
            class="reference-add"
            :disabled="readonly"
            :max-tag-count="0"
            mode="multiple"
            :options="manualReferenceAssetOptions"
            placeholder="补充素材"
            show-search
            :value="manualReferenceAssets.map((asset) => asset.id)"
            @change="changeReferenceAssets"
          >
            <template #suffixIcon>
              <IconifyIcon icon="lucide:plus" />
            </template>
            <template #maxTagPlaceholder>
              <span>管理素材</span>
            </template>
          </Select>
          <AssetLibraryPicker
            button-text="浏览资产库"
            :disabled="readonly"
            :kinds="['IMAGE']"
            multiple
            :project-id="projectId"
            @select="selectReferenceAssetsFromLibrary"
          />
          <slot name="asset-actions" :node="node"></slot>
        </div>
      </section>

      <section
        v-if="node.type === 'image-edit'"
        class="editor-section mask-capability-note"
      >
        <div class="section-heading">
          <strong>遮罩局部重绘</strong>
          <Tag color="default">当前不可用</Tag>
        </div>
        <p>
          当前 FDM AI 目录尚未声明 IMAGE_INPAINT / IMAGE_OUTPAINT
          的供应商契约。遮罩资产仅保留为私有图片引用，运行会被安全拒绝，不会被静默忽略或伪装成普通图片编辑。
        </p>
        <span v-if="config.maskAssetId">
          已检测到历史遮罩配置；请移除或等待管理员配置完整能力后再运行。
        </span>
      </section>

      <section v-if="supportsPrompt" class="editor-section prompt-section">
        <div class="section-heading">
          <strong>{{ promptLabel() }}</strong>
          <PromptLibraryPicker
            button-text="从提示词库选择"
            :current-text="asString(config.prompt)"
            :disabled="readonly"
            :target-type="promptLibraryTarget"
            @select="applyPromptFromLibrary"
          />
          <span
            v-if="
              isPromptGenerator
                ? connectedTextSources.length
                : connectedPromptInputCount
            "
          >
            <IconifyIcon icon="lucide:workflow" />
            {{
              isPromptGenerator
                ? connectedTextSources.length
                : connectedPromptInputCount
            }}
            个上游输入
          </span>
          <span>{{ asString(config.prompt).length }} / 1000</span>
        </div>
        <div class="prompt-field">
          <Mentions
            :disabled="readonly"
            :maxlength="1000"
            :options="promptMentionOptions"
            :placeholder="promptPlaceholder()"
            prefix="@"
            :rows="isPlanner ? 4 : expanded ? 5 : 3"
            split=" "
            :value="asString(config.prompt)"
            @change="changePrompt"
          />
          <Tooltip title="提示词润色由上层工作台接入">
            <span class="prompt-sparkle">
              <IconifyIcon icon="lucide:sparkles" />
            </span>
          </Tooltip>
        </div>
        <div v-if="displayedReferences.length" class="prompt-reference-tip">
          <IconifyIcon icon="lucide:at-sign" />
          输入 @ 可引用已连接图片，例如“将 @图片1 的图案替换为 @图片2”。
        </div>
        <div
          v-if="isPromptGenerator || isPromptTemplate"
          class="prompt-template-tip"
        >
          <IconifyIcon icon="lucide:braces" />
          <span>
            可用 <code v-text="'{{input}}'"></code>、<code
              v-text="'{{context}}'"
            ></code>
            和
            <code v-text="'{{brief}}'"></code>；未写变量时，上游文本会自动附加。
          </span>
        </div>
        <div
          v-if="isPromptGenerator || isPromptTemplate"
          class="template-variable-row"
        >
          <span>插入变量</span>
          <button type="button" @click="appendPromptVariable('input')">
            input · 首选输入
          </button>
          <button type="button" @click="appendPromptVariable('context')">
            context · 上游提示词
          </button>
          <button type="button" @click="appendPromptVariable('brief')">
            brief · 创作需求
          </button>
        </div>
        <div
          v-if="
            (isPromptGenerator || isPromptTemplate) &&
            connectedTextSources.length
          "
          class="connected-text-sources"
        >
          <article v-for="source in connectedTextSources" :key="source.id">
            <span class="text-source-icon">
              <IconifyIcon
                :icon="
                  source.portType === 'prompt-text'
                    ? 'lucide:sparkles'
                    : 'lucide:message-square-text'
                "
              />
            </span>
            <div>
              <strong>{{ source.name }}</strong>
              <small :title="source.preview">
                {{
                  source.preview ||
                  (source.portType === 'prompt-text'
                    ? '运行时读取上游生成结果'
                    : '读取创作需求')
                }}
              </small>
            </div>
            <Tag v-if="source.status">
              {{ nodeRunStatusLabel(source.status) }}
            </Tag>
          </article>
        </div>
        <div
          v-else-if="connectedPromptInputCount"
          class="prompt-template-tip prompt-template-tip--connected"
        >
          <IconifyIcon icon="lucide:link-2" />
          <span>
            执行时使用上游生成的提示词，本地提示词仅作为未连接时的备用值。
          </span>
        </div>
        <div v-if="promptReferenceError" class="prompt-reference-error">
          <IconifyIcon icon="lucide:circle-alert" />
          {{ promptReferenceError }}
        </div>
        <button
          v-if="supportsNegativePrompt"
          class="fold-row"
          type="button"
          @click="negativePromptOpen = !negativePromptOpen"
        >
          <IconifyIcon
            :icon="
              negativePromptOpen ? 'lucide:chevron-up' : 'lucide:chevron-down'
            "
          />
          负向提示词
          <span v-if="asString(config.negativePrompt)">已填写</span>
        </button>
        <div v-if="negativePromptOpen" class="library-text-field">
          <PromptLibraryPicker
            button-text="选择负向提示词"
            :current-text="asString(config.negativePrompt)"
            :disabled="readonly"
            :target-type="promptLibraryTarget"
            @select="applyLibraryText('negativePrompt', $event)"
          />
          <Textarea
            class="negative-prompt"
            :auto-size="{ minRows: 2, maxRows: 4 }"
            :disabled="readonly"
            placeholder="描述不希望出现在结果中的内容、风格或画面问题…"
            :value="asString(config.negativePrompt)"
            @change="emitConfig('negativePrompt', $event.target.value)"
          />
        </div>
      </section>

      <section
        v-if="isRandomPrompt"
        class="editor-section random-prompt-section"
      >
        <div class="section-heading">
          <strong>候选提示词</strong>
          <PromptLibraryPicker
            button-text="添加库中提示词"
            :current-text="asString(config.prompts)"
            :disabled="readonly"
            :target-type="promptLibraryTarget"
            @select="applyLibraryText('prompts', $event)"
          />
          <span>每行一个，每次执行都会重新随机抽取</span>
        </div>
        <Textarea
          :auto-size="{ minRows: 5, maxRows: expanded ? 14 : 8 }"
          :disabled="readonly"
          :maxlength="10_000"
          placeholder="产品正面特写，柔和棚拍光线&#10;产品侧面特写，突出材质纹理&#10;产品俯拍构图，简洁背景"
          :value="asString(config.prompts)"
          @change="emitConfig('prompts', $event.target.value)"
        />
        <div class="prompt-template-tip">
          <IconifyIcon icon="lucide:shuffle" />
          <span>
            当前 {{ configuredRandomPromptCount }} 条手动候选
            <span v-if="connectedTextSources.length">
              ，另有 {{ connectedTextSources.length }} 个已连接上游候选
            </span>
            。重复内容会自动去重。
          </span>
        </div>
      </section>

      <section v-if="isLoop" class="editor-section loop-section">
        <div class="section-heading">
          <strong>批次循环设置</strong>
          <span>每轮完成整个下游分支后，再开始下一轮</span>
        </div>
        <div class="loop-setting-grid">
          <label>
            <span>循环次数</span>
            <InputNumber
              :disabled="readonly"
              :max="20"
              :min="1"
              :precision="0"
              :value="asNumber(config.count) ?? 4"
              @change="emitConfig('count', $event)"
            />
          </label>
          <label>
            <span>起始序号</span>
            <InputNumber
              :disabled="readonly"
              :min="1"
              :precision="0"
              :value="asNumber(config.startIndex) ?? 1"
              @change="emitConfig('startIndex', $event)"
            />
          </label>
          <label>
            <span>每轮素材数</span>
            <InputNumber
              :disabled="readonly"
              :max="20"
              :min="1"
              :precision="0"
              :value="asNumber(config.batchSize) ?? 1"
              @change="emitConfig('batchSize', $event)"
            />
          </label>
        </div>
        <div class="loop-variation-field">
          <div class="section-heading">
            <strong>变化项</strong>
            <PromptLibraryPicker
              button-text="从库中添加"
              :current-text="asString(config.variations)"
              :disabled="readonly"
              :target-type="promptLibraryTarget"
              @select="applyLibraryText('variations', $event)"
            />
            <span>每行一项；不足时会从第一项循环使用</span>
          </div>
          <Textarea
            :auto-size="{ minRows: 4, maxRows: expanded ? 10 : 6 }"
            :disabled="readonly"
            placeholder="正面视角&#10;侧面视角&#10;俯拍视角"
            :value="asString(config.variations)"
            @change="emitConfig('variations', $event.target.value)"
          />
        </div>
        <div class="prompt-template-tip">
          <IconifyIcon icon="lucide:braces" />
          <span>
            模板支持
            <code v-text="'{{input}}'"></code>、
            <code v-text="'{{brief}}'"></code>、
            <code v-text="'{{item}}'"></code>、
            <code v-text="'{{index}}'"></code>
            和 <code v-text="'{{total}}'"></code>。
          </span>
        </div>
        <div v-if="expanded" class="loop-variation-field">
          <div class="section-heading">
            <strong>循环提示词模板</strong>
            <PromptLibraryPicker
              button-text="从库中选择"
              :current-text="asString(config.promptTemplate)"
              :disabled="readonly"
              :target-type="promptLibraryTarget"
              @select="applyLibraryText('promptTemplate', $event)"
            />
            <span>控制上游文本、变化项和轮次变量的组合方式</span>
          </div>
          <Textarea
            :auto-size="{ minRows: 3, maxRows: 8 }"
            :disabled="readonly"
            :value="
              asString(config.promptTemplate, '{{input}}\n{{brief}}\n{{item}}')
            "
            @change="emitConfig('promptTemplate', $event.target.value)"
          />
        </div>
      </section>

      <section
        v-if="isAudioLocalNode"
        class="editor-section audio-settings-section"
      >
        <div class="section-heading">
          <strong>
            {{
              node.type === 'audio-trim'
                ? '音频裁剪设置'
                : node.type === 'audio-normalize'
                  ? '音频标准化设置'
                  : node.type === 'audio-mix'
                    ? '音频混音设置'
                    : node.type === 'audio-extract'
                      ? '提取音轨设置'
                      : '视频配音合成设置'
            }}
          </strong>
          <span v-if="node.type === 'audio-mix'">
            顺序只取已保存的 AUDIO_LIST，不按画布位置推断
          </span>
          <span v-else>参数将在服务端受控 FFmpeg 中校验和执行</span>
        </div>

        <div v-if="node.type === 'audio-trim'" class="audio-settings-grid">
          <label>
            <span>开始（秒）</span>
            <InputNumber
              :disabled="readonly"
              :max="600"
              :min="0"
              :precision="3"
              :step="0.1"
              :value="asNumber(config.startSeconds) ?? 0"
              @change="changeAudioTrimStart($event)"
            />
          </label>
          <label>
            <span>时长（秒）</span>
            <InputNumber
              :disabled="readonly"
              :max="600"
              :min="0.01"
              :precision="3"
              :step="0.1"
              :value="asNumber(config.durationSeconds) ?? 15"
              @change="changeAudioTrimDuration($event)"
            />
          </label>
          <label>
            <span>结束（秒，可选）</span>
            <InputNumber
              :disabled="readonly"
              :max="86_400"
              :min="0.01"
              :precision="3"
              placeholder="由开始 + 时长推算"
              :step="0.1"
              :value="asNumber(config.endSeconds)"
              @change="changeAudioTrimEnd($event)"
            />
          </label>
          <label>
            <span>淡入（秒）</span>
            <InputNumber
              :disabled="readonly"
              :max="600"
              :min="0"
              :precision="3"
              :step="0.1"
              :value="asNumber(config.fadeInSeconds) ?? 0"
              @change="emitConfig('fadeInSeconds', $event)"
            />
          </label>
          <label>
            <span>淡出（秒）</span>
            <InputNumber
              :disabled="readonly"
              :max="600"
              :min="0"
              :precision="3"
              :step="0.1"
              :value="asNumber(config.fadeOutSeconds) ?? 0"
              @change="emitConfig('fadeOutSeconds', $event)"
            />
          </label>
        </div>

        <div v-if="node.type === 'audio-normalize'" class="audio-settings-grid">
          <label>
            <span>目标响度（LUFS）</span>
            <InputNumber
              :disabled="readonly"
              :max="-5"
              :min="-70"
              :precision="1"
              :step="1"
              :value="asNumber(config.targetLufs) ?? -16"
              @change="emitConfig('targetLufs', $event)"
            />
          </label>
        </div>

        <div v-if="node.type === 'audio-mix'" class="audio-settings-grid">
          <label>
            <span>输出结束策略</span>
            <Select
              :disabled="readonly"
              :options="[
                { label: '最长音轨结束', value: 'LONGEST' },
                { label: '最短音轨结束', value: 'SHORTEST' },
              ]"
              :value="asString(config.durationPolicy, 'LONGEST').toUpperCase()"
              @change="emitConfig('durationPolicy', $event)"
            />
          </label>
          <label class="audio-settings-grid__wide">
            <span>显式音轨顺序（可选）</span>
            <Textarea
              :auto-size="{ minRows: 2, maxRows: 4 }"
              :disabled="readonly"
              placeholder="每行一个源节点 ID；留空时使用保存的连线顺序。推荐先用“音频集合”固定顺序。"
              :value="audioOrderText()"
              @change="changeAudioOrder($event)"
            />
          </label>
        </div>

        <div
          v-if="node.type === 'video-audio-merge'"
          class="audio-settings-grid"
        >
          <label>
            <span>原音轨处理</span>
            <Select
              :disabled="readonly"
              :options="[
                { label: '替换原音轨', value: 'REPLACE' },
                { label: '保留并混合', value: 'KEEP' },
                { label: '压低原音轨（Duck）', value: 'DUCK' },
              ]"
              :value="asString(config.audioMode, 'REPLACE').toUpperCase()"
              @change="emitConfig('audioMode', $event)"
            />
          </label>
          <label>
            <span>视频时长策略</span>
            <Select
              :disabled="readonly"
              :options="[
                { label: '最短素材结束', value: 'SHORTEST' },
                { label: '最长素材结束', value: 'LONGEST' },
              ]"
              :value="asString(config.durationPolicy, 'SHORTEST').toUpperCase()"
              @change="emitConfig('durationPolicy', $event)"
            />
          </label>
          <label
            v-if="
              asString(config.audioMode, 'REPLACE').toUpperCase() === 'DUCK'
            "
          >
            <span>压低比例</span>
            <InputNumber
              :disabled="readonly"
              :max="1"
              :min="0.01"
              :precision="2"
              :step="0.05"
              :value="asNumber(config.duckingLevel) ?? 0.35"
              @change="emitConfig('duckingLevel', $event)"
            />
          </label>
        </div>

        <div
          v-if="
            [
              'audio-extract',
              'audio-mix',
              'audio-normalize',
              'audio-trim',
            ].includes(node.type)
          "
          class="audio-settings-grid audio-settings-grid--output"
        >
          <label>
            <span>输出格式</span>
            <Select
              :disabled="readonly"
              :options="AUDIO_FORMAT_OPTIONS"
              :value="asString(config.format, 'wav').toLowerCase()"
              @change="emitConfig('format', $event)"
            />
          </label>
          <label>
            <span>采样率</span>
            <Select
              :disabled="readonly"
              :options="AUDIO_SAMPLE_RATE_OPTIONS"
              :value="asNumber(config.sampleRate) ?? 44_100"
              @change="emitConfig('sampleRate', $event)"
            />
          </label>
          <label>
            <span>声道</span>
            <Select
              :disabled="readonly"
              :options="AUDIO_CHANNEL_OPTIONS"
              :value="asNumber(config.channels) ?? 2"
              @change="emitConfig('channels', $event)"
            />
          </label>
          <label>
            <span>输出音量（%）</span>
            <InputNumber
              :disabled="readonly"
              :max="200"
              :min="0"
              :precision="0"
              :value="asNumber(config.volumePercent) ?? 100"
              @change="emitConfig('volumePercent', $event)"
            />
          </label>
        </div>
      </section>

      <section v-if="isComposeNode" class="editor-section compose-section">
        <div class="section-heading">
          <strong>{{
            node.type === 'video-compose' ? '合成设置' : '成果设置'
          }}</strong>
          <span>素材顺序以画布连线和上游时间线为准</span>
        </div>
        <div class="compose-summary">
          <span class="compose-icon">
            <IconifyIcon
              :icon="
                node.type === 'video-compose'
                  ? 'lucide:film'
                  : 'lucide:package-check'
              "
            />
          </span>
          <div>
            <strong>{{
              node.type === 'video-compose' ? '视频时间线' : '成果集合'
            }}</strong>
            <p>
              {{
                node.type === 'video-compose'
                  ? '按上游片段顺序执行裁剪、转场与 MP4 合成'
                  : '聚合上游图片、视频与时间线成果'
              }}
            </p>
          </div>
        </div>
      </section>

      <section v-if="visibleError" class="execution-error">
        <IconifyIcon icon="lucide:circle-alert" />
        <span>{{ visibleError }}</span>
      </section>
      <section
        v-if="
          nodeValidationError && nodeValidationError !== promptReferenceError
        "
        class="execution-error validation-error"
      >
        <IconifyIcon icon="lucide:shield-alert" />
        <span>{{ nodeValidationError }}</span>
      </section>

      <section v-if="advancedOpen" class="advanced-panel">
        <div class="advanced-heading">
          <div>
            <strong>高级参数</strong>
            <span v-if="schemaFields.length">由当前模型参数 Schema 生成</span>
            <span v-else>当前模型未声明扩展参数</span>
          </div>
          <Button size="small" type="text" @click="advancedOpen = false">
            收起
          </Button>
        </div>
        <label v-if="isPromptGenerator" class="system-prompt-field">
          <span>
            系统指令
            <small>定义角色、约束与输出质量；不会作为下游提示词直接输出</small>
          </span>
          <PromptLibraryPicker
            button-text="从提示词库选择"
            :current-text="asString(config.systemPrompt)"
            :disabled="readonly"
            target-type="GENERAL"
            @select="applyLibraryText('systemPrompt', $event)"
          />
          <Textarea
            :auto-size="{ minRows: 3, maxRows: 6 }"
            :disabled="readonly"
            placeholder="你是一名专业的图像与视频提示词工程师…"
            :value="asString(config.systemPrompt)"
            @change="emitConfig('systemPrompt', $event.target.value)"
          />
        </label>
        <div v-if="schemaFields.length" class="schema-grid">
          <label
            v-for="field in schemaFields"
            :key="field.key"
            class="schema-field"
          >
            <span>
              {{ field.title }}
              <i v-if="field.required">*</i>
              <Tooltip v-if="field.description" :title="field.description">
                <IconifyIcon icon="lucide:circle-help" />
              </Tooltip>
            </span>
            <Select
              v-if="field.options"
              allow-clear
              :disabled="readonly"
              :options="field.options"
              :value="schemaSelectValue(field.key)"
              @change="updateModelParameter(field.key, $event)"
            />
            <Switch
              v-else-if="field.type === 'boolean'"
              :checked="Boolean(modelParameters[field.key])"
              :disabled="readonly"
              @change="updateModelParameter(field.key, $event)"
            />
            <InputNumber
              v-else-if="field.type === 'integer' || field.type === 'number'"
              :disabled="readonly"
              :max="field.maximum"
              :min="field.minimum"
              :precision="field.type === 'integer' ? 0 : undefined"
              :step="field.step"
              :value="asNumber(modelParameters[field.key])"
              @change="updateModelParameter(field.key, $event)"
            />
            <Input
              v-else
              :disabled="readonly"
              :value="asString(modelParameters[field.key])"
              @change="updateModelParameter(field.key, $event.target.value)"
            />
          </label>
        </div>
        <div v-else-if="!isPromptGenerator" class="advanced-empty">
          <IconifyIcon icon="lucide:sliders-horizontal" />
          <span>选择带参数 Schema 的逻辑模型后，将自动显示可用控件。</span>
        </div>
      </section>

      <section v-if="resultText" class="editor-section text-result-section">
        <div class="section-heading">
          <strong>输出提示词</strong>
          <Button size="small" type="text" @click="copyResultText">
            <IconifyIcon icon="lucide:copy" />
            复制
          </Button>
        </div>
        <div class="text-result">
          <pre>{{ resultText }}</pre>
        </div>
      </section>

      <section v-if="resultAssets.length" class="editor-section result-section">
        <div class="section-heading">
          <strong>生成结果</strong>
          <span>{{ resultAssets.length }} 个素材已归档</span>
        </div>
        <div class="result-strip">
          <article
            v-for="asset in resultAssets.slice(0, 6)"
            :key="asset.id"
            :title="asset.name"
          >
            <a
              v-if="asset.kind !== 'AUDIO'"
              :href="asset.url"
              rel="noreferrer"
              target="_blank"
            >
              <img
                v-if="asset.kind === 'IMAGE'"
                :alt="asset.name"
                :src="asset.url"
              />
              <video
                v-else
                muted
                playsinline
                preload="metadata"
                :src="asset.url"
              ></video>
            </a>
            <div v-else class="result-strip__audio">
              <IconifyIcon icon="lucide:audio-lines" />
              <audio controls preload="metadata" :src="asset.url"></audio>
            </div>
            <span>{{ asset.name }}</span>
          </article>
        </div>
      </section>

      <NodeResultVersionsPanel
        v-if="resultVersions.length || resultHistoryLoading"
        :autosave-conflict="resultHistoryAutosaveConflict"
        :can-edit="resultHistoryCanEdit"
        :loading="resultHistoryLoading"
        :media-tools="resultMediaTools"
        :versions="resultVersions"
        @adopt="emit('resultAdopt', $event)"
        @pin="emit('resultPin', $event)"
        @tool="emit('resultTool', $event)"
      />
    </main>

    <footer class="editor-toolbar">
      <Select
        v-if="isAiNode"
        allow-clear
        class="toolbar-model"
        :disabled="readonly"
        :options="modelSelectOptions"
        :placeholder="
          isPromptGenerator ? '自动路由 · TEXT / CHAT' : '自动路由模型'
        "
        show-search
        :status="modelSelectionError ? 'error' : undefined"
        :value="selectedModelId"
        @change="emitConfig('logicalModelId', $event)"
      />

      <template v-if="isPlanner">
        <Select
          class="toolbar-control toolbar-control--wide"
          :disabled="readonly"
          :options="PLAN_MODE_OPTIONS"
          :value="asString(config.planMode, 'MIXED')"
          @change="emitConfig('planMode', $event)"
        />
        <InputNumber
          addon-before="图片"
          class="toolbar-number"
          :disabled="readonly"
          :max="20"
          :min="0"
          :value="asNumber(config.imageCount) ?? 4"
          @change="emitConfig('imageCount', $event)"
        />
        <InputNumber
          addon-before="片段"
          class="toolbar-number"
          :disabled="readonly"
          :max="20"
          :min="0"
          :value="asNumber(config.videoCount) ?? 4"
          @change="emitConfig('videoCount', $event)"
        />
      </template>

      <template
        v-else-if="
          isPromptGenerator ||
          isPromptInput ||
          isRandomPrompt ||
          isPromptTemplate
        "
      >
        <Select
          class="toolbar-control toolbar-control--wide"
          :disabled="readonly"
          :options="PROMPT_TARGET_OPTIONS"
          :value="asString(config.targetType, 'GENERAL')"
          @change="emitConfig('targetType', $event)"
        />
        <Select
          class="toolbar-control"
          :disabled="readonly"
          :options="PROMPT_LANGUAGE_OPTIONS"
          :value="asString(config.language, 'ZH_CN')"
          @change="emitConfig('language', $event)"
        />
      </template>

      <template v-else-if="isLoop">
        <Tag color="orange"> 串行 {{ asNumber(config.count) ?? 4 }} 轮 </Tag>
        <Tag> 每轮 {{ asNumber(config.batchSize) ?? 1 }} 个素材 </Tag>
      </template>

      <template v-else-if="isMediaSelector">
        <Select
          class="toolbar-control toolbar-control--wide"
          :disabled="readonly"
          :options="[
            { label: '选择第一个', value: 'FIRST' },
            { label: '选择最后一个', value: 'LAST' },
            { label: '按序号选择', value: 'INDEX' },
          ]"
          :value="asString(config.mode, 'FIRST')"
          @change="emitConfig('mode', $event)"
        />
        <InputNumber
          v-if="asString(config.mode, 'FIRST') === 'INDEX'"
          addon-before="序号"
          class="toolbar-number"
          :disabled="readonly"
          :min="1"
          :precision="0"
          :value="asNumber(config.index) ?? 1"
          @change="emitConfig('index', $event)"
        />
      </template>

      <template v-else-if="isImageNode">
        <Select
          class="toolbar-control"
          :disabled="readonly"
          :options="ASPECT_RATIO_OPTIONS"
          :value="asString(currentMediaValue('aspectRatio', '1:1'))"
          @change="emitMediaConfig('aspectRatio', $event)"
        >
          <template #suffixIcon>
            <IconifyIcon icon="lucide:rectangle-horizontal" />
          </template>
        </Select>
        <InputNumber
          addon-before="数量"
          class="toolbar-number toolbar-number--small"
          :disabled="readonly"
          :max="8"
          :min="1"
          :value="asNumber(currentMediaValue('outputCount', 1))"
          @change="emitMediaConfig('outputCount', $event)"
        />
      </template>

      <template
        v-else-if="
          VIDEO_AI_TYPES.has(node.type) || node.type === 'video-plan-item'
        "
      >
        <Select
          class="toolbar-control"
          :disabled="readonly"
          :options="ASPECT_RATIO_OPTIONS"
          :value="asString(currentMediaValue('aspectRatio', '9:16'))"
          @change="emitMediaConfig('aspectRatio', $event)"
        />
        <Select
          class="toolbar-control"
          :disabled="readonly"
          :options="DURATION_OPTIONS"
          :value="asNumber(currentMediaValue('durationSeconds', 5))"
          @change="emitMediaConfig('durationSeconds', $event)"
        />
        <Select
          class="toolbar-control"
          :disabled="readonly"
          :options="RESOLUTION_OPTIONS"
          :value="asString(currentMediaValue('resolution', '1080P'))"
          @change="emitMediaConfig('resolution', $event)"
        />
        <Select
          v-if="isPlanItem || VIDEO_AI_TYPES.has(node.type)"
          class="toolbar-control toolbar-control--wide"
          :disabled="readonly"
          :options="CAMERA_OPTIONS"
          :value="asString(currentMediaValue('cameraMovement', '固定镜头'))"
          @change="emitMediaConfig('cameraMovement', $event)"
        />
        <Select
          class="toolbar-control"
          :disabled="readonly"
          :options="PLAYBACK_RATE_OPTIONS"
          :value="asNumber(currentMediaValue('playbackRate', 1))"
          @change="emitMediaConfig('playbackRate', $event)"
        />
      </template>

      <template v-else-if="AUDIO_AI_TYPES.has(node.type)">
        <Select
          class="toolbar-control"
          :disabled="readonly"
          :options="AUDIO_DURATION_OPTIONS"
          :value="
            asNumber(config.durationSeconds) ??
            (node.type === 'music-generate' ? 30 : 15)
          "
          @change="emitConfig('durationSeconds', $event)"
        />
        <Select
          class="toolbar-control"
          :disabled="readonly"
          :options="AUDIO_FORMAT_OPTIONS"
          :value="asString(config.format, 'mp3').toLowerCase()"
          @change="emitConfig('format', $event)"
        />
        <Tag color="purple">
          {{
            node.type === 'music-generate' ? '音乐 route' : '语音 / 音效 route'
          }}
        </Tag>
      </template>

      <template v-else-if="node.type === 'video-compose'">
        <Tag>MP4 · 按输入顺序拼接</Tag>
      </template>

      <template v-else-if="node.type === 'image-resize'">
        <InputNumber
          addon-before="宽"
          class="toolbar-number"
          :disabled="readonly"
          :max="8192"
          :min="64"
          :value="asNumber(config.width) ?? 1024"
          @change="emitConfig('width', $event)"
        />
        <InputNumber
          addon-before="高"
          class="toolbar-number"
          :disabled="readonly"
          :max="8192"
          :min="64"
          :value="asNumber(config.height) ?? 1024"
          @change="emitConfig('height', $event)"
        />
        <Select
          class="toolbar-control"
          :disabled="readonly"
          :options="RESIZE_MODE_OPTIONS"
          :value="asString(config.resizeMode, 'FIT').toUpperCase()"
          @change="emitConfig('resizeMode', $event)"
        />
        <Select
          class="toolbar-control"
          :disabled="readonly"
          :options="[
            { label: 'PNG', value: 'png' },
            { label: 'JPEG', value: 'jpeg' },
          ]"
          :value="asString(config.format, 'png').toLowerCase()"
          @change="emitConfig('format', $event)"
        />
      </template>

      <template v-else-if="node.type === 'image-crop'">
        <Tag color="cyan">归一化坐标</Tag>
        <InputNumber
          addon-before="X"
          class="toolbar-number toolbar-number--small"
          :disabled="readonly"
          :max="1"
          :min="0"
          :precision="4"
          :step="0.01"
          :value="asNumber(config.cropX) ?? 0"
          @change="emitConfig('cropX', $event)"
        />
        <InputNumber
          addon-before="Y"
          class="toolbar-number toolbar-number--small"
          :disabled="readonly"
          :max="1"
          :min="0"
          :precision="4"
          :step="0.01"
          :value="asNumber(config.cropY) ?? 0"
          @change="emitConfig('cropY', $event)"
        />
        <InputNumber
          addon-before="宽"
          class="toolbar-number toolbar-number--small"
          :disabled="readonly"
          :max="1"
          :min="0.0001"
          :precision="4"
          :step="0.01"
          :value="asNumber(config.cropWidth) ?? 1"
          @change="emitConfig('cropWidth', $event)"
        />
        <InputNumber
          addon-before="高"
          class="toolbar-number toolbar-number--small"
          :disabled="readonly"
          :max="1"
          :min="0.0001"
          :precision="4"
          :step="0.01"
          :value="asNumber(config.cropHeight) ?? 1"
          @change="emitConfig('cropHeight', $event)"
        />
        <Select
          class="toolbar-control"
          :disabled="readonly"
          :options="[
            { label: 'PNG', value: 'png' },
            { label: 'JPEG', value: 'jpeg' },
          ]"
          :value="asString(config.format, 'png').toLowerCase()"
          @change="emitConfig('format', $event)"
        />
      </template>

      <template v-else-if="node.type === 'image-split'">
        <InputNumber
          addon-before="列"
          class="toolbar-number toolbar-number--small"
          :disabled="readonly"
          :max="8"
          :min="1"
          :precision="0"
          :value="asNumber(config.columns) ?? 2"
          @change="emitConfig('columns', $event)"
        />
        <InputNumber
          addon-before="行"
          class="toolbar-number toolbar-number--small"
          :disabled="readonly"
          :max="8"
          :min="1"
          :precision="0"
          :value="asNumber(config.rows) ?? 2"
          @change="emitConfig('rows', $event)"
        />
        <Tag color="cyan">
          {{ (asNumber(config.columns) ?? 2) * (asNumber(config.rows) ?? 2) }}
          个分片
        </Tag>
        <Select
          class="toolbar-control"
          :disabled="readonly"
          :options="[
            { label: 'PNG', value: 'png' },
            { label: 'JPEG', value: 'jpeg' },
          ]"
          :value="asString(config.format, 'png').toLowerCase()"
          @change="emitConfig('format', $event)"
        />
      </template>

      <template v-else-if="node.type === 'video-frame-extract'">
        <Select
          class="toolbar-control"
          :disabled="readonly"
          :options="FRAME_MODE_OPTIONS"
          :value="asString(config.frameMode, 'FIRST')"
          @change="emitConfig('frameMode', $event)"
        />
        <InputNumber
          v-if="asString(config.frameMode, 'FIRST') === 'TIME'"
          addon-before="秒"
          class="toolbar-number"
          :disabled="readonly"
          :max="86_400"
          :min="0"
          :step="0.1"
          :value="asNumber(config.timeSeconds) ?? 0"
          @change="emitConfig('timeSeconds', $event)"
        />
      </template>

      <template v-else-if="node.type === 'video-normalize'">
        <InputNumber
          addon-before="宽"
          class="toolbar-number"
          :disabled="readonly"
          :max="8192"
          :min="64"
          :precision="0"
          :step="2"
          :value="asNumber(config.width) ?? 1280"
          @change="emitConfig('width', $event)"
        />
        <InputNumber
          addon-before="高"
          class="toolbar-number"
          :disabled="readonly"
          :max="8192"
          :min="64"
          :precision="0"
          :step="2"
          :value="asNumber(config.height) ?? 720"
          @change="emitConfig('height', $event)"
        />
        <InputNumber
          addon-before="FPS"
          class="toolbar-number toolbar-number--small"
          :disabled="readonly"
          :max="120"
          :min="1"
          :value="asNumber(config.fps) ?? 30"
          @change="emitConfig('fps', $event)"
        />
        <Select
          class="toolbar-control"
          :disabled="readonly"
          :options="RESIZE_MODE_OPTIONS"
          :value="asString(config.resizeMode, 'FIT')"
          @change="emitConfig('resizeMode', $event)"
        />
      </template>

      <template v-else-if="node.type === 'video-trim'">
        <InputNumber
          addon-before="开始"
          class="toolbar-number"
          :disabled="readonly"
          :min="0"
          :value="asNumber(config.startSeconds) ?? 0"
          @change="emitConfig('startSeconds', $event)"
        />
        <InputNumber
          addon-before="时长"
          class="toolbar-number"
          :disabled="readonly"
          :min="0.1"
          :value="asNumber(config.durationSeconds) ?? 5"
          @change="emitConfig('durationSeconds', $event)"
        />
      </template>

      <template v-else-if="node.type === 'video-transition'">
        <Select
          class="toolbar-control"
          :disabled="readonly"
          :options="TRANSITION_OPTIONS"
          :value="asString(config.transition, '淡化')"
          @change="emitConfig('transition', $event)"
        />
        <InputNumber
          addon-before="时长"
          class="toolbar-number"
          :disabled="readonly"
          :min="0.1"
          :value="asNumber(config.transitionSeconds) ?? 1"
          @change="emitConfig('transitionSeconds', $event)"
        />
        <InputNumber
          addon-before="开始"
          class="toolbar-number"
          :disabled="readonly"
          :min="0"
          :step="0.1"
          :value="asNumber(config.offsetSeconds) ?? 4"
          @change="emitConfig('offsetSeconds', $event)"
        />
      </template>

      <Select
        v-if="node.type === 'video-plan-item'"
        class="toolbar-control"
        :disabled="readonly"
        :options="SHOT_SIZE_OPTIONS"
        :value="asString(currentMediaValue('shotSize', '中景'))"
        @change="emitMediaConfig('shotSize', $event)"
      />

      <Button
        v-if="isAiNode"
        class="advanced-button"
        :type="advancedOpen ? 'primary' : 'default'"
        @click="advancedOpen = !advancedOpen"
      >
        <IconifyIcon icon="lucide:sliders-horizontal" />
        高级参数
      </Button>

      <div class="toolbar-spacer"></div>
      <Button
        v-if="canRun && expanded"
        class="downstream-button"
        :disabled="isRunning || Boolean(nodeValidationError)"
        @click="runDownstream"
      >
        从此向下运行
      </Button>
      <Tooltip
        :title="
          nodeValidationError || (isRunning ? '节点正在执行' : '运行当前节点')
        "
      >
        <Button
          v-if="canRun"
          class="run-button"
          :disabled="isRunning || Boolean(nodeValidationError)"
          :loading="isRunning"
          shape="circle"
          type="primary"
          @click="runNode"
        >
          <IconifyIcon v-if="!isRunning" icon="lucide:arrow-up" />
        </Button>
      </Tooltip>
    </footer>
  </section>
</template>

<style scoped>
.node-inline-editor {
  --editor-accent: #6d5dfc;

  position: relative;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 132px);
  overflow: visible;
  color: hsl(var(--foreground));
  background: hsl(var(--card) / 99%);
  border: 1px solid hsl(var(--border));
  border-radius: 12px;
  box-shadow:
    0 18px 45px hsl(var(--foreground) / 14%),
    0 3px 10px hsl(var(--foreground) / 8%);
  transition: width 180ms ease;
}

.node-inline-editor::before,
.node-inline-editor::after {
  position: absolute;
  left: var(--inline-editor-anchor-left, 50%);
  z-index: 1;
  width: 0;
  height: 0;
  pointer-events: none;
  content: '';
  border-right: 9px solid transparent;
  border-left: 9px solid transparent;
  transform: translateX(-50%);
}

.node-inline-editor--panel {
  width: 100% !important;
  max-width: none;
  height: 100%;
  max-height: none;
  overflow: hidden;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}

.node-inline-editor--panel::before,
.node-inline-editor--panel::after {
  display: none;
}

.node-inline-editor--panel .editor-content,
.node-inline-editor--panel.is-expanded .editor-content {
  max-height: none;
  overflow: hidden auto;
}

.node-inline-editor--panel .editor-section {
  min-width: 0;
}

.node-inline-editor--panel .editor-toolbar {
  flex-wrap: wrap;
  align-content: center;
  overflow-x: hidden;
}

.node-inline-editor--below::before {
  top: -10px;
  border-bottom: 10px solid hsl(var(--border));
}

.node-inline-editor--below::after {
  top: -8px;
  border-bottom: 9px solid hsl(var(--card));
}

.node-inline-editor--above::before {
  bottom: -10px;
  border-top: 10px solid hsl(var(--border));
}

.node-inline-editor--above::after {
  bottom: -8px;
  border-top: 9px solid hsl(var(--card));
}

.editor-header {
  display: flex;
  gap: 8px;
  align-items: center;
  height: 46px;
  padding: 0 12px;
  border-bottom: 1px solid hsl(var(--border) / 72%);
}

.editor-node-icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 25px;
  height: 25px;
  color: white;
  background: var(--editor-accent);
  border-radius: 7px;
  box-shadow: 0 4px 10px
    color-mix(in srgb, var(--editor-accent) 24%, transparent);
}

.editor-node-icon :deep(svg) {
  width: 14px;
  height: 14px;
}

.node-name {
  display: inline-flex;
  flex: 0 1 auto;
  gap: 6px;
  align-items: center;
  min-width: 0;
  padding: 0;
  color: hsl(var(--foreground));
  cursor: text;
  background: transparent;
  border: 0;
}

.node-name strong {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 14px;
  font-weight: 650;
  white-space: nowrap;
}

.node-name :deep(svg) {
  flex: none;
  width: 12px;
  height: 12px;
  color: hsl(var(--muted-foreground));
}

.node-name-input {
  flex: 0 1 240px;
}

.status-tag {
  flex: none;
  margin-inline-end: auto;
  font-size: 11px;
  line-height: 21px;
  border: 0;
}

.header-progress {
  font-size: 11px;
  color: #1677ff;
}

.header-action {
  display: inline-grid;
  flex: none;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  color: hsl(var(--muted-foreground));
}

.header-action :deep(svg) {
  width: 15px;
  height: 15px;
}

.header-expand {
  display: inline-flex;
  gap: 5px;
  width: auto;
  padding: 0 6px;
  font-size: 11px;
}

.running-progress {
  position: absolute;
  top: 43px;
  left: 0;
  width: 100%;
  margin: 0;
  line-height: 0;
}

.running-progress :deep(.ant-progress-inner) {
  border-radius: 0;
}

.editor-content {
  display: grid;
  flex: 1 1 auto;
  gap: 0;
  min-height: 0;
  max-height: min(590px, calc(100vh - 180px));
  overflow: auto;
}

.is-expanded .editor-content {
  max-height: min(720px, calc(100vh - 120px));
}

.editor-section {
  padding: 12px 14px;
  border-bottom: 1px solid hsl(var(--border) / 72%);
}

.section-heading {
  display: flex;
  gap: 10px;
  align-items: center;
  min-height: 21px;
  margin-bottom: 8px;
}

.section-heading strong {
  flex: none;
  font-size: 12px;
  font-weight: 650;
  color: hsl(var(--foreground) / 88%);
}

.section-heading span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
}

.section-heading span:last-child {
  margin-left: auto;
}

.single-asset-row {
  display: grid;
  grid-template-columns: 122px minmax(0, 1fr);
  gap: 12px;
  align-items: stretch;
}

.asset-preview--large {
  width: 122px;
  height: 90px;
  overflow: hidden;
  background: hsl(var(--muted) / 42%);
  border: 1px solid hsl(var(--border) / 72%);
  border-radius: 8px;
}

.asset-preview--large img,
.asset-preview--large video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.asset-preview--large audio {
  width: 100%;
  min-width: 0;
  padding: 27px 8px;
}

.asset-empty {
  display: grid;
  gap: 5px;
  place-content: center;
  place-items: center;
  width: 100%;
  height: 100%;
  font-size: 10px;
  color: hsl(var(--muted-foreground));
}

.asset-empty :deep(svg) {
  width: 23px;
  height: 23px;
  color: var(--editor-accent);
}

.single-asset-control {
  display: flex;
  flex-direction: column;
  gap: 6px;
  justify-content: center;
  min-width: 0;
}

.single-asset-control > :deep(.ant-select) {
  width: min(360px, 100%);
}

.single-asset-control p {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
}

.reference-strip {
  display: flex;
  gap: 8px;
  min-height: 88px;
  overflow-x: auto;
  scrollbar-width: thin;
}

.reference-card {
  display: flex;
  flex: 0 0 92px;
  flex-direction: column;
  min-width: 0;
}

.reference-card--connected .reference-image {
  border-color: color-mix(
    in srgb,
    var(--editor-accent) 42%,
    hsl(var(--border))
  );
}

.reference-image {
  position: relative;
  display: grid;
  place-items: center;
  width: 92px;
  height: 64px;
  overflow: hidden;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--muted) / 48%);
  border: 1px solid hsl(var(--border) / 72%);
  border-radius: 7px;
}

.reference-image > img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.reference-image > button {
  position: absolute;
  top: 3px;
  right: 3px;
  display: none;
  place-items: center;
  width: 18px;
  height: 18px;
  padding: 0;
  color: white;
  cursor: pointer;
  background: rgb(15 23 42 / 68%);
  border: 0;
  border-radius: 999px;
}

.reference-alias {
  position: absolute;
  bottom: 3px;
  left: 3px;
  max-width: calc(100% - 6px);
  padding: 1px 5px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 9px;
  font-weight: 650;
  line-height: 15px;
  color: white;
  white-space: nowrap;
  background: rgb(15 23 42 / 72%);
  border-radius: 4px;
}

.reference-card:hover .reference-image > button {
  display: grid;
}

.reference-card strong,
.reference-card > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reference-card strong {
  margin-top: 4px;
  font-size: 10px;
  font-weight: 550;
}

.reference-card > span {
  font-size: 9px;
  color: hsl(var(--muted-foreground));
}

.reference-origin {
  display: flex;
  gap: 3px;
  align-items: center;
}

.reference-origin :deep(svg) {
  flex: 0 0 auto;
  width: 10px;
  height: 10px;
  color: var(--editor-accent);
}

.reference-add {
  flex: 0 0 92px;
  width: 92px;
  height: 64px;
}

.reference-add :deep(.ant-select-selector) {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 92px;
  height: 64px !important;
  padding: 0 8px !important;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--muted) / 28%) !important;
  border-style: dashed !important;
}

.reference-add :deep(.ant-select-selection-overflow) {
  justify-content: center;
}

.reference-add :deep(.ant-select-selection-placeholder),
.reference-add :deep(.ant-select-selection-item) {
  inset-inline: 8px !important;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: center;
}

.frame-grid {
  display: flex;
  gap: 10px;
  align-items: stretch;
}

.frame-card {
  display: grid;
  grid-template-columns: 96px;
  gap: 5px;
}

.frame-card :deep(.ant-select) {
  width: 96px;
  font-size: 10px;
}

.frame-card > :deep(.ant-btn) {
  width: 96px;
  overflow: hidden;
  font-size: 10px;
}

.frame-preview {
  position: relative;
  display: grid;
  place-items: center;
  width: 96px;
  height: 66px;
  overflow: hidden;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--muted) / 42%);
  border: 1px solid hsl(var(--border) / 72%);
  border-radius: 7px;
}

.frame-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.frame-preview > span {
  position: absolute;
  top: 4px;
  left: 4px;
  padding: 2px 5px;
  font-size: 9px;
  color: white;
  background: rgb(15 23 42 / 68%);
  border-radius: 4px;
}

.frame-tip {
  display: flex;
  gap: 6px;
  align-items: center;
  max-width: 240px;
  padding: 8px 10px;
  font-size: 10px;
  line-height: 16px;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--muted) / 34%);
  border-radius: 7px;
}

.prompt-field {
  position: relative;
}

.prompt-field :deep(.ant-mentions) {
  border-color: hsl(var(--border));
  border-radius: 8px;
}

.prompt-field :deep(.ant-mentions textarea) {
  padding: 9px 36px 9px 10px;
  font-size: 12px;
  line-height: 20px;
  resize: none;
}

.prompt-field :deep(.ant-mentions-focused) {
  border-color: var(--editor-accent);
  box-shadow: 0 0 0 2px
    color-mix(in srgb, var(--editor-accent) 12%, transparent);
}

.prompt-sparkle {
  position: absolute;
  right: 10px;
  bottom: 9px;
  display: grid;
  place-items: center;
  width: 21px;
  height: 21px;
  color: #2563eb;
}

.prompt-sparkle :deep(svg) {
  width: 15px;
  height: 15px;
}

.prompt-reference-tip,
.prompt-reference-error,
.prompt-template-tip {
  display: flex;
  gap: 5px;
  align-items: flex-start;
  margin-top: 6px;
  font-size: 10px;
  line-height: 16px;
}

.prompt-reference-tip {
  color: hsl(var(--muted-foreground));
}

.prompt-reference-error {
  color: #dc2626;
}

.prompt-template-tip {
  padding: 6px 8px;
  color: color-mix(in srgb, var(--editor-accent) 58%, hsl(var(--foreground)));
  background: color-mix(in srgb, var(--editor-accent) 6%, hsl(var(--card)));
  border: 1px solid
    color-mix(in srgb, var(--editor-accent) 18%, hsl(var(--border)));
  border-radius: 7px;
}

.prompt-template-tip--connected {
  color: color-mix(in srgb, #16a34a 68%, hsl(var(--foreground)));
  background: color-mix(in srgb, #16a34a 8%, hsl(var(--card)));
  border-color: color-mix(in srgb, #16a34a 20%, hsl(var(--border)));
}

.prompt-template-tip code {
  padding: 1px 4px;
  font-size: 10px;
  color: color-mix(in srgb, var(--editor-accent) 78%, hsl(var(--foreground)));
  background: color-mix(in srgb, var(--editor-accent) 12%, hsl(var(--card)));
  border-radius: 3px;
}

.template-variable-row {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  align-items: center;
  margin-top: 7px;
}

.template-variable-row > span {
  margin-right: 2px;
  font-size: 10px;
  color: hsl(var(--muted-foreground));
}

.template-variable-row button {
  padding: 2px 7px;
  font-family: inherit;
  font-size: 9px;
  line-height: 17px;
  color: color-mix(in srgb, var(--editor-accent) 78%, hsl(var(--foreground)));
  cursor: pointer;
  background: color-mix(in srgb, var(--editor-accent) 8%, hsl(var(--card)));
  border: 1px solid
    color-mix(in srgb, var(--editor-accent) 20%, hsl(var(--border)));
  border-radius: 999px;
}

.template-variable-row button:hover {
  background: color-mix(in srgb, var(--editor-accent) 14%, hsl(var(--card)));
  border-color: color-mix(
    in srgb,
    var(--editor-accent) 32%,
    hsl(var(--border))
  );
}

.connected-text-sources {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  margin-top: 7px;
}

.connected-text-sources article {
  display: flex;
  gap: 7px;
  align-items: center;
  min-width: 0;
  padding: 6px 7px;
  background: hsl(var(--muted) / 28%);
  border: 1px solid hsl(var(--border) / 72%);
  border-radius: 7px;
}

.text-source-icon {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 23px;
  height: 23px;
  color: color-mix(in srgb, var(--editor-accent) 78%, hsl(var(--foreground)));
  background: color-mix(in srgb, var(--editor-accent) 12%, hsl(var(--card)));
  border-radius: 6px;
}

.connected-text-sources article > div {
  display: grid;
  flex: 1;
  min-width: 0;
}

.connected-text-sources strong,
.connected-text-sources small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.connected-text-sources strong {
  font-size: 10px;
  color: hsl(var(--foreground) / 86%);
}

.connected-text-sources small {
  font-size: 9px;
  color: hsl(var(--muted-foreground));
}

.connected-text-sources :deep(.ant-tag) {
  flex: 0 0 auto;
  padding-inline: 4px;
  margin: 0;
  font-size: 9px;
  line-height: 17px;
}

.prompt-reference-tip :deep(svg),
.prompt-reference-error :deep(svg),
.prompt-template-tip :deep(svg) {
  flex: 0 0 auto;
  width: 13px;
  height: 13px;
  margin-top: 1px;
}

.fold-row {
  display: flex;
  gap: 5px;
  align-items: center;
  width: 100%;
  min-height: 30px;
  padding: 0 8px;
  margin-top: 7px;
  font-size: 11px;
  color: hsl(var(--foreground) / 78%);
  cursor: pointer;
  background: hsl(var(--muted) / 28%);
  border: 1px solid hsl(var(--border) / 72%);
  border-radius: 7px;
}

.fold-row > span {
  margin-left: auto;
  font-size: 10px;
  color: var(--editor-accent);
}

.negative-prompt {
  margin-top: 7px;
  font-size: 12px;
  line-height: 20px;
}

.library-text-field {
  display: grid;
  gap: 6px;
}

.library-text-field > :deep(.ant-btn) {
  justify-self: start;
}

.system-prompt-field {
  display: grid;
  gap: 7px;
  margin-bottom: 12px;
}

.system-prompt-field > span {
  display: flex;
  gap: 8px;
  align-items: baseline;
  font-size: 12px;
  font-weight: 600;
  color: hsl(var(--foreground) / 86%);
}

.system-prompt-field small {
  font-size: 10px;
  font-weight: 400;
  color: hsl(var(--muted-foreground));
}

.system-prompt-field :deep(textarea) {
  font-size: 11px;
  line-height: 18px;
}

.loop-setting-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 10px;
}

.loop-setting-grid label {
  display: grid;
  gap: 5px;
  font-size: 11px;
  color: hsl(var(--muted-foreground));
}

.loop-setting-grid :deep(.ant-input-number) {
  width: 100%;
}

.audio-settings-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 10px;
}

.audio-settings-grid + .audio-settings-grid {
  margin-top: 10px;
}

.audio-settings-grid label {
  display: grid;
  gap: 5px;
  min-width: 0;
  font-size: 11px;
  color: hsl(var(--muted-foreground));
}

.audio-settings-grid :deep(.ant-input-number),
.audio-settings-grid :deep(.ant-select) {
  width: 100%;
}

.audio-settings-grid__wide {
  grid-column: 1 / -1;
}

.audio-settings-grid__wide :deep(textarea) {
  font-size: 11px;
  line-height: 17px;
}

.audio-settings-grid--output {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.loop-variation-field {
  margin-top: 12px;
}

.compose-summary {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 10px;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--editor-accent) 5%, hsl(var(--card))),
    hsl(var(--muted) / 28%)
  );
  border: 1px solid hsl(var(--border) / 72%);
  border-radius: 8px;
}

.compose-icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 38px;
  height: 38px;
  color: white;
  background: var(--editor-accent);
  border-radius: 9px;
}

.compose-summary strong {
  font-size: 12px;
}

.compose-summary p {
  margin: 3px 0 0;
  font-size: 11px;
  color: hsl(var(--muted-foreground));
}

.mask-capability-note {
  background: color-mix(in srgb, #f59e0b 6%, hsl(var(--card)));
}

.mask-capability-note .section-heading :deep(.ant-tag) {
  margin-left: auto;
  font-size: 10px;
}

.mask-capability-note p,
.mask-capability-note > span {
  display: block;
  margin: 0;
  font-size: 11px;
  line-height: 18px;
  color: hsl(var(--muted-foreground));
}

.mask-capability-note > span {
  margin-top: 6px;
  color: color-mix(in srgb, #d97706 72%, hsl(var(--foreground)));
}

.execution-error {
  display: flex;
  gap: 7px;
  align-items: flex-start;
  padding: 8px 10px;
  margin: 10px 14px 0;
  font-size: 11px;
  line-height: 17px;
  color: color-mix(in srgb, #ef4444 76%, hsl(var(--foreground)));
  background: color-mix(in srgb, #ef4444 9%, hsl(var(--card)));
  border: 1px solid color-mix(in srgb, #ef4444 28%, hsl(var(--border)));
  border-radius: 7px;
}

.validation-error {
  color: color-mix(in srgb, #f59e0b 72%, hsl(var(--foreground)));
  background: color-mix(in srgb, #f59e0b 9%, hsl(var(--card)));
  border-color: color-mix(in srgb, #f59e0b 28%, hsl(var(--border)));
}

.execution-error :deep(svg) {
  flex: none;
  margin-top: 1px;
}

.result-strip {
  display: flex;
  gap: 8px;
  overflow-x: auto;
}

.result-strip > article {
  position: relative;
  flex: 0 0 86px;
  height: 62px;
  overflow: hidden;
  color: white;
  background: hsl(var(--muted) / 52%);
  border: 1px solid hsl(var(--border));
  border-radius: 7px;
}

.result-strip > article > a,
.result-strip img,
.result-strip video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.result-strip__audio {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 4px;
  align-items: center;
  height: 100%;
  padding: 8px 5px 16px;
  color: var(--editor-accent);
  background: color-mix(in srgb, var(--editor-accent) 8%, hsl(var(--card)));
}

.result-strip__audio audio {
  width: 100%;
  min-width: 0;
  height: 28px;
}

.result-strip span {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  padding: 3px 5px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 9px;
  white-space: nowrap;
  background: linear-gradient(transparent, rgb(15 23 42 / 75%));
}

.text-result-section .section-heading :deep(.ant-btn) {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  height: 24px;
  margin-left: auto;
  font-size: 11px;
  color: var(--editor-accent);
}

.text-result {
  max-height: 180px;
  overflow: auto;
  background: linear-gradient(
    145deg,
    color-mix(in srgb, var(--editor-accent) 5%, hsl(var(--card))),
    hsl(var(--muted) / 28%)
  );
  border: 1px solid
    color-mix(in srgb, var(--editor-accent) 18%, hsl(var(--border)));
  border-radius: 8px;
}

.text-result pre {
  padding: 10px 11px;
  margin: 0;
  font-family: inherit;
  font-size: 11px;
  line-height: 19px;
  color: hsl(var(--foreground) / 86%);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.advanced-panel {
  padding: 12px 14px 14px;
  background: hsl(var(--muted) / 24%);
  border-bottom: 1px solid hsl(var(--border) / 72%);
}

.advanced-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 9px;
}

.advanced-heading > div {
  display: flex;
  gap: 8px;
  align-items: baseline;
}

.advanced-heading strong {
  font-size: 12px;
}

.advanced-heading span {
  font-size: 10px;
  color: hsl(var(--muted-foreground));
}

.schema-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.schema-field {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.schema-field > span {
  display: flex;
  gap: 4px;
  align-items: center;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 10px;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
}

.schema-field > span i {
  color: #ef4444;
}

.schema-field > span :deep(svg) {
  flex: none;
  color: hsl(var(--muted-foreground));
}

.schema-field > :deep(.ant-input-number),
.schema-field > :deep(.ant-select) {
  width: 100%;
}

.advanced-empty {
  display: flex;
  gap: 7px;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  border: 1px dashed hsl(var(--border));
  border-radius: 7px;
}

.editor-toolbar {
  display: flex;
  flex: none;
  gap: 7px;
  align-items: center;
  min-height: 56px;
  padding: 9px 12px;
  overflow-x: auto;
  scrollbar-width: thin;
  background: hsl(var(--muted) / 24%);
  border-radius: 0 0 12px 12px;
}

.editor-toolbar :deep(.ant-select-selector),
.editor-toolbar :deep(.ant-input-number),
.editor-toolbar :deep(.ant-btn) {
  min-height: 34px;
  border-radius: 7px;
}

.toolbar-model {
  flex: 0 1 150px;
  min-width: 118px;
}

.toolbar-control {
  flex: 0 0 70px;
  width: 70px;
}

.toolbar-control--wide {
  flex-basis: 90px;
  width: 90px;
}

.toolbar-number {
  flex: 0 0 112px;
  width: 112px;
}

.toolbar-number--small {
  flex-basis: 100px;
  width: 100px;
}

.advanced-button {
  display: inline-flex;
  flex: none;
  gap: 5px;
  align-items: center;
  font-size: 11px;
}

.toolbar-spacer {
  flex: 1 0 8px;
}

.downstream-button {
  flex: none;
  font-size: 11px;
}

.run-button {
  display: inline-grid;
  flex: 0 0 40px;
  place-items: center;
  width: 40px;
  height: 40px;
  padding: 0;
  background: #1677ff;
  box-shadow: 0 6px 14px rgb(22 119 255 / 24%);
}

.run-button :deep(svg) {
  width: 17px;
  height: 17px;
}

.is-readonly .node-name {
  cursor: default;
}

@media (max-width: 900px) {
  .node-inline-editor {
    width: 100% !important;
  }

  .schema-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .editor-toolbar {
    flex-wrap: wrap;
  }

  .toolbar-spacer {
    display: none;
  }
}
</style>
