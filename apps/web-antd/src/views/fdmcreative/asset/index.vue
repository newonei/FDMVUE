<script lang="ts" setup>
import type { FdmCreativeApi } from '#/api/fdmcreative';

import { computed, onMounted, reactive, ref } from 'vue';

import { IconifyIcon } from '@vben/icons';
import { formatDateTime } from '@vben/utils';

import {
  Button,
  Empty,
  Input,
  message,
  Modal,
  Pagination,
  Popconfirm,
  Select,
  Spin,
  Tag,
} from 'ant-design-vue';

import {
  createCreativeAsset,
  deleteCreativeAsset,
  getCreativeAssetPage,
  getCreativeProjectPage,
} from '#/api/fdmcreative';
import { uploadFdmObject } from '#/api/fdmstorage/object';

import CreativeShell from '../shared/CreativeShell.vue';
import { ASSET_KIND_OPTIONS, assetKindLabel } from '../shared/library-options';

defineOptions({ name: 'FdmCreativeAssets' });

const loading = ref(false);
const uploading = ref(false);
const uploadOpen = ref(false);
const rows = ref<FdmCreativeApi.CreativeAsset[]>([]);
const projects = ref<FdmCreativeApi.Project[]>([]);
const total = ref(0);
const selectedFile = ref<File>();
const fileInput = ref<HTMLInputElement>();
const query = reactive({
  keyword: '',
  kind: '' as '' | FdmCreativeApi.CreativeAsset['kind'],
  pageNo: 1,
  pageSize: 24,
  projectId: undefined as number | undefined,
});
const uploadForm = reactive({ projectId: undefined as number | undefined });

const projectOptions = computed(() =>
  projects.value.map((project) => ({ label: project.name, value: project.id })),
);
const editableProjectOptions = computed(() =>
  projects.value
    .filter((project) => ['EDITOR', 'OWNER'].includes(project.currentUserRole))
    .map((project) => ({ label: project.name, value: project.id })),
);

const projectById = computed(
  () => new Map(projects.value.map((project) => [project.id, project])),
);

async function load() {
  loading.value = true;
  try {
    const data = await getCreativeAssetPage({
      keyword: query.keyword.trim() || undefined,
      kind: query.kind || undefined,
      kinds: query.kind ? undefined : ['IMAGE', 'VIDEO', 'AUDIO'],
      pageNo: query.pageNo,
      pageSize: query.pageSize,
      projectId: query.projectId,
    });
    rows.value = data.list;
    total.value = data.total;
  } finally {
    loading.value = false;
  }
}

async function loadProjects() {
  const data = await getCreativeProjectPage({ pageNo: 1, pageSize: 100 });
  projects.value = data.list;
}

function switchKind(kind: '' | FdmCreativeApi.CreativeAsset['kind']) {
  query.kind = kind;
  query.pageNo = 1;
  void load();
}

function showUpload() {
  if (editableProjectOptions.value.length === 0) {
    message.warning('当前没有可编辑的画布项目，请先创建项目或申请编辑权限');
    return;
  }
  selectedFile.value = undefined;
  uploadForm.projectId = editableProjectOptions.value.some(
    (item) => item.value === query.projectId,
  )
    ? query.projectId
    : editableProjectOptions.value[0]?.value;
  uploadOpen.value = true;
}

function chooseFile() {
  fileInput.value?.click();
}

function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  selectedFile.value = input.files?.[0];
  input.value = '';
}

function inferKind(
  file: File,
): FdmCreativeApi.CreativeAsset['kind'] | undefined {
  if (file.type.startsWith('image/')) return 'IMAGE';
  if (file.type.startsWith('video/')) return 'VIDEO';
  if (file.type.startsWith('audio/')) return 'AUDIO';
  return undefined;
}

function uploadedUrl(result: unknown) {
  if (typeof result === 'string') return result;
  if (!result || typeof result !== 'object') return undefined;
  const response = result as Record<string, unknown>;
  if (typeof response.url === 'string') return response.url;
  if (typeof response.data === 'string') return response.data;
  return undefined;
}

async function submitUpload() {
  const file = selectedFile.value;
  const projectId = uploadForm.projectId;
  if (!projectId) {
    message.warning('请选择素材所属项目');
    return;
  }
  if (!file) {
    message.warning('请选择图片、视频或音频文件');
    return;
  }
  const kind = inferKind(file);
  if (!kind) {
    message.error('仅支持图片、视频和音频文件');
    return;
  }
  uploading.value = true;
  try {
    const response = await uploadFdmObject({
      directory: `fdmcreative/${projectId}/uploads`,
      file,
    });
    const url = uploadedUrl(response);
    if (!url) throw new Error('文件服务未返回可用 URL');
    await createCreativeAsset({ kind, name: file.name, projectId, url });
    uploadOpen.value = false;
    message.success('素材已加入资产库');
    query.projectId = projectId;
    query.kind = kind;
    query.pageNo = 1;
    await load();
  } finally {
    uploading.value = false;
  }
}

function canDelete(asset: FdmCreativeApi.CreativeAsset) {
  const role = projectById.value.get(asset.projectId)?.currentUserRole;
  return role === 'OWNER' || role === 'EDITOR';
}

async function remove(id: number) {
  await deleteCreativeAsset(id);
  message.success('素材已删除');
  await load();
}

function mediaIcon(kind: FdmCreativeApi.CreativeAsset['kind']) {
  return kind === 'AUDIO'
    ? 'lucide:audio-lines'
    : kind === 'VIDEO'
      ? 'lucide:film'
      : 'lucide:file';
}

function formatBytes(size?: number) {
  if (!size) return '—';
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

onMounted(async () => {
  await Promise.all([loadProjects(), load()]);
});
</script>

<template>
  <CreativeShell
    description="统一搜索和复用画布上传、模型生成的图片、视频与音频"
    title="资产库"
  >
    <template #actions>
      <Button
        v-access:code="['fdmcreative:asset:create']"
        type="primary"
        @click="showUpload"
      >
        <IconifyIcon icon="lucide:upload" />
        上传素材
      </Button>
    </template>

    <section class="asset-library">
      <header class="asset-toolbar">
        <div class="kind-tabs">
          <button
            v-for="item in ASSET_KIND_OPTIONS"
            :key="item.value || 'ALL'"
            :class="{ active: query.kind === item.value }"
            type="button"
            @click="switchKind(item.value)"
          >
            <IconifyIcon :icon="item.icon" />
            {{ item.label }}
          </button>
        </div>
        <div class="asset-search">
          <Select
            v-model:value="query.projectId"
            allow-clear
            :options="projectOptions"
            placeholder="全部项目"
            show-search
            @change="
              query.pageNo = 1;
              load();
            "
          />
          <Input.Search
            v-model:value="query.keyword"
            allow-clear
            placeholder="搜索素材名称、格式或来源"
            @search="
              query.pageNo = 1;
              load();
            "
          />
        </div>
      </header>

      <Spin :spinning="loading">
        <div v-if="rows.length" class="asset-grid">
          <article v-for="asset in rows" :key="asset.id" class="asset-card">
            <div class="asset-preview">
              <img
                v-if="asset.kind === 'IMAGE' && asset.url"
                :alt="asset.name"
                loading="lazy"
                :src="asset.url"
              />
              <video
                v-else-if="asset.kind === 'VIDEO' && asset.url"
                controls
                playsinline
                preload="metadata"
                :src="asset.url"
              ></video>
              <div v-else class="asset-fallback">
                <IconifyIcon :icon="mediaIcon(asset.kind)" />
                <audio
                  v-if="asset.kind === 'AUDIO' && asset.url"
                  controls
                  preload="none"
                  :src="asset.url"
                ></audio>
              </div>
              <Tag class="asset-kind" color="blue">
                {{ assetKindLabel(asset.kind) }}
              </Tag>
            </div>
            <div class="asset-info">
              <strong :title="asset.name">{{ asset.name }}</strong>
              <span>{{ asset.projectName || `项目 ${asset.projectId}` }}</span>
              <div class="asset-meta">
                <span>{{ formatBytes(asset.size) }}</span>
                <span>{{
                  asset.updateTime ? formatDateTime(asset.updateTime) : '—'
                }}</span>
              </div>
            </div>
            <footer>
              <Button
                v-if="asset.url"
                size="small"
                type="link"
                :href="asset.url"
                target="_blank"
              >
                查看原文件
              </Button>
              <Popconfirm
                v-if="canDelete(asset)"
                title="确定删除这个素材吗？"
                @confirm="remove(asset.id)"
              >
                <Button
                  v-access:code="['fdmcreative:asset:delete']"
                  danger
                  size="small"
                  type="link"
                >
                  删除
                </Button>
              </Popconfirm>
            </footer>
          </article>
        </div>
        <Empty v-else class="asset-empty" description="暂无匹配素材" />
      </Spin>

      <footer class="library-pagination">
        <span>共 {{ total }} 个素材</span>
        <Pagination
          v-model:current="query.pageNo"
          v-model:page-size="query.pageSize"
          show-size-changer
          :page-size-options="['12', '24', '48']"
          :total="total"
          @change="load"
          @show-size-change="
            query.pageNo = 1;
            load();
          "
        />
      </footer>
    </section>

    <Modal
      v-model:open="uploadOpen"
      :confirm-loading="uploading"
      ok-text="上传并加入资产库"
      title="上传素材"
      @ok="submitUpload"
    >
      <div class="upload-form">
        <label>
          <span>所属项目</span>
          <Select
            v-model:value="uploadForm.projectId"
            :options="editableProjectOptions"
            placeholder="请选择项目"
            show-search
          />
        </label>
        <button class="file-drop" type="button" @click="chooseFile">
          <IconifyIcon icon="lucide:cloud-upload" />
          <strong>{{
            selectedFile?.name || '点击选择图片、视频或音频'
          }}</strong>
          <span v-if="selectedFile">{{ formatBytes(selectedFile.size) }}</span>
          <span v-else>上传后会进入所选项目，并可在所有素材节点中复用</span>
        </button>
        <input
          ref="fileInput"
          accept="image/*,video/*,audio/*"
          hidden
          type="file"
          @change="handleFileChange"
        />
      </div>
    </Modal>
  </CreativeShell>
</template>

<style scoped>
.asset-library {
  min-height: 0;
  padding: 14px;
  background: #fff;
  border: 1px solid #e7edf5;
  border-radius: 12px;
}

.asset-toolbar,
.library-pagination,
.asset-meta,
.asset-card footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.asset-toolbar {
  gap: 16px;
  padding-bottom: 14px;
  border-bottom: 1px solid #edf1f6;
}

.kind-tabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  background: #f5f7fa;
  border-radius: 9px;
}

.kind-tabs button {
  display: flex;
  gap: 6px;
  align-items: center;
  padding: 7px 14px;
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

.asset-search {
  display: flex;
  gap: 8px;
}

.asset-search :deep(.ant-select) {
  width: 180px;
}

.asset-search :deep(.ant-input-search) {
  width: 300px;
}

.asset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 12px;
  min-height: 440px;
  padding: 16px 0;
}

.asset-card {
  min-width: 0;
  overflow: hidden;
  background: #fff;
  border: 1px solid #e5eaf1;
  border-radius: 10px;
  transition: 150ms ease;
}

.asset-card:hover {
  border-color: #9bc3ff;
  box-shadow: 0 7px 20px rgb(30 64 175 / 9%);
  transform: translateY(-1px);
}

.asset-preview {
  position: relative;
  height: 152px;
  overflow: hidden;
  background: #f1f4f8;
}

.asset-preview img,
.asset-preview video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.asset-fallback {
  display: grid;
  gap: 14px;
  place-content: center;
  height: 100%;
  padding: 20px;
  color: #7c8ba1;
}

.asset-fallback > :deep(svg) {
  width: 36px;
  height: 36px;
  margin: auto;
}

.asset-fallback audio {
  width: 180px;
  height: 36px;
}

.asset-kind {
  position: absolute;
  top: 8px;
  left: 8px;
}

.asset-info {
  display: grid;
  gap: 5px;
  padding: 11px 12px 8px;
}

.asset-info strong,
.asset-info > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.asset-info > span,
.asset-meta {
  font-size: 11px;
  color: #8491a5;
}

.asset-card footer {
  min-height: 38px;
  padding: 2px 7px;
  border-top: 1px solid #edf1f6;
}

.asset-empty {
  min-height: 460px;
  padding-top: 160px;
}

.library-pagination {
  padding-top: 13px;
  color: #64748b;
  border-top: 1px solid #edf1f6;
}

.upload-form,
.upload-form label {
  display: grid;
  gap: 9px;
}

.upload-form label > span {
  font-weight: 600;
  color: #334155;
}

.file-drop {
  display: grid;
  gap: 8px;
  place-content: center;
  min-height: 180px;
  margin-top: 12px;
  color: #64748b;
  cursor: pointer;
  background: #f8fbff;
  border: 1px dashed #9bc3ff;
  border-radius: 10px;
}

.file-drop :deep(svg) {
  width: 36px;
  height: 36px;
  margin: auto;
  color: #1677ff;
}

.file-drop strong {
  color: #1e293b;
}

@media (max-width: 900px) {
  .asset-toolbar {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
