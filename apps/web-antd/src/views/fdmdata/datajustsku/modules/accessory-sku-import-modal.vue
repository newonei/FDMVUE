<script lang="ts" setup>
import type { UploadFile } from 'ant-design-vue/es/upload/interface';

import { computed, ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';
import { Button, message, Upload } from 'ant-design-vue';

import { importAccessorySkuExcel } from '#/api/fdmdata/datajustaccessory';

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
      const res = await importAccessorySkuExcel(file);
      await modalApi.close();
      emit('success');
      message.success(
        `导入完成：读取 ${res.total} 行；新增 ${res.created}；更新 ${res.updated}；跳过 ${res.skipped}（非配件行或无效行已跳过）。导入行同步状态已置为「已同步」。`,
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
</script>

<template>
  <Modal
    title="配件列表导入（聚水潭导出）"
    class="w-[520px] max-w-[calc(100vw-2rem)]"
    :confirm-disabled="!selectedFile || submitting"
    confirm-text="开始导入"
  >
    <div class="space-y-2 px-1 text-sm text-muted-foreground">
      <div>
        表头与空白版导入一致（含：图片、款式编码、商品编码、商品名称、颜色及规格、颜色、规格、成本价、其它属性、长宽高重等）。中间多列（库存、售价等）会自动忽略。
      </div>
      <div>
        仅<strong>款式编码以「配件-」开头</strong>的行会写入配件列表；其它行计入跳过。
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
