<script setup lang="ts">
import type { BatchOrder, RequestForm } from '../batch-model';

import type { ProcurementSetting } from '#/api/fdmplatform/procurement';

import { computed, ref, watch } from 'vue';

import {
  Alert,
  Button,
  Input,
  InputNumber,
  Modal,
  Select,
} from 'ant-design-vue';
import BigNumber from 'bignumber.js';

import { getProcurementSettings } from '#/api/fdmplatform/procurement';
import {
  createProcurementFinance,
  getProcurementFinanceSummary,
  procurementFinanceAction,
} from '#/api/fdmplatform/procurement-finance';

import { errorText } from '../../../data';
import { requestFormProblem, requestPayloads } from '../batch-model';

/**
 * 集中请款（金智「全部集中付款」）：同一供应商的多张采购单一次填好付款主体、收款账户和凭据，
 * 每张采购单各生成一张请款单并直接生效；请款单仍是一单一张，财务付款照常。
 */
const props = defineProps<{ open: boolean; orders: BatchOrder[] }>();
const emit = defineEmits<{ close: []; done: [created: number] }>();

const payers = ref<ProcurementSetting[]>([]);
const available = ref<Record<string, string>>({});
const amounts = ref<Record<string, string | undefined>>({});
const form = ref<RequestForm>({});
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const results = ref<string[]>([]);
let base = '';

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
    error.value = '';
    results.value = [];
    form.value = {
      payeeName: active.value[0]?.supplierName,
      remark: '货款',
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
      if (loaded.length === 1) form.value.payerEntityId = loaded[0]!.id;
      available.value = {};
      for (const [index, order] of active.value.entries()) {
        const value = String(
          (summaries[index] as Record<string, unknown>)
            ?.availableRequestAmount ?? order.unpaid,
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

async function submit() {
  error.value = requestFormProblem(form.value, amounts.value);
  if (error.value) return;
  saving.value = true;
  results.value = [];
  let created = 0;
  for (const { order, payload } of requestPayloads(
    active.value,
    amounts.value,
    form.value,
  )) {
    try {
      // 幂等键按采购单区分：中途失败后再点提交，已建好的不会重复
      const draft = await createProcurementFinance({
        type: 'REQUEST',
        idempotencyKey: `${base}:${order.key}`,
        payload,
      });
      await procurementFinanceAction(draft.id, {
        action: 'SUBMIT',
        expectedVersion: draft.version,
        idempotencyKey: `${base}:${order.key}:submit`,
        payload: {},
      });
      created += 1;
      results.value.push(`${order.code}：已生成请款 ${draft.code}`);
    } catch (error_) {
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
    title="集中请款"
    width="880px"
    :mask-closable="false"
    @cancel="emit('close')"
  >
    <div class="batch">
      <Alert
        type="info"
        show-icon
        :message="`${active[0]?.supplierName ?? ''} · ${active.length} 张采购单，每张各生成一张请款单并直接生效，财务付款照常。`"
      />
      <Alert v-if="error" type="error" :message="error" show-icon />
      <div class="sheet">
        <label>
          <span><em>*</em>付款主体</span>
          <Select
            v-model:value="form.payerEntityId"
            :options="
              payers.map((entry) => ({
                value: entry.id,
                label: entry.legalName ?? entry.name,
              }))
            "
            placeholder="选择付款公司"
          />
        </label>
        <label>
          <span><em>*</em>收款方</span>
          <Input v-model:value="form.payeeName" />
        </label>
        <label>
          <span><em>*</em>收款账户</span>
          <Input
            v-model:value="form.payeeAccount"
            placeholder="开户行 + 账号"
          />
        </label>
        <label>
          <span><em>*</em>请款说明</span>
          <Input v-model:value="form.remark" />
        </label>
        <label>
          <span><em>*</em>凭据编号</span>
          <Input
            v-model:value="form.evidence"
            placeholder="对账单号、合同号或发票号"
          />
        </label>
        <label>
          <span>代付说明</span>
          <Input
            v-model:value="form.agencyReason"
            placeholder="付款公司和签约公司不同时填写"
          />
        </label>
      </div>
      <table class="orders">
        <thead>
          <tr>
            <th>采购单</th>
            <th class="num">可请款</th>
            <th class="amount">本次请款</th>
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
                :disabled="loading || saving"
                placeholder="不请留空"
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
        生成请款单
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
