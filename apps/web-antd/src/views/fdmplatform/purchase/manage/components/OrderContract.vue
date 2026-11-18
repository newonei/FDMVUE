<script setup lang="ts">
import type {
  ProcurementFile,
  ProcurementOrderView,
} from '#/api/fdmplatform/procurement';

import { computed, ref, watch } from 'vue';

import { Alert, Button, Select, Space, Tag } from 'ant-design-vue';

import { downloadProcurementFile } from '#/api/fdmplatform/procurement';
import {
  ATTACHMENT_ACCEPT,
  attachmentSize,
  submissionFilesError,
} from '#/api/fdmplatform/submission-files';

import { attachmentTime } from '../../../components/attachment-preview';
import FilePreviewButton from '../../../components/FilePreviewButton.vue';
import { errorText } from '../../../data';
import { downloadBlob } from '../model';
import { procurementFileGroups } from './order-contract-files';

const props = defineProps<{ saving: boolean; view: ProcurementOrderView }>();
const emit = defineEmits<{
  delete: [file: ProcurementFile];
  signed: [file: File, exportId: string];
}>();
const pageError = ref('');
const exportId = ref<string>();
const fileInput = ref<HTMLInputElement>();
const historyOpen = ref(false);
const groups = computed(() =>
  procurementFileGroups(props.view.exports, props.view.files),
);
const latest = computed(() => groups.value.versions[0]);
const visibleVersions = computed(() =>
  historyOpen.value ? groups.value.versions : groups.value.versions.slice(0, 1),
);
const selectedVersion = computed(() =>
  groups.value.versions.find((item) => item.export.id === exportId.value),
);
const kindLabels: Record<string, string> = {
  docx: 'Word',
  pdf: 'PDF',
  xlsx: 'Excel',
};
function format(file: ProcurementFile) {
  const ext = file.name.split('.').at(-1)?.toLowerCase() ?? '';
  return kindLabels[ext] ?? (ext.toUpperCase() || '文件');
}
function deleteBlocked(file: ProcurementFile) {
  return props.view.files.some(
    (item) => item.kind === 'SIGNED' && item.exportId === file.id,
  );
}
watch(
  () => [
    props.view.id,
    groups.value.versions.map((item) => item.export.id).join(','),
  ],
  (_value, previous) => {
    if (
      previous?.[0] !== props.view.id ||
      !selectedVersion.value ||
      exportId.value === previous?.[1]?.split(',')[0]
    )
      exportId.value = latest.value?.export.id;
    pageError.value = '';
  },
  { immediate: true },
);
watch(
  () => props.view.id,
  () => {
    historyOpen.value = false;
  },
);
async function download(file: ProcurementFile) {
  pageError.value = '';
  try {
    downloadBlob(
      await downloadProcurementFile(
        props.view.contractId,
        props.view.id,
        file.id,
      ),
      file.name,
    );
  } catch (error) {
    pageError.value = errorText(error);
  }
}
function upload(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (
    !file ||
    !exportId.value ||
    props.saving ||
    !props.view.storageEnabled ||
    !props.view.allowedActions.includes('UPLOAD_SIGNED')
  )
    return;
  pageError.value = submissionFilesError([file]);
  if (!pageError.value && file.size > 20 * 1024 * 1024)
    pageError.value = '供应商盖章件不能超过 20 MB';
  if (!pageError.value) emit('signed', file, exportId.value);
}
</script>

<template>
  <section class="order-contract-files" aria-label="采购单文件">
    <div class="section-heading">
      <div>
        <h3>采购单文件</h3>
        <p>导出稿自动保留版本，供应商盖章件与对应版本一起归档。</p>
      </div>
      <div
        v-if="view.allowedActions.includes('UPLOAD_SIGNED')"
        class="signed-upload"
      >
        <label v-if="groups.versions.length > 1" class="version-picker">
          <span>盖章件对应</span>
          <Select
            v-model:value="exportId"
            size="small"
            aria-label="盖章件对应的采购单版本"
            :disabled="saving"
            :options="
              groups.versions.map(({ export: file }, index) => ({
                value: file.id,
                label: `V${file.revision ?? '—'} · ${format(file)}${index === 0 ? '（最新）' : ''}`,
              }))
            "
          />
        </label>
        <Button
          type="primary"
          :loading="saving"
          :disabled="!exportId || saving || !view.storageEnabled"
          :title="
            !view.storageEnabled
              ? '文件存储未配置'
              : !exportId
                ? '请先导出采购单'
                : '选择盖章件后直接上传，单个文件不超过 20 MB'
          "
          @click="fileInput?.click()"
        >
          {{
            selectedVersion?.signed.length ? '补传盖章件' : '上传供应商盖章件'
          }}
        </Button>
      </div>
    </div>
    <input
      ref="fileInput"
      type="file"
      hidden
      :accept="ATTACHMENT_ACCEPT"
      aria-label="选择供应商盖章件"
      :disabled="
        saving ||
        !view.storageEnabled ||
        !exportId ||
        !view.allowedActions.includes('UPLOAD_SIGNED')
      "
      @change="upload"
    />
    <Alert v-if="pageError" type="error" :message="pageError" show-icon />
    <div
      v-if="!groups.versions.length && !groups.unlinked.length"
      class="empty-files"
    >
      <strong>还没有采购单文件</strong>
      <p>
        确认下单资料后，点击右上角「导出」生成 PDF 或
        Excel，再上传对应的供应商盖章件。
      </p>
    </div>
    <div
      v-for="(version, index) in visibleVersions"
      :key="version.export.id"
      class="version-group"
    >
      <div class="version-heading">
        <Space :size="6" wrap>
          <strong>导出 V{{ version.export.revision ?? '—' }}</strong>
          <Tag v-if="index === 0" color="blue">最新导出</Tag>
          <span class="muted">
            下单资料第 {{ version.export.detailsRevision ?? '—' }} 版
          </span>
        </Space>
        <Tag :color="version.signed.length ? 'success' : 'default'">
          {{
            version.signed.length
              ? `已回传盖章件 ${version.signed.length} 份`
              : '未回传盖章件'
          }}
        </Tag>
      </div>
      <div
        v-for="file in [version.export, ...version.signed]"
        :key="file.id"
        class="file-row"
      >
        <span class="file-format" :class="{ signed: file.kind === 'SIGNED' }">{{
          format(file)
        }}</span>
        <div class="file-info">
          <span class="file-name" :title="file.name">{{ file.name }}</span>
          <span class="file-meta">
            {{ file.kind === 'SIGNED' ? '供应商盖章件' : '系统导出' }} ·
            {{ attachmentSize(file.size) }} ·
            {{ attachmentTime(file.createdAt) }}
          </span>
        </div>
        <Space :size="0" class="file-actions">
          <FilePreviewButton
            :name="file.name"
            size="small"
            :disabled="saving"
            :load="
              () => downloadProcurementFile(view.contractId, view.id, file.id)
            "
          />
          <Button
            type="link"
            size="small"
            :disabled="saving"
            @click="download(file)"
          >
            下载
          </Button>
          <Button
            v-if="view.allowedActions.includes('DELETE_FILE')"
            type="link"
            size="small"
            danger
            :disabled="saving || deleteBlocked(file)"
            :title="
              deleteBlocked(file) ? '请先删除对应的供应商盖章件' : undefined
            "
            @click="emit('delete', file)"
          >
            删除
          </Button>
        </Space>
      </div>
    </div>
    <div v-if="groups.unlinked.length" class="version-group">
      <div class="version-heading">
        <strong>其他盖章件</strong><span class="muted">未找到对应导出版本</span>
      </div>
      <div v-for="file in groups.unlinked" :key="file.id" class="file-row">
        <span class="file-format signed">{{ format(file) }}</span>
        <div class="file-info">
          <span class="file-name">{{ file.name }}</span>
          <span class="file-meta">
            {{ attachmentSize(file.size) }} ·
            {{ attachmentTime(file.createdAt) }}
          </span>
        </div>
        <Space :size="0" class="file-actions">
          <FilePreviewButton
            :name="file.name"
            size="small"
            :disabled="saving"
            :load="
              () => downloadProcurementFile(view.contractId, view.id, file.id)
            "
          />
          <Button
            type="link"
            size="small"
            :disabled="saving"
            @click="download(file)"
          >
            下载
          </Button>
          <Button
            v-if="view.allowedActions.includes('DELETE_FILE')"
            type="link"
            size="small"
            danger
            :disabled="saving"
            @click="emit('delete', file)"
          >
            删除
          </Button>
        </Space>
      </div>
    </div>
    <Button
      v-if="groups.versions.length > 1"
      class="history-toggle"
      type="link"
      size="small"
      :aria-expanded="historyOpen"
      @click="historyOpen = !historyOpen"
    >
      {{
        historyOpen
          ? '收起历史导出'
          : `展开历史导出（${groups.versions.length - 1}）`
      }}
    </Button>
  </section>
</template>

<style scoped>
.order-contract-files {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
}

.section-heading,
.version-heading {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}

.section-heading h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.section-heading p,
.empty-files p {
  margin: 4px 0 0;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.signed-upload,
.version-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.version-picker {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.version-picker :deep(.ant-select) {
  min-width: 155px;
}

.version-group {
  overflow: hidden;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.version-heading {
  padding: 10px 12px;
  background: hsl(var(--muted) / 45%);
}

.version-heading :deep(.ant-tag) {
  margin-inline-end: 0;
}

.muted,
.file-meta {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.file-row {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 12px;
}

.file-row + .file-row {
  border-top: 1px solid hsl(var(--border));
}

.file-format {
  display: flex;
  flex: 0 0 44px;
  align-items: center;
  justify-content: center;
  height: 44px;
  font-size: 11px;
  font-weight: 600;
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 8%);
  border-radius: 8px;
}

.file-format.signed {
  color: hsl(var(--success));
  background: hsl(var(--success) / 8%);
}

.file-info {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.file-name {
  font-size: 13px;
  overflow-wrap: anywhere;
}

.file-actions {
  flex-shrink: 0;
}

.empty-files {
  padding: 20px 12px;
  text-align: center;
  background: hsl(var(--muted) / 35%);
  border-radius: 8px;
}

.history-toggle {
  align-self: flex-start;
}

@media (max-width: 680px) {
  .file-row {
    flex-wrap: wrap;
  }

  .file-actions {
    margin-left: 56px;
  }

  .file-info {
    flex-basis: calc(100% - 56px);
  }
}
</style>
