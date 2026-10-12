<script setup lang="ts">
import type { RelatedTarget } from '../../documents/navigation';

import type {
  CashDirection,
  CashFactView,
  CashPartyRow,
  CashPartySnapshot,
} from '#/api/fdmplatform/finance-stats';

import { computed, onMounted, ref } from 'vue';

import { Alert, Button, Spin } from 'ant-design-vue';
import BigNumber from 'bignumber.js';

import { getCashParty } from '#/api/fdmplatform/finance-stats';

import { errorText } from '../../data';
import {
  businessRecordTarget,
  documentTarget,
} from '../../documents/navigation';
import RelatedLink from '../../documents/RelatedLink.vue';
import {
  directionWords,
  factSource,
  moneyShort,
  nativeShort,
  rmb,
} from './model';
import RankBars from './RankBars.vue';

const props = defineProps<{ direction: CashDirection; row: CashPartyRow }>();
const emit = defineEmits<{ profile: [row: CashPartyRow] }>();
const words = computed(() => directionWords[props.direction]);
const snapshot = ref<CashPartySnapshot>();
const loading = ref(false);
const loadError = ref('');

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    snapshot.value = await getCashParty(props.direction, props.row.key);
  } catch (error) {
    loadError.value = errorText(error);
  } finally {
    loading.value = false;
  }
}
onMounted(load);

const years = computed(() => {
  const rows = snapshot.value?.years ?? [];
  const max = BigNumber.max(1, ...rows.map((row) => new BigNumber(row.amount)));
  return rows.map((row) => ({
    ...row,
    width: `${BigNumber.max(0, new BigNumber(row.amount)).dividedBy(max).multipliedBy(100).toFixed(1)}%`,
  }));
});
const accounts = computed(() =>
  (snapshot.value?.accounts ?? []).map((account) => ({
    key: account.name,
    name: account.name,
    amount: account.amount,
    hint: `${account.count} 笔`,
    muted: account.other,
  })),
);
/** 合同回款跳到回款记录，金智集中回款 / 付款跳到历史单据，采购付款跳到付款详情。 */
function target(fact: CashFactView): RelatedTarget | undefined {
  if (fact.standaloneId)
    return businessRecordTarget(
      props.direction === 'IN' ? 'RECEIPT' : 'PURCHASE_PAYMENT',
      fact.standaloneId,
    );
  if (props.direction === 'IN')
    return documentTarget('receipts', fact.contractId, fact.id);
  return { type: 'procurementFinance', id: fact.id };
}
</script>

<template>
  <Spin :spinning="loading">
    <Alert v-if="loadError" type="error" show-icon :message="loadError">
      <template #action>
        <Button size="small" @click="load">重试</Button>
      </template>
    </Alert>
    <div v-else-if="snapshot" class="snapshot">
      <section>
        <h4>年度{{ words.act }} <small>人民币</small></h4>
        <ul v-if="years.length" class="years">
          <li v-for="year in years" :key="year.year">
            <span>{{ year.year }}</span>
            <span class="track" :class="direction"><span :style="{ width: year.width }"></span></span>
            <b>{{ moneyShort(year.amount) }}</b>
          </li>
        </ul>
        <p v-else class="muted">没有可折算人民币的{{ words.act }}</p>
      </section>
      <section>
        <h4>
          {{ direction === 'IN' ? '收款账户' : '付款账户' }}
          <small>全部历史 · 人民币</small>
        </h4>
        <RankBars
          :rows="accounts"
          :tone="direction === 'IN' ? 'in' : 'out'"
          empty="没有记录账户"
        />
      </section>
      <section class="recent">
        <h4>
          最近{{ words.act }}
          <small>共 {{ snapshot.count.toLocaleString('en-US') }} 笔</small>
        </h4>
        <table v-if="snapshot.recent.length">
          <tbody>
            <tr v-for="fact in snapshot.recent" :key="fact.id">
              <td class="num">{{ fact.date ?? '—' }}</td>
              <td class="ref">
                <RelatedLink :target="target(fact)">
                  {{
                    fact.contractCode ||
                    (fact.bulk ? `集中${words.act}` : `${words.act}记录`)
                  }}
                </RelatedLink>
                <span class="tag">{{ factSource(fact) }}</span>
              </td>
              <td class="muted account" :title="fact.account ?? ''">
                {{ fact.account || '未注明账户' }}
              </td>
              <td
                class="num right"
                :class="{ negative: Number(fact.amount) < 0 }"
              >
                {{ nativeShort(fact.amount, fact.currency) }}
              </td>
              <td class="num right muted">
                {{
                  fact.cny === null
                    ? '未折算'
                    : fact.currency === 'CNY'
                      ? ''
                      : rmb(fact.cny)
                }}
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="muted">没有{{ words.act }}记录</p>
        <div v-if="row.id" class="actions">
          <Button size="small" @click="emit('profile', row)">
            {{ direction === 'IN' ? '客户档案' : '供应商资料' }}
          </Button>
        </div>
      </section>
    </div>
  </Spin>
</template>

<style scoped>
.snapshot {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1fr) minmax(0, 1.6fr);
  gap: 24px;
  padding: 4px 8px;
}

h4 {
  display: flex;
  gap: 6px;
  align-items: baseline;
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
}

h4 small,
.muted {
  font-size: 12px;
  font-weight: 400;
  color: hsl(var(--muted-foreground));
}

.years {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.years li {
  display: grid;
  grid-template-columns: 3em minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  font-size: 12px;
}

.years b {
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.track {
  height: 8px;
  overflow: hidden;
  background: hsl(var(--accent));
  border-radius: 4px;
}

.track span {
  display: block;
  height: 100%;
  background: hsl(var(--primary));
  border-radius: 4px;
}

.track.OUT span {
  background: hsl(var(--warning) / 75%);
}

table {
  width: 100%;
  font-size: 12px;
  border-collapse: collapse;
}

td {
  padding: 3px 6px 3px 0;
  vertical-align: top;
  white-space: nowrap;
}

.ref {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.account {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.num {
  font-variant-numeric: tabular-nums;
}

.right {
  text-align: right;
}

.negative {
  color: hsl(var(--destructive));
}

.tag {
  display: inline-block;
  padding: 0 4px;
  margin-left: 4px;
  font-size: 11px;
  line-height: 16px;
  color: hsl(var(--muted-foreground));
  border: 1px solid hsl(var(--border));
  border-radius: 3px;
}

.actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

@media (max-width: 1100px) {
  .snapshot {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
