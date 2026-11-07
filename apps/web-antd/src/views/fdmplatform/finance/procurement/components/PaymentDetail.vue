<script setup lang="ts">
import type { ProcurementFinanceRecord } from '#/api/fdmplatform/procurement-finance';

import { computed } from 'vue';

import { Alert, Button, Steps, Tag } from 'ant-design-vue';
import BigNumber from 'bignumber.js';

import { rows } from '../../../data';
import { contractReferenceText } from '../../../documents/migration-display';
import { contractTarget, documentTarget } from '../../../documents/navigation';
import RelatedLink from '../../../documents/RelatedLink.vue';
import { invoiceStates, paymentStatus } from '../model';

/**
 * 采购付款记录详情：采购登记 → 财务审核 → 已付款。
 * 财务在这里确认付款或退回；采购在退回、草稿时修改后重新提交，审核中可以撤回。
 */
const props = defineProps<{
  busy?: boolean;
  record: ProcurementFinanceRecord;
}>();
const emit = defineEmits<{
  action: [action: string];
  sources: [];
}>();

const state = computed(() => paymentStatus(props.record));
const can = (action: string) => props.record.allowedActions.includes(action);
const money = (value: unknown, currency = props.record.currency) => {
  const number = new BigNumber(String(value ?? ''));
  return number.isFinite()
    ? `${currency ?? ''} ${number.toFormat(2)}`.trim()
    : '—';
};
function time(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (number: number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
const history = computed(() => rows(props.record.history));
const lastReject = computed(
  () =>
    [...history.value].toReversed().find((entry) => entry.action === 'REJECT')
      ?.reason as string | undefined,
);
const reviewed = computed(() =>
  ['CONFIRMED', 'PARTIALLY_REVERSED', 'REVERSED'].includes(props.record.status),
);
const steps = computed(() => {
  const record = props.record;
  const step = state.value.step;
  const submitted = record.submittedByName
    ? `${record.submittedByName} · ${time(record.submittedAt)}`
    : `${record.createdByName ?? ''}${record.status === 'DRAFT' ? ' · 未提交' : ''}`;
  let review = '等待财务确认';
  if (record.status === 'REJECTED')
    review = `${record.reviewedByName ?? '财务'}退回 · ${time(record.reviewedAt)}`;
  else if (reviewed.value && record.reviewedByName)
    review = `${record.reviewedByName} · ${time(record.reviewedAt)}`;
  else if (step === 'REGISTER') review = '提交后由财务审核';
  return [
    { title: '采购登记', description: submitted },
    {
      title: record.approvalStage === 'DINGTALK' ? '钉钉审批' : '财务审核',
      description: review,
    },
    {
      title: '已付款',
      description: reviewed.value ? `付款日期 ${record.paidAt ?? '—'}` : '',
    },
  ];
});
const current = computed(() => {
  if (state.value.step === 'DONE') return 2;
  if (state.value.step === 'REVIEW' || props.record.status === 'REJECTED')
    return 1;
  return 0;
});
const stepStatus = computed(() => {
  if (props.record.status === 'REJECTED') return 'error' as const;
  if (props.record.status === 'CANCELLED') return 'wait' as const;
  return state.value.step === 'DONE'
    ? ('finish' as const)
    : ('process' as const);
});
const invoice = computed(() =>
  props.record.invoiceState
    ? invoiceStates[String(props.record.invoiceState)]
    : undefined,
);
const items = computed(() => {
  const record = props.record;
  const rmb =
    record.exchange && record.currency !== 'CNY'
      ? `${money(record.rmbAmount, 'CNY')}（${record.exchange.rateDate} 汇率 ${record.exchange.rateToCny}）`
      : undefined;
  return [
    { label: '收款方', value: record.payeeName },
    { label: '收款账户', value: record.payeeAccount, wide: true },
    {
      label: reviewed.value ? '付款日期' : '计划付款日期',
      value: record.paidAt,
    },
    { label: '付款分类', value: record.paymentMethod },
    { label: '付款公司', value: record.payerSnapshot?.name },
    { label: '付款账户', value: record.payerAccount },
    ...(rmb ? [{ label: '人民币金额', value: rmb, wide: true }] : []),
    ...(record.batchNo
      ? [{ label: '集中付款批号', value: record.batchNo }]
      : []),
    { label: '备注', value: record.remark, wide: true },
  ];
});
</script>

<template>
  <div class="payment">
    <div class="hero">
      <div class="hero-main">
        <span class="hero-label">付款金额</span>
        <span class="hero-amount">{{ money(record.amount) }}</span>
        <span class="hero-sub">
          {{ record.payeeName || '收款方未填' }}
          <template v-if="record.paymentMethod">
            · {{ record.paymentMethod }}
          </template>
        </span>
      </div>
      <div class="hero-side">
        <Tag :color="state.color" class="state">{{ state.label }}</Tag>
        <Tag v-if="invoice" :color="invoice.color">{{ invoice.label }}</Tag>
        <Tag v-if="record.agencyPayment" color="warning">代付</Tag>
      </div>
    </div>

    <Steps
      size="small"
      :current="current"
      :status="stepStatus"
      :items="steps"
      class="steps"
    />

    <Alert
      v-if="record.status === 'REJECTED'"
      type="error"
      show-icon
      :message="`财务退回：${lastReject || '未填写原因'}`"
      description="按退回原因修改后重新提交，财务确认付款前不计入已付。"
    />
    <Alert
      v-else-if="
        record.status === 'SUBMITTED' && record.approvalStage !== 'DINGTALK'
      "
      type="info"
      show-icon
      :message="
        can('APPROVE')
          ? '核对金额和收款方，转账后点「确认已付款」，可以同时上传银行回单；不对就退回采购。'
          : '已提交财务审核，财务确认付款后计入已付。审核前可以撤回修改。'
      "
    />
    <Alert
      v-else-if="record.status === 'DRAFT'"
      type="warning"
      show-icon
      message="草稿还没提交，财务看不到。核对后提交财务审核。"
    />

    <div class="actions">
      <Button
        v-if="can('APPROVE')"
        type="primary"
        :disabled="busy"
        @click="emit('action', 'APPROVE')"
      >
        确认已付款
      </Button>
      <Button
        v-if="can('REJECT')"
        danger
        :disabled="busy"
        @click="emit('action', 'REJECT')"
      >
        退回采购
      </Button>
      <Button
        v-if="can('UPDATE')"
        type="primary"
        :disabled="busy"
        @click="emit('action', 'UPDATE')"
      >
        修改并提交审核
      </Button>
      <Button
        v-if="can('SUBMIT')"
        :disabled="busy"
        @click="emit('action', 'SUBMIT')"
      >
        {{ record.status === 'REJECTED' ? '不修改，重新提交' : '提交财务审核' }}
      </Button>
      <Button
        v-if="can('CONFIRM')"
        :disabled="busy"
        @click="emit('action', 'CONFIRM')"
      >
        直接确认已付款
      </Button>
      <Button
        v-if="can('WITHDRAW')"
        :disabled="busy"
        @click="emit('action', 'WITHDRAW')"
      >
        撤回
      </Button>
      <Button
        v-if="can('SET_NO_INVOICE')"
        :disabled="busy"
        @click="emit('action', 'SET_NO_INVOICE')"
      >
        {{ record.noInvoice ? '改为需要发票' : '设为无需发票' }}
      </Button>
      <Button
        v-if="can('REVERSE')"
        danger
        :disabled="busy"
        @click="emit('action', 'REVERSE')"
      >
        退款 / 冲销
      </Button>
      <Button
        v-if="can('CANCEL')"
        danger
        type="text"
        :disabled="busy"
        @click="emit('action', 'CANCEL')"
      >
        取消登记
      </Button>
    </div>

    <dl class="grid">
      <div>
        <dt>{{ record.invoiceId ? '来源（付款发票）' : '采购单' }}</dt>
        <dd v-if="record.invoiceId">
          {{ record.invoice?.code ?? record.invoice?.invoiceNo ?? '付款发票' }}
          · {{ record.invoice?.orderCount ?? 1 }} 个采购单
          <Button type="link" size="small" @click="emit('sources')">
            查看来源
          </Button>
        </dd>
        <dd v-else>
          <RelatedLink
            :target="
              documentTarget('orders', record.contractId, record.orderId)
            "
          >
            {{ record.orderCode ?? '查看采购单' }}
          </RelatedLink>
        </dd>
      </div>
      <div v-if="!record.invoiceId">
        <dt>关联合同</dt>
        <dd>
          <RelatedLink :target="contractTarget(record.contractId)">
            {{
              contractReferenceText(
                record.contractCode,
                record.contractName,
                record.contractId,
              )
            }}
          </RelatedLink>
        </dd>
      </div>
      <div v-for="item in items" :key="item.label" :class="{ wide: item.wide }">
        <dt>{{ item.label }}</dt>
        <dd>{{ item.value || '—' }}</dd>
      </div>
      <div v-if="invoice">
        <dt>收票</dt>
        <dd>
          {{ invoice.label }}
          <template
            v-if="record.invoicedAmount && invoice.label !== '无需发票'"
          >
            · 已收 {{ money(record.invoicedAmount) }}
          </template>
        </dd>
      </div>
    </dl>
  </div>
</template>

<style scoped>
.payment {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.hero {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
  padding: 16px 18px;
  background: hsl(var(--accent));
  border-radius: 10px;
}

.hero-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.hero-label,
.hero-sub {
  font-size: 13px;
  color: hsl(var(--muted-foreground));
}

.hero-amount {
  font-size: 26px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1.3;
}

.hero-side {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.hero-side .state {
  font-size: 13px;
}

.steps {
  padding: 0 4px;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px 20px;
  padding: 14px 16px;
  margin: 0;
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
}

.grid > div {
  min-width: 0;
}

.grid .wide {
  grid-column: span 2;
}

.grid dt {
  margin-bottom: 2px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.grid dd {
  margin: 0;
  overflow-wrap: anywhere;
}

@media (max-width: 900px) {
  .grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .grid .wide {
    grid-column: auto;
  }
}
</style>
