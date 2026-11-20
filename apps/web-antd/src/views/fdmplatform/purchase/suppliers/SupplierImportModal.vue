<script setup lang="ts">
import type { SupplierImportResult } from '#/api/fdmplatform/supplier-import';

import { ref, watch } from 'vue';

import { downloadFileFromBlobPart } from '@vben/utils';

import { Alert, Button, Modal, Upload } from 'ant-design-vue';

import {
  downloadSupplierImportTemplate,
  importSuppliers,
} from '#/api/fdmplatform/supplier-import';

import { errorText } from '../../data';

const emit = defineEmits<{ changed: [] }>();
const open = defineModel<boolean>('open', { required: true });
const selectedFile = ref<File>();
const result = ref<SupplierImportResult>();
const panelError = ref('');
const downloading = ref(false);
const submitting = ref(false);

watch(open, (isOpen) => {
  if (isOpen) {
    selectedFile.value = undefined;
    result.value = undefined;
    panelError.value = '';
  }
});

function chooseFile(file: File) {
  if (submitting.value || downloading.value) return false;
  selectedFile.value = undefined;
  result.value = undefined;
  panelError.value = '';
  if (!/\.xlsx?$/i.test(file.name)) {
    panelError.value = '请选择 .xls 或 .xlsx 文件';
  } else if (file.size > 10 * 1024 * 1024) {
    panelError.value = '文件不能超过 10 MB';
  } else {
    selectedFile.value = file;
  }
  return false;
}

async function downloadTemplate() {
  if (downloading.value || submitting.value) return;
  downloading.value = true;
  panelError.value = '';
  try {
    const source = await downloadSupplierImportTemplate();
    downloadFileFromBlobPart({ fileName: '供应商导入模板.xlsx', source });
  } catch (error) {
    panelError.value = errorText(error);
  } finally {
    downloading.value = false;
  }
}

async function submit() {
  if (
    !selectedFile.value ||
    submitting.value ||
    downloading.value ||
    result.value
  )
    return;
  panelError.value = '';
  submitting.value = true;
  try {
    result.value = await importSuppliers(selectedFile.value);
    if (result.value.createdCount > 0 || result.value.updatedCount > 0)
      emit('changed');
  } catch (error) {
    panelError.value = errorText(error);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <Modal
    :open="open"
    title="导入供应商"
    ok-text="导入"
    :cancel-text="result ? '关闭' : '取消'"
    :confirm-loading="submitting"
    :ok-button-props="{ disabled: !selectedFile || !!result || downloading }"
    :cancel-button-props="{ disabled: submitting || downloading }"
    :closable="!submitting && !downloading"
    :keyboard="!submitting && !downloading"
    :mask-closable="false"
    @ok="submit"
    @cancel="!submitting && !downloading && (open = false)"
  >
    <div class="space-y-3">
      <Alert type="info" show-icon>
        <template #message>
          <p>供应商编码必填，新增时还须填写名称，状态留空默认启用。</p>
          <p>已有供应商只补空白资料，不覆盖原档或更换已有默认联系人。</p>
          <p>未设默认时，将符合条件的联系人设为工厂默认联系人。</p>
          <p>地址和付款信息保存到「供应商资料及备注」。</p>
          <p>
            每次最多 500 个非空数据行，支持 .xls / .xlsx，文件不超过 10 MB。
          </p>
        </template>
      </Alert>
      <div class="flex flex-wrap items-center gap-2">
        <Button
          :loading="downloading"
          :disabled="submitting"
          @click="downloadTemplate"
        >
          下载导入模板
        </Button>
        <Upload
          accept=".xls,.xlsx"
          :before-upload="chooseFile"
          :disabled="submitting || downloading"
          :show-upload-list="false"
        >
          <Button :disabled="submitting || downloading">
            {{ selectedFile ? '更换 Excel 文件' : '选择 Excel 文件' }}
          </Button>
        </Upload>
      </div>
      <p v-if="selectedFile" class="break-all text-sm">
        已选择：{{ selectedFile.name }}
      </p>
      <Alert v-if="panelError" :message="panelError" type="error" show-icon />
      <template v-if="result">
        <p class="font-medium" role="status">
          导入完成：新增 {{ result.createdCount }}，补充
          {{ result.updatedCount }}，跳过 {{ result.skippedCount }}，失败
          {{ result.failedCount }}
        </p>
        <ul
          v-if="result.issues.length"
          class="max-h-60 space-y-1 overflow-y-auto break-words rounded border p-2"
          aria-label="跳过和失败明细"
          tabindex="0"
        >
          <li v-for="(issue, index) in result.issues" :key="index">
            第 {{ issue.row }} 行{{ issue.code ? ` · ${issue.code}` : '' }}：{{
              issue.message
            }}
          </li>
        </ul>
      </template>
    </div>
  </Modal>
</template>
