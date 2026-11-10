<script lang="ts" setup>
import type { UploadFile } from 'ant-design-vue/es/upload/interface';

import { computed, ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { downloadFileFromBlobPart } from '@vben/utils';
import { Button, message, Upload } from 'ant-design-vue';

import { downloadBlankSkuImportTemplate, importBlankSkuExcel } from '#/api/fdmdata/datajustsku';

const emit = defineEmits(['success']);

const fileList = ref<UploadFile[]>([]);
const selectedFile = computed(() => fileList.value[0]?.originFileObj ?? null);
const submitting = ref(false);

const [Modal, modalApi] = useVbenModal({
  async onConfirm() {
    if (submitting.value) return;
    const file = selectedFile.value;
    if (!file) {
      message.warning('请选择 Excel 文件');
      return;
    }
    submitting.value = true;
    modalApi.lock();
    try {
      const res = await importBlankSkuExcel(file);
      await modalApi.close();
      emit('success');
      message.success(
        `导入完成：读取 ${res.total} 行；新增 ${res.created}；更新 ${res.updated}；跳过 ${res.skipped}。导入行同步状态已置为“已同步”。`,
      );
    } finally {
      submitting.value = false;
      modalApi.unlock();
    }
  },
  onOpenChange(isOpen: boolean) {
    if (!isOpen) {
      fileList.value = [];
    }
  },
});

function beforeUpload() {
  return false;
}

async function downloadTemplate() {
  const data = await downloadBlankSkuImportTemplate();
  downloadFileFromBlobPart({ fileName: '空白版导入模板.xlsx', source: data });
}
</script>

<template>
  <Modal
    title="空白版列表导入（主表）"
    class="w-[520px] max-w-[calc(100vw-2rem)]"
    :confirm-disabled="!selectedFile || submitting"
    confirm-text="开始导入"
  >
    <div class="space-y-2 px-1 text-sm text-muted-foreground">
      <div>
        从聚水潭导出表导入空白版 SKU
        主数据，按<strong>商品编码</strong>(itemCode) 新增/更新到空白版列表。
      </div>
      <div>
        导入成功的行将把<strong>聚水潭同步状态</strong>设置为<strong>已同步</strong>（不要求填
        jstSkuId）。
      </div>
      <div>
        <Button type="link" size="small" class="!px-0" @click="downloadTemplate">
          <template #icon><IconifyIcon icon="lucide:file-down" /></template>
          下载导入模板
        </Button>
      </div>
      <Upload
        v-model:file-list="fileList"
        :max-count="1"
        accept=".xls,.xlsx"
        :before-upload="beforeUpload"
        :disabled="submitting"
      >
        <Button type="primary">选择 Excel 文件</Button>
      </Upload>
    </div>
  </Modal>
</template>
