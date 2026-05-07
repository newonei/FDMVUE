<script lang="ts" setup>
import type { FileType } from 'ant-design-vue/es/upload/interface';

import { useVbenModal } from '@vben/common-ui';
import { Button, message, Upload } from 'ant-design-vue';

import { importAccessorySkuExcel } from '#/api/fdmdata/datajustaccessory';

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
      const res = await importAccessorySkuExcel(selectedFile);
      await modalApi.close();
      emit('success');
      message.success(
        `导入完成：读取 ${res.total} 行；新增 ${res.created}；更新 ${res.updated}；跳过 ${res.skipped}（非配件行或无效行已跳过）。导入行同步状态已置为「已同步」。`,
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
  <Modal title="配件列表导入（聚水潭导出）" class="w-[520px] max-w-[calc(100vw-2rem)]">
    <div class="space-y-2 px-1 text-sm text-muted-foreground">
      <div>
        表头与空白版导入一致（含：图片、款式编码、商品编码、商品名称、颜色及规格、颜色、规格、成本价、其它属性、长宽高重等）。中间多列（库存、售价等）会自动忽略。
      </div>
      <div>
        仅<strong>款式编码以「配件-」开头</strong>的行会写入配件列表；其它行计入跳过。
      </div>
      <Upload :max-count="1" accept=".xls,.xlsx" :before-upload="beforeUpload">
        <Button type="primary">选择 Excel 文件</Button>
      </Upload>
    </div>
  </Modal>
</template>
