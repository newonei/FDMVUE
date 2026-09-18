<script lang="ts" setup>
import type { UploadFile } from 'ant-design-vue/es/upload/interface';

import { computed, ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import { Button, Input, message, Upload } from 'ant-design-vue';

import { importDouyinEcShopDailyExcel } from '#/api/fdmdata/ecshopdaily';

defineOptions({ name: 'EcShopDailyDouyinImportModal' });

const emit = defineEmits(['success']);

const shopId = ref('');
const fileList = ref<UploadFile[]>([]);
const selectedFile = computed(() => fileList.value[0]?.originFileObj ?? null);
const submitting = ref(false);

const [Modal, modalApi] = useVbenModal({
  async onConfirm() {
    if (submitting.value) return;
    const file = selectedFile.value;
    const id = shopId.value.trim();
    if (!id) {
      message.warning('请输入店铺ID');
      return;
    }
    if (!file) {
      message.warning('请选择 Excel 文件');
      return;
    }
    submitting.value = true;
    modalApi.lock();
    try {
      const res = await importDouyinEcShopDailyExcel(file, id);
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
      shopId.value = '';
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
    title="抖音 Excel 导入"
    class="w-[560px] max-w-[calc(100vw-2rem)]"
    :confirm-disabled="!selectedFile || submitting"
  >
    <div class="space-y-3 px-1">
      <div>
        <div class="mb-1 text-sm font-medium">店铺ID</div>
        <Input v-model:value="shopId" allow-clear placeholder="请输入店铺ID" />
      </div>
      <div>
        <div class="mb-1 text-sm font-medium">Excel 文件</div>
        <Upload
          v-model:file-list="fileList"
          :before-upload="beforeUpload"
          :disabled="submitting"
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
