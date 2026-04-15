<script lang="ts" setup>
import { ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';

import { Button, Image, message } from 'ant-design-vue';

import { batchSetFinishedPic } from '#/api/fdmdata/datajustsku';
import ImageUpload from '#/components/upload/image-upload.vue';

const emit = defineEmits(['success']);

const selectedIds = ref<number[]>([]);
const picUrl = ref<string>('');

const [Modal, modalApi] = useVbenModal({
  async onOpenChange(isOpen: boolean) {
    if (!isOpen) {
      selectedIds.value = [];
      picUrl.value = '';
      return;
    }
    const ids = modalApi.getData<number[]>() ?? [];
    selectedIds.value = Array.isArray(ids) ? ids : [];
  },
});

async function handleConfirm() {
  if (!selectedIds.value.length) {
    message.warning('请先勾选成品编码列表数据');
    return;
  }
  const url = (picUrl.value ?? '').trim();
  if (!url) {
    message.warning('请先上传图片');
    return;
  }
  modalApi.lock();
  try {
    await batchSetFinishedPic({ ids: selectedIds.value, picUrl: url });
    message.success(`已批量设置 ${selectedIds.value.length} 条图片`);
    emit('success');
    modalApi.close();
  } finally {
    modalApi.unlock();
  }
}
</script>

<template>
  <Modal title="批量设置图片（成品编码列表）" :show-confirm-button="false">
    <div class="space-y-3 px-4">
      <div class="text-sm text-muted-foreground">
        已选择 <strong>{{ selectedIds.length }}</strong> 条，将统一设置为同一张图片。
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <div class="w-[92px]">
          <Image
            v-if="picUrl"
            :src="picUrl"
            :width="80"
            :height="80"
            class="rounded object-cover"
          />
          <div
            v-else
            class="flex h-[80px] w-[80px] items-center justify-center rounded border border-border text-xs text-muted-foreground"
          >
            无预览
          </div>
        </div>

        <div class="flex-1">
          <ImageUpload v-model="picUrl" :max-number="1" />
        </div>
      </div>

      <div class="flex justify-end gap-2 border-t border-border pt-3">
        <Button @click="modalApi.close()">取消</Button>
        <Button type="primary" @click="handleConfirm">确定上传并批量设置</Button>
      </div>
    </div>
  </Modal>
</template>

