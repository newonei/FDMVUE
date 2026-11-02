<script setup lang="ts">
import type {
  ExpenseSummary,
  ExpenseSummaryRow,
} from '#/api/fdmplatform/expense';

import { computed, onMounted, ref } from 'vue';

import { Alert, DatePicker, Empty, Spin } from 'ant-design-vue';
import BigNumber from 'bignumber.js';

import { getExpenseSummary } from '#/api/fdmplatform/expense';

import { errorText, expenseCategoryLabel } from '../../../data';
import { currencyScale } from '../model';

/** 已通过审核的报销汇总。按费用发生日期算，外币不折算，按币种分开显示。 */
const range = ref<[string, string] | undefined>();
const summary = ref<ExpenseSummary>();
const loading = ref(false);
const pageError = ref('');
let sequence = 0;

async function load() {
  const run = ++sequence;
  loading.value = true;
  pageError.value = '';
  try {
    const value = await getExpenseSummary({
      from: range.value?.[0],
      to: range.value?.[1],
    });
    if (run === sequence) summary.value = value;
  } catch (error) {
    if (run === sequence) pageError.value = errorText(error);
  } finally {
    if (run === sequence) loading.value = false;
  }
}
onMounted(load);

function binding(name: string) {
  return name === 'BOUND' ? '绑定合同 / 订单' : '未绑定业务';
}
const groups = computed(() =>
  summary.value
    ? [
        {
          title: '按费用类别',
          rows: summary.value.byCategory,
          name: expenseCategoryLabel,
        },
        {
          title: '按部门',
          rows: summary.value.byDepartment,
          name: (value: string) => value,
        },
        {
          title: '按月份',
          rows: summary.value.byMonth,
          name: (value: string) => value,
        },
        { title: '是否绑定业务', rows: summary.value.byBinding, name: binding },
      ]
    : [],
);
function amount(row: ExpenseSummaryRow) {
  return `${row.currency} ${new BigNumber(String(row.amount)).toFormat(currencyScale(row.currency))}`;
}
</script>

<template>
  <section class="expense-summary">
    <div class="expense-summary-toolbar">
      <DatePicker.RangePicker
        v-model:value="range"
        value-format="YYYY-MM-DD"
        allow-clear
        @change="load"
      />
      <span>只统计已通过审核的报销，按费用发生日期；外币不折算。</span>
    </div>
    <Alert v-if="pageError" type="error" :message="pageError" show-icon />
    <Spin :spinning="loading">
      <div class="expense-summary-grid">
        <article v-for="group in groups" :key="group.title">
          <h3>{{ group.title }}</h3>
          <Empty v-if="group.rows.length === 0" description="暂无数据" />
          <dl v-else>
            <div v-for="row in group.rows" :key="`${row.currency}-${row.name}`">
              <dt>{{ group.name(row.name) }}</dt>
              <dd>{{ amount(row) }}</dd>
            </div>
          </dl>
        </article>
      </div>
    </Spin>
  </section>
</template>

<style scoped>
.expense-summary {
  display: grid;
  gap: 16px;
  padding: 16px;
}

.expense-summary-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.expense-summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
}

.expense-summary-grid article {
  padding: 16px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.expense-summary-grid h3 {
  margin-bottom: 12px;
  font-size: 14px;
  font-weight: 600;
}

.expense-summary-grid dl > div {
  display: flex;
  gap: 12px;
  justify-content: space-between;
  padding: 6px 0;
  border-top: 1px solid hsl(var(--border));
}

.expense-summary-grid dt {
  color: hsl(var(--muted-foreground));
}

.expense-summary-grid dd {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
</style>
