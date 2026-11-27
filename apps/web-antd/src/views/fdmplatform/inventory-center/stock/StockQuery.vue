<script setup lang="ts">
import type { ProductStock, StockStatus } from './model';

import type {
  InventoryWarehouse,
  StockBalance,
} from '#/api/fdmplatform/warehouse';

import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { downloadFileFromBlobPart, formatDate } from '@vben/utils';

import { useElementSize } from '@vueuse/core';
import {
  Alert,
  Button,
  Input,
  message,
  Radio,
  Select,
  Table,
  Tag,
  Tooltip,
} from 'ant-design-vue';

import { getInventoryWarehouses, getStocks } from '#/api/fdmplatform/warehouse';

import { errorText } from '../../data';
import { localDate } from '../../purchase/quotes/comparison';
import { averageCost, money, qty } from '../../purchase/warehouse/model';
import {
  compareDecimal,
  compareText,
  groupByProduct,
  idleDays,
  isStockStatus,
  matchesKeyword,
  matchesStatus,
  overview,
  share,
  STAGNANT_DAYS,
  STATUS_OPTIONS,
  stockCsv,
  stockFlags,
  warehouseGroups,
} from './model';
import StockFlowDrawer from './StockFlowDrawer.vue';
import StockProductCell from './StockProductCell.vue';
import StockProductDetails from './StockProductDetails.vue';

import '../../purchase/warehouse/warehouse-pages.css';

/**
 * 库存中心 · 库存查询：先看总览（品项、金额、要处理的负库存 / 呆滞 / 成本未知），
 * 左侧按仓库（公司仓、各工厂的原料 / 半成品 / 成品仓）切换，表格可按仓库明细或按产品汇总看。
 * 筛选条件记在地址栏，复制链接给同事打开是同一个视图。
 */
defineOptions({ name: 'FdmInventoryStockQuery' });

type View = 'detail' | 'product';

const route = useRoute();
const router = useRouter();
const today = localDate();

const rows = ref<StockBalance[]>([]);
const warehouses = ref<InventoryWarehouse[]>([]);
const loading = ref(false);
const error = ref('');
const selected = ref<StockBalance[]>([]);
const main = ref<HTMLElement>();
const { width: tableWidth } = useElementSize(main);
const compactProductColumns = computed(
  () => tableWidth.value > 0 && tableWidth.value < 1040,
);
const expandedKey = ref<string>();
const expandedRowKeys = computed(() =>
  expandedKey.value ? [expandedKey.value] : [],
);

const queryText = (key: string) =>
  typeof route.query[key] === 'string' ? (route.query[key] as string) : '';

const view = ref<View>(queryText('view') === 'product' ? 'product' : 'detail');
const warehouseId = ref(queryText('warehouseId') || undefined);
const status = ref<StockStatus>(
  isStockStatus(queryText('status'))
    ? (queryText('status') as StockStatus)
    : 'IN_STOCK',
);
const keyword = ref(queryText('keyword'));
const search = ref(keyword.value);

watch(view, () => {
  expandedKey.value = undefined;
});

// 页面会被缓存：离开本页后不再改地址栏
const ownPath = route.path;
watch([view, warehouseId, status, keyword], () => {
  if (route.path !== ownPath) return;
  const next: Record<string, string | undefined> = {
    view: view.value === 'detail' ? undefined : view.value,
    warehouseId: warehouseId.value || undefined,
    status: status.value === 'IN_STOCK' ? undefined : status.value,
    keyword: keyword.value.trim() || undefined,
  };
  const query = Object.fromEntries(
    Object.entries({ ...route.query, ...next }).filter(
      ([, value]) => value !== undefined,
    ),
  );
  void router.replace({ query });
});

const groups = computed(() =>
  warehouseGroups(warehouses.value, rows.value, today),
);
const allSummary = computed(() => overview(rows.value, today));
const currentWarehouse = computed(() =>
  groups.value
    .flatMap((group) => group.warehouses)
    .find((entry) => entry.id === warehouseId.value),
);

/** 仓库和关键字范围内的库存（状态卡片在这个范围里计数） */
const scoped = computed(() =>
  rows.value.filter(
    (row) =>
      (!warehouseId.value || row.warehouseId === warehouseId.value) &&
      matchesKeyword(row, keyword.value),
  ),
);
const summary = computed(() => overview(scoped.value, today));
const filtered = computed(() =>
  scoped.value.filter((row) => matchesStatus(row, status.value, today)),
);
const products = computed(() => groupByProduct(filtered.value));
const filteredAmount = computed(() => overview(filtered.value, today).amount);

const cards = computed(() => [
  {
    key: 'IN_STOCK' as const,
    label: '在库品项',
    value: String(summary.value.items),
    hint: `${groupByProduct(scoped.value.filter((row) => stockFlags(row, today).inStock)).length} 种产品`,
  },
  {
    key: 'ALL' as const,
    label: '库存金额',
    value: money(summary.value.amount),
    hint:
      summary.value.costUnknown > 0
        ? `另有 ${summary.value.costUnknown} 项成本未知`
        : '成本均已知',
  },
  {
    key: 'NEGATIVE' as const,
    label: '负库存',
    value: String(summary.value.negative),
    hint: '先出后入，待补入库',
    tone: summary.value.negative > 0 ? 'danger' : undefined,
  },
  {
    key: 'STAGNANT' as const,
    label: '呆滞',
    value: String(summary.value.stagnant),
    hint: `${STAGNANT_DAYS} 天未出库 · ${money(summary.value.stagnantAmount)}`,
    tone: summary.value.stagnant > 0 ? 'warning' : undefined,
  },
  {
    key: 'COST_UNKNOWN' as const,
    label: '成本未知',
    value: String(summary.value.costUnknown),
    hint: '入库未填单价，金额不计入',
    tone: summary.value.costUnknown > 0 ? 'warning' : undefined,
  },
]);

const productIdentityColumns = computed(() => [
  {
    title: '产品名称',
    key: 'product',
    width: 155,
    fixed: compactProductColumns.value ? undefined : ('left' as const),
    sorter: (a: ProductStock | StockBalance, b: ProductStock | StockBalance) =>
      compareText(a.productName, b.productName),
  },
  { title: '产品编号（SKU）', key: 'code', width: 176 },
  ...(compactProductColumns.value
    ? [{ title: '型号 / 规格', key: 'modelAndSpec', width: 160 }]
    : [
        { title: '型号', key: 'model', width: 165 },
        { title: '规格', key: 'specification', width: 140 },
      ]),
]);
const productCellKeys = computed(
  () => new Set(productIdentityColumns.value.map((column) => column.key)),
);

const actionColumn = {
  title: '操作',
  key: 'action',
  width: 112,
  fixed: 'right' as const,
};

const detailColumns = computed(() => [
  ...productIdentityColumns.value,
  ...(warehouseId.value
    ? []
    : [
        {
          title: '仓库',
          key: 'warehouse',
          width: 130,
          sorter: (a: StockBalance, b: StockBalance) =>
            compareText(a.warehouseName, b.warehouseName),
        },
      ]),
  {
    title: '现存',
    key: 'onHand',
    width: 96,
    align: 'right' as const,
    sorter: (a: StockBalance, b: StockBalance) =>
      compareDecimal(a.onHand, b.onHand),
  },
  { title: '平均成本', key: 'cost', width: 96, align: 'right' as const },
  {
    title: '库存金额',
    key: 'amount',
    width: 130,
    align: 'right' as const,
    sorter: (a: StockBalance, b: StockBalance) =>
      compareDecimal(
        a.costKnown ? a.costAmount : -1,
        b.costKnown ? b.costAmount : -1,
      ),
  },
  {
    title: '最近入库',
    key: 'lastIn',
    width: 107,
    sorter: (a: StockBalance, b: StockBalance) =>
      compareText(a.lastInDate, b.lastInDate),
  },
  {
    title: '最近出库',
    key: 'lastOut',
    width: 117,
    sorter: (a: StockBalance, b: StockBalance) =>
      compareText(a.lastOutDate, b.lastOutDate),
  },
  actionColumn,
]);

const productColumns = computed(() => [
  ...productIdentityColumns.value,
  { title: '仓库分布', key: 'spread', width: 210 },
  {
    title: '合计现存',
    key: 'onHand',
    width: 96,
    align: 'right' as const,
    sorter: (a: ProductStock, b: ProductStock) =>
      compareDecimal(a.onHand, b.onHand),
  },
  { title: '平均成本', key: 'cost', width: 96, align: 'right' as const },
  {
    title: '库存金额',
    key: 'amount',
    width: 130,
    align: 'right' as const,
    sorter: (a: ProductStock, b: ProductStock) =>
      compareDecimal(a.costAmount, b.costAmount),
  },
  {
    title: '最近出库',
    key: 'lastOut',
    width: 117,
    sorter: (a: ProductStock, b: ProductStock) =>
      compareText(a.lastOutDate, b.lastOutDate),
  },
  actionColumn,
]);

const scroll = computed(() => ({
  x: (view.value === 'detail'
    ? detailColumns.value
    : productColumns.value
  ).reduce((total, column) => total + column.width, 0),
}));

const pagination = {
  defaultPageSize: 50,
  showSizeChanger: true,
  pageSizeOptions: ['20', '50', '100', '200'],
  showTotal: (count: number) => `共 ${count} 条`,
};

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const [stocks, list] = await Promise.all([
      getStocks({ inStockOnly: false }),
      getInventoryWarehouses().catch(() => warehouses.value),
    ]);
    rows.value = stocks;
    warehouses.value = list;
  } catch (error_) {
    error.value = errorText(error_);
  } finally {
    loading.value = false;
  }
}

function applySearch() {
  keyword.value = search.value.trim();
}

function pickWarehouse(id?: string) {
  warehouseId.value = id;
}

function pickCard(key: StockStatus) {
  status.value = status.value === key && key !== 'IN_STOCK' ? 'IN_STOCK' : key;
}

function toggleDetails(key: string) {
  expandedKey.value = expandedKey.value === key ? undefined : key;
}

function resetFilters() {
  search.value = '';
  keyword.value = '';
  status.value = 'IN_STOCK';
  warehouseId.value = undefined;
}

function exportCsv() {
  if (filtered.value.length === 0) {
    message.info('当前筛选下没有库存可导出');
    return;
  }
  const scope = currentWarehouse.value?.name ?? '全部仓库';
  downloadFileFromBlobPart({
    source: new Blob([stockCsv(filtered.value, today)], {
      type: 'text/csv;charset=utf-8',
    }),
    fileName: `库存-${scope}-${formatDate(new Date(), 'YYYYMMDD-HHmm')}.csv`,
  });
  message.success(`已导出 ${filtered.value.length} 行库存`);
}

function idleText(row: Pick<StockBalance, 'lastInDate' | 'lastOutDate'>) {
  const days = idleDays(row, today);
  if (days === undefined) return '';
  return days === 0 ? '今天有进出' : `${days} 天未出库`;
}

onMounted(load);
</script>

<template>
  <div class="warehouse-page stock-query">
    <section class="cards" aria-label="库存总览">
      <button
        v-for="card in cards"
        :key="card.key"
        type="button"
        class="card"
        :class="[card.tone, { active: status === card.key }]"
        :aria-pressed="status === card.key"
        @click="pickCard(card.key)"
      >
        <span class="label">{{ card.label }}</span>
        <strong class="num">{{ card.value }}</strong>
        <span class="hint">{{ card.hint }}</span>
      </button>
    </section>

    <div class="layout">
      <nav class="nav" aria-label="仓库">
        <button
          type="button"
          class="nav-item"
          :class="{ active: !warehouseId }"
          @click="pickWarehouse()"
        >
          <span class="ellipsis">全部仓库</span>
          <span class="meta num">
            {{ allSummary.items }} 项 · {{ money(allSummary.amount) }}
          </span>
        </button>
        <div v-for="group in groups" :key="group.label" class="group">
          <div class="group-label">{{ group.label }}</div>
          <button
            v-for="entry in group.warehouses"
            :key="entry.id"
            type="button"
            class="nav-item"
            :class="{ active: warehouseId === entry.id }"
            @click="pickWarehouse(entry.id)"
          >
            <span class="name">
              <span class="ellipsis">{{ entry.name }}</span>
              <Tag v-if="entry.isDefault" class="mini">默认</Tag>
              <Tooltip
                v-if="entry.negative > 0"
                :title="`${entry.negative} 项负库存`"
              >
                <span class="dot" aria-label="有负库存"></span>
              </Tooltip>
            </span>
            <span class="meta num">
              {{ entry.items }} 项 · {{ money(entry.amount) }}
            </span>
          </button>
        </div>
      </nav>

      <main ref="main" class="main">
        <div class="toolbar">
          <Radio.Group v-model:value="view" button-style="solid">
            <Radio.Button value="detail">按仓库明细</Radio.Button>
            <Radio.Button value="product">按产品汇总</Radio.Button>
          </Radio.Group>
          <Input.Search
            v-model:value="search"
            allow-clear
            placeholder="产品名称、编号、规格、仓库"
            style="width: 260px"
            @search="applySearch"
          />
          <Select
            v-model:value="status"
            :options="STATUS_OPTIONS"
            style="width: 190px"
          />
          <Button
            v-if="keyword || warehouseId || status !== 'IN_STOCK'"
            type="link"
            @click="resetFilters"
          >
            清除筛选
          </Button>
          <span class="grow"></span>
          <span class="muted">
            {{ currentWarehouse?.name ?? '全部仓库' }} ·
            {{
              view === 'product'
                ? `${products.length} 种产品`
                : `${filtered.length} 行`
            }}
            · {{ money(filteredAmount) }}
          </span>
          <Button @click="exportCsv">导出</Button>
          <Button :loading="loading" @click="load">刷新</Button>
        </div>
        <Alert v-if="error" type="error" :message="error" show-icon />

        <Table
          v-if="view === 'detail'"
          class="fdm-business-table"
          size="middle"
          table-layout="fixed"
          row-key="id"
          :data-source="filtered"
          :loading="loading"
          :pagination="pagination"
          :scroll="scroll"
          :columns="detailColumns"
          :expanded-row-keys="expandedRowKeys"
          :show-expand-column="false"
          :row-class-name="
            (record: StockBalance) =>
              stockFlags(record, today).negative ? 'negative' : ''
          "
        >
          <template #emptyText>
            {{
              rows.length === 0
                ? '还没有库存。采购入库、常规入库或工厂报工后，这里会按仓库和产品汇总。'
                : '当前筛选下没有库存'
            }}
          </template>
          <template #expandedRowRender="{ expanded, record }">
            <StockProductDetails
              v-if="expanded"
              :product="record as StockBalance"
            />
          </template>
          <template #bodyCell="{ column, record }">
            <StockProductCell
              v-if="productCellKeys.has(String(column.key))"
              :column="String(column.key)"
              :product="record as StockBalance"
            />
            <span v-else-if="column.key === 'warehouse'" class="ellipsis">
              {{ record.warehouseName }}
            </span>
            <div v-else-if="column.key === 'onHand'" class="cell right">
              <b class="num" :class="{ out: Number(record.onHand) < 0 }">
                {{ qty(record.onHand) }}
                <span class="muted">{{ record.unit }}</span>
              </b>
              <Tag
                v-if="stockFlags(record as StockBalance, today).negative"
                color="error"
                class="mini"
              >
                负库存
              </Tag>
            </div>
            <span v-else-if="column.key === 'cost'" class="num">
              {{ averageCost(record as StockBalance) ?? '—' }}
            </span>
            <div v-else-if="column.key === 'amount'" class="cell right">
              <span v-if="record.costKnown" class="num">
                {{ money(record.costAmount) }}
              </span>
              <Tag v-else class="mini">成本未知</Tag>
              <span
                v-if="record.costKnown && Number(filteredAmount) > 0"
                class="share"
                :title="`占当前金额 ${share(record.costAmount, filteredAmount)}%`"
              >
                <span
                  :style="{
                    width: `${Math.max(0, share(record.costAmount, filteredAmount))}%`,
                  }"
                ></span>
              </span>
            </div>
            <span v-else-if="column.key === 'lastIn'" class="num muted">
              {{ record.lastInDate ?? '—' }}
            </span>
            <div v-else-if="column.key === 'lastOut'" class="cell">
              <span class="num">{{ record.lastOutDate ?? '—' }}</span>
              <span
                v-if="stockFlags(record as StockBalance, today).inStock"
                class="muted"
                :class="{
                  warn: stockFlags(record as StockBalance, today).stagnant,
                }"
              >
                {{ idleText(record as StockBalance) }}
              </span>
            </div>
            <div v-else-if="column.key === 'action'" class="row-actions">
              <Button
                type="link"
                size="small"
                :aria-expanded="expandedKey === record.id"
                @click="toggleDetails(record.id)"
              >
                {{ expandedKey === record.id ? '收起' : '详情' }}
              </Button>
              <Button
                type="link"
                size="small"
                @click="selected = [record as StockBalance]"
              >
                流水
              </Button>
            </div>
          </template>
        </Table>

        <Table
          v-else
          class="fdm-business-table"
          size="middle"
          table-layout="fixed"
          row-key="key"
          :data-source="products"
          :loading="loading"
          :pagination="pagination"
          :scroll="scroll"
          :columns="productColumns"
          :expanded-row-keys="expandedRowKeys"
          :show-expand-column="false"
        >
          <template #emptyText>当前筛选下没有库存</template>
          <template #expandedRowRender="{ expanded, record }">
            <StockProductDetails
              v-if="expanded"
              :product="record as ProductStock"
            />
          </template>
          <template #bodyCell="{ column, record }">
            <StockProductCell
              v-if="productCellKeys.has(String(column.key))"
              :column="String(column.key)"
              :product="record as ProductStock"
            />
            <div v-else-if="column.key === 'spread'" class="chips">
              <Tooltip
                v-for="row in record.stocks.slice(0, 3)"
                :key="row.id"
                :title="`${row.warehouseName}：${qty(row.onHand)} ${row.unit ?? ''}`"
              >
                <button
                  type="button"
                  class="chip"
                  :class="{ out: Number(row.onHand) < 0 }"
                  @click="selected = [row]"
                >
                  <span class="ellipsis">{{ row.warehouseName }}</span>
                  <b class="num">{{ qty(row.onHand) }}</b>
                </button>
              </Tooltip>
              <span v-if="record.stocks.length > 3" class="muted">
                +{{ record.stocks.length - 3 }} 个仓库
              </span>
            </div>
            <b
              v-else-if="column.key === 'onHand'"
              class="num"
              :class="{ out: Number(record.onHand) < 0 }"
            >
              {{ qty(record.onHand) }}
              <span class="muted">{{ record.unit }}</span>
            </b>
            <span v-else-if="column.key === 'cost'" class="num">
              {{
                averageCost({
                  onHand: record.onHand,
                  costAmount: record.costAmount,
                  costKnown: record.costKnown,
                }) ?? '—'
              }}
            </span>
            <div v-else-if="column.key === 'amount'" class="cell right">
              <span class="num">{{ money(record.costAmount) }}</span>
              <span v-if="!record.costKnown" class="muted">部分成本未知</span>
            </div>
            <div v-else-if="column.key === 'lastOut'" class="cell">
              <span class="num">{{ record.lastOutDate ?? '—' }}</span>
              <span class="muted">{{ idleText(record as ProductStock) }}</span>
            </div>
            <div v-else-if="column.key === 'action'" class="row-actions">
              <Button
                type="link"
                size="small"
                :aria-expanded="expandedKey === record.key"
                @click="toggleDetails(record.key)"
              >
                {{ expandedKey === record.key ? '收起' : '详情' }}
              </Button>
              <Button
                type="link"
                size="small"
                @click="selected = (record as ProductStock).stocks"
              >
                流水
              </Button>
            </div>
          </template>
        </Table>
      </main>
    </div>

    <StockFlowDrawer
      :open="selected.length > 0"
      :stocks="selected"
      @close="selected = []"
    />
  </div>
</template>

<style scoped>
.cards {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: 12px 14px;
  color: inherit;
  text-align: left;
  cursor: pointer;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  transition: border-color 0.15s;
}

.card:hover {
  border-color: hsl(var(--primary) / 50%);
}

.card.active {
  border-color: hsl(var(--primary));
  box-shadow: 0 0 0 1px hsl(var(--primary));
}

.card .label {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.card strong {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 20px;
  font-weight: 600;
  white-space: nowrap;
}

.card .hint {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
}

.card.danger strong {
  color: hsl(var(--destructive));
}

.card.warning strong {
  color: color-mix(in srgb, hsl(var(--warning)) 60%, hsl(var(--foreground)));
}

.layout {
  display: grid;
  grid-template-columns: 230px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}

.nav {
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: calc(100vh - 160px);
  padding: 8px;
  overflow-y: auto;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.group {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 6px;
}

.group-label {
  padding: 4px 8px 2px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.nav-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: stretch;
  min-width: 0;
  padding: 6px 8px;
  color: inherit;
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 6px;
}

.nav-item:hover {
  background: hsl(var(--accent));
}

.nav-item.active {
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 10%);
}

.nav-item .name {
  display: flex;
  gap: 4px;
  align-items: center;
  min-width: 0;
  font-weight: 500;
}

.nav-item .meta {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.dot {
  flex: none;
  width: 6px;
  height: 6px;
  background: hsl(var(--destructive));
  border-radius: 50%;
}

.mini {
  margin: 0;
  font-size: 11px;
  line-height: 16px;
}

.main {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.cell.right {
  align-items: flex-end;
}

.row-actions {
  display: flex;
  justify-content: flex-end;
  white-space: nowrap;
}

.warn {
  color: color-mix(in srgb, hsl(var(--warning)) 60%, hsl(var(--foreground)));
}

.share {
  display: block;
  width: 80px;
  height: 4px;
  overflow: hidden;
  background: hsl(var(--border));
  border-radius: 2px;
}

.share span {
  display: block;
  height: 100%;
  background: hsl(var(--primary) / 70%);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.chip {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  max-width: 130px;
  padding: 1px 8px;
  font-size: 12px;
  color: inherit;
  cursor: pointer;
  background: hsl(var(--accent));
  border: 0;
  border-radius: 10px;
}

.chip:hover {
  outline: 1px solid hsl(var(--primary) / 40%);
}

.chip.out b {
  color: hsl(var(--destructive));
}

:deep(.negative td) {
  background: hsl(var(--destructive) / 4%);
}

@media (max-width: 1100px) {
  .cards {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .nav {
    position: static;
    flex-flow: row wrap;
    max-height: none;
  }

  .group {
    flex-flow: row wrap;
    margin-top: 0;
  }

  .group-label {
    width: 100%;
  }
}
</style>
