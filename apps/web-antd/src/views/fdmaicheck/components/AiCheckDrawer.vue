<script setup lang="ts">
import type { Checklist, DrawerFilter } from './checklist';

import { computed, ref, watch } from 'vue';

import { Drawer, Input, Radio } from 'ant-design-vue';

import { filterRows, RESULT_META } from './checklist';

/** 全部依据：逐项列出 AI 和系统规则是怎么判的，可按结论筛选、按名称搜索。 */
const props = defineProps<{ list: Checklist; open: boolean; title?: string }>();
const emit = defineEmits<{ close: [] }>();

const filter = ref<DrawerFilter>('ALL');
const keyword = ref('');
const rows = computed(() =>
  filterRows(props.list, filter.value, keyword.value),
);
const options = computed(() => [
  { value: 'ALL', label: `全部 ${props.list.total}` },
  { value: 'FAIL', label: `不通过 ${props.list.tally.FAIL}` },
  { value: 'WARN', label: `提醒 ${props.list.tally.WARN}` },
  { value: 'PASS', label: `通过 ${props.list.tally.PASS}` },
  {
    value: 'OTHER',
    label: `其他 ${props.list.tally.NOT_APPLICABLE + props.list.tally.UNKNOWN}`,
  },
]);

watch(
  () => props.open,
  (open) => {
    if (open) {
      filter.value = 'ALL';
      keyword.value = '';
    }
  },
);
</script>

<template>
  <Drawer
    :open="open"
    :title="title || 'AI 检查 · 全部依据'"
    width="420"
    @close="emit('close')"
  >
    <div class="dr">
      <Radio.Group
        v-model:value="filter"
        size="small"
        button-style="solid"
        :options="options"
        option-type="button"
      />
      <Input
        v-model:value="keyword"
        size="small"
        allow-clear
        placeholder="搜检查点名称"
      />
      <ul class="dr-list">
        <li v-for="row in rows" :key="row.key">
          <span class="dr-mark" :class="`is-${RESULT_META[row.result].tone}`">
            {{ RESULT_META[row.result].mark }}
          </span>
          <div class="dr-body">
            <div class="dr-line">
              <span class="dr-name">{{ row.name }}</span>
              <span class="dr-meta">
                {{ RESULT_META[row.result].label }} ·
                {{ row.source === 'RULE' ? '规则' : 'AI'
                }}{{ row.group ? ` · ${row.group}` : '' }}
              </span>
            </div>
            <p v-for="f in row.findings" :key="f.id" class="dr-text">
              {{ f.message }}
            </p>
            <p
              v-if="row.basis && row.basis !== row.findings[0]?.message"
              class="dr-basis"
            >
              {{ row.basis }}
            </p>
            <p
              v-else-if="!row.basis && row.findings.length === 0"
              class="dr-basis"
            >
              {{
                row.source === 'RULE' ? '系统规则没有发现问题' : '没有写依据'
              }}
            </p>
          </div>
        </li>
        <li v-if="rows.length === 0" class="dr-empty">没有符合条件的检查点</li>
      </ul>
    </div>
  </Drawer>
</template>

<style scoped>
.dr {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.dr-list {
  padding: 0;
  margin: 0;
  list-style: none;
}

.dr-list li {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 0 8px;
  padding: 7px 0;
  border-top: 1px solid var(--ant-color-border-secondary, #f0f0f0);
}

.dr-list li:first-child {
  border-top: 0;
}

.dr-list li.dr-empty {
  display: block;
  color: var(--ant-color-text-tertiary, #8c8c8c);
  text-align: center;
}

.dr-body {
  min-width: 0;
}

.dr-line {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 8px;
  align-items: baseline;
}

.dr-name {
  font-weight: 500;
}

.dr-meta {
  font-size: 12px;
  color: var(--ant-color-text-tertiary, #8c8c8c);
}

.dr-text,
.dr-basis {
  margin: 2px 0 0;
  overflow-wrap: anywhere;
}

.dr-basis {
  font-size: 12px;
  color: var(--ant-color-text-secondary, #595959);
}

.dr-mark {
  display: inline-grid;
  place-items: center;
  width: 18px;
  height: 18px;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  border-radius: 50%;
}

.is-pass {
  color: var(--ant-color-success, #52c41a);
  background: var(--ant-color-success-bg, #f6ffed);
}

.is-fail {
  color: var(--ant-color-error, #ff4d4f);
  background: var(--ant-color-error-bg, #fff2f0);
}

.is-warn {
  color: var(--ant-color-warning, #faad14);
  background: var(--ant-color-warning-bg, #fffbe6);
}

.is-na {
  color: var(--ant-color-text-tertiary, #8c8c8c);
  background: var(--ant-color-fill-secondary, rgb(0 0 0 / 6%));
}
</style>
