<script setup lang="ts">
import type { TableColumnsType } from 'ant-design-vue';
import type { FdmcaiwuEcProfitApi as Api } from '#/api/fdmcaiwu/ec-profit';
import type { MetricKey } from '../model';
import type { LeafRow } from '../tree-model';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { useAccess } from '@vben/access';
import { IconifyIcon } from '@vben/icons';
import { downloadFileFromBlobPart } from '@vben/utils';

import {
  Alert,
  Button,
  Checkbox,
  DatePicker,
  Dropdown,
  Empty,
  Input,
  InputNumber,
  Menu,
  message,
  Modal,
  Segmented,
  Select,
  Spin,
  Table,
  Tag,
  Tooltip,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import {
  deleteEcProfit,
  deleteEcProfitItem,
  exportEcProfitMonthlyExcel,
  fillBlankEcProfitItems,
  getEcProfitMonthlyView,
  getEcProfitYear,
  purgeEcProfitReport,
} from '#/api/fdmcaiwu/ec-profit';

import {
  changeOf,
  formatMetric,
  sumMetrics,
  toNumber,
} from '../model';
import {
  displaySummary,
  expansionKeys,
  filterTree,
  financialColumns,
  findGroup,
  fullyImported,
  isRateMetric,
  leafRows,
  nodeMetric,
  nodeState,
  selectedTotal,
  tableTree,
  UNCONFIGURED_KEY,
} from '../tree-model';
import CostStructure from './cost-structure.vue';
import GroupRanking from './group-ranking.vue';
import ImportDialog from './import-dialog.vue';
import ItemDrawer from './item-drawer.vue';
import ItemEditor from './item-editor.vue';
import MonthStrip from './month-strip.vue';
import ReportForm from './report-form.vue';
import ScopeDialog from './scope-dialog.vue';

const props = defineProps<{
  month: string;
  focusGroupKey?: string;
  configRevision: number;
}>();
const emit = defineEmits<{
  'update:month': [month: string];
  configured: [];
  'clear-focus': [];
}>();
const { hasAccessByCodes } = useAccess();

const view = ref<Api.MonthlyView>();
const loading = ref(false);
const error = ref('');
const yearReports = ref<Api.Report[]>([]);
const previousYearReports = ref<Api.Report[]>([]);
const yearLoading = ref(false);
const groupKey = ref<string>();
const keyword = ref('');
const mode = ref<'flat' | 'tree'>('tree');
const columnMode = ref<'core' | 'full'>('core');
const fullColumns = computed(() => columnMode.value === 'full');
const received = ref(false);
const expandedKeys = ref<(number | string)[]>([]);
const formOpen = ref(false);
const editing = ref<Api.Report>();
const scopeOpen = ref(false);
const importOpen = ref(false);
const exporting = ref(false);
const itemDetail = ref<Api.GroupNode>();
const detailOpen = ref(false);
let sequence = 0;
let yearSequence = 0;

const thisMonth = dayjs().format('YYYY-MM');
const report = computed(() => view.value?.report ?? undefined);
const groups = computed(() => view.value?.groups ?? []);
const hasData = computed(() => (view.value?.total.importedShopCount ?? 0) > 0
  || (view.value?.total.adjustmentCount ?? 0) > (view.value?.total.pendingAdjustmentCount ?? 0));
const totalComplete = computed(() => !!view.value && fullyImported(view.value.total));
/** 未配置分组的明细条数；一个分组都没配时全部在这里 */
const unconfiguredCount = computed(() => view.value?.total.unassignedCount ?? 0);
const noGroupConfigured = computed(
  () => groups.value.length > 0 && groups.value.every((group) => group.key === UNCONFIGURED_KEY),
);

// ==================== 月份与年度 ====================

function shiftMonth(step: number) {
  return dayjs(`${props.month}-01`).add(step, 'month').format('YYYY-MM');
}
function changeMonth(value: unknown) {
  if (typeof value === 'string' && value) emit('update:month', value);
}
const previousReport = computed(() => {
  const month = shiftMonth(-1);
  return [...yearReports.value, ...previousYearReports.value].find(
    (item) => item.month === month && item.status === 'READY',
  );
});
const latestReportMonth = computed(
  () =>
    [...yearReports.value]
      .filter((item) => item.month !== props.month)
      .sort((a, b) => b.month.localeCompare(a.month))[0]?.month,
);

async function loadYear() {
  const current = ++yearSequence;
  const year = Number(props.month.slice(0, 4));
  yearLoading.value = true;
  try {
    const [reports, previous] = await Promise.all([
      getEcProfitYear(year),
      props.month.endsWith('-01') ? getEcProfitYear(year - 1) : Promise.resolve([]),
    ]);
    if (current !== yearSequence) return;
    yearReports.value = reports;
    previousYearReports.value = previous;
  } catch {
    // 年度导航失败不影响当月明细
  } finally {
    if (current === yearSequence) yearLoading.value = false;
  }
}

async function load() {
  const current = ++sequence;
  loading.value = true;
  error.value = '';
  view.value = undefined;
  try {
    const result = await getEcProfitMonthlyView(props.month);
    if (current !== sequence) return;
    view.value = result;
    expandedKeys.value = expansionKeys(result.groups, 'group');
    groupKey.value = undefined;
    if (props.focusGroupKey) {
      const found = findGroup(result.groups, props.focusGroupKey);
      if (found) {
        groupKey.value = found.key;
        expandedKeys.value = expansionKeys(result.groups, 'shop');
      } else message.info('该月未找到此分组，已展示完整月报');
      emit('clear-focus');
    }
  } catch {
    if (current === sequence) error.value = '月度毛利加载失败，请重试。';
  } finally {
    if (current === sequence) loading.value = false;
  }
}
watch(
  () => [props.month, props.configRevision],
  () => void load(),
  { immediate: true },
);
watch(
  () => [props.month.slice(0, 4), props.month.endsWith('-01'), props.configRevision],
  () => void loadYear(),
  { immediate: true },
);
onBeforeUnmount(() => {
  sequence++;
  yearSequence++;
});
function refresh() {
  void load();
  void loadYear();
}

// ==================== 概览 ====================

const overview = computed(() => (view.value ? displaySummary(view.value.total) : undefined));
const cards = computed(() =>
  (['salesAmount', 'grossProfit', 'grossMargin'] as MetricKey[]).map((key) => {
    const rate = isRateMetric(key);
    const change =
      totalComplete.value && report.value?.status === 'READY'
        ? changeOf(overview.value?.[key], previousReport.value?.summary?.[key], rate)
        : undefined;
    return {
      key,
      label: { salesAmount: '销售额', grossProfit: '毛利润', grossMargin: '毛利率' }[key as string],
      value: formatMetric(overview.value?.[key], rate),
      negative: (toNumber(overview.value?.[key]) ?? 0) < 0,
      change,
    };
  }),
);
const coverage = computed(() => {
  const total = view.value?.total;
  if (!total || total.expectedShopCount === 0) return 0;
  return Math.round((total.importedShopCount / total.expectedShopCount) * 100);
});
const issues = computed(() => {
  const total = view.value?.total;
  if (!report.value || !total) return [];
  const result: string[] = [];
  const pending = total.expectedShopCount - total.importedShopCount;
  if (pending > 0) result.push(`${pending} 家店铺待导入，合计暂按已导入小计展示`);
  if (total.pendingAdjustmentCount > 0) result.push(`${total.pendingAdjustmentCount} 项费用待导入`);
  const missing = Object.entries(total.missingMetricCounts ?? {})
    .filter(([key, count]) => count > 0 && ['estimatedFreight', 'freightAdjustment', 'newProductGiftAmount', 'customerRefundAmount'].every((optional) => optional !== key))
    .map(([key, count]) => `${financialColumns(true).find((column) => column.key === key)?.title ?? key} ${count} 项`);
  if (missing.length > 0) result.push(`缺少指标：${missing.join('、')}`);
  return result;
});

// ==================== 筛选与表格 ====================

const groupOptions = computed(() =>
  groups.value.map((group) => ({ label: group.name, value: group.key })),
);
function selectGroup(key: string | undefined) {
  groupKey.value = key;
  if (key) expandedKeys.value = expansionKeys(groups.value, 'shop');
}
function clearFilters() {
  groupKey.value = undefined;
  keyword.value = '';
}
const filtered = computed(() => !!(groupKey.value || keyword.value.trim()));
watch(keyword, (value) => {
  if (value.trim()) mode.value = 'flat';
});

const tree = computed(() => filterTree(groups.value, groupKey.value));
const treeRows = computed(() => tableTree(tree.value));
const allExpanded = computed(() => {
  const keys = expansionKeys(tree.value, 'shop');
  return keys.length > 0 && keys.every((key) => expandedKeys.value.includes(key));
});
function toggleExpand() {
  expandedKeys.value = allExpanded.value
    ? expansionKeys(tree.value, 'group')
    : expansionKeys(tree.value, 'shop');
}

const flatRows = computed(() => {
  const text = keyword.value.trim().toLowerCase();
  return leafRows(groups.value).filter(
    (row) =>
      (!groupKey.value || row.groupKey === groupKey.value) &&
      (!text ||
        row.name.toLowerCase().includes(text) ||
        (row.item?.platformCode ?? '').toLowerCase().includes(text)),
  );
});
const flatSummary = computed(() =>
  sumMetrics(
    flatRows.value
      .filter((row) => !received.value || row.item?.dataStatus === 'IMPORTED')
      .map((row) => (row.item?.dataStatus === 'IMPORTED' ? row.item : {})),
  ),
);
const summaryNode = computed(() =>
  view.value ? selectedTotal(view.value, groupKey.value) : undefined,
);
/** 结构图跟随筛选：选中分组/部门后展示该范围。 */
const structureSummary = computed(() =>
  summaryNode.value ? displaySummary(summaryNode.value) : undefined,
);
const structureScope = computed(() =>
  groupKey.value ? (findGroup(groups.value, groupKey.value)?.name ?? '所选分组') : '全月',
);

function compare(key: string) {
  return (a: LeafRow, b: LeafRow) =>
    (toNumber(a.item?.[key as MetricKey]) ?? Number.NEGATIVE_INFINITY) -
    (toNumber(b.item?.[key as MetricKey]) ?? Number.NEGATIVE_INFINITY);
}
/** 受控排序：店铺排行默认按毛利润从高到低。 */
const sortState = ref<{ key: string; order: 'ascend' | 'descend' | null }>({
  key: 'grossProfit',
  order: 'descend',
});
function tableChange(_pagination: unknown, _filters: unknown, sorter: any) {
  const current = Array.isArray(sorter) ? sorter[0] : sorter;
  sortState.value = { key: String(current?.columnKey ?? ''), order: current?.order ?? null };
}
const metricColumns = computed(() => financialColumns(fullColumns.value));
const columns = computed<TableColumnsType>(() => [
  {
    title: mode.value === 'tree' ? '分组 / 店铺' : '店铺 / 费用',
    key: 'name',
    fixed: 'left',
    width: mode.value === 'tree' ? 280 : 260,
  },
  ...(fullColumns.value
    ? [
        { title: '平台', key: 'platform', width: 90 },
        { title: '公司主体', key: 'company', width: 170 },
      ]
    : []),
  ...metricColumns.value.map((column) => ({
    ...column,
    ...(mode.value === 'flat'
      ? {
          sorter: compare(column.key),
          sortDirections: ['descend', 'ascend'] as ('ascend' | 'descend')[],
          sortOrder: sortState.value.key === column.key ? sortState.value.order : null,
        }
      : {}),
  })),
  ...(canUpdate.value
    ? [{ title: '操作', key: 'actions', width: 92, fixed: 'right' as const, align: 'center' as const }]
    : []),
]);
const scrollX = computed(() =>
  columns.value.reduce((sum, column) => sum + Number(column.width ?? 0), 0),
);
function rowClass(record: Api.GroupNode) {
  if (mode.value === 'flat') return '';
  if (record.nodeType === 'GROUP') return 'ecp-row-group';
  return '';
}
function metricValue(node: Api.GroupNode, key: string) {
  return nodeMetric(node, key, received.value);
}
function negative(node: Api.GroupNode, key: string) {
  const values = received.value ? node.receivedSummary : node.summary;
  return (toNumber(values?.[key as MetricKey]) ?? 0) < 0;
}
/** 只在异常时显示状态，正常数据不占位。 */
function leafFlags(node: Api.GroupNode) {
  const flags: { color: string; text: string }[] = [];
  if (node.nodeType === 'ADJUSTMENT') flags.push({ color: 'purple', text: '费用' });
  const state = nodeState(node);
  if (!['已导入', '费用已导入'].includes(state))
    flags.push({ color: state.includes('待导入') ? 'orange' : 'gold', text: state });
  return flags;
}
function openItem(node: Api.GroupNode) {
  itemDetail.value = node;
  detailOpen.value = true;
}

// ==================== 操作 ====================

const editable = computed(
  () =>
    !!report.value &&
    report.value.status === 'WAITING_IMPORT' &&
    view.value!.total.importedShopCount === 0 &&
    view.value!.total.adjustmentCount === view.value!.total.pendingAdjustmentCount,
);
const canUpdate = computed(() => hasAccessByCodes(['fdmcaiwu:ec-profit:update']));
const moreActions = computed(() =>
  [
    { key: 'add', label: '添加店铺 / 费用行', icon: 'lucide:list-plus', show: canUpdate.value },
    {
      key: 'fill',
      label: '批量填写空白项',
      icon: 'lucide:paint-bucket',
      show: canUpdate.value && !!report.value,
    },
    {
      key: 'scope',
      label: '同步本月范围',
      icon: 'lucide:list-restart',
      show: editable.value && hasAccessByCodes(['fdmcaiwu:ec-profit:update']),
    },
    {
      key: 'remark',
      label: '编辑备注',
      icon: 'lucide:pencil',
      show: editable.value && hasAccessByCodes(['fdmcaiwu:ec-profit:update']),
    },
    {
      key: 'delete',
      label: '删除月报',
      icon: 'lucide:trash-2',
      show: editable.value && hasAccessByCodes(['fdmcaiwu:ec-profit:delete']),
      danger: true,
    },
    {
      key: 'purge',
      label: '清空本月数据…',
      icon: 'lucide:eraser',
      show: !!report.value && !editable.value && hasAccessByCodes(['fdmcaiwu:ec-profit:delete']),
      danger: true,
    },
  ].filter((action) => action.show),
);
function runAction({ key }: { key: number | string }) {
  if (key === 'add') openEditor();
  else if (key === 'fill') openFill();
  else if (key === 'purge') openPurge();
  else if (key === 'scope') scopeOpen.value = true;
  else if (key === 'remark') edit();
  else if (key === 'delete') remove();
}
function edit() {
  if (report.value && editable.value) {
    editing.value = report.value;
    formOpen.value = true;
  }
}
// ---------- 明细维护 ----------
const editorOpen = ref(false);
const editorItem = ref<Api.Item>();
function openEditor(item?: Api.Item) {
  editorItem.value = item;
  editorOpen.value = true;
  detailOpen.value = false;
}
function afterImport(month: string) {
  if (month !== props.month) emit('update:month', month);
  else refresh();
}
function removeItem(item: Api.Item) {
  const current = report.value;
  if (!current) return;
  Modal.confirm({
    title: `删除「${item.shopName}」这一行？`,
    content: '只删除本月这一行数据，可以之后重新导入或手工添加。',
    okText: '删除',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      await deleteEcProfitItem(item.id, current.version);
      message.success('已删除');
      refresh();
    },
  });
}

const FILL_FIELDS = [
  { label: '代发采购', value: 'dropshipPurchaseCost' },
  { label: '其中周边', value: 'accessoryPurchaseCost' },
  { label: '税费', value: 'taxFee' },
  { label: '新品礼金', value: 'newProductGiftAmount' },
  { label: '客户返款', value: 'customerRefundAmount' },
] as const;
const fillOpen = ref(false);
const fillField = ref<string>('dropshipPurchaseCost');
const fillValue = ref<number | undefined>(0);
const filling = ref(false);
const fillBlankCount = computed(
  () =>
    leafRows(groups.value).filter(
      (row) => row.item && row.item[fillField.value as keyof Api.Item] == null,
    ).length,
);
function openFill() {
  fillField.value = 'dropshipPurchaseCost';
  fillValue.value = 0;
  fillOpen.value = true;
}
async function submitFill() {
  const current = report.value;
  if (!current || fillValue.value == null) return;
  filling.value = true;
  try {
    const count = await fillBlankEcProfitItems({
      reportId: current.id,
      reportVersion: current.version,
      field: fillField.value,
      value: fillValue.value,
    });
    message.success(`已填写 ${count} 行`);
    fillOpen.value = false;
    refresh();
  } finally {
    filling.value = false;
  }
}

const purgeOpen = ref(false);
const purgeInput = ref('');
const purging = ref(false);
function openPurge() {
  purgeInput.value = '';
  purgeOpen.value = true;
}
async function submitPurge() {
  const current = report.value;
  if (!current || purgeInput.value.trim() !== current.month) return;
  purging.value = true;
  try {
    await purgeEcProfitReport(current.id, current.version, current.month);
    message.success(`${current.month} 的数据已清空，可以重新导入`);
    purgeOpen.value = false;
    refresh();
  } finally {
    purging.value = false;
  }
}

async function saved(month: string) {
  void loadYear();
  if (month !== props.month) emit('update:month', month);
  else await load();
}
function remove() {
  const current = report.value;
  if (!current || !editable.value) return;
  Modal.confirm({
    title: `删除 ${current.month} 月报？`,
    content: '仅删除尚无导入数据的月报及店铺占位明细，分组配置不受影响。',
    okText: '删除',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      await deleteEcProfit(current.id, current.version);
      message.success('月报已删除');
      refresh();
    },
  });
}
async function exportExcel() {
  if (!report.value) return;
  exporting.value = true;
  try {
    const data = await exportEcProfitMonthlyExcel(props.month);
    downloadFileFromBlobPart({ fileName: `电商毛利表-${props.month}.xlsx`, source: data });
  } finally {
    exporting.value = false;
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- 工具栏 -->
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-wrap items-center gap-2">
        <div class="flex items-center">
          <Tooltip title="上个月">
            <Button aria-label="上个月" @click="changeMonth(shiftMonth(-1))">
              <template #icon><IconifyIcon icon="lucide:chevron-left" /></template>
            </Button>
          </Tooltip>
          <DatePicker
            :value="month"
            picker="month"
            value-format="YYYY-MM"
            format="YYYY 年 MM 月"
            :allow-clear="false"
            class="mx-1 w-36"
            aria-label="毛利月份"
            @change="changeMonth"
          />
          <Tooltip title="下个月">
            <Button
              aria-label="下个月"
              :disabled="shiftMonth(1) > thisMonth"
              @click="changeMonth(shiftMonth(1))"
            >
              <template #icon><IconifyIcon icon="lucide:chevron-right" /></template>
            </Button>
          </Tooltip>
        </div>
        <template v-if="report">
          <Tag :color="report.status === 'READY' ? 'success' : 'orange'" class="!mr-0">{{
            report.status === 'READY' ? '已就绪' : '待导入'
          }}</Tag>
          <span class="text-xs text-muted-foreground">{{ report.reportNo }}</span>
          <Tooltip v-if="report.remark" :title="`备注：${report.remark}`">
            <IconifyIcon icon="lucide:message-square-text" class="text-muted-foreground" />
          </Tooltip>
        </template>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <Button
          v-access:code="['fdmcaiwu:ec-profit:update']"
          @click="importOpen = true"
        >
          <template #icon><IconifyIcon icon="lucide:upload" /></template>导入 Excel
        </Button>
        <Tooltip :title="report ? '分层汇总（可折叠）+ 店铺明细两张表' : '本月尚未建单'">
          <Button :disabled="!report" :loading="exporting" @click="exportExcel">
            <template #icon><IconifyIcon icon="lucide:download" /></template>导出 Excel
          </Button>
        </Tooltip>
        <Tooltip title="刷新">
          <Button aria-label="刷新" :loading="loading" @click="refresh">
            <template #icon><IconifyIcon icon="lucide:refresh-cw" /></template>
          </Button>
        </Tooltip>
        <Dropdown v-if="moreActions.length > 0" :trigger="['click']">
          <Button>
            更多<IconifyIcon icon="lucide:chevron-down" class="ml-1 inline-block" />
          </Button>
          <template #overlay>
            <Menu @click="runAction">
              <Menu.Item v-for="action in moreActions" :key="action.key" :danger="action.danger">
                <span class="inline-flex items-center gap-2">
                  <IconifyIcon :icon="action.icon" />{{ action.label }}
                </span>
              </Menu.Item>
            </Menu>
          </template>
        </Dropdown>
      </div>
    </div>

    <MonthStrip
      :loading="yearLoading"
      :month="month"
      :reports="yearReports"
      @select="changeMonth"
    />

    <Alert v-if="error" :message="error" type="error" show-icon>
      <template #action><Button size="small" @click="load">重试</Button></template>
    </Alert>

    <div v-if="loading && !view" class="flex h-60 items-center justify-center">
      <Spin />
    </div>
    <!-- 未建单 -->
      <div
        v-if="!loading && !error && view && !report"
        class="flex flex-col items-center rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center"
      >
        <IconifyIcon icon="lucide:calendar-plus" class="mb-3 size-10 text-muted-foreground" />
        <div class="text-base font-medium">{{ month.replace('-', ' 年 ') }} 月尚未建立月报</div>
        <p class="mb-5 mt-2 max-w-md text-sm text-muted-foreground">
          导入聚水潭「经营利润明细表」后自动建立本月月报；聚水潭里没有的店铺可以手工添加。
        </p>
        <div class="flex flex-wrap justify-center gap-2">
          <Button v-if="canUpdate" type="primary" @click="importOpen = true">
            <template #icon><IconifyIcon icon="lucide:upload" /></template>导入 Excel
          </Button>
          <Button v-if="canUpdate" @click="openEditor()">手工添加</Button>
          <Button @click="emit('configured')">查看分组配置</Button>
          <Button
            v-if="latestReportMonth"
            type="link"
            @click="changeMonth(latestReportMonth)"
            >查看 {{ Number(latestReportMonth.slice(5)) }} 月数据 →</Button
          >
        </div>
      </div>

      <template v-else-if="view && report">
        <!-- 核心指标 -->
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div
            v-for="card in cards"
            :key="card.key"
            class="rounded-xl border border-border bg-card px-5 py-4"
          >
            <div class="flex items-center justify-between text-sm text-muted-foreground">
              <span>{{ card.label }}</span>
              <Tag v-if="!totalComplete" color="orange" class="!mr-0">已导入小计</Tag>
            </div>
            <div
              class="my-2 text-[26px] font-semibold leading-tight"
              :class="card.negative ? 'text-[var(--ecp-negative)]' : ''"
            >
              {{ card.value }}
            </div>
            <div class="flex items-center gap-1 text-xs text-muted-foreground">
              <template v-if="card.change">
                <span
                  class="inline-flex items-center gap-0.5 font-medium"
                  :class="
                    card.change.direction > 0
                      ? 'text-[var(--ecp-positive-text)]'
                      : card.change.direction < 0
                        ? 'text-[var(--ecp-negative)]'
                        : ''
                  "
                >
                  <IconifyIcon
                    v-if="card.change.direction !== 0"
                    :icon="card.change.direction > 0 ? 'lucide:arrow-up-right' : 'lucide:arrow-down-right'"
                  />{{ card.change.text }}
                </span>
                <span>较上月</span>
              </template>
              <span v-else>{{ totalComplete ? '上月无可比数据' : '全月尚未完整，不做环比' }}</span>
            </div>
          </div>
          <div class="rounded-xl border border-border bg-card px-5 py-4">
            <div class="text-sm text-muted-foreground">应报店铺完成</div>
            <div class="my-2 text-[26px] font-semibold leading-tight">
              {{ view.total.importedShopCount
              }}<span class="ml-1 text-sm font-normal text-muted-foreground"
                >/ {{ view.total.expectedShopCount }} 家</span
              >
            </div>
            <div class="h-1.5 overflow-hidden rounded-full bg-[var(--ecp-track)]">
              <div
                class="h-full rounded-full"
                :class="coverage === 100 ? 'bg-[var(--ecp-series-1)]' : 'bg-amber-500'"
                :style="{ width: `${coverage}%` }"
              ></div>
            </div>
          </div>
        </div>

        <Alert v-if="issues.length > 0" type="warning" show-icon class="!mt-3">
          <template #message>
            <ul class="m-0 list-none space-y-0.5 p-0 text-sm">
              <li v-for="issue in issues" :key="issue">{{ issue }}</li>
            </ul>
          </template>
        </Alert>
        <Alert v-if="unconfiguredCount > 0" type="info" show-icon class="!mt-3">
          <template #message>
            {{
              noGroupConfigured
                ? '还没有配置电商分组，本月全部店铺暂时放在「未配置」分组。'
                : `${unconfiguredCount} 项明细还没有配置分组，已放在「未配置」分组。`
            }}
          </template>
          <template #action>
            <Button size="small" type="primary" ghost @click="emit('configured')">去配置分组</Button>
          </template>
        </Alert>

        <!-- 结构与排行 -->
        <div v-if="hasData" class="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-5">
          <div class="rounded-xl border border-border bg-card p-5 xl:col-span-3">
            <div class="mb-4 flex items-start justify-between gap-2">
              <div>
                <div class="font-medium">销售额去向 · {{ structureScope }}</div>
                <div class="text-xs text-muted-foreground">
                  每 100 元销售额里，毛利与各项成本各占多少
                </div>
              </div>
              <Button v-if="filtered" size="small" type="link" class="!px-0" @click="clearFilters"
                >看全月</Button
              >
            </div>
            <CostStructure :summary="structureSummary" />
          </div>
          <div class="rounded-xl border border-border bg-card p-5 xl:col-span-2">
            <GroupRanking
              :groups="groups"
              :selected-key="groupKey"
              @select="selectGroup"
            />
          </div>
        </div>

        <!-- 明细表 -->
        <div class="mt-4 rounded-xl border border-border bg-card p-4">
          <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div class="flex flex-wrap items-center gap-2">
              <Segmented
                v-model:value="mode"
                :options="[
                  { label: '按分组', value: 'tree' },
                  { label: '店铺排行', value: 'flat' },
                ]"
              />
              <Input
                v-model:value="keyword"
                allow-clear
                placeholder="搜索店铺 / 平台"
                class="!w-44"
                aria-label="搜索店铺"
              >
                <template #prefix><IconifyIcon icon="lucide:search" class="text-muted-foreground" /></template>
              </Input>
              <Select
                :value="groupKey"
                :options="groupOptions"
                placeholder="全部分组"
                allow-clear
                class="w-44"
                aria-label="筛选分组"
                @change="(value) => selectGroup(value as string | undefined)"
              />
              <Button v-if="filtered" type="link" size="small" @click="clearFilters">清除筛选</Button>
            </div>
            <div class="flex flex-wrap items-center gap-3">
              <Checkbox v-if="!totalComplete" v-model:checked="received">显示已导入小计</Checkbox>
              <Button v-if="mode === 'tree'" size="small" @click="toggleExpand">
                <template #icon>
                  <IconifyIcon :icon="allExpanded ? 'lucide:chevrons-down-up' : 'lucide:chevrons-up-down'" />
                </template>
                {{ allExpanded ? '收起到分组' : '展开全部店铺' }}
              </Button>
              <Segmented
                v-model:value="columnMode"
                size="small"
                :options="[
                  { label: '核心列', value: 'core' },
                  { label: '完整列', value: 'full' },
                ]"
              />
            </div>
          </div>
          <div class="mb-2 text-xs text-muted-foreground">
            单位：元 · 红色为负数 · 「—」表示未导入或缺少口径
          </div>
          <Table
            :columns="columns"
            :data-source="mode === 'tree' ? treeRows : flatRows"
            :loading="loading"
            :pagination="false"
            :scroll="{ x: scrollX, y: 560 }"
            :expanded-row-keys="mode === 'tree' ? expandedKeys : undefined"
            :row-class-name="(record: any) => rowClass(record)"
            :indent-size="16"
            row-key="key"
            size="small"
            @update:expanded-row-keys="expandedKeys = [...$event]"
            @change="tableChange"
          >
            <template #bodyCell="{ column, record }">
              <div v-if="column.key === 'name'" class="flex min-w-0 items-center gap-1.5">
                <template v-if="record.item">
                  <button
                    type="button"
                    class="truncate text-left text-primary hover:underline"
                    :title="record.name"
                    @click="openItem(record as Api.GroupNode)"
                  >
                    {{ record.name }}
                  </button>
                  <Tag
                    v-for="flag in leafFlags(record as Api.GroupNode)"
                    :key="flag.text"
                    :color="flag.color"
                    class="!mr-0 shrink-0"
                    >{{ flag.text }}</Tag
                  >
                </template>
                <template v-else>
                  <span class="truncate" :title="record.name">{{ record.name }}</span>
                  <span class="shrink-0 text-xs font-normal text-muted-foreground"
                    >{{ record.expectedShopCount }} 家</span
                  >
                  <Tooltip
                    v-if="!fullyImported(record as Api.GroupNode)"
                    :title="`已导入 ${record.importedShopCount} / ${record.expectedShopCount} 家`"
                  >
                    <Tag color="orange" class="!mr-0 shrink-0"
                      >{{ record.importedShopCount }}/{{ record.expectedShopCount }}</Tag
                    >
                  </Tooltip>
                  <Tag
                    v-else-if="record.expectedShopCount === 0 && record.adjustmentCount === 0"
                    class="!mr-0 shrink-0"
                    >本月无应报</Tag
                  >
                </template>
              </div>
              <div
                v-if="column.key === 'name' && mode === 'flat'"
                class="truncate text-[11px] text-muted-foreground"
              >
                {{ record.groupLabel }}
              </div>
              <template v-else-if="column.key === 'platform'">{{
                record.item?.platformCode || '—'
              }}</template>
              <template v-else-if="column.key === 'company'">
                <span class="block truncate" :title="record.item?.companyName">{{
                  record.item?.companyName || '—'
                }}</span>
              </template>
              <div v-else-if="column.key === 'actions'" class="flex justify-center gap-1">
                <template v-if="record.item">
                  <Tooltip title="修改">
                    <Button
                      size="small"
                      type="text"
                      aria-label="修改"
                      @click="openEditor(record.item as Api.Item)"
                    >
                      <template #icon><IconifyIcon icon="lucide:pencil" /></template>
                    </Button>
                  </Tooltip>
                  <Tooltip title="删除这一行">
                    <Button
                      size="small"
                      type="text"
                      danger
                      aria-label="删除"
                      @click="removeItem(record.item as Api.Item)"
                    >
                      <template #icon><IconifyIcon icon="lucide:trash-2" /></template>
                    </Button>
                  </Tooltip>
                </template>
              </div>
              <span
                v-else-if="column.key !== 'name'"
                class="tabular-nums"
                :class="[
                  negative(record as Api.GroupNode, String(column.key)) ? 'text-[var(--ecp-negative)]' : '',
                  record.item ? '' : 'font-medium',
                ]"
                >{{ metricValue(record as Api.GroupNode, String(column.key)) }}</span
              >
            </template>
            <template #summary>
              <Table.Summary v-if="summaryNode" fixed>
                <Table.Summary.Row class="ecp-summary-row">
                  <Table.Summary.Cell
                    v-for="(column, index) in columns"
                    :key="String(column.key)"
                    :index="index"
                    :align="(column as any).align"
                  >
                    <div v-if="column.key === 'name'" class="font-semibold">
                      {{ filtered ? '筛选范围合计' : '全月合计' }}
                      <span
                        v-if="received || !fullyImported(summaryNode)"
                        class="ml-1 text-xs font-normal text-muted-foreground"
                        >{{ received ? '已导入小计' : '完整合计，缺失不补零' }}</span
                      >
                    </div>
                    <span
                      v-else-if="['platform', 'company', 'actions'].includes(String(column.key))"
                    ></span>
                    <strong
                      v-else
                      class="tabular-nums"
                      :class="
                        (toNumber(
                          (mode === 'flat'
                            ? flatSummary
                            : received
                              ? summaryNode.receivedSummary
                              : summaryNode.summary)?.[column.key as MetricKey],
                        ) ?? 0) < 0
                          ? 'text-[var(--ecp-negative)]'
                          : ''
                      "
                      >{{
                        mode === 'flat'
                          ? formatMetric(
                              flatSummary[column.key as MetricKey],
                              isRateMetric(String(column.key)),
                            )
                          : nodeMetric(summaryNode, String(column.key), received)
                      }}</strong
                    >
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              </Table.Summary>
            </template>
            <template #emptyText>
              <Empty
                :image="Empty.PRESENTED_IMAGE_SIMPLE"
                :description="keyword ? `没有找到「${keyword}」` : '当前范围暂无明细'"
              />
            </template>
          </Table>
        </div>
      </template>
  </div>
  <ReportForm
    v-model:open="formOpen"
    :default-month="month"
    :report="editing"
    @saved="saved"
    @configure="
      formOpen = false;
      emit('configured');
    "
  />
  <ScopeDialog
    v-if="report"
    v-model:open="scopeOpen"
    :report="report"
    @saved="refresh"
    @configure="
      scopeOpen = false;
      emit('configured');
    "
  />
  <ImportDialog v-model:open="importOpen" :default-month="month" @imported="afterImport" />
  <ItemDrawer
    v-model:open="detailOpen"
    :node="itemDetail"
    :editable="canUpdate"
    @edit="openEditor"
  />
  <ItemEditor
    v-model:open="editorOpen"
    :item="editorItem"
    :month="month"
    :report-version="report?.version"
    @saved="refresh"
  />
  <Modal
    v-model:open="fillOpen"
    title="批量填写空白项"
    :confirm-loading="filling"
    ok-text="填写"
    :ok-button-props="{ disabled: fillValue == null || fillBlankCount === 0 }"
    @ok="submitFill"
  >
    <p class="text-sm text-muted-foreground">
      把本月所有「空白」的某一项统一填成同一个值，已有数值的行不受影响。常用于代发采购、周边统一填 0。
    </p>
    <div class="flex items-center gap-3">
      <Select v-model:value="fillField" :options="[...FILL_FIELDS]" class="w-40" />
      <span class="text-sm">填为</span>
      <InputNumber v-model:value="fillValue" :precision="2" class="w-36" />
    </div>
    <p class="mb-0 mt-3 text-sm">本月有 <strong>{{ fillBlankCount }}</strong> 行这一项是空白的。</p>
  </Modal>
  <Modal
    v-model:open="purgeOpen"
    title="清空本月数据"
    :confirm-loading="purging"
    ok-text="清空"
    :ok-button-props="{ danger: true, disabled: purgeInput.trim() !== report?.month }"
    @ok="submitPurge"
  >
    <Alert
      type="error"
      show-icon
      class="mb-3"
      :message="`将删除 ${report?.month} 的月报和全部 ${leafRows(groups).length} 行明细（含手工录入的），之后可重新导入。`"
    />
    <p class="mb-2 text-sm">请输入月份 <strong>{{ report?.month }}</strong> 确认：</p>
    <Input v-model:value="purgeInput" :placeholder="report?.month" />
  </Modal>
</template>

<style scoped>
:deep(.ecp-row-group > td) {
  font-weight: 600;
  background: hsl(var(--accent));
}

:deep(.ecp-summary-row > td) {
  background: hsl(var(--accent)) !important;
}
</style>
