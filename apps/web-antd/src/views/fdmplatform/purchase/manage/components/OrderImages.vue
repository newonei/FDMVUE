<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';

import { Button, Image, message, Spin } from 'ant-design-vue';

import {
  getProcurementImage,
  uploadProcurementImage,
} from '#/api/fdmplatform/procurement';

import { errorText } from '../../../data';

/**
 * 下单资料里的一组图片（产品图、共用说明配图、包装步骤图）：缩略图点开放大，可上传、粘贴截图、删除。
 * 图片按采购单存档，ids 只记引用，保存下单资料时一起提交。
 */
const props = defineProps<{
  contractId: string;
  disabled?: boolean;
  max: number;
  orderId: string;
  /** 缩略图边长（像素） */
  size?: number;
}>();
const ids = defineModel<string[]>({ required: true });
const urls = ref<Record<string, string>>({});
const uploading = ref(false);
const input = ref<HTMLInputElement>();
let disposed = false;

watch(
  () => ids.value.join(','),
  () => {
    for (const id of ids.value) void load(id);
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  disposed = true;
  Object.values(urls.value).forEach((url) => URL.revokeObjectURL(url));
});

async function load(id: string) {
  if (urls.value[id]) return;
  try {
    const blob = await getProcurementImage(props.contractId, props.orderId, id);
    if (disposed) return;
    urls.value = { ...urls.value, [id]: URL.createObjectURL(blob) };
  } catch {
    // 读不到的图显示占位，不挡编辑
  }
}
async function upload(files: File[]) {
  const room = props.max - ids.value.length;
  if (room <= 0) {
    message.warning(`最多 ${props.max} 张图片`);
    return;
  }
  const picked = files
    .filter((file) => /^image\/(?:png|jpeg)$/.test(file.type))
    .slice(0, room);
  if (picked.length < files.length)
    message.warning(
      `只收 PNG / JPG，最多 ${props.max} 张，已跳过 ${files.length - picked.length} 个文件`,
    );
  if (picked.length === 0) return;
  uploading.value = true;
  try {
    for (const file of picked) {
      const image = await uploadProcurementImage(
        props.contractId,
        props.orderId,
        file,
      );
      ids.value = [...ids.value, image.id];
    }
  } catch (error) {
    message.error(errorText(error));
  } finally {
    uploading.value = false;
  }
}
function choose(event: Event) {
  const target = event.target as HTMLInputElement;
  void upload([...(target.files ?? [])]);
  target.value = '';
}
/** 截图后在框里按 Ctrl+V / ⌘V 直接贴上。 */
function paste(event: ClipboardEvent) {
  if (props.disabled) return;
  const files = [...(event.clipboardData?.files ?? [])];
  if (files.length === 0) return;
  event.preventDefault();
  void upload(files);
}
function remove(id: string) {
  ids.value = ids.value.filter((value) => value !== id);
}
</script>
<template>
  <div
    class="order-images"
    :tabindex="disabled ? undefined : 0"
    :title="disabled ? undefined : '可粘贴截图'"
    @paste="paste"
  >
    <Image.PreviewGroup>
      <div
        v-for="id in ids"
        :key="id"
        class="thumb"
        :style="{ width: `${size ?? 64}px`, height: `${size ?? 64}px` }"
      >
        <Image
          v-if="urls[id]"
          :src="urls[id]"
          :width="size ?? 64"
          :height="size ?? 64"
          class="thumb-image"
        />
        <Spin v-else size="small" />
        <button
          v-if="!disabled"
          type="button"
          class="remove"
          aria-label="删除图片"
          @click="remove(id)"
        >
          ×
        </button>
      </div>
    </Image.PreviewGroup>
    <Button
      v-if="!disabled && ids.length < max"
      class="add"
      :style="{ width: `${size ?? 64}px`, height: `${size ?? 64}px` }"
      :loading="uploading"
      @click="input?.click()"
    >
      {{ uploading ? '' : '+ 图片' }}
    </Button>
    <input
      ref="input"
      type="file"
      accept="image/png,image/jpeg"
      multiple
      hidden
      @change="choose"
    />
  </div>
</template>
<style scoped>
.order-images {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  outline: none;
  border-radius: 4px;
}

.order-images:focus-visible {
  box-shadow: 0 0 0 2px hsl(var(--primary) / 30%);
}

.thumb {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: hsl(var(--accent));
  border: 1px solid hsl(var(--border));
  border-radius: 4px;
}

.thumb :deep(.thumb-image) {
  object-fit: cover;
}

.remove {
  position: absolute;
  top: 0;
  right: 0;
  width: 18px;
  height: 18px;
  font-size: 13px;
  line-height: 16px;
  color: #fff;
  cursor: pointer;
  background: rgb(0 0 0 / 55%);
  border: none;
  border-bottom-left-radius: 4px;
}

.add {
  padding: 0;
  font-size: 12px;
}
</style>
