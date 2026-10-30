<script setup lang="ts">
import type { Contract, Directory } from '#/api/fdmplatform';
import type { ContractBoardRow } from '#/api/fdmplatform/contract-board';

import { computed, onMounted, ref } from 'vue';

import { Button, Tag } from 'ant-design-vue';

import { getContract } from '#/api/fdmplatform';

import { contractItemPipeline } from '../../components/contract-progress';
import { errorText } from '../../data';
import { personLabel } from '../../directory';
import { amountText, plain } from './model';

const props = defineProps<{ directory?: Directory; row: ContractBoardRow }>();
const emit = defineEmits<{ open: [tab?: string] }>();
const contract = ref<Contract>();
const error = ref('');
const loading = ref(true);

const items = computed(() => contractItemPipeline(contract.value).slice(0, 6));
const receipts = computed(() =>
  (contract.value?.finance?.receipts ?? [])
    .filter((receipt) => receipt.kind === 'PAYMENT' || !receipt.kind)
    .slice(-4)
    .reverse(),
);
const statusLabels: Record<string, string> = {
  CONFIRMED: '已确认',
  PENDING: '待确认',
};

onMounted(async () => {
  try {
    contract.value = await getContract(props.row.id);
  } catch (error_) {
    error.value = errorText(error_);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="row-panel" :aria-busy="loading">
    <p v-if="loading" class="muted">正在读取合同明细…</p>
    <p v-else-if="error" class="error">{{ error }}</p>
    <template v-else-if="contract">
      <section>
        <h5>产品明细</h5>
        <div v-for="item in items" :key="item.id" class="line">
          <div class="line-main">
            <span class="name" :title="item.specification">{{
              item.skuName
            }}</span>
            <span class="num">{{ plain(item.quantity) }} {{ item.unit }} ×
              {{ item.unitPrice ?? '待定价' }}</span>
          </div>
          <div class="line-sub">
            <span>申请 {{ item.requestedQuantity ?? '待核对' }} · 已下单
              {{ item.orderedQuantity ?? '—' }} · 已到
              {{ item.arrivedQuantity ?? '—' }} · 已发
              {{ item.shippedQuantity ?? '待核对' }}</span>
            <b class="num">{{
              amountText(item.lineAmount, contract.currency)
            }}</b>
          </div>
        </div>
        <p v-if="contract.items.length > items.length" class="muted">
          另有 {{ contract.items.length - items.length }} 项，打开合同查看全部
        </p>
      </section>
      <section>
        <h5>收款</h5>
        <div v-for="receipt in receipts" :key="receipt.id" class="line-sub">
          <span>{{ receipt.receivedAt ?? '日期未填' }}
            {{ receipt.paymentMethod ?? '' }}</span>
          <span class="num">{{ amountText(receipt.amount, String(receipt.currency ?? ''))
            }}<Tag
              :color="receipt.status === 'CONFIRMED' ? 'green' : 'orange'"
              class="mini"
              >{{ statusLabels[String(receipt.status)] ?? receipt.status }}</Tag></span>
        </div>
        <p v-if="!receipts.length" class="muted">还没有登记回款</p>
        <Button
          size="small"
          type="link"
          class="more"
          @click="emit('open', 'finance')"
        >
          收款与开票 →
        </Button>
      </section>
      <section>
        <h5>关联单据</h5>
        <dl class="kv">
          <dt>采购申请</dt>
          <dd>
            {{ row.counts.requests }} 份<template v-if="row.buyers.length">
              ·
              {{
                row.buyers
                  .map((id) => personLabel(directory, id).split(' · ')[0])
                  .join('、')
              }}
              经办
            </template>
          </dd>
          <dt>报价 / 采购单</dt>
          <dd>{{ row.counts.quotes }} / {{ row.counts.orders }}</dd>
          <dt>发货</dt>
          <dd>{{ row.counts.shipments }} 次</dd>
          <dt>回款 / 发票</dt>
          <dd>{{ row.counts.receipts }} / {{ row.counts.invoices }}</dd>
          <dt>合同附件</dt>
          <dd>{{ row.counts.attachments || '无' }}</dd>
        </dl>
        <Button size="small" type="link" class="more" @click="emit('open')">
          打开合同 →
        </Button>
      </section>
    </template>
  </div>
</template>

<style scoped>
.row-panel {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr) minmax(0, 0.9fr);
  gap: 20px;
  padding: 4px 8px 4px 28px;
}

h5 {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 500;
  color: hsl(var(--muted-foreground));
}

.line {
  padding: 6px 0;
  border-bottom: 1px solid hsl(var(--border));
}

.line:last-of-type {
  border-bottom: 0;
}

.line-main,
.line-sub {
  display: flex;
  gap: 12px;
  justify-content: space-between;
  font-size: 12.5px;
}

.line-sub {
  color: hsl(var(--muted-foreground));
}

section > .line-sub {
  padding: 5px 0;
  border-bottom: 1px solid hsl(var(--border));
}

.name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.num {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.kv {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 3px 12px;
  margin: 0;
  font-size: 12.5px;
}

.kv dt {
  color: hsl(var(--muted-foreground));
}

.kv dd {
  margin: 0;
}

.muted {
  margin: 4px 0 0;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.error {
  color: hsl(var(--destructive));
}

.mini {
  margin: 0 0 0 6px;
  font-size: 11px;
  line-height: 16px;
}

.more {
  padding: 0;
  margin-top: 4px;
}

@media (max-width: 900px) {
  .row-panel {
    grid-template-columns: minmax(0, 1fr);
    padding-left: 8px;
  }
}
</style>
