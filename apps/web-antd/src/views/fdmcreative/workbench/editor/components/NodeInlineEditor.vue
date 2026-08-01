<script lang="ts" setup>
import type { FdmAiApi } from '#/api/fdmai';
import type { FdmCreativeApi } from '#/api/fdmcreative';
import type { FileUploadProps } from '#/components/upload/typing';

import { computed, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import {
  Button,
  Input,
  InputNumber,
  Progress,
  Select,
  Switch,
  Tag,
  Textarea,
  Tooltip,
} from 'ant-design-vue';

import { FileUpload } from '#/components/upload';

import { CREATIVE_NODE_MAP } from '../graph/catalog';

type InlineEditorPlacement = 'above' | 'below';
type SchemaScalar = number | string;

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

interface Props {
  busy?: boolean;
  errorMessage?: string;
  executionStatus?: FdmCreativeApi.ExecutionStatus;
  modelOptions?: FdmAiApi.ModelOption[];
  node: FdmCreativeApi.WorkflowNode;
  nodeRun?: FdmCreativeApi.NodeRun;
  placement?: InlineEditorPlacement;
  progress?: number;
  projectAssets?: FdmCreativeApi.CreativeAsset[];
  resultAssets?: FdmCreativeApi.CreativeAsset[];
  readonly?: boolean;
  uploadAccept?: string[];
  uploadApi?: FileUploadProps['api'];
  uploadMaxSize?: number;
  width?: number;
}

const props = withDefaults(defineProps<Props>(), {
  busy: false,
  errorMessage: undefined,
  executionStatus: undefined,
  modelOptions: () => [],
  nodeRun: undefined,
  placement: 'below',
  progress: undefined,
  projectAssets: () => [],
  resultAssets: () => [],
  readonly: false,
  uploadAccept: () => [],
  uploadApi: undefined,
  uploadMaxSize: undefined,
  width: 700,
});

const emit = defineEmits<{
  assetChange: [payload: AssetChangePayload];
  close: [];
  configChange: [key: string, value: unknown];
  nameChange: [value: string];
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
const VIDEO_TYPES = new Set([
  ...VIDEO_AI_TYPES,
  'video-compose',
  'video-input',
  'video-plan-item',
  'video-timeline',
  'video-transition',
  'video-trim',
]);
const COMPOSE_TYPES = new Set([
  'artifact-collection',
  'asset-library-output',
  'image-collection',
  'output',
  'video-compose',
  'video-timeline',
]);
const ASPECT_RATIO_OPTIONS = ['1:1', '4:3', '3:4', '16:9', '9:16', '21:9'].map(
  (value) => ({ label: value, value }),
);
const DURATION_OPTIONS = [3, 5, 8, 10, 15].map((value) => ({
  label: `${value} 秒`,
  value,
}));
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
const TRANSITION_OPTIONS = ['无', '淡化', '叠化', '擦除', '闪白'].map(
  (value) => ({ label: value, value }),
);

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
  ['image-input', 'video-input'].includes(props.node.type),
);
const isPlanner = computed(() => props.node.type === 'content-planner');
const isPlanItem = computed(() =>
  ['image-plan-item', 'video-plan-item'].includes(props.node.type),
);
const isImageNode = computed(
  () =>
    IMAGE_AI_TYPES.has(props.node.type) ||
    props.node.type === 'image-plan-item',
);
const isVideoNode = computed(() => VIDEO_TYPES.has(props.node.type));
const isComposeNode = computed(() => COMPOSE_TYPES.has(props.node.type));
const isAiNode = computed(
  () =>
    isPlanner.value ||
    IMAGE_AI_TYPES.has(props.node.type) ||
    VIDEO_AI_TYPES.has(props.node.type),
);
const supportsPrompt = computed(
  () =>
    !isAssetInput.value &&
    !isComposeNode.value &&
    props.node.type !== 'image-resize',
);
const supportsReferences = computed(
  () =>
    isAssetInput.value ||
    isPlanner.value ||
    IMAGE_AI_TYPES.has(props.node.type) ||
    VIDEO_AI_TYPES.has(props.node.type),
);

const editorStyle = computed(() => ({
  '--editor-accent': template.value?.color ?? '#6d5dfc',
  width: `${props.width}px`,
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
    ['CREATED', 'PENDING', 'RUNNING', 'WAITING_AI'].includes(
      effectiveStatus.value,
    ),
);
const statusMeta = computed(() => {
  const map: Record<string, { color?: string; label: string }> = {
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
  if (isPlanner.value) return 'TEXT';
  if (IMAGE_AI_TYPES.has(props.node.type)) return 'IMAGE';
  if (VIDEO_AI_TYPES.has(props.node.type)) return 'VIDEO';
  return undefined;
});
const availableModels = computed(() =>
  props.modelOptions.filter(
    (item) =>
      item.enabled &&
      (!expectedModality.value || item.modality === expectedModality.value),
  ),
);
const modelSelectOptions = computed(() =>
  availableModels.value.map((item) => ({
    label: item.name,
    value: item.id,
  })),
);
const selectedModelId = computed(() =>
  asNumber(config.value.logicalModelId ?? config.value.modelId),
);
const selectedModel = computed(() =>
  availableModels.value.find((item) => item.id === selectedModelId.value),
);
const frameSlots = computed(() => {
  const capabilities = selectedModel.value?.capabilities ?? [];
  const supportsFirstFrame =
    ['first-last-frame-to-video', 'image-to-video'].includes(props.node.type) ||
    (props.node.type === 'video-generate' &&
      capabilities.some((item) =>
        ['FIRST_FRAME_TO_VIDEO', 'FIRST_LAST_FRAME_TO_VIDEO'].includes(item),
      ));
  const supportsLastFrame =
    props.node.type === 'first-last-frame-to-video' ||
    (props.node.type === 'video-generate' &&
      capabilities.includes('FIRST_LAST_FRAME_TO_VIDEO'));
  if (!supportsFirstFrame) return [];
  return [
    { key: 'firstFrameAssetId', label: '首帧' },
    ...(supportsLastFrame ? [{ key: 'lastFrameAssetId', label: '尾帧' }] : []),
  ] as Array<{
    key: 'firstFrameAssetId' | 'lastFrameAssetId';
    label: string;
  }>;
});
const hasFrameSlots = computed(() => frameSlots.value.length > 0);

const assetById = computed(
  () => new Map(props.projectAssets.map((asset) => [asset.id, asset])),
);
const imageAssets = computed(() =>
  props.projectAssets.filter((asset) => asset.kind === 'IMAGE'),
);
const inputAssetOptions = computed(() => {
  const kind = props.node.type === 'video-input' ? 'VIDEO' : 'IMAGE';
  return props.projectAssets
    .filter((asset) => asset.kind === kind)
    .map((asset) => ({ label: asset.name, value: asset.id }));
});
const imageAssetOptions = computed(() =>
  imageAssets.value.map((asset) => ({ label: asset.name, value: asset.id })),
);
const selectedInputAssetId = computed(() => asNumber(config.value.assetId));
const referenceAssetIds = computed(() =>
  asNumberList(config.value.referenceAssetIds),
);
const referenceAssets = computed(() =>
  referenceAssetIds.value
    .map((id) => assetById.value.get(id))
    .filter(
      (asset): asset is FdmCreativeApi.CreativeAsset => asset !== undefined,
    ),
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
  if (!props.readonly && !isRunning.value) emit('run', props.node.id);
}

function runDownstream() {
  if (!props.readonly && !isRunning.value) {
    emit('runDownstream', props.node.id);
  }
}

function promptLabel() {
  if (isPlanner.value) return '创作总提示词';
  if (props.node.type === 'video-plan-item') return '片段脚本';
  if (props.node.type === 'image-plan-item') return '图片提示词';
  if (isVideoNode.value) return '视频提示词';
  if (isImageNode.value) return '图片提示词';
  return '节点提示词';
}

function promptPlaceholder() {
  if (isPlanner.value) return '描述创作目标、商品卖点、受众与整体视觉风格…';
  if (isVideoNode.value) return '描述主体动作、场景变化、镜头运动与画面连续性…';
  if (isImageNode.value) return '描述主体、场景、构图、光线、材质和画面风格…';
  return '输入该节点需要处理的内容…';
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

function formatAssetMeta(asset: FdmCreativeApi.CreativeAsset) {
  if (asset.mimeType) return asset.mimeType.replace('image/', '').toUpperCase();
  return asset.kind === 'VIDEO' ? '视频素材' : '图片素材';
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
          <span v-else-if="!isAssetInput"
            >可选，模型能力不支持时会在执行前提示</span
          >
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
                v-else
                muted
                playsinline
                preload="metadata"
                :src="assetPreview(assetById.get(selectedInputAssetId || -1))"
              ></video>
            </template>
            <div v-else class="asset-empty">
              <IconifyIcon
                :icon="
                  node.type === 'video-input'
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
          </article>
          <div v-if="node.type === 'image-to-video'" class="frame-tip">
            <IconifyIcon icon="lucide:info" />
            图生视频只要求首帧；尾帧未配置时由模型自然续写。
          </div>
        </div>

        <div v-else class="reference-strip">
          <article
            v-for="asset in referenceAssets"
            :key="asset.id"
            class="reference-card"
          >
            <div class="reference-image">
              <img v-if="asset.url" :alt="asset.name" :src="asset.url" />
              <IconifyIcon v-else icon="lucide:image" />
              <button
                v-if="!readonly"
                aria-label="移除参考素材"
                type="button"
                @click="removeReferenceAsset(asset.id)"
              >
                <IconifyIcon icon="lucide:x" />
              </button>
            </div>
            <strong :title="asset.name">{{ asset.name }}</strong>
            <span>{{ formatAssetMeta(asset) }}</span>
          </article>
          <Select
            class="reference-add"
            :disabled="readonly"
            :max-tag-count="0"
            mode="multiple"
            :options="imageAssetOptions"
            placeholder="添加素材"
            show-search
            :value="referenceAssetIds"
            @change="changeReferenceAssets"
          >
            <template #suffixIcon>
              <IconifyIcon icon="lucide:plus" />
            </template>
            <template #maxTagPlaceholder>
              <span>管理素材</span>
            </template>
          </Select>
          <slot name="asset-actions" :node="node"></slot>
        </div>
      </section>

      <section v-if="supportsPrompt" class="editor-section prompt-section">
        <div class="section-heading">
          <strong>{{ promptLabel() }}</strong>
          <span>{{ asString(config.prompt).length }} / 1000</span>
        </div>
        <div class="prompt-field">
          <Textarea
            :auto-size="{
              minRows: isPlanner ? 4 : 3,
              maxRows: expanded ? 8 : 5,
            }"
            :disabled="readonly"
            :maxlength="1000"
            :placeholder="promptPlaceholder()"
            :value="asString(config.prompt)"
            @change="emitConfig('prompt', $event.target.value)"
          />
          <Tooltip title="提示词润色由上层工作台接入">
            <span class="prompt-sparkle">
              <IconifyIcon icon="lucide:sparkles" />
            </span>
          </Tooltip>
        </div>
        <button
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
        <Textarea
          v-if="negativePromptOpen"
          class="negative-prompt"
          :auto-size="{ minRows: 2, maxRows: 4 }"
          :disabled="readonly"
          placeholder="描述不希望出现在结果中的内容、风格或画面问题…"
          :value="asString(config.negativePrompt)"
          @change="emitConfig('negativePrompt', $event.target.value)"
        />
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
        <div v-else class="advanced-empty">
          <IconifyIcon icon="lucide:sliders-horizontal" />
          <span>选择带参数 Schema 的逻辑模型后，将自动显示可用控件。</span>
        </div>
      </section>

      <section v-if="resultAssets.length" class="editor-section result-section">
        <div class="section-heading">
          <strong>生成结果</strong>
          <span>{{ resultAssets.length }} 个素材已归档</span>
        </div>
        <div class="result-strip">
          <a
            v-for="asset in resultAssets.slice(0, 6)"
            :key="asset.id"
            :href="asset.url"
            rel="noreferrer"
            target="_blank"
            :title="asset.name"
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
            <span>{{ asset.name }}</span>
          </a>
        </div>
      </section>
    </main>

    <footer class="editor-toolbar">
      <Select
        v-if="isAiNode"
        allow-clear
        class="toolbar-model"
        :disabled="readonly"
        :options="modelSelectOptions"
        placeholder="自动路由模型"
        show-search
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

      <template v-else-if="isImageNode">
        <Select
          class="toolbar-control"
          :disabled="readonly"
          :options="ASPECT_RATIO_OPTIONS"
          :value="asString(currentMediaValue('aspectRatio', '1:1'))"
          @change="emitMediaConfig('aspectRatio', $event)"
        >
          <template #suffixIcon
            ><IconifyIcon icon="lucide:rectangle-horizontal"
          /></template>
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

      <template v-else-if="isVideoNode && !isComposeNode">
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

      <template v-else-if="node.type === 'video-compose'">
        <Select
          class="toolbar-control"
          :disabled="readonly"
          :options="RESOLUTION_OPTIONS"
          :value="asString(config.resolution, '1080P')"
          @change="emitConfig('resolution', $event)"
        />
        <Select
          class="toolbar-control"
          :disabled="readonly"
          :options="TRANSITION_OPTIONS"
          :value="asString(config.transition, '淡化')"
          @change="emitConfig('transition', $event)"
        />
        <Select
          class="toolbar-control"
          :disabled="readonly"
          :options="[{ label: 'MP4', value: 'MP4' }]"
          :value="asString(config.format, 'MP4')"
          @change="emitConfig('format', $event)"
        />
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
        v-if="!readonly && expanded"
        class="downstream-button"
        :disabled="isRunning"
        @click="runDownstream"
      >
        从此向下运行
      </Button>
      <Tooltip :title="isRunning ? '节点正在执行' : '运行当前节点'">
        <Button
          v-if="!readonly"
          class="run-button"
          :disabled="isRunning"
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
  color: #172033;
  background: rgb(255 255 255 / 99%);
  border: 1px solid #cbd8eb;
  border-radius: 12px;
  box-shadow:
    0 18px 45px rgb(26 50 84 / 14%),
    0 3px 10px rgb(26 50 84 / 8%);
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

.node-inline-editor--below::before {
  top: -10px;
  border-bottom: 10px solid #cbd8eb;
}

.node-inline-editor--below::after {
  top: -8px;
  border-bottom: 9px solid white;
}

.node-inline-editor--above::before {
  bottom: -10px;
  border-top: 10px solid #cbd8eb;
}

.node-inline-editor--above::after {
  bottom: -8px;
  border-top: 9px solid white;
}

.editor-header {
  display: flex;
  gap: 8px;
  align-items: center;
  height: 46px;
  padding: 0 12px;
  border-bottom: 1px solid #edf1f7;
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
  color: #172033;
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
  color: #94a3b8;
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
  color: #64748b;
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
  border-bottom: 1px solid #edf1f7;
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
  color: #26344b;
}

.section-heading span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 11px;
  color: #9aa6b6;
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
  background: #f5f7fb;
  border: 1px solid #e5eaf2;
  border-radius: 8px;
}

.asset-preview--large img,
.asset-preview--large video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.asset-empty {
  display: grid;
  gap: 5px;
  place-content: center;
  place-items: center;
  width: 100%;
  height: 100%;
  font-size: 10px;
  color: #94a3b8;
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
  color: #94a3b8;
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

.reference-image {
  position: relative;
  display: grid;
  place-items: center;
  width: 92px;
  height: 64px;
  overflow: hidden;
  color: #a6b1c1;
  background: #f3f6fa;
  border: 1px solid #e3e8f1;
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
  color: #a0aaba;
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
  color: #64748b;
  background: #fafbfc !important;
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

.frame-preview {
  position: relative;
  display: grid;
  place-items: center;
  width: 96px;
  height: 66px;
  overflow: hidden;
  color: #9aa6b6;
  background: #f5f7fa;
  border: 1px solid #e2e8f0;
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
  color: #718096;
  background: #f8fafc;
  border-radius: 7px;
}

.prompt-field {
  position: relative;
}

.prompt-field :deep(textarea.ant-input) {
  padding: 9px 36px 9px 10px;
  font-size: 12px;
  line-height: 20px;
  resize: none;
  border-color: #cbd8eb;
  border-radius: 8px;
}

.prompt-field :deep(textarea.ant-input:focus) {
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

.fold-row {
  display: flex;
  gap: 5px;
  align-items: center;
  width: 100%;
  min-height: 30px;
  padding: 0 8px;
  margin-top: 7px;
  font-size: 11px;
  color: #526178;
  cursor: pointer;
  background: #fafbfc;
  border: 1px solid #e5eaf1;
  border-radius: 7px;
}

.fold-row > span {
  margin-left: auto;
  font-size: 10px;
  color: #8b5cf6;
}

.negative-prompt {
  margin-top: 7px;
  font-size: 12px;
  line-height: 20px;
}

.compose-summary {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 10px;
  background: linear-gradient(135deg, #f6fbff, #f8f7ff);
  border: 1px solid #e5ecf5;
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
  color: #7a8799;
}

.execution-error {
  display: flex;
  gap: 7px;
  align-items: flex-start;
  padding: 8px 10px;
  margin: 10px 14px 0;
  font-size: 11px;
  line-height: 17px;
  color: #b42318;
  background: #fff1f0;
  border: 1px solid #ffccc7;
  border-radius: 7px;
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

.result-strip > a {
  position: relative;
  flex: 0 0 86px;
  height: 62px;
  overflow: hidden;
  color: white;
  background: #e9eef5;
  border: 1px solid #dbe4ee;
  border-radius: 7px;
}

.result-strip img,
.result-strip video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
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

.advanced-panel {
  padding: 12px 14px 14px;
  background: #fbfcfe;
  border-bottom: 1px solid #e9eef5;
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
  color: #98a3b3;
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
  color: #5e6a7d;
  white-space: nowrap;
}

.schema-field > span i {
  color: #ef4444;
}

.schema-field > span :deep(svg) {
  flex: none;
  color: #9ba7b7;
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
  color: #98a3b3;
  border: 1px dashed #dce3ed;
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
  background: #fbfcfe;
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
