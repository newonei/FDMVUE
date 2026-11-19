<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import { currency } from './model';

type Cell = null | number | string;
const props = defineProps<{
  action?: string;
  columns: Array<{
    format?: 'currency' | 'number' | 'percent';
    key: string;
    label: string;
  }>;
  empty: string;
  rows: Array<Record<string, Cell> & { key: string }>;
}>();
const emit = defineEmits<{ select: [key: string] }>();
const page = ref(1);
const pageSize = 12;
const pages = computed(() =>
  Math.max(1, Math.ceil(props.rows.length / pageSize)),
);
const visible = computed(() =>
  props.rows.slice((page.value - 1) * pageSize, page.value * pageSize),
);
const percent = new Intl.NumberFormat('zh-CN', {
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
  style: 'percent',
});
watch(
  () => props.rows,
  () => {
    page.value = 1;
  },
);

function display(
  value: Cell | undefined,
  format?: 'currency' | 'number' | 'percent',
) {
  if (value === null || value === undefined) return '—';
  if (typeof value !== 'number') return value;
  if (format === 'currency') return currency(value);
  if (format === 'percent') return percent.format(value);
  return value.toLocaleString('zh-CN');
}
</script>

<template>
  <div v-if="rows.length" class="report-table">
    <div
      class="table-scroll"
      role="region"
      aria-label="薪酬数据表"
      tabindex="0"
    >
      <table>
        <thead>
          <tr>
            <th
              v-for="column in columns"
              :key="column.key"
              scope="col"
              :class="{ numeric: column.format }"
            >
              {{ column.label }}
            </th>
            <th v-if="action" scope="col">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in visible" :key="row.key">
            <td
              v-for="column in columns"
              :key="column.key"
              :class="{ numeric: column.format }"
            >
              {{ display(row[column.key], column.format) }}
            </td>
            <td v-if="action">
              <button
                type="button"
                class="table-link"
                @click="emit('select', row.key)"
              >
                {{ action }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="pages > 1" class="pagination">
      <span>{{ rows.length }} 条 · {{ page }} / {{ pages }} 页</span>
      <button type="button" :disabled="page === 1" @click="page--">
        上一页
      </button>
      <button type="button" :disabled="page === pages" @click="page++">
        下一页
      </button>
    </div>
  </div>
  <p v-else class="empty-table">{{ empty }}</p>
</template>

<style scoped>
.table-scroll {
  overflow-x: auto;
}

table {
  width: 100%;
  margin: 0;
  font-size: 13px;
  text-align: left;
  white-space: nowrap;
  border-collapse: collapse;
}

th,
td {
  padding: 11px 16px;
  border-bottom: 1px solid var(--line);
}

th {
  font-weight: 650;
  color: var(--muted);
  background: var(--subtle);
}

tbody tr:hover {
  background: var(--subtle);
}

.numeric {
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.empty-table {
  padding: 30px 16px;
  color: var(--muted);
  text-align: center;
}

.pagination {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: flex-end;
  padding: 10px 16px;
  font-size: 12px;
  color: var(--muted);
}

.pagination button {
  padding: 5px 9px;
  border: 1px solid var(--line);
  border-radius: 5px;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.table-link {
  font-weight: 650;
  color: var(--accent-text);
}

.table-link:hover {
  text-decoration: underline;
}
</style>
