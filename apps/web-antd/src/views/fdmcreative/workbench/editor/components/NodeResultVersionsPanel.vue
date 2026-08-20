<script lang="ts" setup>
import type { FdmCreativeApi } from '#/api/fdmcreative';

import { computed, ref } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Empty, Modal, Tag, Tooltip } from 'ant-design-vue';

import {
  defaultResultHistorySelection,
  isActiveResultAsset,
  resultBranchBlockedReason,
} from '../result-history';

interface ResultActionPayload {
  asset: FdmCreativeApi.NodeResultAsset;
  version: FdmCreativeApi.NodeResultVersion;
}

interface ToolActionPayload extends ResultActionPayload {
  tool: FdmCreativeApi.MediaToolDescriptor;
}

interface Props {
  autosaveConflict?: boolean;
  canEdit?: boolean;
  loading?: boolean;
  mediaTools?: FdmCreativeApi.MediaToolDescriptor[];
  /** Workbench pins to canvas; other consumers can route the same archived asset to their library. */
  pinLabel?: string;
  versions?: FdmCreativeApi.NodeResultVersion[];
}

const props = withDefaults(defineProps<Props>(), {
  autosaveConflict: false,
  canEdit: false,
  loading: false,
  mediaTools: () => [],
  pinLabel: '固定到画布',
  versions: () => [],
});

const emit = defineEmits<{
  adopt: [payload: ResultActionPayload];
  pin: [payload: ResultActionPayload];
  tool: [payload: ToolActionPayload];
}>();

const preview = ref<ResultActionPayload>();
const previewZoom = ref(1);

const actionBlockedReason = computed(() => {
  return resultBranchBlockedReason({
    autosaveConflict: props.autosaveConflict,
    canEdit: props.canEdit,
  });
});
const defaultSelection = computed(() =>
  defaultResultHistorySelection(props.versions),
);
const defaultTools = computed(() => {
  const selection = defaultSelection.value;
  if (!selection?.asset.kind) return [];
  return props.mediaTools.filter((tool) =>
    tool.applicableAssetKinds.includes(selection.asset.kind!),
  );
});

function assetIsActive(asset: FdmCreativeApi.NodeResultAsset) {
  return isActiveResultAsset(asset);
}

function relevantTools(asset: FdmCreativeApi.NodeResultAsset) {
  if (!asset.kind) return [];
  return props.mediaTools.filter((tool) =>
    tool.applicableAssetKinds.includes(asset.kind!),
  );
}

function openPreview(payload: ResultActionPayload) {
  if (!assetIsActive(payload.asset)) return;
  preview.value = payload;
  previewZoom.value = 1;
}

function closePreview() {
  preview.value = undefined;
  previewZoom.value = 1;
}

function formatTime(value?: string) {
  if (!value) return '时间未知';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(date);
}

function formatBytes(value?: number) {
  if (!value || value < 0) return undefined;
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(2)} GB`;
}

function formatDuration(value?: number) {
  if (!value || value < 0) return undefined;
  return `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)} 秒`;
}

function assetKindLabel(kind?: FdmCreativeApi.NodeResultAsset['kind']) {
  if (kind === 'AUDIO') return '音频';
  if (kind === 'VIDEO') return '视频';
  if (kind === 'IMAGE') return '图片';
  return '媒体';
}

function formatCost(cost?: FdmCreativeApi.NodeResultVersion['cost']) {
  if (!cost) return undefined;
  const amount = cost.costAmount ?? cost.estimatedCost;
  if (amount === undefined) return undefined;
  const source = cost.costAmount === undefined ? '估算' : '成本';
  return `${source} ${cost.currency ?? ''}${Number(amount).toFixed(4)}`;
}

function toolReason(tool: FdmCreativeApi.MediaToolDescriptor) {
  const reason = actionBlockedReason.value ?? tool.unavailableReason;
  if (reason) return reason;
  if (tool.available) return undefined;
  return '该工具当前不可用';
}

function emitTool(
  tool: FdmCreativeApi.MediaToolDescriptor,
  payload: ResultActionPayload,
) {
  if (!tool.available || actionBlockedReason.value) return;
  emit('tool', { ...payload, tool });
}
</script>

<template>
  <section class="node-result-versions" data-testid="node-result-versions">
    <header class="node-result-versions__header">
      <span>
        <IconifyIcon icon="lucide:history" />
        <strong>结果版本</strong>
        <small v-if="versions.length">{{ versions.length }} 个历史版本</small>
      </span>
      <small v-if="loading">正在同步…</small>
    </header>

    <div v-if="defaultSelection" class="node-result-versions__quick-tools">
      <span>
        <IconifyIcon icon="lucide:wand-sparkles" />
        当前素材：{{ defaultSelection.asset.name || defaultSelection.asset.id }}
      </span>
      <Tooltip :title="actionBlockedReason">
        <Button
          size="small"
          :disabled="Boolean(actionBlockedReason)"
          @click="emit('pin', defaultSelection)"
        >
          {{ pinLabel }}
        </Button>
      </Tooltip>
      <Tooltip
        v-for="tool in defaultTools"
        :key="`quick-${tool.id}`"
        :title="toolReason(tool)"
      >
        <Button
          size="small"
          :disabled="!tool.available || Boolean(actionBlockedReason)"
          @click="emitTool(tool, defaultSelection)"
        >
          {{ tool.label }}
        </Button>
      </Tooltip>
    </div>

    <div
      v-if="loading && !versions.length"
      class="node-result-versions__loading"
    >
      <IconifyIcon icon="lucide:loader-circle" class="is-spinning" />
      正在读取结果历史
    </div>
    <Empty
      v-else-if="!versions.length"
      class="node-result-versions__empty"
      description="此节点尚无可用结果版本"
      :image-style="{ height: '34px' }"
    />
    <ol v-else class="node-result-versions__list">
      <li v-for="(version, index) in versions" :key="version.nodeRunId">
        <article class="result-version">
          <header class="result-version__meta">
            <span class="result-version__title">
              <strong>版本 {{ versions.length - index }}</strong>
              <Tag v-if="version.selectionStatus === 'CURRENT'" color="blue">
                当前可复用
              </Tag>
              <Tag
                v-else-if="version.selectionStatus === 'STALE'"
                color="orange"
              >
                已过期语义
              </Tag>
            </span>
            <time :title="version.completedTime">
              {{ formatTime(version.completedTime || version.startedTime) }}
            </time>
          </header>
          <p class="result-version__summary">
            <span v-if="version.model?.name">
              {{ version.model.name }}
            </span>
            <span v-if="formatCost(version.cost)">{{
              formatCost(version.cost)
            }}</span>
            <span v-if="version.attemptNo">尝试 {{ version.attemptNo }}</span>
          </p>

          <div class="result-version__assets">
            <article
              v-for="asset in version.assets"
              :key="asset.id || `${version.nodeRunId}:${asset.name}`"
              class="result-asset"
              :class="{
                'is-audio': asset.kind === 'AUDIO',
                'is-unavailable': !assetIsActive(asset),
              }"
            >
              <div
                v-if="assetIsActive(asset) && asset.kind === 'AUDIO'"
                class="result-asset__audio"
              >
                <span><IconifyIcon icon="lucide:audio-lines" /> 音频结果</span>
                <audio
                  controls
                  preload="metadata"
                  :src="asset.url"
                  @click.stop
                ></audio>
              </div>
              <button
                v-else-if="assetIsActive(asset)"
                class="result-asset__preview"
                type="button"
                @click="openPreview({ asset, version })"
              >
                <img
                  v-if="asset.kind === 'IMAGE'"
                  :alt="asset.name || '节点结果图片'"
                  :src="asset.url"
                />
                <video
                  v-else
                  muted
                  playsinline
                  preload="metadata"
                  :src="asset.url"
                ></video>
                <span class="result-asset__preview-hint">查看</span>
              </button>
              <div v-else class="result-asset__placeholder">
                <IconifyIcon icon="lucide:image-off" />
                <span>{{ asset.unavailableReason || '结果素材已不可用' }}</span>
              </div>

              <div class="result-asset__detail">
                <strong :title="asset.name">{{
                  asset.name || '未命名素材'
                }}</strong>
                <small>
                  {{ assetKindLabel(asset.kind) }}
                  <template v-if="asset.width && asset.height">
                    · {{ asset.width }}×{{ asset.height }}
                  </template>
                  <template v-if="formatDuration(asset.durationMillis)">
                    · {{ formatDuration(asset.durationMillis) }}
                  </template>
                </small>
                <small v-if="formatBytes(asset.size)">{{
                  formatBytes(asset.size)
                }}</small>
              </div>

              <div class="result-asset__actions">
                <Tag v-if="asset.adopted" color="green">当前采用</Tag>
                <Tooltip
                  :title="
                    actionBlockedReason ||
                    (!assetIsActive(asset)
                      ? asset.unavailableReason
                      : undefined)
                  "
                >
                  <Button
                    size="small"
                    type="link"
                    :disabled="
                      !assetIsActive(asset) || Boolean(actionBlockedReason)
                    "
                    @click="emit('adopt', { asset, version })"
                  >
                    采用此版
                  </Button>
                </Tooltip>
                <Tooltip
                  :title="
                    actionBlockedReason ||
                    (!assetIsActive(asset)
                      ? asset.unavailableReason
                      : undefined)
                  "
                >
                  <Button
                    size="small"
                    type="link"
                    :disabled="
                      !assetIsActive(asset) || Boolean(actionBlockedReason)
                    "
                    @click="emit('pin', { asset, version })"
                  >
                    {{ pinLabel }}
                  </Button>
                </Tooltip>
              </div>

              <div v-if="assetIsActive(asset)" class="result-asset__tools">
                <Tooltip
                  v-for="tool in relevantTools(asset)"
                  :key="tool.id"
                  :title="toolReason(tool)"
                >
                  <Button
                    size="small"
                    :disabled="!tool.available || Boolean(actionBlockedReason)"
                    @click="emitTool(tool, { asset, version })"
                  >
                    <IconifyIcon
                      :icon="
                        tool.localExecution
                          ? 'lucide:wand-sparkles'
                          : 'lucide:sparkles'
                      "
                    />
                    {{ tool.label }}
                  </Button>
                </Tooltip>
                <small
                  v-if="asset.deleteEligible"
                  class="result-asset__library-hint"
                >
                  可在资产库删除
                </small>
              </div>
            </article>
          </div>
        </article>
      </li>
    </ol>
  </section>

  <Modal
    :footer="null"
    :open="Boolean(preview)"
    title="结果预览"
    width="min(980px, calc(100vw - 32px))"
    @cancel="closePreview"
  >
    <template v-if="preview">
      <div class="result-preview__toolbar">
        <span>{{ preview.asset.name || '未命名素材' }}</span>
        <span class="result-preview__toolbar-actions">
          <Button
            v-if="preview.asset.kind === 'IMAGE'"
            size="small"
            @click="previewZoom = Math.max(0.5, previewZoom - 0.25)"
          >
            <IconifyIcon icon="lucide:zoom-out" />
          </Button>
          <Button
            v-if="preview.asset.kind === 'IMAGE'"
            size="small"
            @click="previewZoom = Math.min(3, previewZoom + 0.25)"
          >
            <IconifyIcon icon="lucide:zoom-in" />
          </Button>
          <a :download="preview.asset.name" :href="preview.asset.url">
            <Button size="small"><IconifyIcon icon="lucide:download" /> 下载</Button>
          </a>
        </span>
      </div>
      <div class="result-preview__canvas">
        <img
          v-if="preview.asset.kind === 'IMAGE'"
          :alt="preview.asset.name || '节点结果图片'"
          :src="preview.asset.url"
          :style="{ transform: `scale(${previewZoom})` }"
        />
        <audio
          v-else-if="preview.asset.kind === 'AUDIO'"
          controls
          preload="metadata"
          :src="preview.asset.url"
        ></audio>
        <video
          v-else
          controls
          playsinline
          preload="metadata"
          :src="preview.asset.url"
        ></video>
      </div>
      <dl class="result-preview__metadata">
        <div>
          <dt>运行版本</dt>
          <dd>{{ preview.version.nodeRunId }}</dd>
        </div>
        <div>
          <dt>类型</dt>
          <dd>{{ assetKindLabel(preview.asset.kind) }}</dd>
        </div>
        <div v-if="preview.asset.mimeType">
          <dt>格式</dt>
          <dd>{{ preview.asset.mimeType }}</dd>
        </div>
        <div v-if="preview.asset.width && preview.asset.height">
          <dt>尺寸</dt>
          <dd>{{ preview.asset.width }}×{{ preview.asset.height }}</dd>
        </div>
        <div v-if="formatDuration(preview.asset.durationMillis)">
          <dt>时长</dt>
          <dd>{{ formatDuration(preview.asset.durationMillis) }}</dd>
        </div>
        <div v-if="formatBytes(preview.asset.size)">
          <dt>文件大小</dt>
          <dd>{{ formatBytes(preview.asset.size) }}</dd>
        </div>
      </dl>
    </template>
  </Modal>
</template>

<style scoped>
.node-result-versions {
  padding: 12px 14px 16px;
  border-top: 1px solid hsl(var(--border));
}

.node-result-versions__header,
.node-result-versions__header > span,
.result-version__meta,
.result-version__title,
.result-asset__detail,
.result-asset__actions,
.result-asset__tools,
.result-preview__toolbar,
.result-preview__toolbar-actions {
  display: flex;
  align-items: center;
}

.node-result-versions__header {
  gap: 8px;
  justify-content: space-between;
  margin-bottom: 10px;
}

.node-result-versions__quick-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  align-items: center;
  padding: 7px;
  margin: -2px 0 10px;
  font-size: 11px;
  background: hsl(var(--primary) / 7%);
  border: 1px solid hsl(var(--primary) / 18%);
  border-radius: 8px;
}

.node-result-versions__quick-tools > span {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  min-width: 0;
  margin-right: auto;
  overflow: hidden;
  text-overflow: ellipsis;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
}

.node-result-versions__quick-tools > span svg {
  color: hsl(var(--primary));
}

.node-result-versions__quick-tools :deep(.ant-btn) {
  height: 22px;
  padding-inline: 5px;
  font-size: 10px;
}

.node-result-versions__header > span {
  gap: 6px;
  min-width: 0;
}

.node-result-versions__header svg {
  color: hsl(var(--primary));
}

.node-result-versions__header strong {
  font-size: 13px;
}

.node-result-versions__header small,
.result-version__meta time,
.result-version__summary,
.result-asset__detail small,
.result-asset__library-hint {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
}

.node-result-versions__loading {
  display: flex;
  gap: 7px;
  align-items: center;
  min-height: 56px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.is-spinning {
  animation: node-result-spin 0.8s linear infinite;
}

.node-result-versions__empty {
  margin: 4px 0 0;
}

.node-result-versions__list {
  display: grid;
  gap: 10px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.result-version {
  padding: 10px;
  background: hsl(var(--muted) / 35%);
  border: 1px solid hsl(var(--border) / 80%);
  border-radius: 10px;
}

.result-version__meta {
  gap: 8px;
  justify-content: space-between;
}

.result-version__title {
  gap: 5px;
  min-width: 0;
}

.result-version__title strong {
  font-size: 12px;
}

.result-version__title :deep(.ant-tag) {
  margin-inline-end: 0;
  font-size: 10px;
}

.result-version__meta time {
  flex: none;
  white-space: nowrap;
}

.result-version__summary {
  display: flex;
  flex-wrap: wrap;
  gap: 3px 9px;
  margin: 5px 0 8px;
}

.result-version__assets {
  display: grid;
  gap: 8px;
}

.result-asset {
  display: grid;
  grid-template-columns: 78px minmax(0, 1fr);
  gap: 5px 9px;
  padding: 7px;
  background: hsl(var(--background));
  border: 1px solid hsl(var(--border) / 72%);
  border-radius: 8px;
}

.result-asset.is-unavailable {
  grid-template-columns: 1fr;
}

.result-asset.is-audio {
  grid-template-columns: minmax(154px, 210px) minmax(0, 1fr);
}

.result-asset__preview,
.result-asset__placeholder {
  position: relative;
  display: grid;
  place-items: center;
  width: 78px;
  height: 58px;
  padding: 0;
  overflow: hidden;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--muted) / 50%);
  border: 0;
  border-radius: 6px;
}

.result-asset__preview {
  cursor: zoom-in;
}

.result-asset__preview img,
.result-asset__preview video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.result-asset__preview-hint {
  position: absolute;
  inset: auto 0 0;
  padding: 2px;
  font-size: 10px;
  color: white;
  text-align: center;
  background: rgb(15 23 42 / 62%);
  opacity: 0;
  transition: opacity 120ms ease;
}

.result-asset__preview:hover .result-asset__preview-hint {
  opacity: 1;
}

.result-asset__audio {
  display: grid;
  gap: 5px;
  align-content: center;
  min-width: 0;
  padding: 7px;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--primary) / 7%);
  border: 1px solid hsl(var(--primary) / 16%);
  border-radius: 6px;
}

.result-asset__audio > span {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  font-size: 10px;
}

.result-asset__audio > span svg {
  width: 13px;
  height: 13px;
  color: hsl(var(--primary));
}

.result-asset__audio audio {
  width: 100%;
  height: 29px;
}

.result-asset__placeholder {
  gap: 5px;
  width: 100%;
  height: auto;
  min-height: 48px;
  padding: 8px;
  text-align: center;
}

.result-asset__placeholder svg {
  width: 18px;
  height: 18px;
}

.result-asset__placeholder span {
  font-size: 11px;
}

.result-asset__detail {
  flex-direction: column;
  gap: 2px;
  align-items: flex-start;
  justify-content: center;
  min-width: 0;
}

.result-asset__detail strong {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  white-space: nowrap;
}

.result-asset__actions {
  flex-wrap: wrap;
  grid-column: 1 / -1;
  gap: 2px;
  min-height: 22px;
}

.result-asset__actions :deep(.ant-tag) {
  margin: 0 4px 0 0;
  font-size: 10px;
}

.result-asset__actions :deep(.ant-btn) {
  height: 21px;
  padding-inline: 3px;
  font-size: 11px;
}

.result-asset__tools {
  flex-wrap: wrap;
  grid-column: 1 / -1;
  gap: 4px;
  padding-top: 5px;
  border-top: 1px dashed hsl(var(--border));
}

.result-asset__tools :deep(.ant-btn) {
  height: 22px;
  padding-inline: 5px;
  font-size: 10px;
}

.result-asset__tools :deep(.ant-btn svg) {
  width: 11px;
  height: 11px;
}

.result-asset__library-hint {
  margin-left: auto;
}

.result-preview__toolbar {
  gap: 12px;
  justify-content: space-between;
  margin-bottom: 12px;
  font-size: 12px;
}

.result-preview__toolbar-actions {
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-end;
}

.result-preview__toolbar a {
  color: inherit;
}

.result-preview__canvas {
  display: grid;
  place-items: center;
  min-height: 280px;
  max-height: 62vh;
  overflow: auto;
  background: hsl(var(--muted) / 55%);
  border-radius: 8px;
}

.result-preview__canvas img {
  max-width: 100%;
  max-height: 62vh;
  object-fit: contain;
  transform-origin: center;
  transition: transform 120ms ease;
}

.result-preview__canvas video {
  max-width: 100%;
  max-height: 62vh;
}

.result-preview__canvas audio {
  width: min(560px, calc(100% - 40px));
}

.result-preview__metadata {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 8px;
  margin: 12px 0 0;
}

.result-preview__metadata div {
  min-width: 0;
}

.result-preview__metadata dt {
  font-size: 10px;
  color: hsl(var(--muted-foreground));
}

.result-preview__metadata dd {
  margin: 2px 0 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 11px;
  white-space: nowrap;
}

@keyframes node-result-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 520px) {
  .result-version__meta {
    flex-direction: column;
    align-items: flex-start;
  }

  .result-asset__library-hint {
    width: 100%;
    margin-left: 0;
  }
}
</style>
