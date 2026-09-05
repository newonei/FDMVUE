<script lang="ts" setup>
import type { UploadFile } from 'ant-design-vue/es/upload/interface';

import { computed, ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';
import { Button, message, Upload } from 'ant-design-vue';

import { importBlankCostExcel } from '#/api/fdmdata/datajustsku';

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
      const res = await importBlankCostExcel(file);
      await modalApi.close();
      emit('success');
      message.success(
        `导入完成：读取 ${res.total} 行；新增 ${res.created}；更新 ${res.updated}；跳过 ${res.skipped}`,
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
    title="空白版列表导入（成本对照）"
    class="w-[520px] max-w-[calc(100vw-2rem)]"
    :confirm-disabled="!selectedFile || submitting"
    confirm-text="开始导入"
  >
    <div class="space-y-2 px-1">
      <div class="text-sm text-muted-foreground">
        读取聚水潭导出表中的<strong>商品编码</strong>、<strong>规格</strong>、<strong>成本价</strong>、<strong>重量</strong>、
        <strong>长/宽/高</strong>，按「材质+类型+规格」写入<strong
          >空白版 SKU 成本对照维护</strong
        >。
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
