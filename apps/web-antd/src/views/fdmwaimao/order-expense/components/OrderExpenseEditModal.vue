<script lang="ts" setup>
import type { FdmWaimaoOrderExpenseApi } from '#/api/fdmwaimao/order-expense';

import { computed, reactive, ref, watch } from 'vue';

import {
  Alert,
  DatePicker,
  Form,
  Input,
  message,
  Modal,
  Select,
  Table,
  Tag,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import { getExchangeRateCurrencies } from '#/api/fdmwaimao/exchange-rate';
import {
  getOrderExpenseCategories,
  updateOrderExpenseDraft,
} from '#/api/fdmwaimao/order-expense';

import {
  clearExpenseCommand,
  getOrCreateExpenseCommand,
} from '../command-store';
import { isValidPositiveExpenseAmount } from '../workflow-policy';

defineOptions({ name: 'FdmWaimaoOrderExpenseEditModal' });

const props = defineProps<{
  expense?: FdmWaimaoOrderExpenseApi.Expense;
  open: boolean;
}>();
const emit = defineEmits<{
  close: [];
  saved: [id: string];
}>();

interface EditableLine {
  amount: string;
  categoryRef: string;
  description: string;
  id: string;
  lineNo: number;
}

const form = reactive({
  currency: 'CNY',
  expenseDate: dayjs(),
  lines: [] as EditableLine[],
});
const categories = ref<FdmWaimaoOrderExpenseApi.Category[]>([]);
const currencies = ref<Array<{ code: string; name: string }>>([]);
const loading = ref(false);
const saving = ref(false);
const errorMessage = ref('');

const categoryOptions = computed(() =>
  categories.value.map((item) => ({
    label: `${item.categoryName} · ${item.categoryCode}`,
    value: item.categoryRef,
  })),
);
const currencyOptions = computed(() =>
  currencies.value.map((item) => ({
    label: item.name ? `${item.code} · ${item.name}` : item.code,
    value: item.code,
  })),
);

function resetFromExpense() {
  const expense = props.expense;
  if (!expense) return;
  form.currency = expense.currency || 'CNY';
  form.expenseDate = dayjs(expense.expenseDate || undefined);
  form.lines = expense.lines.map((line) => ({
    amount: line.amount ?? '',
    categoryRef: line.categoryRef,
    description: line.description,
    id: line.id,
    lineNo: line.lineNo,
  }));
  errorMessage.value = '';
}

function validate() {
  if (!form.expenseDate?.isValid()) return '请选择有效费用日期';
  if (!/^[A-Z]{3}$/.test(form.currency)) return '请选择有效币种';
  if (form.lines.length === 0) return '费用明细不能为空';
  for (const [index, line] of form.lines.entries()) {
    if (!line.categoryRef) return `第 ${index + 1} 行缺少费用分类`;
    if (!line.description.trim()) return `第 ${index + 1} 行缺少费用说明`;
    if (!isValidPositiveExpenseAmount(line.amount)) {
      return `第 ${index + 1} 行金额必须大于 0，最多保留 6 位小数`;
    }
  }
  return undefined;
}

async function loadOptions() {
  const expense = props.expense;
  if (!expense) return;
  loading.value = true;
  try {
    const [categoryResult, currencyResult] = await Promise.all([
      getOrderExpenseCategories(expense.sourceType),
      getExchangeRateCurrencies(),
    ]);
    categories.value = categoryResult ?? [];
    currencies.value = currencyResult ?? [];
  } finally {
    loading.value = false;
  }
}

async function save() {
  const expense = props.expense;
  if (!expense || saving.value) return;
  const problem = validate();
  if (problem) {
    errorMessage.value = problem;
    return;
  }
  const payloadWithoutKey = {
    currency: form.currency,
    expectedVersion: expense.version,
    expenseDate: form.expenseDate.format('YYYY-MM-DD'),
    id: expense.id,
    lines: form.lines.map((line) => ({
      amount: line.amount.trim(),
      categoryRef: line.categoryRef,
      description: line.description.trim(),
      id: line.id,
    })),
  };
  const identity = `update:${expense.id}:${expense.version}`;
  saving.value = true;
  errorMessage.value = '';
  try {
    await updateOrderExpenseDraft({
      ...payloadWithoutKey,
      idempotencyKey: await getOrCreateExpenseCommand(
        identity,
        JSON.stringify(payloadWithoutKey),
        'expense-update',
      ),
    });
    clearExpenseCommand(identity);
    message.success('费用金额与汇率快照已保存');
    emit('saved', expense.id);
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '费用草稿保存失败';
  } finally {
    saving.value = false;
  }
}

watch(
  () => props.open,
  (open) => {
    if (!open || !props.expense) return;
    resetFromExpense();
    void loadOptions();
  },
);
</script>

<template>
  <Modal
    :confirm-loading="saving"
    :mask-closable="false"
    :open="open"
    cancel-text="取消"
    ok-text="保存并冻结汇率"
    title="补录订单费用金额"
    width="min(1040px, calc(100vw - 32px))"
    @cancel="emit('close')"
    @ok="save"
  >
    <Alert
      description="费用日期、币种和原币金额由人工确认；人民币金额、实际汇率日、汇率来源和是否回退由服务端汇率中心计算并冻结，浏览器不能提交或覆盖。"
      message="金额人工录入，汇率服务端计算"
      show-icon
      type="info"
    />
    <Alert
      v-if="errorMessage"
      class="expense-edit-error"
      :message="errorMessage"
      closable
      show-icon
      type="error"
      @close="errorMessage = ''"
    />

    <Form class="expense-edit-form" layout="vertical">
      <div class="expense-edit-grid">
        <Form.Item label="费用日期" required>
          <DatePicker v-model:value="form.expenseDate" style="width: 100%" />
        </Form.Item>
        <Form.Item label="原币币种" required>
          <Select
            v-model:value="form.currency"
            :loading="loading"
            :options="currencyOptions"
            show-search
          />
        </Form.Item>
      </div>

      <Form.Item label="费用明细" required>
        <Table
          :columns="[
            { key: 'lineNo', title: '#', width: 54 },
            { key: 'category', title: '费用分类', width: 230 },
            { key: 'description', title: '费用说明' },
            { key: 'amount', title: `金额（${form.currency}）`, width: 180 },
          ]"
          :data-source="form.lines"
          :loading="loading"
          :pagination="false"
          row-key="id"
          size="small"
          :scroll="{ x: 760 }"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'lineNo'">
              <Tag>{{ record.lineNo }}</Tag>
            </template>
            <template v-else-if="column.key === 'category'">
              <Select
                v-model:value="record.categoryRef"
                :options="categoryOptions"
                style="width: 100%"
              />
            </template>
            <template v-else-if="column.key === 'description'">
              <Input.TextArea
                v-model:value="record.description"
                :auto-size="{ minRows: 1, maxRows: 3 }"
                :maxlength="1000"
              />
            </template>
            <template v-else-if="column.key === 'amount'">
              <Input
                v-model:value="record.amount"
                inputmode="decimal"
                placeholder="请输入原币金额"
              />
            </template>
          </template>
        </Table>
      </Form.Item>
    </Form>
  </Modal>
</template>

<style scoped>
.expense-edit-error {
  margin-top: 12px;
}

.expense-edit-form {
  margin-top: 20px;
}

.expense-edit-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

@media (max-width: 640px) {
  .expense-edit-grid {
    grid-template-columns: 1fr;
    gap: 0;
  }
}
</style>
