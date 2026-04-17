<script lang="ts" setup>
import type { FileType } from 'ant-design-vue/es/upload/interface';

import { useVbenModal } from '@vben/common-ui';
import { Button, message, Upload } from 'ant-design-vue';

import { importBlankSkuExcel } from '#/api/fdmdata/datajustsku';

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
      const res = await importBlankSkuExcel(selectedFile);
      await modalApi.close();
      emit('success');
      message.success(
        `导入完成：读取 ${res.total} 行；新增 ${res.created}；更新 ${res.updated}；跳过 ${res.skipped}。导入行同步状态已置为“已同步”。`,
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
  <Modal title="空白版列表导入（主表）" class="w-[520px] max-w-[calc(100vw-2rem)]">
    <div class="space-y-2 px-1 text-sm text-muted-foreground">
      <div>
        从聚水潭导出表导入空白版 SKU 主数据，按<strong>商品编码</strong>(itemCode) 新增/更新到空白版列表。
      </div>
      <div>
        导入成功的行将把<strong>聚水潭同步状态</strong>设置为<strong>已同步</strong>（不要求填 jstSkuId）。
      </div>
      <Upload :max-count="1" accept=".xls,.xlsx" :before-upload="beforeUpload">
        <Button type="primary">选择 Excel 文件</Button>
      </Upload>
    </div>
  </Modal>
</template>

