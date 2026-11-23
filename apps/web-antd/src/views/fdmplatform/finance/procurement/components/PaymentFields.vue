<script setup lang="ts">
import type { ProcurementFinanceRecord } from '#/api/fdmplatform/procurement-finance';

import { computed } from 'vue';

import { Button } from 'ant-design-vue';

import { money } from '../../../data';
import {
  businessDocumentTarget,
  contractTarget,
  documentTarget,
  entityTarget,
} from '../../../documents/navigation';
import RelatedLink from '../../../documents/RelatedLink.vue';
import { invoiceStates } from '../model';

const props = defineProps<{ record: ProcurementFinanceRecord }>();
const emit = defineEmits<{ sources: [] }>();

const contract = computed(() =>
  props.record.contractId === 'standalone'
    ? undefined
    : contractTarget(props.record.contractId),
);
const contractLabel = computed(() => {
  const { contractCode, contractInternalOrderNo } = props.record;
  return (
    contractInternalOrderNo ||
    (contractCode ? `合同单号 ${contractCode}` : '内部单号待补齐')
  );
});
const order = computed(() =>
  contract.value
    ? documentTarget('orders', props.record.contractId, props.record.orderId)
    : businessDocumentTarget('orders', props.record.orderId),
);
const orderLabel = computed(() => {
  const subject = props.record.orderSubject?.trim();
  const code = props.record.orderCode?.trim();
  return subject && code && subject !== code
    ? `${subject}（单号 ${code}）`
    : subject || code || '查看采购单';
});
const supplier = computed(
  () => props.record.supplierName || props.record.invoice?.supplierName,
);
const invoice = computed(() => {
  const state = props.record.invoiceState;
  return state ? invoiceStates[state] : undefined;
});
const paid = computed(() =>
  ['CONFIRMED', 'PARTIALLY_REVERSED', 'REVERSED'].includes(props.record.status),
);
const items = computed(() => {
  const record = props.record;
  const rmb =
    record.exchange && record.currency !== 'CNY'
      ? `${money(record.rmbAmount, 'CNY')}（${record.exchange.rateDate} 汇率 ${record.exchange.rateToCny}）`
      : undefined;
  let kind = '常规付款';
  if (record.sourceType === 'OTHER') kind = '其他付款';
  else if (record.invoiceId) kind = '发票付款';
  else if (record.batchNo) kind = '集中付款';
  else if (record.sourceDocumentId) kind = '历史请款付款';
  const pendingSettlement =
    (order.value || record.invoiceId) &&
    ['APPROVED', 'DRAFT', 'REJECTED', 'SUBMITTED'].includes(record.status);
  const settledAmount = record.settledAmount ?? null;
  const invoicedAmount = record.invoicedAmount ?? null;
  let settlementValue = pendingSettlement ? '待确认' : undefined;
  if (settledAmount !== null) {
    settlementValue = money(settledAmount, record.currency);
  }
  return [
    { label: paid.value ? '付款日期' : '计划付款日期', value: record.paidAt },
    {
      label: '冲销金额',
      value: settlementValue,
    },
    { label: '负责人', value: record.responsibleName || record.ownerName },
    { label: '所有者', value: record.ownerName },
    {
      label: '所属公司',
      value: record.payerSnapshot?.name || record.migration?.sourceCompanyName,
    },
    { label: '付款方式', value: record.payerAccount },
    { label: '付款分类', value: record.paymentMethod },
    {
      label: '是否收票',
      value:
        invoice.value &&
        invoicedAmount !== null &&
        ['INVOICED', 'PARTIAL'].includes(record.invoiceState ?? '')
          ? `${invoice.value.label} · 已收 ${money(invoicedAmount, record.currency)}`
          : invoice.value?.label || (record.noInvoice ? '无需发票' : undefined),
    },
    { label: '收款账户信息', value: record.payeeAccount, wide: true },
    { label: '类型', value: kind },
    ...(record.batchNo
      ? [{ label: '集中付款批号', value: record.batchNo }]
      : []),
    ...(rmb ? [{ label: '人民币金额', value: rmb, wide: true }] : []),
    { label: '备注', value: record.remark, wide: true },
  ];
});
</script>

<template>
  <dl class="grid">
    <div v-if="record.invoiceId" class="wide">
      <dt>来源（付款发票）</dt>
      <dd>
        {{ record.invoice?.code ?? record.invoice?.invoiceNo ?? '付款发票' }}
        · {{ record.invoice?.orderCount ?? 1 }} 个采购单
        <Button type="link" size="small" @click="emit('sources')">
          查看来源
        </Button>
      </dd>
    </div>
    <template v-else-if="order || contract">
      <div class="wide">
        <dt>采购单</dt>
        <dd>
          <RelatedLink v-if="order" :target="order">
            {{ orderLabel }}
          </RelatedLink>
          <span v-else>—</span>
        </dd>
      </div>
      <div class="wide">
        <dt>关联合同</dt>
        <dd>
          <RelatedLink v-if="contract" :target="contract">
            {{ contractLabel }}
          </RelatedLink>
          <span v-else>尚未关联合同</span>
        </dd>
      </div>
    </template>
    <div v-if="supplier" class="wide">
      <dt>供应商</dt>
      <dd>
        <RelatedLink :target="entityTarget('supplier', record.supplierId)">
          {{ supplier }}
        </RelatedLink>
      </dd>
    </div>
    <div class="wide">
      <dt>收款方</dt>
      <dd>{{ record.payeeName || '—' }}</dd>
    </div>
    <div v-for="item in items" :key="item.label" :class="{ wide: item.wide }">
      <dt>{{ item.label }}</dt>
      <dd>{{ item.value || '—' }}</dd>
    </div>
  </dl>
</template>

<style scoped>
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

.wide {
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

  .wide {
    grid-column: auto;
  }
}
</style>
