<script setup lang="ts">
import type { Directory } from '#/api/fdmplatform';
import type {
  AgingBucket,
  ContractReceivables,
  ReceivableRow,
} from '#/api/fdmplatform/contract-board';

import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { Alert, Button, Input, Table } from 'ant-design-vue';

import { getDirectory } from '#/api/fdmplatform';
import { getContractReceivables } from '#/api/fdmplatform/contract-board';

import { errorText } from '../../data';
import { personName } from '../../directory';
import { amountText, currencyLine } from '../../trade/contracts/model';

import '../../components/compact-tables.css';

defineOptions({ name: 'FdmPlatformContractReceivables' });

const agingLabels: Record<AgingBucket, string> = {
  UNSHIPPED: '还没发货',
  D30: '发货 30 天内',
  D60: '31–60 天',
  D90: '61–90 天',
  OVER90: '超过 90 天',
};
const router = useRouter();
const data = ref<ContractReceivables>();
const directory = ref<Directory>();
const aging = ref<AgingBucket>();
const keyword = ref('');
const mine = ref(false);
const pageNo = ref(1);
const pageSize = ref(20);
const loading = ref(false);
const error = ref('');
let sequence = 0;

const columns = [
  { title: '合同 / 客户', key: 'contract', width: 230 },
  { title: '负责人', key: 'owner', width: 100 },
  { title: '合同额', key: 'amount', width: 150, align: 'right' as const },
  {
    title: '已确认回款',
    key: 'confirmed',
    width: 130,
    align: 'right' as const,
  },
  { title: '待财务确认', key: 'pending', width: 120, align: 'right' as const },
  { title: '未收', key: 'unpaid', width: 140, align: 'right' as const },
  { title: '账龄', key: 'aging', width: 140 },
  { title: '最近回款', key: 'lastReceipt', width: 100 },
  { title: '操作', key: 'action', width: 90, fixed: 'right' as const },
];

async function load(reset = false) {
  if (reset) pageNo.value = 1;
  const run = ++sequence;
  loading.value = true;
  error.value = '';
  try {
    const result = await getContractReceivables({
      pageNo: pageNo.value,
      pageSize: pageSize.value,
      keyword: keyword.value.trim() || undefined,
      mine: mine.value || undefined,
      aging: aging.value,
    });
    if (run === sequence) data.value = result;
  } catch (error_) {
    if (run === sequence) error.value = errorText(error_);
  } finally {
    if (run === sequence) loading.value = false;
  }
}
function selectAging(value?: AgingBucket) {
  aging.value = aging.value === value ? undefined : value;
  void load(true);
}
function openContract(row: ReceivableRow) {
  void router.push({
    path: '/fdmwaimao/platform-contracts',
    query: { contractId: row.id, tab: 'finance' },
  });
}
function agingText(row: ReceivableRow) {
  if (!row.lastShipDate) return { main: '还没发货', sub: '' };
  return { main: `${row.agingDays} 天`, sub: `最近发货 ${row.lastShipDate}` };
}
onMounted(async () => {
  void load();
  try {
    directory.value = await getDirectory(0);
  } catch {
    // 只影响负责人显示
  }
});
</script>

<template>
  <div class="receivables">
    <p class="intro">
      已生效、还有未收款的合同，账龄从最近一次发货算起。金智迁移前的应收只有按客户的汇总，在「客户管理」的未回款里看。
    </p>
    <Alert v-if="error" :message="error" type="error" show-icon />
    <section class="cards" aria-label="应收概况">
      <div class="card total">
        <span>未收合计 · {{ data?.contracts ?? 0 }} 份合同</span>
        <b>{{ currencyLine(data?.unpaid, '没有未收款') }}</b>
        <small>已登记待财务确认 {{ currencyLine(data?.pending, '0') }}</small>
      </div>
      <button
        v-for="bucket in data?.buckets ?? []"
        :key="bucket.key"
        type="button"
        class="card bucket"
        :class="{
          on: aging === bucket.key,
          late: bucket.key === 'OVER90' && bucket.count > 0,
        }"
        @click="selectAging(bucket.key)"
      >
        <span>{{ agingLabels[bucket.key] }}</span>
        <b>{{ bucket.count }}<small>份</small></b>
        <small>{{ currencyLine(bucket.amounts, '—') }}</small>
      </button>
    </section>
    <div class="toolbar">
      <Input.Search
        v-model:value="keyword"
        placeholder="合同号 / 客户 / 产品"
        allow-clear
        style="width: 260px"
        @search="load(true)"
      />
      <div class="seg" role="group" aria-label="查看范围">
        <button
          type="button"
          :class="{ on: !mine }"
          @click="
            mine = false;
            load(true);
          "
        >
          全部
        </button>
        <button
          type="button"
          :class="{ on: mine }"
          @click="
            mine = true;
            load(true);
          "
        >
          我负责的
        </button>
      </div>
      <Button v-if="aging" type="link" @click="selectAging(undefined)">
        清除账龄筛选
      </Button>
      <span class="grow"></span>
      <Button :loading="loading" @click="load()">刷新</Button>
    </div>
    <Table
      class="fdm-business-table"
      size="small"
      table-layout="fixed"
      row-key="id"
      :columns="columns"
      :data-source="data?.list ?? []"
      :loading="loading"
      :scroll="{ x: 1200 }"
      :pagination="{
        current: pageNo,
        pageSize,
        total: data?.total ?? 0,
        showSizeChanger: true,
        showTotal: (count: number) => `共 ${count} 份合同`,
      }"
      @change="
        (pagination) => {
          pageNo = pagination.current ?? 1;
          pageSize = pagination.pageSize ?? 20;
          load();
        }
      "
    >
      <template #emptyText>
        <span class="muted">{{
          loading ? '正在读取' : '当前没有未收款的合同'
        }}</span>
      </template>
      <template #bodyCell="{ column, record }">
        <div v-if="column.key === 'contract'" class="cell">
          <button
            type="button"
            class="code"
            @click="openContract(record as ReceivableRow)"
          >
            {{ record.code }}
          </button>
          <span class="sub" :title="record.customerName">{{
            record.customerName
          }}</span>
        </div>
        <span v-else-if="column.key === 'owner'">{{
          personName(directory, record.ownerUserId)
        }}</span>
        <span v-else-if="column.key === 'amount'" class="num">{{
          amountText(record.amount, record.currency)
        }}</span>
        <span v-else-if="column.key === 'confirmed'" class="num">{{
          amountText(record.money.confirmed)
        }}</span>
        <span
          v-else-if="column.key === 'pending'"
          class="num"
          :class="{ warn: Number(record.money.pending) > 0 }"
          >{{
            Number(record.money.pending) > 0
              ? amountText(record.money.pending)
              : '—'
          }}</span>
        <b v-else-if="column.key === 'unpaid'" class="num">{{
          amountText(record.money.unpaid, record.currency)
        }}</b>
        <div v-else-if="column.key === 'aging'" class="cell">
          <span :class="{ late: (record.agingDays ?? 0) > 90 }">{{
            agingText(record as ReceivableRow).main
          }}</span>
          <span v-if="agingText(record as ReceivableRow).sub" class="sub">{{
            agingText(record as ReceivableRow).sub
          }}</span>
        </div>
        <span v-else-if="column.key === 'lastReceipt'" class="num">{{
          record.lastReceiptDate ?? '—'
        }}</span>
        <Button
          v-else-if="column.key === 'action'"
          type="link"
          size="small"
          @click="openContract(record as ReceivableRow)"
        >
          查看合同
        </Button>
      </template>
    </Table>
  </div>
</template>

<style scoped>
.receivables {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 16px 16px;
}

.intro {
  margin: 0;
  font-size: 13px;
  color: hsl(var(--muted-foreground));
}

.cards {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) repeat(5, minmax(0, 1fr));
  gap: 10px;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: flex-start;
  min-width: 0;
  padding: 10px 14px;
  font: inherit;
  color: inherit;
  text-align: left;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
}

.card span,
.card small {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
}

.card b {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 18px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.card b small {
  margin-left: 3px;
  font-size: 12px;
}

.bucket {
  cursor: pointer;
}

.bucket:hover,
.bucket:focus-visible,
.bucket.on {
  outline: none;
  border-color: hsl(var(--primary));
}

.bucket.on b {
  color: hsl(var(--primary));
}

.bucket.late b,
.late {
  color: hsl(var(--destructive));
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.grow {
  flex: 1;
}

.seg {
  display: inline-flex;
  overflow: hidden;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.seg button {
  padding: 4px 12px;
  font: inherit;
  font-size: 13px;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  background: transparent;
  border: 0;
}

.seg button.on {
  font-weight: 600;
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 10%);
}

.seg button:focus-visible,
.code:focus-visible {
  outline: 2px solid hsl(var(--primary));
  outline-offset: -2px;
}

.cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.code {
  padding: 0;
  font: inherit;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-weight: 600;
  color: hsl(var(--primary));
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 0;
}

.sub {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
}

.num {
  font-variant-numeric: tabular-nums;
}

.warn {
  color: color-mix(in srgb, hsl(var(--warning)) 55%, hsl(var(--foreground)));
}

.muted {
  color: hsl(var(--muted-foreground));
}

@media (max-width: 1100px) {
  .cards {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .card.total {
    grid-column: 1 / -1;
  }
}
</style>
