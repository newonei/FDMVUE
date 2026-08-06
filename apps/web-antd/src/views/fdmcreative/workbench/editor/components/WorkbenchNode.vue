<script lang="ts" setup>
import type { Node } from '@antv/x6';

import { computed, inject, onBeforeUnmount, ref } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { CREATIVE_NODE_MAP, getCreativeNodeVisual } from '../graph/catalog';
import { nodeRunStatusLabel } from '../node-run-status';

interface WorkbenchNodeData {
  config?: Record<string, unknown>;
  display?: Record<string, unknown>;
  name?: string;
  status?: string;
  type?: string;
}

interface DetailRow {
  label: string;
  value: string;
}

const PROMPT_TARGET_LABELS: Record<string, string> = {
  GENERAL: '通用',
  IMAGE: '图片',
  NEGATIVE: '负向',
  VIDEO: '视频',
};
const PROMPT_LANGUAGE_LABELS: Record<string, string> = {
  AUTO: '自动语言',
  EN: '英文',
  ZH_CN: '中文',
};

const getNode = inject<() => Node>('getNode');
const node = getNode?.();
const data = ref<WorkbenchNodeData>(
  (node?.getData() ?? {}) as WorkbenchNodeData,
);
const size = ref(
  node?.getSize() ?? getCreativeNodeVisual(data.value.type ?? 'creative-brief'),
);

const onDataChanged = () => {
  data.value = { ...((node?.getData() ?? {}) as WorkbenchNodeData) };
};
const onSizeChanged = () => {
  if (node) size.value = node.getSize();
};
node?.on('change:data', onDataChanged);
node?.on('change:size', onSizeChanged);
onBeforeUnmount(() => {
  node?.off('change:data', onDataChanged);
  node?.off('change:size', onSizeChanged);
});

const nodeType = computed(() => data.value.type ?? 'creative-brief');
const template = computed(() => CREATIVE_NODE_MAP.get(nodeType.value));
const visual = computed(() => getCreativeNodeVisual(nodeType.value));
const nodeStyle = computed(() => ({
  '--node-accent': template.value?.color ?? '#64748b',
  height: `${size.value.height}px`,
  width: `${size.value.width}px`,
}));
const statusText = computed(() => {
  return nodeRunStatusLabel(data.value.status);
});

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readable(value: unknown) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.length > 0 ? `${value.length} 项` : '';
  return '';
}

function firstValue(...values: unknown[]) {
  for (const value of values) {
    const normalized = readable(value);
    if (normalized) return normalized;
  }
  return '';
}

const config = computed(() => data.value.config ?? {});
const display = computed(() => data.value.display ?? {});
const imageConfig = computed(() => asRecord(config.value.image));
const videoConfig = computed(() => asRecord(config.value.video));
const outputText = computed(() => firstValue(display.value.outputText));
const prompt = computed(() =>
  firstValue(
    visual.value.variant === 'llm' ? outputText.value : undefined,
    config.value.prompt,
    config.value.description,
    template.value?.description,
  ),
);
const mediaUrl = computed(() =>
  firstValue(
    display.value.previewUrl,
    display.value.mediaUrl,
    display.value.thumbnailUrl,
    display.value.assetUrl,
    config.value.previewUrl,
    config.value.mediaUrl,
    config.value.assetUrl,
    config.value.thumbnailUrl,
    config.value.url,
  ),
);
const isVideoMedia = computed(() => {
  if (
    [
      'first-last-frame-to-video',
      'image-to-video',
      'video-compose',
      'video-generate',
      'video-input',
      'video-normalize',
      'video-transition',
      'video-trim',
    ].includes(nodeType.value)
  ) {
    return true;
  }
  return /\.(?:m3u8|mov|mp4|webm)(?:[?#].*)?$/i.test(mediaUrl.value);
});
const assetName = computed(() =>
  firstValue(
    display.value.assetName,
    config.value.assetName,
    config.value.fileName,
    data.value.name,
  ),
);
const plannerMode = computed(() => {
  const labels: Record<string, string> = {
    IMAGE_SET: '图片方案',
    MIXED: '图像 + 视频',
    VIDEO_SEQUENCE: '视频序列',
  };
  const mode = firstValue(config.value.planMode, config.value.mode);
  return labels[mode] ?? '混合规划';
});
const headerMeta = computed(() => {
  if (data.value.status && data.value.status !== 'IDLE')
    return statusText.value;
  if (visual.value.variant === 'llm') return outputText.value ? '已输出' : 'AI';
  if (visual.value.variant === 'planner') return 'AI';
  if (visual.value.variant === 'plan-item') return '脚本';
  if (visual.value.variant === 'asset') {
    return config.value.assetId || mediaUrl.value ? '已就绪' : '待素材';
  }
  return '待运行';
});

const detailRows = computed<DetailRow[]>(() => {
  const type = nodeType.value;
  const rows: DetailRow[] = [];
  const add = (label: string, ...values: unknown[]) => {
    const value = firstValue(...values);
    if (value) rows.push({ label, value });
  };

  if (type === 'image-plan-item') {
    add('构图', imageConfig.value.composition, imageConfig.value.aspectRatio);
    add('光线', imageConfig.value.lighting, imageConfig.value.light);
    add('数量', imageConfig.value.outputCount);
  } else if (type === 'video-plan-item') {
    add('镜头', videoConfig.value.shot, videoConfig.value.shotType);
    add('动作', videoConfig.value.action);
    add('运镜', videoConfig.value.cameraMovement);
  } else if (
    ['image-edit', 'image-generate', 'image-to-image'].includes(type)
  ) {
    add(
      '模型',
      config.value.modelName,
      config.value.logicalModelName,
      '自动路由',
    );
    add('比例', imageConfig.value.aspectRatio, config.value.aspectRatio, '1:1');
    add(
      '输出',
      imageConfig.value.outputCount,
      config.value.outputCount,
      '1 张',
    );
  } else if (
    ['first-last-frame-to-video', 'image-to-video', 'video-generate'].includes(
      type,
    )
  ) {
    add(
      '模型',
      config.value.modelName,
      config.value.logicalModelName,
      '自动路由',
    );
    add(
      '比例',
      videoConfig.value.aspectRatio,
      config.value.aspectRatio,
      '9:16',
    );
    add(
      '时长',
      videoConfig.value.durationSeconds,
      config.value.durationSeconds,
      '5 秒',
    );
  } else if (type === 'video-compose') {
    add('片段', config.value.segmentOrder, config.value.videoIds);
    add('格式', config.value.format, 'MP4');
  } else if (type === 'image-resize') {
    const width = firstValue(config.value.width);
    const height = firstValue(config.value.height);
    add('尺寸', width && height ? `${width} × ${height}` : '1024 × 1024');
    add('适配', config.value.resizeMode, 'contain');
  } else if (type === 'video-trim') {
    add('开始', config.value.startSeconds, '0 秒');
    add('时长', config.value.durationSeconds, '5 秒');
  } else if (type === 'video-frame-extract') {
    const modeLabels: Record<string, string> = {
      FIRST: '首帧',
      LAST: '尾帧',
      TIME: '指定时间',
    };
    add('位置', modeLabels[firstValue(config.value.frameMode)] ?? '首帧');
    if (firstValue(config.value.frameMode) === 'TIME') {
      add('时间', `${firstValue(config.value.timeSeconds) || 0} 秒`);
    }
  } else if (type === 'video-normalize') {
    const width = firstValue(config.value.width);
    const height = firstValue(config.value.height);
    add('尺寸', width && height ? `${width} × ${height}` : '1280 × 720');
    add('帧率', `${firstValue(config.value.fps) || 30} FPS`);
    add('适配', config.value.resizeMode, 'FIT');
  } else if (type === 'video-transition') {
    add('转场', config.value.transition, '淡化');
    add('时长', config.value.transitionSeconds, '1 秒');
  }

  return rows.slice(0, visual.value.variant === 'generate' ? 3 : 2);
});

const plannerTags = computed(() => {
  const tags = [plannerMode.value];
  const imageCount = readable(config.value.imageCount);
  const videoCount = readable(config.value.videoCount);
  if (imageCount) tags.push(`图 ${imageCount}`);
  if (videoCount) tags.push(`片 ${videoCount}`);
  return tags;
});
const llmTags = computed(() => {
  return [
    PROMPT_TARGET_LABELS[firstValue(config.value.targetType)] ?? '通用',
    PROMPT_LANGUAGE_LABELS[firstValue(config.value.language)] ?? '中文',
  ];
});
</script>

<template>
  <article
    class="creative-node"
    :class="`creative-node--${visual.variant}`"
    :data-node-type="nodeType"
    :data-node-variant="visual.variant"
    :style="nodeStyle"
  >
    <header class="node-header">
      <span class="node-icon">
        <IconifyIcon :icon="template?.icon ?? 'lucide:box'" />
      </span>
      <strong :title="data.name || template?.label">
        {{ data.name || template?.label || '创作节点' }}
      </strong>
      <span
        class="status-label"
        :class="`status-${data.status?.toLowerCase() || 'idle'}`"
      >
        {{ headerMeta }}
      </span>
    </header>

    <section v-if="visual.variant === 'asset'" class="asset-body">
      <div class="asset-preview">
        <img
          v-if="mediaUrl && nodeType === 'image-input'"
          :src="mediaUrl"
          alt=""
        />
        <video
          v-else-if="mediaUrl && nodeType === 'video-input'"
          muted
          playsinline
          preload="metadata"
          :src="mediaUrl"
        ></video>
        <div v-else class="asset-placeholder">
          <IconifyIcon
            :icon="
              nodeType === 'video-input' ? 'lucide:film' : 'lucide:image-plus'
            "
          />
          <span>选择或上传素材</span>
        </div>
      </div>
      <div class="asset-caption">
        <strong :title="assetName">{{ assetName }}</strong>
        <span>{{ config.assetId ? '已绑定素材' : '等待素材' }}</span>
      </div>
    </section>

    <section
      v-else
      class="node-body"
      :class="{
        'node-body--has-media': visual.variant === 'generate' && mediaUrl,
      }"
    >
      <div v-if="visual.variant === 'compose'" class="compose-preview">
        <template v-if="mediaUrl">
          <video
            v-if="isVideoMedia"
            muted
            playsinline
            preload="metadata"
            :src="mediaUrl"
          ></video>
          <img v-else :src="mediaUrl" alt="" />
          <span v-if="isVideoMedia" class="media-play">
            <IconifyIcon icon="lucide:play" />
          </span>
        </template>
        <div v-else class="compose-placeholder">
          <IconifyIcon
            :icon="
              nodeType === 'video-compose'
                ? 'lucide:play'
                : 'lucide:package-check'
            "
          />
          <span>{{
            nodeType === 'video-compose' ? '合成预览' : '成果预览'
          }}</span>
        </div>
        <span v-if="mediaUrl" class="preview-caption">
          {{ nodeType === 'video-compose' ? '合成预览' : '成果预览' }}
        </span>
      </div>

      <div
        v-else-if="visual.variant === 'generate' && mediaUrl"
        class="generate-preview"
      >
        <video
          v-if="isVideoMedia"
          muted
          playsinline
          preload="metadata"
          :src="mediaUrl"
        ></video>
        <img v-else :src="mediaUrl" alt="" />
        <span v-if="isVideoMedia" class="media-play media-play--small">
          <IconifyIcon icon="lucide:play" />
        </span>
      </div>

      <p
        v-if="!['compose', 'generate'].includes(visual.variant)"
        class="prompt"
        :class="{ 'prompt--planner': visual.variant === 'planner' }"
        :title="prompt"
      >
        {{ prompt }}
      </p>

      <dl v-if="detailRows.length" class="detail-list">
        <div v-for="row in detailRows" :key="row.label">
          <dt>{{ row.label }}</dt>
          <dd :title="row.value">{{ row.value }}</dd>
        </div>
      </dl>

      <div v-if="visual.variant === 'planner'" class="planner-tags">
        <span v-for="tag in plannerTags" :key="tag">{{ tag }}</span>
      </div>
      <div v-if="visual.variant === 'llm'" class="llm-tags">
        <span v-for="tag in llmTags" :key="tag">{{ tag }}</span>
      </div>
      <div v-if="visual.variant === 'planner'" class="planner-action">
        <IconifyIcon icon="lucide:sparkles" />
        生成内容方案
      </div>
      <div v-if="visual.variant === 'llm'" class="llm-action">
        <IconifyIcon :icon="outputText ? 'lucide:check' : 'lucide:sparkles'" />
        {{ outputText ? '查看生成提示词' : '生成提示词' }}
      </div>

      <footer>
        <span class="node-state">
          <i
            :class="`status-dot status-${data.status?.toLowerCase() || 'idle'}`"
          ></i>
          {{ statusText }}
        </span>
        <span v-if="videoConfig.durationSeconds">
          {{ videoConfig.durationSeconds }} 秒
        </span>
        <span v-else-if="nodeType === 'prompt-generator'">
          {{
            config.logicalModelId
              ? `模型 #${config.logicalModelId}`
              : '自动路由'
          }}
        </span>
        <span v-else-if="config.modelName">{{ config.modelName }}</span>
      </footer>
    </section>
  </article>
</template>

<style>
/*
 * x6-vue-shape mounts an XHTML body inside foreignObject. The application
 * theme gives every body min-height: 100vh, so without this scoped reset the
 * card visually overflows a compact X6 cell to the bottom of the canvas.
 */
.x6-node foreignObject > body {
  width: 100%;
  height: 100%;
  min-height: 0 !important;
  margin: 0;
  overflow: hidden;
  background: transparent;
}

.x6-node foreignObject > body > div {
  width: 100%;
  height: 100%;
  overflow: hidden;
}
</style>

<style scoped>
.creative-node {
  position: relative;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: #172033;
  background: rgb(255 255 255 / 98%);
  border: 1px solid color-mix(in srgb, var(--node-accent) 36%, #dbe4ee);
  border-radius: 8px;
  box-shadow: 0 2px 8px rgb(15 23 42 / 8%);
}

.node-header {
  display: flex;
  flex: 0 0 38px;
  gap: 7px;
  align-items: center;
  min-width: 0;
  padding: 0 8px;
  border-bottom: 1px solid #eef2f7;
}

.node-header > strong {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  font-weight: 650;
  line-height: 18px;
  white-space: nowrap;
}

.node-icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 22px;
  height: 22px;
  color: var(--node-accent);
  background: color-mix(in srgb, var(--node-accent) 10%, white);
  border-radius: 6px;
}

.node-icon :deep(svg) {
  width: 13px;
  height: 13px;
}

.node-more {
  flex: none;
  width: 15px;
  height: 15px;
  color: #a8b3c2;
}

.status-label {
  flex: none;
  max-width: 48px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 10px;
  color: #64748b;
  white-space: nowrap;
}

.status-label.status-succeeded {
  color: #16a34a;
}

.status-label.status-failed {
  color: #dc2626;
}

.status-label.status-archiving_ai,
.status-label.status-pending,
.status-label.status-queued,
.status-label.status-running,
.status-label.status-waiting_ai {
  color: #1677ff;
}

.status-label.status-blocked,
.status-label.status-cancel_requested,
.status-label.status-stale {
  color: #d97706;
}

.node-body,
.asset-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.node-body {
  gap: 5px;
  padding: 7px 8px 6px;
}

.prompt {
  display: -webkit-box;
  flex: 0 0 auto;
  margin: 0;
  overflow: hidden;
  -webkit-line-clamp: 2;
  font-size: 11px;
  line-height: 16px;
  color: #64748b;
  -webkit-box-orient: vertical;
}

.prompt--planner {
  min-height: 68px;
  padding: 7px;
  -webkit-line-clamp: 4;
  color: #475569;
  background: #f8fafc;
  border: 1px solid #edf1f6;
  border-radius: 6px;
}

.creative-node--llm .prompt {
  min-height: 42px;
  padding: 6px 7px;
  -webkit-line-clamp: 2;
  color: #514168;
  background: linear-gradient(145deg, #fbf9ff, #f8f7fc);
  border: 1px solid #eee8f8;
  border-radius: 6px;
}

.detail-list {
  display: grid;
  gap: 0;
  margin: 0;
  overflow: hidden;
  border: 1px solid #edf1f6;
  border-radius: 6px;
}

.detail-list > div {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr);
  align-items: center;
  min-height: 23px;
  padding: 0 6px;
  border-bottom: 1px solid #edf1f6;
}

.detail-list > div:last-child {
  border-bottom: 0;
}

.detail-list dt,
.detail-list dd {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 10px;
  line-height: 14px;
  white-space: nowrap;
}

.detail-list dt {
  color: #94a3b8;
}

.detail-list dd {
  color: #475569;
}

.planner-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.llm-tags {
  display: flex;
  gap: 4px;
}

.llm-tags span {
  padding: 2px 6px;
  font-size: 9px;
  color: #6d28d9;
  background: #f4efff;
  border-radius: 999px;
}

.planner-tags span {
  padding: 2px 6px;
  font-size: 10px;
  color: #6d28d9;
  background: #f4efff;
  border-radius: 999px;
}

.planner-action {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 28px;
  margin-top: auto;
  font-size: 11px;
  font-weight: 600;
  color: white;
  background: linear-gradient(90deg, #8b5cf6, #a855f7);
  border-radius: 6px;
}

.llm-action {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 25px;
  margin-top: auto;
  font-size: 10px;
  font-weight: 600;
  color: #6d28d9;
  background: #f4efff;
  border: 1px solid #e7dcff;
  border-radius: 6px;
}

.llm-action :deep(svg) {
  width: 11px;
  height: 11px;
  margin-right: 4px;
}

.planner-action :deep(svg) {
  width: 12px;
  height: 12px;
  margin-right: 4px;
}

.node-body footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
  min-height: 16px;
  margin-top: auto;
  font-size: 10px;
  color: #94a3b8;
}

.node-body footer > span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-state {
  display: inline-flex;
  gap: 4px;
  align-items: center;
}

.status-dot {
  width: 6px;
  height: 6px;
  background: #cbd5e1;
  border-radius: 999px;
}

.status-dot.status-archiving_ai,
.status-dot.status-pending,
.status-dot.status-queued,
.status-dot.status-running,
.status-dot.status-waiting_ai {
  background: #1677ff;
}

.status-dot.status-succeeded {
  background: #16a34a;
}

.status-dot.status-failed {
  background: #ef4444;
}

.status-dot.status-blocked,
.status-dot.status-cancel_requested,
.status-dot.status-stale {
  background: #f59e0b;
}

.asset-preview {
  display: grid;
  flex: 1;
  place-items: center;
  min-height: 0;
  margin: 8px 8px 0;
  overflow: hidden;
  background: #f3f6fa;
  border-radius: 6px;
}

.asset-preview img,
.asset-preview video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.asset-placeholder {
  display: grid;
  gap: 7px;
  place-items: center;
  color: #94a3b8;
}

.asset-placeholder :deep(svg) {
  width: 28px;
  height: 28px;
  color: var(--node-accent);
}

.asset-placeholder span {
  font-size: 10px;
}

.asset-caption {
  display: flex;
  flex: 0 0 38px;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
  padding: 0 8px;
}

.asset-caption strong,
.asset-caption span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.asset-caption strong {
  font-size: 11px;
}

.asset-caption span {
  font-size: 10px;
  color: #94a3b8;
}

.compose-preview {
  position: relative;
  display: grid;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  color: var(--node-accent);
  background:
    linear-gradient(145deg, rgb(255 255 255 / 8%), rgb(15 23 42 / 10%)),
    color-mix(in srgb, var(--node-accent) 9%, #f8fafc);
  border-radius: 6px;
}

.compose-preview > img,
.compose-preview > video,
.generate-preview img,
.generate-preview video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.compose-placeholder {
  display: grid;
  gap: 7px;
  place-content: center;
  place-items: center;
}

.compose-placeholder :deep(svg) {
  width: 34px;
  height: 34px;
  padding: 8px;
  color: white;
  background: color-mix(in srgb, var(--node-accent) 82%, #0f172a);
  border-radius: 999px;
}

.compose-placeholder span {
  font-size: 10px;
  color: #64748b;
}

.preview-caption {
  position: absolute;
  right: 6px;
  bottom: 6px;
  max-width: calc(100% - 12px);
  padding: 2px 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 10px;
  color: white;
  white-space: nowrap;
  background: rgb(15 23 42 / 68%);
  border-radius: 999px;
  backdrop-filter: blur(3px);
}

.generate-preview {
  position: relative;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: #f1f5f9;
  border: 1px solid #edf1f6;
  border-radius: 6px;
}

.media-play {
  position: absolute;
  top: 50%;
  left: 50%;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  color: white;
  background: rgb(15 23 42 / 62%);
  border: 1px solid rgb(255 255 255 / 45%);
  border-radius: 999px;
  backdrop-filter: blur(2px);
  transform: translate(-50%, -50%);
}

.media-play :deep(svg) {
  width: 14px;
  height: 14px;
}

.media-play--small {
  width: 22px;
  height: 22px;
}

.media-play--small :deep(svg) {
  width: 10px;
  height: 10px;
}

.creative-node--generate .node-body--has-media {
  display: grid;
  grid-template-rows: minmax(0, 1fr) 17px;
  grid-template-columns: 54px minmax(0, 1fr);
  gap: 5px 6px;
}

.creative-node--generate .node-body--has-media .generate-preview {
  grid-row: 1;
  grid-column: 1;
}

.creative-node--generate .node-body--has-media .detail-list {
  grid-row: 1;
  grid-column: 2;
}

.creative-node--generate .node-body--has-media .detail-list > div {
  grid-template-columns: 30px minmax(0, 1fr);
  min-height: 21px;
  padding: 0 4px;
}

.creative-node--generate .node-body--has-media footer {
  grid-row: 2;
  grid-column: 1 / -1;
}

.creative-node--generate
  .node-body:not(.node-body--has-media)
  .detail-list
  > div {
  min-height: 24px;
}

.creative-node--plan-item .prompt {
  -webkit-line-clamp: 2;
}

.creative-node--compact .prompt {
  -webkit-line-clamp: 3;
}
</style>
