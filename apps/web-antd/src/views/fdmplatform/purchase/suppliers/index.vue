<script setup lang="ts">
import type { MasterRecord } from '#/api/fdmplatform';
import type {
  SupplierOverview,
  SupplierRanking,
  SupplierRow,
  SupplierSort,
  SupplierTier,
} from '#/api/fdmplatform/supplier-stats';

import { computed, onMounted, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { downloadFileFromBlobPart, formatDate } from '@vben/utils';

import {
  Alert,
  Button,
  Card,
  Drawer,
  Input,
  message,
  Select,
  Table,
  Tag,
} from 'ant-design-vue';

import { saveMasterData, updateMasterData } from '#/api/fdmplatform';
import { getMasterRecord } from '#/api/fdmplatform/masters';
import {
  getSupplierOverview,
  getSupplierStatsPage,
} from '#/api/fdmplatform/supplier-stats';

import ActionDialog from '../../components/ActionDialog.vue';
import { errorText, field } from '../../data';
import { useEntityDetail } from '../../documents/useEntityDetail';
import { useRouteOwner } from '../../documents/useRouteOwner';
import PurchaseTrendBars from '../components/PurchaseTrendBars.vue';
import TopSupplierBars from '../components/TopSupplierBars.vue';
import SupplierContacts from '../manage/components/SupplierContacts.vue';
import {
  moneyShort,
  orderedAgo,
  otherCurrencyTitle,
  rmb,
  sparkBars,
  supplierCsv,
  supplierTrend,
  tierColors,
  tierNames,
} from './model';
import SupplierSnapshotPanel from './SupplierSnapshotPanel.vue';

import '../../components/compact-tables.css';

defineOptions({ name: 'FdmPlatformPurchaseSuppliers' });
const contactSupplier = ref<MasterRecord>();
const activeRoute = useRouteOwner();
const records = ref<SupplierRow[]>([]);
const overview = ref<SupplierOverview>();
const pageNo = ref(1);
const pageSize = ref(20);
const total = ref(0);
const keyword = ref('');
const tier = ref<'ALL' | SupplierTier>('ALL');
const active = ref<'false' | 'true'>();
const sort = ref<SupplierSort>('RECENT_12');
const order = ref<'ASC' | 'DESC'>('DESC');
const expandedKeys = ref<string[]>([]);
const loading = ref(false);
const exporting = ref(false);
const pageError = ref('');
const saving = ref(false);
const open = ref(false);
const editing = ref<MasterRecord>();
let sequence = 0;

const definition = computed(() => ({
  action: 'SAVE_SUPPLIER',
  title: editing.value ? '维护供应商' : '新增供应商',
  description:
    '统一维护采购报价与采购单使用的供应商资料，停用后历史单据保持可查。',
  fields: [
    field('name', '供应商名称'),
    field('code', '供应商编码'),
    field('active', '启用', 'boolean', { default: true }),
  ],
  initialValues: editing.value ? { ...editing.value } : undefined,
}));
const tierHints = computed<Record<'ALL' | SupplierTier, string>>(() => ({
  ALL: '',
  ACTIVE: `近 ${overview.value?.activeDays ?? 90} 天下过单`,
  OCCASIONAL: '91–365 天前下过单',
  SLEEP: '超过 1 年没有下单',
  NONE: '从没下过单',
}));
const tabs = computed(() =>
  (['ALL', 'ACTIVE', 'OCCASIONAL', 'SLEEP', 'NONE'] as const).map((key) => ({
    key,
    label: key === 'ALL' ? '全部' : tierNames[key],
    count: key === 'ALL' ? overview.value?.total : overview.value?.tiers?.[key],
    hint: tierHints.value[key],
  })),
);
const sortKeys: Record<string, SupplierSort> = {
  recent12: 'RECENT_12',
  total: 'TOTAL',
  lastOrder: 'LAST_ORDER',
};
function sortOrder(key: string) {
  if (sortKeys[key] !== sort.value) return null;
  return order.value === 'ASC' ? ('ascend' as const) : ('descend' as const);
}
const columns = computed(() => {
  const sortable = (key: string) => ({
    sorter: true,
    sortOrder: sortOrder(key),
    sortDirections: ['descend', 'ascend'] as ('ascend' | 'descend')[],
  });
  return [
    { title: '供应商', key: 'name', width: 220 },
    {
      title: '分层 / 最近下单',
      key: 'lastOrder',
      width: 120,
      ...sortable('lastOrder'),
    },
    {
      title: '近 12 个月',
      key: 'recent12',
      width: 210,
      align: 'right' as const,
      ...sortable('recent12'),
    },
    {
      title: '累计采购额',
      key: 'total',
      width: 140,
      align: 'right' as const,
      ...sortable('total'),
    },
    { title: '常购物料', key: 'items', width: 180 },
    { title: '在途', key: 'open', width: 56, align: 'right' as const },
    { title: '操作', key: 'action', width: 120, fixed: 'right' as const },
  ];
});
const share = computed(() => {
  const value = overview.value?.top10Share;
  return value === null || value === undefined ? '—' : `${value}%`;
});

function params(page = pageNo.value, size = pageSize.value) {
  return {
    keyword: keyword.value.trim() || undefined,
    tier: tier.value === 'ALL' ? undefined : tier.value,
    active: active.value === undefined ? undefined : active.value === 'true',
    sort: sort.value,
    order: order.value,
    pageNo: page,
    pageSize: size,
  };
}
async function load(reset = false) {
  if (reset) pageNo.value = 1;
  const run = ++sequence;
  loading.value = true;
  pageError.value = '';
  try {
    const result = await getSupplierStatsPage(params());
    if (run !== sequence) return;
    records.value = result.list;
    total.value = result.total;
    expandedKeys.value = expandedKeys.value.filter((key) =>
      result.list.some((row) => row.id === key),
    );
  } catch (error) {
    if (run === sequence) pageError.value = errorText(error);
  } finally {
    if (run === sequence) loading.value = false;
  }
}
async function loadOverview() {
  try {
    overview.value = await getSupplierOverview();
  } catch (error) {
    pageError.value = errorText(error);
  }
}
function refresh() {
  void load();
  void loadOverview();
}
function selectTier(value: 'ALL' | SupplierTier) {
  tier.value = value;
  void load(true);
}
function tableChange(
  pagination: { current?: number; pageSize?: number },
  _filters: unknown,
  sorter: unknown,
) {
  const current = (Array.isArray(sorter) ? sorter[0] : sorter) as
    | undefined
    | { columnKey?: string; order?: 'ascend' | 'descend' | null };
  const key = current?.columnKey ? sortKeys[current.columnKey] : undefined;
  if (key && current?.order) {
    const next = current.order === 'ascend' ? 'ASC' : 'DESC';
    if (key !== sort.value || next !== order.value) {
      sort.value = key;
      order.value = next;
      void load(true);
      return;
    }
  }
  pageNo.value = pagination.current ?? 1;
  pageSize.value = pagination.pageSize ?? 20;
  void load();
}
function expand(expanded: boolean, row: SupplierRow) {
  expandedKeys.value = expanded
    ? [...expandedKeys.value, row.id]
    : expandedKeys.value.filter((key) => key !== row.id);
}
function toggle(row: SupplierRow) {
  expand(!expandedKeys.value.includes(row.id), row);
}
function showRanked(row: SupplierRanking) {
  keyword.value = row.name;
  tier.value = 'ALL';
  void load(true).then(() => {
    const match = records.value.find((record) => record.name === row.name);
    if (match && !expandedKeys.value.includes(match.id))
      expandedKeys.value = [...expandedKeys.value, match.id];
  });
}
async function exportCsv() {
  exporting.value = true;
  try {
    const rows: SupplierRow[] = [];
    for (let page = 1; ; page++) {
      const result = await getSupplierStatsPage(params(page, 100));
      rows.push(...result.list);
      if (rows.length >= result.total || result.list.length === 0) break;
    }
    downloadFileFromBlobPart({
      fileName: `供应商采购统计-${formatDate(new Date(), 'YYYYMMDD')}.csv`,
      source: supplierCsv(rows),
    });
  } catch (error) {
    message.error(errorText(error));
  } finally {
    exporting.value = false;
  }
}
function tierOf(row: SupplierRow) {
  const key = row.stats?.tier ?? 'NONE';
  return { label: tierNames[key], color: tierColors[key] };
}
function bars(row: SupplierRow) {
  return sparkBars(row.stats?.monthly ?? [], overview.value?.months ?? []);
}
async function save(payload: Record<string, unknown>, idempotencyKey: string) {
  saving.value = true;
  pageError.value = '';
  try {
    const data = { ...payload, companyId: 0, type: 'SUPPLIER', idempotencyKey };
    await (editing.value
      ? updateMasterData('SUPPLIER', editing.value.id, {
          ...data,
          expectedVersion: editing.value.version,
        })
      : saveMasterData(data));
    message.success('供应商已保存');
    entityDetail.close();
    refresh();
  } catch (error) {
    pageError.value = errorText(error);
  } finally {
    saving.value = false;
  }
}
const entityDetail = useEntityDetail(
  'supplierId',
  (id) => getMasterRecord('SUPPLIER', id),
  (value) => {
    editing.value = value;
    open.value = true;
  },
  () => {
    open.value = false;
  },
  (value) => {
    pageError.value = value;
  },
);
onMounted(refresh);
</script>
<template>
  <Page
    title="供应商管理"
    description="按采购额和最近下单看供应商；展开一行看年度采购、常购物料和最近采购单。"
  >
    <div class="suppliers">
      <Alert v-if="pageError" :message="pageError" type="error" show-icon />
      <section class="overview" aria-label="供应商概况">
        <div class="kpis">
          <div class="kpi">
            <span>合作供应商</span>
            <b>{{ overview ? `${overview.activeSuppliers} 家` : '—' }}</b>
            <small>近 12 个月有下单 · 共 {{ overview?.total ?? '—' }} 家</small>
          </div>
          <div class="kpi">
            <span>近 12 个月采购额</span>
            <b>{{ overview ? rmb(overview.recent12Amount) : '—' }}</b>
            <small>{{
              overview
                ? `${overview.recent12Orders.toLocaleString('en-US')} 张采购单`
                : ''
            }}</small>
          </div>
          <div class="kpi">
            <span>前 10 家占比</span>
            <b>{{ share }}</b>
            <small>{{ overview ? rmb(overview.top10Amount) : '' }}</small>
          </div>
          <div class="kpi">
            <span>没有工厂联系人</span>
            <b>{{ overview ? `${overview.withoutContact} 家` : '—' }}</b>
            <small>下单前需补联系人和电话</small>
          </div>
        </div>
        <div class="charts">
          <div class="chart">
            <h4>近 12 个月采购额 <small>人民币</small></h4>
            <PurchaseTrendBars
              v-if="overview"
              :months="overview.months"
              :monthly="overview.monthly"
              :height="80"
            />
          </div>
          <div class="chart">
            <h4>近 12 个月前 5 家</h4>
            <TopSupplierBars
              v-if="overview"
              :suppliers="overview.topSuppliers"
              @select="showRanked"
            />
          </div>
        </div>
        <p v-if="overview" class="note">
          统计截至
          {{
            overview.asOf
          }}，含金智迁入的历史采购单。金智采购单没有币种，按人民币计；新系统的外币采购单单独列出。
        </p>
      </section>

      <Card :body-style="{ padding: '16px' }">
        <div class="tabs" role="tablist" aria-label="供应商分层">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            type="button"
            role="tab"
            :aria-selected="tier === tab.key"
            :class="{ on: tier === tab.key }"
            :title="tab.hint"
            @click="selectTier(tab.key)"
          >
            {{ tab.label
            }}<em>{{ tab.count?.toLocaleString('en-US') ?? '' }}</em>
          </button>
        </div>
        <div class="toolbar">
          <Input.Search
            v-model:value="keyword"
            placeholder="供应商名称、编码或物料"
            allow-clear
            class="search"
            @search="load(true)"
          />
          <Select
            v-model:value="active"
            :options="[
              { label: '启用', value: 'true' },
              { label: '停用', value: 'false' },
            ]"
            placeholder="状态"
            allow-clear
            style="width: 100px"
            @change="load(true)"
          />
          <div class="toolbar-actions">
            <Button :loading="loading" @click="refresh">刷新</Button>
            <Button :loading="exporting" @click="exportCsv">导出</Button>
            <Button type="primary" @click="entityDetail.open()">
              新增供应商
            </Button>
          </div>
        </div>
        <Table
          class="fdm-business-table supplier-table"
          size="small"
          table-layout="fixed"
          :columns="columns"
          :data-source="records"
          row-key="id"
          :loading="loading"
          :scroll="{ x: 1090 }"
          :expanded-row-keys="expandedKeys"
          :pagination="{
            current: pageNo,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (count: number) =>
              `共 ${count.toLocaleString('en-US')} 家供应商`,
          }"
          @expand="expand"
          @change="tableChange"
        >
          <template #expandedRowRender="{ record }">
            <SupplierSnapshotPanel
              :supplier="record as SupplierRow"
              @contacts="(row) => (contactSupplier = row)"
              @edit="(row) => entityDetail.open(String(row.id))"
            />
          </template>
          <template #bodyCell="{ column, record }">
            <div v-if="column.key === 'name'" class="stack">
              <button
                type="button"
                class="name"
                :title="`展开 ${record.name} 的采购速览`"
                @click="toggle(record as SupplierRow)"
              >
                {{ record.name }}
              </button>
              <span class="muted">{{ record.code
                }}<Tag v-if="!record.active" class="mini-tag">停用</Tag></span>
            </div>
            <div
              v-else-if="column.key === 'lastOrder'"
              class="stack"
              :title="
                record.stats?.lastOrderDate
                  ? `最近下单 ${record.stats.lastOrderDate} · ${record.stats.lastOrderCode ?? ''}`
                  : undefined
              "
            >
              <Tag
                :color="tierOf(record as SupplierRow).color"
                class="mini-tag"
              >
                {{ tierOf(record as SupplierRow).label }}
              </Tag>
              <span class="muted">{{
                orderedAgo(record.stats?.daysSinceLastOrder)
              }}</span>
            </div>
            <div v-else-if="column.key === 'recent12'" class="trend-cell">
              <span class="spark" aria-hidden="true">
                <span
                  v-for="(bar, index) in bars(record as SupplierRow)"
                  :key="index"
                  :class="{ empty: bar.empty }"
                  :style="{ height: `${bar.height}px` }"
                  :title="`${bar.month} ${bar.empty ? '无采购' : moneyShort(bar.value.toString())}`"
                ></span>
              </span>
              <span class="stack end">
                <b>{{
                  record.stats?.orders
                    ? moneyShort(
                        record.stats.recent12Amount,
                        record.stats.currency,
                      )
                    : '—'
                }}</b>
                <span class="trend" :class="supplierTrend(record.stats).tone">{{
                  supplierTrend(record.stats).text
                }}</span>
              </span>
            </div>
            <div v-else-if="column.key === 'total'" class="stack end">
              <template v-if="record.stats?.orders">
                <b>{{
                  moneyShort(record.stats.totalAmount, record.stats.currency)
                }}</b>
                <span class="muted">{{ record.stats.orders.toLocaleString('en-US') }} 张 ·
                  {{ record.stats.firstOrderDate?.slice(0, 4) ?? '—' }}
                  年起</span>
                <span
                  v-if="record.stats.otherCurrencies?.length"
                  class="muted"
                  :title="otherCurrencyTitle(record.stats)"
                  >另有外币采购</span>
              </template>
              <span v-else class="muted">—</span>
            </div>
            <div v-else-if="column.key === 'items'" class="chips">
              <span
                v-for="item in record.stats?.topItems ?? []"
                :key="item"
                class="chip"
                :title="item"
                >{{ item }}</span>
              <span v-if="!record.stats?.topItems?.length" class="muted">—</span>
            </div>
            <span
              v-else-if="column.key === 'open'"
              class="num"
              :class="{ muted: !record.stats?.openOrders }"
              >{{ record.stats?.openOrders || '—' }}</span>
            <div v-else-if="column.key === 'action'" class="row-actions">
              <Button
                type="link"
                size="small"
                @click="entityDetail.open(String(record.id))"
              >
                维护
              </Button>
              <Button
                type="link"
                size="small"
                @click="contactSupplier = record as MasterRecord"
              >
                联系人
              </Button>
            </div>
          </template>
        </Table>
      </Card>
    </div>
    <ActionDialog
      :open="open"
      :definition="definition"
      :saving="saving"
      :error="pageError"
      @close="entityDetail.close"
      @submit="save"
    />
    <Drawer
      :open="!!contactSupplier && activeRoute"
      :title="`${contactSupplier?.name ?? ''} · 工厂联系人`"
      width="900px"
      @close="contactSupplier = undefined"
    >
      <SupplierContacts
        v-if="contactSupplier"
        :supplier-id="contactSupplier.id"
      />
    </Drawer>
  </Page>
</template>

<style scoped>
.suppliers {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.overview {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.kpi {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 12px 14px;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
}

.kpi span,
.kpi small {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.kpi b {
  font-size: 20px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.charts {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  gap: 12px;
}

.chart {
  min-width: 0;
  padding: 12px 14px;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
}

.chart h4 {
  display: flex;
  gap: 6px;
  align-items: baseline;
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 600;
}

.chart h4 small,
.note,
.muted {
  font-size: 12px;
  font-weight: 400;
  color: hsl(var(--muted-foreground));
}

.note {
  margin: 0;
}

.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  margin-bottom: 12px;
  border-bottom: 1px solid hsl(var(--border));
}

.tabs button {
  padding: 6px 0;
  font: inherit;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  background: transparent;
  border: 0;
  border-bottom: 2px solid transparent;
}

.tabs button.on {
  color: hsl(var(--primary));
  border-bottom-color: hsl(var(--primary));
}

.tabs button:focus-visible,
.name:focus-visible {
  outline: 2px solid hsl(var(--primary));
  outline-offset: 2px;
}

.tabs em {
  margin-left: 4px;
  font-size: 12px;
  font-style: normal;
  font-variant-numeric: tabular-nums;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
}

.search {
  width: 260px;
  max-width: 100%;
}

.toolbar-actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
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

.mini-tag {
  margin-left: 4px;
  font-size: 11px;
  line-height: 16px;
}

.trend-cell {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: flex-end;
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

.spark span.empty {
  background: hsl(var(--border));
}

.trend {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
}

.trend.up {
  color: hsl(var(--success));
}

.trend.down {
  color: hsl(var(--destructive));
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.chip {
  max-width: 100%;
  padding: 0 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  white-space: nowrap;
  background: hsl(var(--accent));
  border-radius: 4px;
}

.num,
b {
  font-variant-numeric: tabular-nums;
}

.row-actions {
  display: flex;
  gap: 4px;
}

@media (max-width: 960px) {
  .kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .charts {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
