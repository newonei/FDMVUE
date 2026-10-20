<script setup lang="ts">
import type { BusinessRecord, Contract } from '#/api/fdmplatform';

import { computed } from 'vue';

import { Tag } from 'ant-design-vue';

import { label, money } from '../data';
import { receiptSettlement } from './model';
import { contractTarget, entityTarget } from './navigation';
import RelatedLink from './RelatedLink.vue';

/** 回款详情抬头（金智式）：金额、状态、关联合同客户，以及核销/退款/余额 */
const props = defineProps<{
  company: string;
  contract: Contract;
  display: (key: string) => string;
  record: BusinessRecord;
}>();

const currency = computed(() =>
  String(props.record.currency ?? props.contract.currency ?? ''),
);
const settlement = computed(() =>
  receiptSettlement(props.contract, props.record),
);
const confirmed = computed(() => props.record.status === 'CONFIRMED');
const facts = computed(() =>
  [
    ['到账日期', props.display('receivedAt')],
    ['折人民币', props.display('rmbAmount')],
    ['到款方式', props.display('paymentMethod')],
    ['收款账户', props.display('accountRef')],
  ].filter(([, value]) => value && value !== '—'),
);
</script>

<template>
  <section class="receipt-summary">
    <div class="receipt-summary__head">
      <div class="receipt-summary__title">
        <Tag color="blue">回款记录</Tag>
        <Tag :color="confirmed ? 'success' : 'warning'">
          {{ label(record.status) }}
        </Tag>
      </div>
      <div class="receipt-summary__amount">
        {{ money(record.amount, currency) }}
      </div>
      <div class="receipt-summary__facts">
        <span v-for="[name, value] in facts" :key="name">
          <em>{{ name }}</em>{{ value }}
        </span>
      </div>
    </div>
    <dl class="receipt-summary__links">
      <div>
        <dt>对应客户</dt>
        <dd>
          <RelatedLink :target="entityTarget('customer', contract.customerId)">
            {{ contract.customerName }}
          </RelatedLink>
        </dd>
      </div>
      <div>
        <dt>合同/订单</dt>
        <dd>
          <RelatedLink :target="contractTarget(contract.id)">
            {{ contract.code }} · {{ contract.name }}
          </RelatedLink>
        </dd>
      </div>
      <div v-if="company">
        <dt>订单所属公司</dt>
        <dd>{{ company }}</dd>
      </div>
    </dl>
    <div v-if="confirmed" class="receipt-summary__stats">
      <div>
        <span>已核销</span>
        <strong>{{ money(settlement.allocated, currency) }}</strong>
      </div>
      <div>
        <span>退款/冲销</span>
        <strong>{{ money(settlement.refunded, currency) }}</strong>
      </div>
      <div>
        <span>可核销余额</span>
        <strong class="receipt-summary__available">
          {{ money(settlement.available, currency) }}
        </strong>
      </div>
    </div>
  </section>
</template>

<style scoped>
.receipt-summary {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px 20px;
  background: hsl(var(--accent) / 50%);
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.receipt-summary__head {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.receipt-summary__title {
  display: flex;
  align-items: center;
}

.receipt-summary__amount {
  font-size: 26px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1.3;
}

.receipt-summary__facts {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 20px;
  color: hsl(var(--foreground) / 85%);
}

.receipt-summary__facts em,
.receipt-summary__links dt,
.receipt-summary__stats span {
  margin-right: 6px;
  font-style: normal;
  color: hsl(var(--muted-foreground));
}

.receipt-summary__links {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 6px 24px;
  margin: 0;
}

.receipt-summary__links > div {
  display: flex;
  min-width: 0;
}

.receipt-summary__links dt {
  flex: none;
  white-space: nowrap;
}

.receipt-summary__links dd {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.receipt-summary__stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  padding-top: 12px;
  border-top: 1px dashed hsl(var(--border));
}

.receipt-summary__stats > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.receipt-summary__stats strong {
  font-size: 16px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.receipt-summary__available {
  color: hsl(var(--primary));
}

@media (max-width: 640px) {
  .receipt-summary__stats {
    grid-template-columns: 1fr;
  }
}
</style>
