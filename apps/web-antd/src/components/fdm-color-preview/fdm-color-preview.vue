<script setup lang="ts">
import type { ColorSample } from './color-preview';

import { computed, ref } from 'vue';

import { Modal } from 'ant-design-vue';

import { colorPreview } from './color-preview';

const props = withDefaults(
  defineProps<{
    color: ColorSample;
    empty?: boolean;
    size?: 'medium' | 'small';
  }>(),
  { size: 'medium' },
);

const sample = computed(() => colorPreview(props.color));
const previewOpen = ref<boolean>();
</script>

<template>
  <button
    v-if="sample.kind !== 'none'"
    :aria-label="`放大预览 ${color.code}`"
    :style="sample.kind === 'swatch' ? { backgroundColor: sample.value } : undefined"
    aria-haspopup="dialog"
    class="color-chip color-chip-button"
    :class="{ 'color-chip-small': size === 'small' }"
    type="button"
    @click.stop="previewOpen = true"
  >
    <img
      v-if="sample.kind === 'image'"
      :src="sample.value"
      alt=""
      class="h-full w-full object-cover"
      loading="lazy"
    />
  </button>
  <span
    v-else-if="empty"
    class="color-chip color-chip-empty"
    :class="{ 'color-chip-small': size === 'small' }"
  >无</span>

  <Modal
    v-if="previewOpen !== undefined"
    :open="previewOpen && sample.kind !== 'none'"
    :title="`色号 ${color.code}`"
    :footer="null"
    :width="420"
    @cancel="previewOpen = false"
  >
    <div class="flex flex-col gap-3">
      <img
        v-if="sample.kind === 'image'"
        :src="sample.value"
        :alt="`色号 ${color.code} 的实物照片`"
        class="max-h-[65vh] w-full rounded-lg object-contain"
      />
      <div
        v-else-if="sample.kind === 'swatch'"
        :style="{ backgroundColor: sample.value }"
        aria-hidden="true"
        class="color-swatch-large"
      ></div>
      <div
        v-if="color.name || sample.kind === 'swatch'"
        class="flex flex-wrap items-center gap-x-3 gap-y-1"
      >
        <span v-if="color.name">{{ color.name }}</span>
        <template v-if="sample.kind === 'swatch'">
          <span class="font-mono text-sm">{{ sample.value }}</span>
          <span v-if="sample.reference" class="text-xs text-muted-foreground">
            参考色
          </span>
        </template>
      </div>
    </div>
  </Modal>
</template>

<style scoped>
.color-chip {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  font-size: 11px;
  vertical-align: middle;
  border: 1px solid var(--ant-color-border, #d9d9d9);
  border-radius: 6px;
}

.color-chip-small {
  width: 22px;
  height: 22px;
  border-radius: 5px;
}

.color-chip-empty {
  color: var(--ant-color-text-quaternary, #bfbfbf);
  border-style: dashed;
}

.color-chip-button {
  padding: 0;
  overflow: hidden;
  cursor: zoom-in;
  background: none;
}

.color-chip-button:focus-visible {
  outline: 2px solid var(--ant-color-primary, #1677ff);
  outline-offset: 2px;
}

.color-swatch-large {
  min-height: 180px;
  aspect-ratio: 3 / 2;
  border: 1px solid var(--ant-color-border, #d9d9d9);
  border-radius: 8px;
}
</style>
