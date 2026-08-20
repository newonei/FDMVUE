<script lang="ts" setup>
import type { FdmCreativeApi } from '#/api/fdmcreative';

import { computed, reactive, ref } from 'vue';

import { IconifyIcon } from '@vben/icons';

import {
  Button,
  Empty,
  Input,
  message,
  Modal,
  Pagination,
  Spin,
  Tag,
} from 'ant-design-vue';

import { getCreativeAssetPage, importCreativeAsset } from '#/api/fdmcreative';

import { ASSET_KIND_OPTIONS, assetKindLabel } from './library-options';

interface Props {
  buttonText?: string;
  disabled?: boolean;
  kinds?: FdmCreativeApi.CreativeAsset['kind'][];
  multiple?: boolean;
  projectId: number;
}

const props = withDefaults(defineProps<Props>(), {
  buttonText: '从资产库选择',
  disabled: false,
  kinds: () => ['IMAGE', 'VIDEO', 'AUDIO'],
  multiple: false,
});

const emit = defineEmits<{
  select: [assets: FdmCreativeApi.CreativeAsset[]];
}>();

const open = ref(false);
const loading = ref(false);
const confirming = ref(false);
const rows = ref<FdmCreativeApi.CreativeAsset[]>([]);
const total = ref(0);
const selected = ref(new Map<number, FdmCreativeApi.CreativeAsset>());
const audioDurations = ref<Record<number, number>>({});
const query = reactive({
  keyword: '',
  kind: '' as '' | FdmCreativeApi.CreativeAsset['kind'],
  pageNo: 1,
  pageSize: 12,
});

const availableKinds = computed(() =>
  ASSET_KIND_OPTIONS.filter(
    (item) => item.value === '' || props.kinds.includes(item.value),
  ),
);

async function load() {
  loading.value = true;
  try {
    const data = await getCreativeAssetPage({
      keyword: query.keyword.trim() || undefined,
      kind:
        query.kind || (props.kinds.length === 1 ? props.kinds[0] : undefined),
      kinds: query.kind || props.kinds.length === 1 ? undefined : props.kinds,
      pageNo: query.pageNo,
      pageSize: query.pageSize,
    });
    rows.value = data.list;
    total.value = data.total;
  } finally {
    loading.value = false;
  }
}

function show() {
  selected.value = new Map();
  query.keyword = '';
  query.kind = props.kinds.length === 1 ? props.kinds[0]! : '';
  query.pageNo = 1;
  open.value = true;
  void load();
}

function switchKind(kind: '' | FdmCreativeApi.CreativeAsset['kind']) {
  query.kind = kind;
  query.pageNo = 1;
  void load();
}

function toggle(asset: FdmCreativeApi.CreativeAsset) {
  const next = new Map(selected.value);
  if (next.has(asset.id)) {
    next.delete(asset.id);
  } else {
    if (!props.multiple) next.clear();
    next.set(asset.id, asset);
  }
  selected.value = next;
}

function mediaIcon(kind: FdmCreativeApi.CreativeAsset['kind']) {
  return {
    AUDIO: 'lucide:audio-lines',
    DOCUMENT: 'lucide:file-text',
    IMAGE: 'lucide:image',
    OTHER: 'lucide:file',
    VIDEO: 'lucide:film',
  }[kind];
}

function formatBytes(size?: number) {
  if (!size) return '未知大小';
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function formatDuration(milliseconds?: number) {
  if (!milliseconds || milliseconds < 0) return undefined;
  const seconds = Math.round(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes > 0
    ? `${minutes}:${String(remainder).padStart(2, '0')}`
    : `${remainder} 秒`;
}

function audioSummary(asset: FdmCreativeApi.CreativeAsset) {
  const duration = formatDuration(audioDurations.value[asset.id]);
  const format = asset.mimeType?.replace(/^audio\//, '').toUpperCase();
  return [duration, format].filter(Boolean).join(' · ') || '加载音频信息中';
}

function captureAudioDuration(
  asset: FdmCreativeApi.CreativeAsset,
  event: Event,
) {
  const media = event.target as HTMLAudioElement;
  if (!Number.isFinite(media.duration) || media.duration < 0) return;
  audioDurations.value = {
    ...audioDurations.value,
    [asset.id]: Math.round(media.duration * 1000),
  };
}

async function confirm() {
  const choices = [...selected.value.values()];
  if (choices.length === 0) {
    message.warning('请先选择素材');
    return;
  }
  confirming.value = true;
  try {
    const resolved: FdmCreativeApi.CreativeAsset[] = [];
    for (const asset of choices) {
      resolved.push(
        asset.projectId === props.projectId
          ? asset
          : await importCreativeAsset({
              sourceAssetId: asset.id,
              targetProjectId: props.projectId,
            }),
      );
    }
    emit('select', resolved);
    open.value = false;
    const importedCount = choices.filter(
      (asset) => asset.projectId !== props.projectId,
    ).length;
    message.success(
      importedCount > 0
        ? `已选择 ${resolved.length} 个素材，其中 ${importedCount} 个已加入当前项目`
        : `已选择 ${resolved.length} 个素材`,
    );
  } finally {
    confirming.value = false;
  }
}
</script>

<template>
  <Button :disabled="disabled" size="small" @click="show">
    <IconifyIcon icon="lucide:library" />
    {{ buttonText }}
  </Button>

  <Modal
    v-model:open="open"
    :confirm-loading="confirming"
    destroy-on-close
    ok-text="使用所选素材"
    title="选择资产"
    :width="960"
    @ok="confirm"
  >
    <div class="asset-picker-toolbar">
      <div class="kind-tabs">
        <button
          v-for="item in availableKinds"
          :key="item.value || 'ALL'"
          :class="{ active: query.kind === item.value }"
          type="button"
          @click="switchKind(item.value)"
        >
          <IconifyIcon :icon="item.icon" />
          {{ item.label }}
        </button>
      </div>
      <Input.Search
        v-model:value="query.keyword"
        allow-clear
        placeholder="搜索素材名称、类型或来源"
        @search="
          query.pageNo = 1;
          load();
        "
      />
    </div>

    <Spin :spinning="loading">
      <div v-if="rows.length" class="asset-picker-grid">
        <article
          v-for="asset in rows"
          :key="asset.id"
          class="asset-tile"
          :class="{ selected: selected.has(asset.id) }"
        >
          <button
            class="asset-tile__select"
            :aria-pressed="selected.has(asset.id)"
            type="button"
            @click="toggle(asset)"
          >
            <div class="asset-tile__preview">
              <img
                v-if="asset.kind === 'IMAGE' && asset.url"
                :alt="asset.name"
                loading="lazy"
                :src="asset.url"
              />
              <video
                v-else-if="asset.kind === 'VIDEO' && asset.url"
                muted
                playsinline
                preload="metadata"
                :src="asset.url"
              ></video>
              <div v-else class="asset-tile__fallback">
                <IconifyIcon :icon="mediaIcon(asset.kind)" />
                <span>{{ assetKindLabel(asset.kind) }}</span>
              </div>
              <span v-if="selected.has(asset.id)" class="asset-tile__check">
                <IconifyIcon icon="lucide:check" />
              </span>
            </div>
            <div class="asset-tile__body">
              <strong :title="asset.name">{{ asset.name }}</strong>
              <span>{{ asset.projectName || `项目 ${asset.projectId}` }}</span>
              <div>
                <Tag :bordered="false">{{ assetKindLabel(asset.kind) }}</Tag>
                <small>{{ formatBytes(asset.size) }}</small>
              </div>
            </div>
          </button>
          <div
            v-if="asset.kind === 'AUDIO' && asset.url"
            class="asset-tile__audio"
          >
            <audio
              controls
              preload="metadata"
              :src="asset.url"
              @click.stop
              @loadedmetadata="captureAudioDuration(asset, $event)"
            ></audio>
            <small>{{ audioSummary(asset) }}</small>
          </div>
        </article>
      </div>
      <Empty v-else description="没有找到匹配素材" />
    </Spin>

    <div class="asset-picker-footer">
      <span>已选择 {{ selected.size }} 个</span>
      <Pagination
        v-model:current="query.pageNo"
        :page-size="query.pageSize"
        :show-size-changer="false"
        :total="total"
        @change="load"
      />
    </div>
  </Modal>
</template>

<style scoped>
.asset-picker-toolbar,
.asset-picker-footer {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}

.asset-picker-toolbar {
  padding-bottom: 14px;
  border-bottom: 1px solid #edf0f5;
}

.asset-picker-toolbar :deep(.ant-input-search) {
  width: 300px;
}

.kind-tabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  background: #f5f7fa;
  border-radius: 9px;
}

.kind-tabs button {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  padding: 6px 11px;
  font-size: 13px;
  color: #64748b;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 7px;
}

.kind-tabs button.active {
  color: #1668dc;
  background: #fff;
  box-shadow: 0 1px 3px rgb(15 23 42 / 10%);
}

.asset-picker-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  min-height: 386px;
  padding: 16px 0;
}

.asset-tile {
  min-width: 0;
  overflow: hidden;
  text-align: left;
  background: #fff;
  border: 1px solid #e5eaf1;
  border-radius: 10px;
  transition: 150ms ease;
}

.asset-tile__select {
  display: block;
  width: 100%;
  padding: 0;
  color: inherit;
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 0;
}

.asset-tile:hover,
.asset-tile.selected {
  border-color: #69a7ff;
  box-shadow: 0 5px 16px rgb(22 104 220 / 12%);
}

.asset-tile__preview {
  position: relative;
  height: 126px;
  overflow: hidden;
  background: #f2f5f9;
}

.asset-tile__preview img,
.asset-tile__preview video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.asset-tile__fallback {
  display: grid;
  place-content: center;
  height: 100%;
  color: #8491a5;
  text-align: center;
}

.asset-tile__fallback :deep(svg) {
  width: 30px;
  height: 30px;
  margin: 0 auto 5px;
}

.asset-tile__check {
  position: absolute;
  top: 8px;
  right: 8px;
  display: grid;
  place-content: center;
  width: 24px;
  height: 24px;
  color: #fff;
  background: #1677ff;
  border: 2px solid #fff;
  border-radius: 50%;
}

.asset-tile__body {
  display: grid;
  gap: 4px;
  padding: 10px;
}

.asset-tile__body strong,
.asset-tile__body > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.asset-tile__body strong {
  color: #1e293b;
}

.asset-tile__body > span,
.asset-tile__body small {
  font-size: 11px;
  color: #8491a5;
}

.asset-tile__body > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 3px;
}

.asset-tile__audio {
  display: grid;
  gap: 4px;
  padding: 0 9px 9px;
  border-top: 1px solid #edf0f5;
}

.asset-tile__audio audio {
  width: 100%;
  height: 30px;
  margin-top: 7px;
}

.asset-tile__audio small {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 10px;
  color: #8491a5;
  white-space: nowrap;
}

.asset-picker-footer {
  padding-top: 12px;
  color: #64748b;
  border-top: 1px solid #edf0f5;
}

@media (max-width: 800px) {
  .asset-picker-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
