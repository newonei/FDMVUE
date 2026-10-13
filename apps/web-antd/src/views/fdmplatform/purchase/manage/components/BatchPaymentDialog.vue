<script setup lang="ts">
import type { BatchOrder, BatchPaymentForm } from '../batch-model';

import type { ProcurementSetting } from '#/api/fdmplatform/procurement';

import { computed, ref, watch } from 'vue';

import {
  Alert,
  AutoComplete,
  Button,
  Input,
  InputNumber,
  Modal,
  Select,
} from 'ant-design-vue';
import BigNumber from 'bignumber.js';

import { getProcurementSettings } from '#/api/fdmplatform/procurement';
import {
  getProcurementFinanceSummary,
  registerOrderPayment,
} from '#/api/fdmplatform/procurement-finance';

import { errorText } from '../../../data';
import {
  payerAccountLabel,
  paymentMethods,
} from '../../../finance/procurement/model';
import { localDate } from '../../quotes/comparison';
import {
  batchPaymentInputs,
  batchPaymentNo,
  batchPaymentProblem,
} from '../batch-model';

/**
 * 集中付款（金智「集中付款」）：同一供应商的多张采购单一次转账付清，
 * 每张采购单各登记一张付款记录，共用付款日期、付款公司、收款方和集中付款批号。
 */
const props = defineProps<{ open: boolean; orders: BatchOrder[] }>();
const emit = defineEmits<{ close: []; done: [created: number] }>();

const today = localDate();
const payers = ref<ProcurementSetting[]>([]);
const available = ref<Record<string, string | undefined>>({});
const amounts = ref<Record<string, string | undefined>>({});
const form = ref<BatchPaymentForm>({});
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const results = ref<string[]>([]);
/** 已登记成功的采购单：再点提交只补失败的那几张 */
const finished = ref(new Set<string>());
/** 失败过的采购单换新幂等键重试（失败的草稿已自动取消） */
const attempts = new Map<string, number>();
let base = '';
let batchNo = '';

const active = computed(() => props.orders.filter((order) => !order.ended));
const total = computed(() => {
  let sum = new BigNumber(0);
  for (const value of Object.values(amounts.value)) {
    if (new BigNumber(value ?? '').isFinite()) sum = sum.plus(value!);
  }
  return sum.toFormat(2);
});

watch(
  () => props.open,
  async (open) => {
    if (!open) return;
    base = crypto.randomUUID();
    batchNo = batchPaymentNo(today);
    error.value = '';
    results.value = [];
    finished.value = new Set();
    attempts.clear();
    form.value = {
      paidAt: today,
      paymentMethod: '公对公转账',
      payeeName: active.value[0]?.supplierName,
    };
    amounts.value = {};
    loading.value = true;
    try {
      const [loaded, ...summaries] = await Promise.all([
        getProcurementSettings('entities', { usage: 'PAY', active: true }),
        ...active.value.map((order) =>
          getProcurementFinanceSummary(order.contractId, order.orderId).catch(
            () => ({}),
          ),
        ),
      ]);
      payers.value = loaded;
      if (loaded.length === 1) pickPayer(loaded[0]!.id);
      available.value = {};
      for (const [index, order] of active.value.entries()) {
        const value = String(
          (summaries[index] as Record<string, unknown>)
            ?.availablePaymentAmount ?? order.unpaid,
        );
        available.value[order.key] = value;
        amounts.value[order.key] = new BigNumber(value).gt(0)
          ? value
          : undefined;
      }
    } catch (error_) {
      error.value = errorText(error_);
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);

function pickPayer(id: string) {
  form.value.payerEntityId = id;
  const label = payerAccountLabel(payers.value.find((row) => row.id === id));
  if (label) form.value.payerAccount = label;
}

async function submit() {
  error.value = batchPaymentProblem(
    form.value,
    amounts.value,
    available.value,
    today,
  );
  if (error.value) return;
  saving.value = true;
  results.value = [];
  let created = 0;
  const pending = batchPaymentInputs(
    active.value,
    amounts.value,
    form.value,
    batchNo,
  ).filter(({ order }) => !finished.value.has(order.key));
  for (const { order, input } of pending) {
    try {
      // 幂等键按采购单区分：中途失败后再点提交，已登记的不会重复
      const record = await registerOrderPayment(
        input,
        `${base}:${order.key}:${attempts.get(order.key) ?? 0}`,
      );
      created += 1;
      finished.value.add(order.key);
      results.value.push(`${order.code}：已登记付款 ${record.code}`);
    } catch (error_) {
      attempts.set(order.key, (attempts.get(order.key) ?? 0) + 1);
      results.value.push(`${order.code}：失败，${errorText(error_)}`);
    }
  }
  saving.value = false;
  if (created > 0) emit('done', created);
}
</script>

<template>
  <Modal
    :open="open"
    title="集中付款"
    width="880px"
    :mask-closable="false"
    @cancel="emit('close')"
  >
    <div class="batch">
      <Alert
        type="info"
        show-icon
        :message="`${active[0]?.supplierName ?? ''} · ${active.length} 张采购单一次付款，每张各登记一张付款记录，共用批号便于对银行流水。`"
      />
      <Alert v-if="error" type="error" :message="error" show-icon />
      <div class="sheet">
        <label>
          <span><em>*</em>付款日期</span>
          <Input v-model:value="form.paidAt" type="date" :max="today" />
        </label>
        <label>
          <span><em>*</em>所属公司（付款公司）</span>
          <Select
            :value="form.payerEntityId"
            :options="
              payers.map((entry) => ({
                value: entry.id,
                label: entry.legalName ?? entry.name,
              }))
            "
            placeholder="选择所属公司"
            @update:value="(value) => pickPayer(String(value))"
          />
        </label>
        <label>
          <span><em>*</em>付款方式（付款账户）</span>
          <Input
            v-model:value="form.payerAccount"
            placeholder="如：湖北飞德慕网商银行（8831）"
          />
        </label>
        <label>
          <span>付款分类</span>
          <AutoComplete
            v-model:value="form.paymentMethod"
            :options="paymentMethods.map((value) => ({ value }))"
          />
        </label>
        <label>
          <span><em>*</em>收款方</span>
          <Input v-model:value="form.payeeName" />
        </label>
        <label>
          <span>收款账户信息</span>
          <Input
            v-model:value="form.payeeAccount"
            placeholder="开户行 + 账号"
          />
        </label>
        <label class="full">
          <span>备注</span>
          <Input v-model:value="form.remark" />
        </label>
      </div>
      <table class="orders">
        <thead>
          <tr>
            <th>采购单</th>
            <th class="num">未付</th>
            <th class="amount">本次付款</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="order in active" :key="order.key">
            <td>{{ order.code }}</td>
            <td class="num">
              {{ order.currency }}
              {{ new BigNumber(available[order.key] ?? 0).toFormat(2) }}
            </td>
            <td>
              <InputNumber
                v-model:value="amounts[order.key]"
                string-mode
                :min="0"
                :controls="false"
                :disabled="loading || saving || finished.has(order.key)"
                placeholder="不付留空"
                style="width: 100%"
              />
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td>合计</td>
            <td></td>
            <td class="num">
              <b>{{ active[0]?.currency }} {{ total }}</b>
            </td>
          </tr>
        </tfoot>
      </table>
      <ul v-if="results.length > 0" class="results">
        <li v-for="line in results" :key="line">{{ line }}</li>
      </ul>
    </div>
    <template #footer>
      <Button @click="emit('close')">
        {{ results.length > 0 ? '关闭' : '取消' }}
      </Button>
      <Button
        type="primary"
        :loading="saving"
        :disabled="loading"
        @click="submit"
      >
        登记付款
      </Button>
    </template>
  </Modal>
</template>

<style scoped>
.batch {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sheet {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px 14px;
}

.sheet label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
}

.sheet span {
  color: hsl(var(--muted-foreground));
}

em {
  margin-right: 2px;
  font-style: normal;
  color: hsl(var(--destructive));
}

.orders {
  width: 100%;
  font-size: 13px;
  border-collapse: collapse;
}

.orders th {
  padding: 6px 8px;
  font-weight: 500;
  color: hsl(var(--muted-foreground));
  text-align: left;
  background: hsl(var(--accent));
}

.orders td {
  padding: 6px 8px;
  border-top: 1px solid hsl(var(--border));
}

.orders .num {
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.orders .amount {
  width: 180px;
}

.sheet .full {
  grid-column: 1 / -1;
}

.results {
  padding-left: 18px;
  margin: 0;
  font-size: 13px;
}

@media (max-width: 760px) {
  .sheet {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
