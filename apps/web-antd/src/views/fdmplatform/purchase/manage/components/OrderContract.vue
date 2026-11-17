<script setup lang="ts">
import type {
  ProcurementFile,
  ProcurementOrderView,
} from '#/api/fdmplatform/procurement';

import { computed, ref, watch } from 'vue';

import { formatDateTime } from '@vben/utils';

import { Alert, Button, Card, Select, Space, Table } from 'ant-design-vue';

import { downloadProcurementFile } from '#/api/fdmplatform/procurement';
import { ATTACHMENT_ACCEPT } from '#/api/fdmplatform/submission-files';

import FilePreviewButton from '../../../components/FilePreviewButton.vue';
import { errorText } from '../../../data';
import { downloadBlob } from '../model';

/**
 * 采购单导出记录与供应商盖章件（放在「附件」页签）。导出本身在采购单右上角「导出」，
 * 每次导出（PDF / Excel）都存一版；盖章件上传时对应其中一版。
 */
const props = defineProps<{ saving: boolean; view: ProcurementOrderView }>();
const emit = defineEmits<{
  delete: [file: ProcurementFile];
  signed: [file: File, exportId: string];
}>();
const pageError = ref('');
const exportId = ref<string>();
const fileInput = ref<HTMLInputElement>();
const signed = computed(() =>
  props.view.files.some((file) => file.kind === 'SIGNED'),
);
const kindLabels: Record<string, string> = {
  docx: '采购单 Word',
  pdf: '采购单 PDF',
  xlsx: '采购单 Excel',
};
function kindLabel(file: ProcurementFile) {
  if (file.kind === 'SIGNED') return '供应商盖章件';
  const ext = file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase();
  return kindLabels[ext] ?? '采购单';
}
function deleteBlocked(file: ProcurementFile) {
  return props.view.files.some(
    (item) => item.kind === 'SIGNED' && item.exportId === file.id,
  );
}
// 盖章件几乎总是对应最新导出的那一版
watch(
  () => props.view.exports.map((file) => file.id).join(','),
  () => {
    exportId.value = props.view.exports.at(-1)?.id;
  },
  { immediate: true },
);
async function download(file: ProcurementFile) {
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
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file && exportId.value) emit('signed', file, exportId.value);
  if (fileInput.value) fileInput.value.value = '';
}
</script>
<template>
  <Card title="采购单导出与盖章件" size="small">
    <template #extra>
      <Space v-if="view.allowedActions.includes('UPLOAD_SIGNED')" wrap>
        <Select
          v-if="view.exports.length > 1"
          v-model:value="exportId"
          size="small"
          :options="
            view.exports.map((file) => ({
              value: file.id,
              label: `对应第${file.revision ?? ''}版 · ${kindLabel(file)}`,
            }))
          "
          style="width: 200px"
        /><Button
          size="small"
          :disabled="!exportId || saving || !view.storageEnabled"
          :title="view.storageEnabled ? undefined : '文件存储未配置'"
          @click="fileInput?.click()"
        >
          {{ signed ? '再传一份盖章件' : '上传供应商盖章件' }}
        </Button>
      </Space>
      <input
        ref="fileInput"
        type="file"
        hidden
        :accept="ATTACHMENT_ACCEPT"
        @change="upload"
      />
    </template>
    <Alert v-if="pageError" type="error" :message="pageError" />
    <Table
      :data-source="view.files"
      row-key="id"
      size="small"
      :pagination="false"
      :columns="[
        { title: '文件', dataIndex: 'name' },
        { title: '类型', key: 'kind' },
        { title: '版本', dataIndex: 'revision' },
        { title: '资料修订版', dataIndex: 'detailsRevision' },
        { title: '时间', key: 'createdAt', dataIndex: 'createdAt' },
        { title: '操作', key: 'action', width: 190, fixed: 'right' as const },
      ]"
      :scroll="{ x: 900 }"
    >
      <template #emptyText>
        还没有导出过。确认下单资料后，在右上角「导出」选择 PDF 或 Excel。
      </template>
      <template #bodyCell="{ column, record }">
        <span v-if="column.key === 'kind'">{{
          kindLabel(record as ProcurementFile)
        }}</span><span v-else-if="column.key === 'createdAt'">{{
          formatDateTime(record.createdAt) || '—'
        }}</span><Space v-else-if="column.key === 'action'" :size="0">
          <FilePreviewButton
            :name="record.name"
            size="small"
            :disabled="saving"
            :load="
              () => downloadProcurementFile(view.contractId, view.id, record.id)
            "
          />
          <Button
            type="link"
            size="small"
            :disabled="saving"
            @click="download(record as ProcurementFile)"
          >
            下载
          </Button>
          <Button
            v-if="view.allowedActions.includes('DELETE_FILE')"
            type="link"
            size="small"
            danger
            :disabled="saving || deleteBlocked(record as ProcurementFile)"
            :title="
              deleteBlocked(record as ProcurementFile)
                ? '请先删除对应的供应商盖章件'
                : undefined
            "
            @click="emit('delete', record as ProcurementFile)"
          >
            删除
          </Button>
        </Space>
      </template>
    </Table>
  </Card>
</template>
