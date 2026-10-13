<script setup lang="ts">
import type { LineColumn, LineTableSetting } from './line-table-model';

import { computed, ref, watch } from 'vue';

import { GripVertical, LockKeyhole, X } from '@vben/icons';

import { Button, Checkbox, Input, Modal } from 'ant-design-vue';

import { defaultSetting, moveKey } from './line-table-model';

/**
 * 产品明细字段设置（参照金智）：左边是已显示的字段，可拖动排序、移除；
 * 右边是全部字段，勾选即显示。保存后才生效。
 */
const props = defineProps<{
  columns: LineColumn[];
  open: boolean;
  setting: LineTableSetting;
  title: string;
}>();
const emit = defineEmits<{
  save: [setting: LineTableSetting];
  'update:open': [value: boolean];
}>();

const keys = ref<string[]>([]);
const widths = ref<Record<string, number>>({});
const keyword = ref('');
const dragging = ref<number>();
watch(
  () => props.open,
  (open) => {
    if (!open) return;
    keys.value = [...props.setting.keys];
    widths.value = { ...props.setting.widths };
    keyword.value = '';
  },
  { immediate: true },
);
const byKey = computed(
  () => new Map(props.columns.map((item) => [item.key, item])),
);
const lockedCount = computed(
  () => props.columns.filter((item) => item.locked).length,
);
const filtered = computed(() => {
  const word = keyword.value.trim().toLowerCase();
  return word
    ? props.columns.filter((item) => item.title.toLowerCase().includes(word))
    : props.columns;
});
function toggle(column: LineColumn, checked: boolean) {
  if (column.locked) return;
  keys.value = checked
    ? [...keys.value, column.key]
    : keys.value.filter((key) => key !== column.key);
}
function drop(index: number) {
  if (dragging.value !== undefined)
    keys.value = moveKey(keys.value, dragging.value, index, lockedCount.value);
  dragging.value = undefined;
}
function reset() {
  keys.value = defaultSetting(props.columns).keys;
  widths.value = {};
}
function save() {
  emit('save', { keys: [...keys.value], widths: { ...widths.value } });
  emit('update:open', false);
}
</script>
<template>
  <Modal
    :open="open"
    :title="`${title}设置`"
    width="900px"
    destroy-on-close
    @cancel="emit('update:open', false)"
  >
    <div class="settings">
      <section class="picked">
        <h4>已显示（{{ keys.length }}）</h4>
        <ol aria-label="已显示字段，拖动调整顺序">
          <li
            v-for="(key, index) in keys"
            :key="key"
            :draggable="index >= lockedCount"
            :class="{ locked: index < lockedCount, over: dragging === index }"
            @dragstart="dragging = index"
            @dragover.prevent
            @drop.prevent="drop(index)"
            @dragend="dragging = undefined"
          >
            <GripVertical class="grip" aria-hidden="true" />
            <span class="name">{{ byKey.get(key)?.title ?? key }}</span>
            <LockKeyhole
              v-if="index < lockedCount"
              class="icon"
              aria-label="固定显示"
            />
            <button
              v-else
              type="button"
              class="remove"
              :aria-label="`不显示${byKey.get(key)?.title ?? key}`"
              @click="keys = keys.filter((item) => item !== key)"
            >
              <X class="icon" />
            </button>
          </li>
        </ol>
      </section>
      <section class="all">
        <header>
          <h4>全部字段（{{ keys.length }}/{{ columns.length }}）</h4>
          <Input
            v-model:value="keyword"
            allow-clear
            placeholder="输入关键字"
            style="width: 220px"
          />
        </header>
        <div class="grid">
          <Checkbox
            v-for="column in filtered"
            :key="column.key"
            :checked="keys.includes(column.key)"
            :disabled="column.locked"
            @update:checked="(value: boolean) => toggle(column, value)"
          >
            {{ column.title }}
          </Checkbox>
          <span v-if="!filtered.length" class="muted">没有匹配的字段</span>
        </div>
      </section>
    </div>
    <template #footer>
      <Button @click="reset">恢复默认</Button>
      <Button @click="emit('update:open', false)">取消</Button>
      <Button type="primary" @click="save">保存</Button>
    </template>
  </Modal>
</template>
<style scoped>
.settings {
  display: grid;
  grid-template-columns: 200px minmax(0, 1fr);
  gap: 16px;
  min-height: 360px;
}

.settings section {
  display: flex;
  flex-direction: column;
  min-width: 0;
  max-height: 60vh;
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
}

.settings h4 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}

.picked h4,
.all header {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: hsl(var(--muted) / 50%);
  border-bottom: 1px solid hsl(var(--border));
}

.picked ol {
  flex: 1;
  padding: 8px;
  margin: 0;
  overflow-y: auto;
  list-style: none;
}

.picked li {
  display: flex;
  gap: 6px;
  align-items: center;
  padding: 6px 8px;
  margin-bottom: 6px;
  font-size: 13px;
  cursor: grab;
  background: hsl(var(--muted) / 50%);
  border: 1px solid transparent;
  border-radius: 4px;
}

.picked li.locked {
  cursor: default;
}

.picked li.over {
  border-color: hsl(var(--primary));
}

.picked .name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.grip,
.icon {
  flex: none;
  width: 14px;
  height: 14px;
  color: hsl(var(--muted-foreground));
}

.picked li.locked .grip {
  visibility: hidden;
}

.remove {
  display: inline-flex;
  padding: 0;
  cursor: pointer;
  background: none;
  border: 0;
}

.all .grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px 8px;
  align-content: start;
  padding: 12px;
  overflow-y: auto;
}

.muted {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

@media (max-width: 760px) {
  .settings {
    grid-template-columns: minmax(0, 1fr);
  }

  .all .grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
