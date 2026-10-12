<script setup lang="ts">
import type {
  CashDirection,
  CashPartyFilter,
  CashPartyRow,
  CashPartySort,
  FinanceOverview,
} from '#/api/fdmplatform/finance-stats';

import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { downloadFileFromBlobPart, formatDate } from '@vben/utils';

import { Alert, Button, Input, message, Table, Tag } from 'ant-design-vue';

import {
  getCustomerReceipts,
  getFinanceOverview,
  getSupplierPayments,
} from '#/api/fdmplatform/finance-stats';

import { errorText } from '../../data';
import { entityTarget, navigationRoute } from '../../documents/navigation';
import CashPartySnapshot from './CashPartySnapshot.vue';
import {
  cashAgo,
  cashPartyCsv,
  changeText,
  currencyMix,
  directionWords,
  factSource,
  nativeShort,
  paidShare,
  partyTrend,
  receivableText,
  rmb,
  sparkBars,
  tierColors,
  tierLabels,
} from './model';

import '../../components/compact-tables.css';

/** 客户回款（IN）与供应商付款（OUT）共用：分层卡片、按人民币排序的列表和行内速览。 */
const props = defineProps<{ direction: CashDirection }>();
const router = useRouter();
const words = computed(() => directionWords[props.direction]);
const isIn = computed(() => props.direction === 'IN');
const rows = ref<CashPartyRow[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const keyword = ref('');
const tier = ref<'ALL' | CashPartyFilter>('ALL');
const sort = ref<CashPartySort>('RECENT_12');
const order = ref<'ASC' | 'DESC'>('DESC');
const loading = ref(false);
const exporting = ref(false);
const panelError = ref('');
const overview = ref<FinanceOverview>();
const expandedKeys = ref<string[]>([]);
let sequence = 0;

const sortColumns: Record<string, CashPartySort> = {
  recent12: 'RECENT_12',
  total: 'TOTAL',
  last: 'LAST',
  receivable: 'RECEIVABLE',
};
function sortOrder(key: string) {
  if (sortColumns[key] !== sort.value) return null;
  return order.value === 'ASC' ? ('ascend' as const) : ('descend' as const);
}
const columns = computed(() => {
  const sortable = (key: string) => ({
    sorter: true,
    sortOrder: sortOrder(key),
    sortDirections: ['descend', 'ascend'] as ('ascend' | 'descend')[],
  });
  return [
    { title: words.value.party, key: 'name', width: 240 },
    { title: '分层', key: 'tier', width: 112 },
    {
      title: `近 12 个月${words.value.act}`,
      key: 'recent12',
      width: 220,
      align: 'right' as const,
      ...sortable('recent12'),
    },
    {
      title: `累计${words.value.act}`,
      key: 'total',
      width: 170,
      align: 'right' as const,
      ...sortable('total'),
    },
    isIn.value
      ? {
          title: '未回款',
          key: 'receivable',
          width: 150,
          align: 'right' as const,
          ...sortable('receivable'),
        }
      : {
          title: '同期采购额',
          key: 'purchase',
          width: 150,
          align: 'right' as const,
        },
    {
      title: `最近${words.value.act}`,
      key: 'last',
      width: 190,
      ...sortable('last'),
    },
    {
      title: isIn.value ? '收款账户' : '付款账户',
      key: 'accounts',
      width: 170,
    },
  ];
});
const scrollX = computed(
  () => columns.value.reduce((sum, column) => sum + column.width, 0) + 48,
);

const tierCounts = computed(() =>
  isIn.value ? overview.value?.customerTiers : overview.value?.supplierTiers,
);
const cards = computed(() => {
  const view = overview.value;
  const counts = tierCounts.value;
  const recent = isIn.value ? view?.recent12.in : view?.recent12.out;
  const previous = isIn.value ? view?.previous12.in : view?.previous12.out;
  const change = view ? changeText(recent, previous) : undefined;
  const count = (value?: number) =>
    value === undefined ? '—' : value.toLocaleString('en-US');
  const list: {
    dot?: string;
    key: 'ALL' | CashPartyFilter;
    label: string;
    sub: string;
    tone?: string;
    value: string;
  }[] = [
    {
      key: 'ALL',
      label: `近 12 个月${words.value.act}`,
      value: view ? rmb(recent) : '—',
      sub: change
        ? `${count(counts?.total)} 个${words.value.party} · ${change.text}`
        : '',
      tone: isIn.value ? change?.tone : 'muted',
    },
    {
      key: 'ACTIVE',
      label: '活跃',
      dot: 'active',
      value: count(counts?.ACTIVE),
      sub: `近 90 天有${words.value.act}`,
    },
    {
      key: 'FOLLOW',
      label: '需跟进',
      dot: 'follow',
      value: count(counts?.FOLLOW),
      sub: `91–365 天没有${words.value.act}`,
    },
    {
      key: 'SLEEP',
      label: '沉睡',
      dot: 'sleep',
      value: count(counts?.SLEEP),
      sub: `超过 1 年没有${words.value.act}`,
    },
  ];
  if (isIn.value)
    list.push({
      key: 'RECEIVABLE',
      label: '有未回款',
      dot: 'owed',
      value: count(view?.receivableCustomers),
      sub: '金智客户汇总 + 新系统合同',
    });
  return list;
});
const unconverted = computed(() => {
  const view = overview.value;
  if (!view) return 0;
  return isIn.value ? view.unconverted.in : view.unconverted.out;
});

function query() {
  return {
    keyword: keyword.value.trim() || undefined,
    tier: tier.value === 'ALL' ? undefined : tier.value,
    sort: sort.value,
    order: order.value,
  };
}
function fetchPage(
  params: ReturnType<typeof query> & { pageNo: number; pageSize: number },
) {
  return isIn.value ? getCustomerReceipts(params) : getSupplierPayments(params);
}
async function load(reset = false) {
  if (reset) page.value = 1;
  const run = ++sequence;
  loading.value = true;
  panelError.value = '';
  try {
    const result = await fetchPage({
      ...query(),
      pageNo: page.value,
      pageSize: pageSize.value,
    });
    if (run !== sequence) return;
    rows.value = result.list;
    total.value = result.total;
    if (!result.list.some((row) => expandedKeys.value.includes(row.key)))
      expandedKeys.value = [];
  } catch (error) {
    if (run === sequence) panelError.value = errorText(error);
  } finally {
    if (run === sequence) loading.value = false;
  }
}
async function loadOverview() {
  try {
    overview.value = await getFinanceOverview();
  } catch {
    overview.value = undefined;
  }
}
function reload() {
  void load();
  void loadOverview();
}
function selectTier(value: 'ALL' | CashPartyFilter) {
  tier.value = tier.value === value && value !== 'ALL' ? 'ALL' : value;
  void load(true);
}
function tableChange(
  pagination: { current?: number; pageSize?: number },
  _filters: unknown,
  sorter: unknown,
  extra?: { action?: string },
) {
  if (extra?.action === 'sort') {
    const current = (Array.isArray(sorter) ? sorter[0] : sorter) as
      | undefined
      | { columnKey?: string; order?: 'ascend' | 'descend' | null };
    const key = current?.order
      ? sortColumns[current.columnKey ?? '']
      : undefined;
    sort.value = key ?? 'RECENT_12';
    order.value = key && current?.order === 'ascend' ? 'ASC' : 'DESC';
    page.value = 1;
  } else {
    page.value = pagination.current ?? 1;
    pageSize.value = pagination.pageSize ?? 20;
  }
  void load();
}
function expand(expanded: boolean, record: CashPartyRow) {
  expandedKeys.value = expanded ? [record.key] : [];
}
function toggle(record: CashPartyRow) {
  expand(!expandedKeys.value.includes(record.key), record);
}
function profile(record: CashPartyRow) {
  const target = entityTarget(isIn.value ? 'customer' : 'supplier', record.id);
  if (target) void router.push(navigationRoute(target));
}
async function exportCsv() {
  exporting.value = true;
  try {
    const all: CashPartyRow[] = [];
    for (let pageNo = 1; ; pageNo++) {
      const result = await fetchPage({ ...query(), pageNo, pageSize: 100 });
      all.push(...result.list);
      if (result.list.length === 0 || all.length >= result.total) break;
    }
    downloadFileFromBlobPart({
      source: new Blob([cashPartyCsv(props.direction, all)], {
        type: 'text/csv;charset=utf-8',
      }),
      fileName: `${isIn.value ? '客户回款' : '供应商付款'}-${formatDate(new Date(), 'YYYYMMDD-HHmm')}.csv`,
    });
    message.success(`已导出 ${all.length} 个${words.value.party}`);
  } catch (error) {
    message.error(errorText(error));
  } finally {
    exporting.value = false;
  }
}
function bars(record: CashPartyRow) {
  const months = overview.value?.months.slice(-12) ?? [];
  return sparkBars(record.stats.monthly ?? [], months).map((bar) => ({
    ...bar,
    title: `${bar.month || '月份'}：${bar.empty ? `无${words.value.act}` : rmb(bar.value.toString())}`,
  }));
}
onMounted(() => {
  void load();
  void loadOverview();
});
onBeforeUnmount(() => {
  sequence++;
});
</script>

<template>
  <div class="cash-list">
    <p class="intro">
      <template v-if="isIn">
        按客户汇总全部回款（含金智迁入的合同回款与集中回款），外币按回款时冻结的汇率或金智本位币金额折人民币；退款与冲销已扣除。未回款与「客户管理」同一口径。
      </template>
      <template v-else>
        按收款方汇总全部采购付款（含金智逐单付款与集中付款，金智付款没有币种按人民币计）；部分冲销按冲销后净额。「同期采购额」取供应商管理的近
        12 个月采购单金额，两者差距大时值得核对欠款或预付。
      </template>
    </p>
    <Alert v-if="panelError" type="error" show-icon :message="panelError" />
    <div class="cards" :class="{ five: isIn }">
      <button
        v-for="card in cards"
        :key="card.key"
        type="button"
        class="card"
        :class="{ selected: tier === card.key }"
        :aria-pressed="tier === card.key"
        @click="selectTier(card.key)"
      >
        <span class="card-label">
          <span v-if="card.dot" class="dot" :class="card.dot"></span>
          {{ card.label }}
        </span>
        <span class="card-value">{{ card.value }}</span>
        <span class="card-sub" :class="card.tone">{{ card.sub }}</span>
      </button>
    </div>
    <p v-if="overview" class="note">
      统计截至 {{ overview.asOf
      }}<template v-if="overview.migratedUntil">
        · 金智数据截至 {{ overview.migratedUntil }}，之后只有新系统登记的{{
          words.act
        }}
      </template>
      · 金额为人民币，满一万显示为「万」<template v-if="unconverted">
        · 近 12 个月有 {{ unconverted }} 笔外币{{ words.act }}缺汇率，未计入金额
      </template>
    </p>
    <div class="toolbar">
      <Input.Search
        v-model:value="keyword"
        :placeholder="`${words.party}名称、编号或账户`"
        allow-clear
        style="width: 260px"
        @search="load(true)"
      />
      <Tag
        v-if="tier !== 'ALL'"
        color="blue"
        closable
        @close.prevent="selectTier('ALL')"
      >
        {{ tier === 'RECEIVABLE' ? '有未回款' : tierLabels[tier] }}
      </Tag>
      <span class="grow"></span>
      <Button :loading="loading" @click="reload">刷新</Button>
      <Button :loading="exporting" @click="exportCsv">导出</Button>
    </div>
    <Table
      class="fdm-business-table cash-table"
      size="small"
      table-layout="fixed"
      :columns="columns"
      :data-source="rows"
      row-key="key"
      :loading="loading"
      :scroll="{ x: scrollX }"
      :expanded-row-keys="expandedKeys"
      :pagination="{
        current: page,
        pageSize,
        total,
        showSizeChanger: true,
        showTotal: (count: number) =>
          `共 ${count.toLocaleString('en-US')} 个${words.party}`,
      }"
      @expand="expand"
      @change="tableChange"
    >
      <template #expandedRowRender="{ record }">
        <CashPartySnapshot
          :direction="direction"
          :row="record as CashPartyRow"
          @profile="profile"
        />
      </template>
      <template #bodyCell="{ column, record }">
        <div v-if="column.key === 'name'" class="stack">
          <button
            type="button"
            class="name"
            :title="`展开${words.party}${words.act}速览`"
            @click="toggle(record as CashPartyRow)"
          >
            {{ record.name || '未注明名称' }}
          </button>
          <span class="muted line">
            {{ record.code || (record.id ? '' : '未对应主档') }}
            <template v-if="!record.active"> · 已停用</template>
          </span>
        </div>
        <div v-else-if="column.key === 'tier'" class="stack">
          <Tag
            :color="tierColors[record.stats.tier as keyof typeof tierColors]"
            class="tag"
          >
            {{ tierLabels[record.stats.tier as keyof typeof tierLabels] }}
          </Tag>
          <span v-if="record.stats.count" class="muted">{{
            cashAgo(direction, record.stats.daysSinceLast)
          }}</span>
        </div>
        <div v-else-if="column.key === 'recent12'" class="trend">
          <span v-if="record.stats.count" class="spark" aria-hidden="true">
            <span
              v-for="(bar, index) in bars(record as CashPartyRow)"
              :key="index"
              :class="[{ empty: bar.empty }, direction]"
              :style="{ height: `${bar.height}px` }"
              :title="bar.title"
            ></span>
          </span>
          <span class="figures">
            <span class="amount">{{
              record.stats.count ? rmb(record.stats.recent12) : '—'
            }}</span>
            <span
              v-if="partyTrend(record.stats).text"
              class="muted"
              :class="isIn ? partyTrend(record.stats).tone : 'muted'"
              >{{ partyTrend(record.stats).text }}</span>
          </span>
        </div>
        <div v-else-if="column.key === 'total'" class="stack end">
          <template v-if="record.stats.count">
            <span class="amount">{{ rmb(record.stats.total) }}</span>
            <span class="muted line" :title="currencyMix(record.stats).title">
              {{ record.stats.count.toLocaleString('en-US') }} 笔 ·
              {{ record.stats.firstDate?.slice(0, 4) ?? '—' }} 年起
            </span>
            <span
              v-if="
                currencyMix(record.stats).text &&
                !(
                  record.stats.currencies?.length === 1 &&
                  record.stats.currencies[0]?.currency === 'CNY'
                )
              "
              class="muted line"
              :title="currencyMix(record.stats).title"
              >{{ currencyMix(record.stats).text
              }}{{
                currencyMix(record.stats).more
                  ? ` 等 ${currencyMix(record.stats).more + 2} 种`
                  : ''
              }}</span>
            <span v-if="record.stats.unconverted" class="warn">
              {{ record.stats.unconverted }} 笔未折算
            </span>
          </template>
          <span v-else class="muted">—</span>
        </div>
        <div v-else-if="column.key === 'receivable'" class="stack end">
          <span
            v-if="receivableText(record.stats)"
            class="amount owed"
            :title="receivableText(record.stats)"
            >{{ receivableText(record.stats) }}</span>
          <span v-else class="muted">—</span>
          <span v-if="record.stats.receivableSource === 'JINZHI'" class="muted">金智汇总（截至迁移）</span>
        </div>
        <div v-else-if="column.key === 'purchase'" class="stack end">
          <template v-if="record.stats.purchaseRecent12 !== undefined">
            <span class="amount">{{ rmb(record.stats.purchaseRecent12) }}</span>
            <span
              v-if="paidShare(record.stats)"
              class="muted"
              :class="paidShare(record.stats)?.tone"
              >{{ paidShare(record.stats)?.text }}</span>
          </template>
          <span v-else class="muted">没有对应采购单</span>
        </div>
        <div v-else-if="column.key === 'last'" class="stack">
          <template v-if="record.stats.last">
            <span class="amount">
              {{ record.stats.lastDate }} ·
              {{
                nativeShort(
                  record.stats.last.amount,
                  record.stats.last.currency,
                )
              }}
            </span>
            <span class="muted line">
              {{
                record.stats.last.contractCode ||
                (record.stats.last.bulk ? `集中${words.act}` : '')
              }}
              <span class="source">{{ factSource(record.stats.last) }}</span>
            </span>
          </template>
          <span v-else class="muted">{{ words.empty }}</span>
        </div>
        <div v-else-if="column.key === 'accounts'" class="stack">
          <span
            v-for="account in (record.stats.accounts ?? []).slice(0, 2)"
            :key="account"
            class="line"
            :title="account"
            >{{ account }}</span>
          <span v-if="!record.stats.accounts?.length" class="muted">—</span>
        </div>
      </template>
    </Table>
  </div>
</template>

<style scoped>
.cash-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 16px 16px;
}

.intro,
.note {
  margin: 0;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.intro {
  font-size: 13px;
}

.note {
  margin-top: -4px;
}

.cards {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.cards.five {
  grid-template-columns: minmax(0, 1.4fr) repeat(4, minmax(0, 1fr));
}

.card {
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: flex-start;
  min-width: 0;
  padding: 12px 14px;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.card:hover,
.card:focus-visible {
  outline: none;
  border-color: hsl(var(--primary));
}

.card.selected {
  background: hsl(var(--primary) / 6%);
  border-color: hsl(var(--primary));
  box-shadow: inset 0 0 0 1px hsl(var(--primary));
}

.card-label {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 13px;
  color: hsl(var(--muted-foreground));
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.dot.active {
  background: hsl(var(--success));
}

.dot.follow {
  background: hsl(var(--warning));
}

.dot.sleep {
  background: #c9cdd3;
}

.dot.owed {
  background: hsl(var(--destructive));
}

.card-value {
  font-size: 22px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 30px;
}

.card-sub {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
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

.stack {
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: flex-start;
  min-width: 0;
}

.stack.end {
  align-items: flex-end;
}

.line {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.name {
  max-width: 100%;
  padding: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font: inherit;
  font-weight: 600;
  color: hsl(var(--primary));
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
  background: transparent;
  border: 0;
}

.name:focus-visible {
  outline: 2px solid hsl(var(--primary));
}

.muted {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.tag {
  margin: 0;
}

.amount {
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.amount.owed {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  color: hsl(var(--destructive));
}

.warn,
.muted.warn {
  font-size: 12px;
  color: hsl(var(--warning));
}

.muted.up {
  color: hsl(var(--success));
}

.muted.down {
  color: hsl(var(--destructive));
}

.muted.info {
  color: hsl(var(--primary));
}

.source {
  display: inline-block;
  padding: 0 4px;
  margin-left: 2px;
  font-size: 11px;
  line-height: 16px;
  border: 1px solid hsl(var(--border));
  border-radius: 3px;
}

.trend {
  display: flex;
  gap: 10px;
  align-items: center;
  min-width: 0;
}

.spark {
  display: flex;
  flex-shrink: 0;
  gap: 2px;
  align-items: flex-end;
  height: 24px;
}

.spark span {
  display: block;
  width: 5px;
  background: hsl(var(--primary));
  border-radius: 1px;
}

.spark span.OUT {
  background: hsl(var(--warning) / 80%);
}

.spark span.empty {
  background: hsl(var(--border));
}

.figures {
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: flex-end;
  min-width: 0;
  margin-left: auto;
}

.cash-table :deep(.ant-table-expanded-row > td) {
  background: hsl(var(--primary) / 4%);
}

@media (max-width: 1200px) {
  .cards,
  .cards.five {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
