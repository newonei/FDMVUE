<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { Button, Image, message, Spin } from 'ant-design-vue';

import {
  getProcurementImage,
  uploadProcurementImage,
} from '#/api/fdmplatform/procurement';

import { errorText } from '../../../data';

/**
 * 下单资料里的一组图片：缩略图点开放大，可上传、粘贴截图、删除和拖拽排序。
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
const emit = defineEmits<{ busy: [value: boolean] }>();
const ids = defineModel<string[]>({ required: true });
const urls = ref<Record<string, string>>({});
const uploading = ref(false);
const input = ref<HTMLInputElement>();
const sortable = computed(
  () => !props.disabled && !uploading.value && ids.value.length > 1,
);
const dragging = ref<string>();
const dropTarget = ref<string>();
let suppressClickUntil = 0;
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
  if (uploading.value) emit('busy', false);
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
  if (props.disabled || uploading.value) return;
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
  emit('busy', true);
  try {
    for (const file of picked) {
      const image = await uploadProcurementImage(
        props.contractId,
        props.orderId,
        file,
      );
      if (disposed) return;
      ids.value = [...ids.value, image.id];
    }
  } catch (error) {
    message.error(errorText(error));
  } finally {
    uploading.value = false;
    if (!disposed) emit('busy', false);
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
function startDrag(event: DragEvent, id: string) {
  if (!sortable.value || (event.target as Element).closest('button')) {
    event.preventDefault();
    return;
  }
  dragging.value = id;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
  }
}
function dragOver(event: DragEvent, id: string) {
  // 只接收本组件内开始的拖拽，避免不同产品行之间串图。
  if (!sortable.value || !dragging.value || dragging.value === id) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  dropTarget.value = id;
}
function endDrag() {
  if (dragging.value) suppressClickUntil = Date.now() + 250;
  dragging.value = undefined;
  dropTarget.value = undefined;
}
function drop(event: DragEvent, id: string) {
  if (!sortable.value || !dragging.value) return;
  event.preventDefault();
  event.stopPropagation();
  const from = ids.value.indexOf(dragging.value);
  const to = ids.value.indexOf(id);
  if (from !== -1 && to !== -1 && from !== to) {
    const reordered = [...ids.value];
    reordered.splice(from, 1);
    reordered.splice(to, 0, dragging.value);
    ids.value = reordered;
  }
  endDrag();
}
function clickImage(event: MouseEvent) {
  if (dragging.value || Date.now() < suppressClickUntil) {
    event.preventDefault();
    event.stopPropagation();
  }
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
        :class="{
          sortable,
          dragging: dragging === id,
          'drop-target': dropTarget === id,
        }"
        :draggable="sortable"
        :title="sortable ? '拖动图片可调整顺序，点击可预览' : undefined"
        :style="{ width: `${size ?? 64}px`, height: `${size ?? 64}px` }"
        @dragstart="startDrag($event, id)"
        @dragover="dragOver($event, id)"
        @dragleave="dropTarget === id && (dropTarget = undefined)"
        @drop="drop($event, id)"
        @dragend="endDrag"
        @click.capture="clickImage"
      >
        <Image
          v-if="urls[id]"
          :src="urls[id]"
          :width="size ?? 64"
          :height="size ?? 64"
          class="thumb-image"
          :draggable="false"
        />
        <Spin v-else size="small" />
        <button
          v-if="!disabled"
          type="button"
          class="remove"
          aria-label="删除图片"
          @mousedown.stop
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
      :multiple="max > 1"
      hidden
      @change="choose"
    />
    <span v-if="sortable" class="sort-hint">拖动图片可调整顺序</span>
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

.thumb.sortable {
  cursor: grab;
}

.thumb.dragging {
  cursor: grabbing;
  opacity: 0.45;
}

.thumb.drop-target {
  outline: 2px solid hsl(var(--primary));
  outline-offset: 1px;
}

.sort-hint {
  flex-basis: 100%;
  font-size: 11px;
  color: hsl(var(--muted-foreground));
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
