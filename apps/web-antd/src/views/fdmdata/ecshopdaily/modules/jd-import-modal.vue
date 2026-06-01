<script lang="ts" setup>
import type { FileType } from 'ant-design-vue/es/upload/interface';

import { ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import { Button, Input, message, Upload } from 'ant-design-vue';

import { importJdEcShopDailyExcel } from '#/api/fdmdata/ecshopdaily';

defineOptions({ name: 'EcShopDailyJdImportModal' });

const emit = defineEmits(['success']);

const shopId = ref('');
let selectedFile: File | null = null;

const [Modal, modalApi] = useVbenModal({
  async onConfirm() {
    const id = shopId.value.trim();
    if (!id) {
      message.warning('请输入店铺ID');
      return;
    }
    if (!selectedFile) {
      message.warning('请选择 Excel 文件');
      return;
    }
    modalApi.lock();
    try {
      const res = await importJdEcShopDailyExcel(selectedFile, id);
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
      shopId.value = '';
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
  <Modal title="京东 Excel 导入" class="w-[560px] max-w-[calc(100vw-2rem)]">
    <div class="space-y-3 px-1">
      <div>
        <div class="mb-1 text-sm font-medium">店铺ID</div>
        <Input v-model:value="shopId" allow-clear placeholder="请输入店铺ID" />
      </div>
      <div>
        <div class="mb-1 text-sm font-medium">京东商智 Excel 文件</div>
        <Upload
          :before-upload="beforeUpload"
          :max-count="1"
          accept=".xls,.xlsx"
        >
          <Button type="primary">
            <template #icon>
              <IconifyIcon icon="lucide:upload" />
            </template>
            选择 Excel 文件
          </Button>
        </Upload>
      </div>
    </div>
  </Modal>
</template>
