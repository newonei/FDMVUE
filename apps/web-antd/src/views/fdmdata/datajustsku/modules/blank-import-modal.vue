<script lang="ts" setup>
import type { FileType } from 'ant-design-vue/es/upload/interface';

import { useVbenModal } from '@vben/common-ui';
import { Button, message, Upload } from 'ant-design-vue';

import { importBlankCostExcel } from '#/api/fdmdata/datajustsku';

const emit = defineEmits(['success']);

let selectedFile: File | null = null;

const [Modal, modalApi] = useVbenModal({
  async onConfirm() {
    if (!selectedFile) {
      message.warning('请选择 Excel 文件');
      return;
    }
    modalApi.lock();
    try {
      const res = await importBlankCostExcel(selectedFile);
      await modalApi.close();
      emit('success');
      message.success(
        `导入完成：读取 ${res.total} 行；新增 ${res.created}；更新 ${res.updated}；跳过 ${res.skipped}`,
      );
    } finally {
      modalApi.unlock();
    }
  },
  onOpenChange(isOpen: boolean) {
    if (!isOpen) {
      selectedFile = null;
    }
  },
});

function beforeUpload(file: FileType) {
  selectedFile = file as File;
  return false;
}
</script>

<template>
  <Modal title="空白版列表导入（成本对照）" class="w-[520px] max-w-[calc(100vw-2rem)]">
    <div class="space-y-2 px-1">
      <div class="text-sm text-muted-foreground">
        读取聚水潭导出表中的<strong>商品编码</strong>、<strong>规格</strong>、<strong>成本价</strong>、<strong>重量</strong>、
        <strong>长/宽/高</strong>，按「材质+类型+规格」写入<strong>空白版 SKU 成本对照维护</strong>。
      </div>
      <Upload :max-count="1" accept=".xls,.xlsx" :before-upload="beforeUpload">
        <Button type="primary">选择 Excel 文件</Button>
      </Upload>
    </div>
  </Modal>
</template>

