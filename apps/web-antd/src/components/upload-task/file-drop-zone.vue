<script lang="ts" setup>
import { computed } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { message } from 'ant-design-vue';

import {
  describeRejectedFiles,
  pickFiles,
  useFileDrop,
  validateFiles,
} from './file-select';

defineOptions({ name: 'FileDropZone' });

const props = withDefaults(
  defineProps<{
    accept?: string[];
    compact?: boolean;
    disabled?: boolean;
    /** 为 false 时只负责点击选择，拖放交给外层容器处理 */
    droppable?: boolean;
    /** 外层容器正在拖入文件时，同步高亮 */
    highlight?: boolean;
    maxSizeMb?: number;
    multiple?: boolean;
    title?: string;
  }>(),
  {
    accept: () => [],
    compact: false,
    disabled: false,
    droppable: true,
    highlight: false,
    maxSizeMb: undefined,
    multiple: true,
    title: '',
  },
);

const emit = defineEmits<{ select: [files: File[]] }>();

function emitValidFiles(files: File[]) {
  const candidates = props.multiple ? files : files.slice(0, 1);
  const { accepted, rejected } = validateFiles(candidates, {
    accept: props.accept,
    maxSizeMb: props.maxSizeMb,
  });
  if (rejected.length > 0) message.warning(describeRejectedFiles(rejected));
  if (accepted.length > 0) emit('select', accepted);
}

const { dragging, handlers } = useFileDrop({
  disabled: () => props.disabled || !props.droppable,
  onDrop: emitValidFiles,
});

const active = computed(() => dragging.value || props.highlight);

const hint = computed(() => {
  const parts: string[] = [];
  if (props.multiple) parts.push('支持多选、拖入文件夹');
  if (props.accept.length > 0) parts.push(props.accept.join(' / '));
  if (props.maxSizeMb) parts.push(`单个不超过 ${props.maxSizeMb >= 1024 ? `${props.maxSizeMb / 1024}GB` : `${props.maxSizeMb}MB`}`);
  return parts.join(' · ');
});

async function handleClick() {
  if (props.disabled) return;
  const files = await pickFiles({
    accept: props.accept,
    multiple: props.multiple,
  });
  if (files.length > 0) emitValidFiles(files);
}
</script>

<template>
  <div
    class="file-drop-zone"
    :class="{ 'is-active': active, 'is-compact': compact, 'is-disabled': disabled }"
    role="button"
    tabindex="0"
    v-on="droppable ? handlers : {}"
    @click="handleClick"
    @keydown.enter.prevent="handleClick"
    @keydown.space.prevent="handleClick"
  >
    <IconifyIcon class="file-drop-zone__icon" icon="lucide:cloud-upload" />
    <div class="file-drop-zone__body">
      <div class="file-drop-zone__title">
        <template v-if="active">松开鼠标即可添加</template>
        <template v-else>
          {{ title || '拖拽文件到这里，或' }}
          <span class="text-primary">点击选择文件</span>
        </template>
      </div>
      <div v-if="hint" class="file-drop-zone__hint">{{ hint }}</div>
    </div>
  </div>
</template>

<style scoped>
.file-drop-zone {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  justify-content: center;
  padding: 28px 16px;
  text-align: center;
  cursor: pointer;
  user-select: none;
  background: hsl(var(--muted) / 30%);
  border: 1px dashed hsl(var(--border));
  border-radius: 8px;
  outline: none;
  transition:
    border-color 0.2s,
    background-color 0.2s;
}

.file-drop-zone:hover,
.file-drop-zone:focus-visible,
.file-drop-zone.is-active {
  background: hsl(var(--primary) / 6%);
  border-color: hsl(var(--primary));
}

.file-drop-zone.is-compact {
  flex-direction: row;
  gap: 12px;
  padding: 12px 16px;
  text-align: left;
}

.file-drop-zone.is-disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.file-drop-zone__icon {
  width: 32px;
  height: 32px;
  color: hsl(var(--primary));
}

.is-compact .file-drop-zone__icon {
  width: 22px;
  height: 22px;
}

.file-drop-zone__title {
  font-size: 14px;
  color: hsl(var(--foreground));
}

.file-drop-zone__hint {
  margin-top: 2px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}
</style>
