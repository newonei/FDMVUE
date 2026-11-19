<script setup lang="ts">
import type { Delivery } from './delivery';
import type { ImportPreview } from './import-payroll';
import type { PayrollRow } from './model';

import { computed, onMounted, onUnmounted, ref, watch } from 'vue';

import {
  ArrowDown,
  ArrowUp,
  Bell,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CloudUpload,
  Download,
  ExternalLink,
  History,
  InspectionPanel,
  LayoutGrid,
  List,
  LockKeyhole,
  Plus,
  Search,
  Settings,
  Upload,
  X,
} from '../../../../../packages/@core/base/icons/src/lucide';
import { openSlip, settingsKey, viewDeadline } from './delivery';
import { currency, monthLabel, shortMonth } from './format';
import { downloadTemplate, parsePayroll } from './import-payroll';
import {
  dateTime,
  deductionFields,
  employeeSlip,
  fields,
  groupSum,
  incomeGroups,
  monthOffset,
  sampleBatches,
  statisticFields,
  sum,
  textFields,
} from './model';

const navigation = [
  {
    id: 'overview',
    title: '薪酬总览',
    icon: LayoutGrid,
    description: '按月核对工资成本、人员分布与发放进度。',
  },
  {
    id: 'detail',
    title: '工资明细',
    icon: List,
    description: '按公司、部门和员工查阅工资核算数据。',
  },
  {
    id: 'delivery',
    title: '工资条发放',
    icon: Bell,
    description: '核对接收范围，预览钉钉工作通知并查看发放记录。',
  },
  {
    id: 'settings',
    title: '薪酬设置',
    icon: Settings,
    description: '管理员工工资条的查看规则。',
  },
] as const;

type Page = (typeof navigation)[number]['id'];
const page = ref<Page>('overview');
const month = ref('2026-10');
const company = ref('');
const department = ref('');
const query = ref('');
const tablePage = ref(1);
const batches = ref(sampleBatches());
const deliveries = ref<Delivery[]>([]);
const lastViewChange = ref(Date.now());
const savedMinutes = ref(Number(localStorage.getItem(settingsKey)) || 30);
const draftMinutes = ref(savedMinutes.value);
const toast = ref('');
let toastTimer: ReturnType<typeof setTimeout> | undefined;
const refreshViewStatus = () => {
  lastViewChange.value = Date.now();
};
const statusInterval = setInterval(refreshViewStatus, 1000);
onMounted(() => window.addEventListener('storage', refreshViewStatus));
onUnmounted(() => {
  clearInterval(statusInterval);
  clearTimeout(toastTimer);
  window.removeEventListener('storage', refreshViewStatus);
});

const current = computed(() => navigation.find(({ id }) => id === page.value)!);
const activeBatch = computed(() => batches.value[month.value]);
const companies = computed(() =>
  [...new Set(activeBatch.value?.rows.map((row) => row.company))].toSorted(),
);
const departments = computed(() =>
  [
    ...new Set(
      activeBatch.value?.rows
        .filter((row) => !company.value || row.company === company.value)
        .map((row) => row.department),
    ),
  ].toSorted(),
);
const scopedRows = (rows: PayrollRow[] = [], restrictDepartment = true) =>
  rows.filter(
    (row) =>
      (!company.value || row.company === company.value) &&
      (!restrictDepartment ||
        !department.value ||
        row.department === department.value),
  );
const visibleRows = computed(() => scopedRows(activeBatch.value?.rows));
const filteredRows = computed(() =>
  visibleRows.value.filter((row) => row.name.includes(query.value.trim())),
);
const pageSize = 9;
const pageCount = computed(() =>
  Math.max(1, Math.ceil(filteredRows.value.length / pageSize)),
);
const pagedRows = computed(() =>
  filteredRows.value.slice(
    (tablePage.value - 1) * pageSize,
    tablePage.value * pageSize,
  ),
);
watch([company, department, month, query], () => {
  tablePage.value = 1;
});
watch(company, () => {
  department.value = '';
});
watch(month, () => {
  company.value = '';
  department.value = '';
  query.value = '';
});

const currentDelivery = computed(() => {
  const byEmployee = new Map<string, Delivery>();
  for (const receipt of deliveries.value) {
    if (
      receipt.slip.month === month.value &&
      receipt.batchVersion === (activeBatch.value?.importedAt ?? 0) &&
      !byEmployee.has(receipt.employeeKey)
    ) {
      byEmployee.set(receipt.employeeKey, receipt);
    }
  }
  return byEmployee;
});
const periodDeliveries = computed(() =>
  deliveries.value.filter(
    ({ slip }) =>
      slip.month === month.value &&
      (!company.value || slip.company === company.value) &&
      (!department.value || slip.department === department.value),
  ),
);
const deliveryStatus = (item: Delivery) => {
  const now = lastViewChange.value;
  const deadline = viewDeadline(item);
  if (!deadline) return '待查看';
  return deadline <= now ? '已到期' : '已查看';
};
const rowStatus = (row: PayrollRow) => {
  const delivery = currentDelivery.value.get(row.id);
  return delivery ? deliveryStatus(delivery) : '待发送';
};
const eligibleRows = computed(() =>
  (page.value === 'detail' ? filteredRows.value : visibleRows.value).filter(
    (row) => ['已到期', '待发送'].includes(rowStatus(row)),
  ),
);
const metrics = computed(() => {
  const rows = visibleRows.value;
  const previous = batches.value[monthOffset(month.value, -1)];
  const prior = previous ? scopedRows(previous.rows) : [];
  const net = sum(rows, 'net');
  const priorNet = sum(prior, 'net');
  return [
    {
      title: '应发合计',
      value: currency(sum(rows, 'gross')),
      foot: '较上月',
      delta:
        rows.length > 0
          ? percentChange(sum(rows, 'gross'), sum(prior, 'gross'))
          : undefined,
      symbol: 'gross',
    },
    {
      title: '实发合计',
      value: currency(net),
      foot: '较上月',
      delta: rows.length > 0 ? percentChange(net, priorNet) : undefined,
      symbol: 'net',
    },
    {
      title: '核算人数',
      value: String(rows.length),
      suffix: '人',
      foot: '较上月',
      delta:
        prior.length > 0 && rows.length > 0
          ? rows.length - prior.length
          : undefined,
      symbol: 'people',
    },
    {
      title: '人均实发',
      value: currency(rows.length > 0 ? Math.round(net / rows.length) : 0),
      foot: '较上月',
      delta: percentChange(net / rows.length, priorNet / prior.length),
      symbol: 'average',
    },
  ];
});
function percentChange(next: number, previous: number) {
  return previous > 0 && Number.isFinite(next)
    ? ((next - previous) / previous) * 100
    : undefined;
}

const trend = computed(() =>
  Array.from({ length: 6 }, (_, i) => {
    const period = monthOffset(month.value, i - 5);
    const rows = scopedRows(batches.value[period]?.rows);
    const gross = sum(rows, 'gross');
    const net = sum(rows, 'net');
    return {
      period,
      label: shortMonth(period),
      description: `${monthLabel(period)} 应发 ${currency(gross)}，实发 ${currency(net)}`,
      gross,
      net,
      loaded: rows.length > 0,
    };
  }),
);
const chartRange = computed(() => {
  const values = trend.value.flatMap(({ gross, net }) => [gross, net]);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const raw = Math.max((max - min) / 4, 100_000);
  const power = 10 ** Math.floor(Math.log10(raw));
  const step =
    ([1, 2, 2.5, 5, 10].find((number) => number * power >= raw) ?? 10) * power;
  const bottom = Math.floor(min / step) * step;
  const top = Math.max(Math.ceil(max / step) * step, bottom + step);
  const lines = Array.from(
    { length: Math.round((top - bottom) / step) + 1 },
    (_, index) => top - step * index,
  );
  return { bottom, top, lines };
});
const chartPercent = (value: number) =>
  (100 * (value - chartRange.value.bottom)) /
  (chartRange.value.top - chartRange.value.bottom);
const barStyle = (value: number) => ({
  bottom: `${Math.min(chartPercent(value), chartPercent(0))}%`,
  height: `${Math.abs(chartPercent(value) - chartPercent(0))}%`,
});
const rankBy = ref<'company' | 'department'>('department');
const ranking = computed(() => {
  const grouped = new Map<
    string,
    { label: string; net: number; people: number }
  >();
  for (const row of scopedRows(
    activeBatch.value?.rows,
    rankBy.value !== 'department',
  )) {
    const key = row[rankBy.value];
    const group = grouped.get(key) ?? { label: key, people: 0, net: 0 };
    group.people++;
    group.net += row.net;
    grouped.set(key, group);
  }
  return [...grouped.values()].toSorted((a, b) => b.net - a.net);
});
const rankingMaximum = computed(() =>
  Math.max(1, ...ranking.value.map(({ net }) => Math.abs(net))),
);
const composition = computed(() =>
  incomeGroups.map(({ title, color, keys }) => ({
    title,
    color,
    cents: groupSum(visibleRows.value, keys),
  })),
);
const compositionTotal = computed(() => {
  let total = 0;
  for (const item of composition.value) total += Math.abs(item.cents);
  return total;
});
const stateCounts = computed(() => {
  const rows = visibleRows.value.map(rowStatus);
  return ['待发送', '待查看', '已查看', '已到期'].map((label) => ({
    label,
    count: rows.filter((status) => status === label).length,
  }));
});

function navigate(target: Page) {
  page.value = target;
  window.scrollTo({ top: 0 });
}
function changeMonth(event: Event) {
  const input = event.target as HTMLInputElement;
  if (/^20\d{2}-(0[1-9]|1[0-2])$/.test(input.value)) month.value = input.value;
  else input.value = month.value;
}
function drillDown(label: string) {
  const dimension = rankBy.value;
  if (dimension === 'company' && company.value !== label) {
    company.value = label;
    department.value = '';
  }
  if (dimension === 'department') department.value = label;
  query.value = '';
  navigate('detail');
}
function notify(message: string) {
  toast.value = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.value = '';
  }, 4200);
}
function saveSettings() {
  const minutes = Number(draftMinutes.value);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
    notify('请输入 1–1440 之间的整数分钟。');
    return;
  }
  savedMinutes.value = minutes;
  localStorage.setItem(settingsKey, String(minutes));
  notify('查看时长已保存，下次发送时生效。');
}

const dialog = ref<HTMLDialogElement>();
const mode = ref<'employee' | 'import' | 'notice' | 'send'>();
const employee = ref<PayrollRow>();
const notice = ref<Delivery>();
const showAllFields = ref(false);
const employeePane = ref<'history' | 'items'>('items');
const employeeHistory = computed(() =>
  Array.from({ length: 6 }, (_, index) => {
    const period = monthOffset(month.value, -index);
    return {
      period,
      row: batches.value[period]?.rows.find(
        ({ id }) => id === employee.value?.id,
      ),
    };
  }),
);
function showDialog(next: NonNullable<typeof mode.value>) {
  mode.value = next;
  if (!dialog.value?.open) dialog.value?.showModal();
}
function closeDialog() {
  dialog.value?.close();
}
function showEmployee(row: PayrollRow) {
  employee.value = row;
  employeePane.value = 'items';
  showAllFields.value = false;
  showDialog('employee');
}

const importMonth = ref(month.value);
const uploadName = ref('');
const importResult = ref<ImportPreview>();
const importBusy = ref(false);
const importError = ref('');
const dragOver = ref(false);
const worksheetFile = ref<File>();
let importAttempt = 0;

function startImport() {
  importMonth.value = month.value;
  uploadName.value = '';
  worksheetFile.value = undefined;
  importResult.value = undefined;
  importError.value = '';
  importAttempt++;
  importBusy.value = false;
  showDialog('import');
}
function validPeriod() {
  return /^20\d{2}-(0[1-9]|1[0-2])$/.test(importMonth.value);
}
async function processFile(file?: File) {
  if (!file) return;
  worksheetFile.value = file;
  const attempt = ++importAttempt;
  uploadName.value = file.name;
  importError.value = '';
  importResult.value = undefined;
  if (!validPeriod()) {
    importError.value = '请先选择有效的工资月份。';
    importBusy.value = false;
    return;
  }
  importBusy.value = true;
  try {
    const result = await parsePayroll(file, importMonth.value);
    if (attempt === importAttempt) importResult.value = result;
  } catch (error) {
    if (attempt === importAttempt) {
      const message = error instanceof Error ? error.message : '';
      importError.value = /[\u3400-\u9FFF]/.test(message)
        ? message
        : '无法读取工作簿，请在 Excel 中另存为 .xlsx 后重试。';
    }
  } finally {
    if (attempt === importAttempt) importBusy.value = false;
  }
}
function handleFileInput(event: Event) {
  const input = event.target as HTMLInputElement;
  void processFile(input.files?.[0]);
  input.value = '';
}
function handleDrop(event: DragEvent) {
  dragOver.value = false;
  void processFile(event.dataTransfer?.files[0]);
}
watch(
  importMonth,
  () => {
    if (worksheetFile.value) void processFile(worksheetFile.value);
  },
  { flush: 'sync' },
);
async function getTemplate() {
  if (!validPeriod()) {
    notify('请先选择有效的工资月份。');
    return;
  }
  try {
    await downloadTemplate(importMonth.value);
  } catch {
    notify('模板下载失败，请重试。');
  }
}
function confirmImport() {
  if (
    importBusy.value ||
    !importResult.value?.rows.length ||
    importResult.value.errors.length > 0
  )
    return;
  const rows = importResult.value.rows;
  batches.value[importMonth.value] = {
    rows,
    source: uploadName.value,
    importedAt: Date.now(),
  };
  month.value = importMonth.value;
  company.value = '';
  department.value = '';
  query.value = '';
  closeDialog();
  navigate('overview');
  notify(`已导入 ${rows.length} 条工资明细，看板已更新。`);
}

const recipients = ref<PayrollRow[]>([]);
const selectedIds = ref<string[]>([]);
function startSend() {
  recipients.value = eligibleRows.value;
  selectedIds.value = recipients.value.map(({ id }) => id);
  showDialog('send');
}
function makeDelivery(row: PayrollRow, at = Date.now()): Delivery {
  return {
    id: crypto.randomUUID(),
    sentAt: at,
    minutes: savedMinutes.value,
    employeeKey: row.id,
    batchVersion: activeBatch.value?.importedAt ?? 0,
    slip: employeeSlip(month.value, row),
  };
}
function confirmSend() {
  const selected = new Set(selectedIds.value);
  const at = Date.now();
  const queue = eligibleRows.value
    .filter(({ id }) => selected.has(id))
    .map((row) => makeDelivery(row, at));
  if (queue.length === 0) return;
  deliveries.value.unshift(...queue);
  closeDialog();
  navigate('delivery');
  notify(`已模拟发送 ${queue.length} 条钉钉工作通知。`);
}
function showNotice(delivery: Delivery) {
  notice.value = delivery;
  showDialog('notice');
}
function previewEmployee(row: PayrollRow) {
  if (!openSlip(makeDelivery(row), true))
    notify('浏览器拦截了新标签页，请允许弹出窗口。');
}
function viewNotice(delivery: Delivery) {
  if (!openSlip(delivery)) notify('浏览器拦截了新标签页，请允许弹出窗口。');
}

const modalTitle = computed(
  () =>
    ({
      import: '导入工资表',
      send: '发送工资条',
      employee: '员工工资明细',
      notice: '钉钉工作通知预览',
    })[mode.value ?? 'import'],
);
const displayedFields = computed(() =>
  showAllFields.value
    ? fields.filter(([key]) => key !== 'seq')
    : fields.filter(([key]) =>
        [
          'attendanceDeduction',
          'base',
          'bonus',
          'commission',
          'employerFund',
          'employerSocial',
          'grade',
          'gross',
          'net',
          'otherDeduction',
          'performance',
          'personalFund',
          'personalSocial',
          'priorPaid',
          'tax',
        ].includes(key),
      ),
);
function fieldValue(row: PayrollRow, key: (typeof fields)[number][0]) {
  if (textFields.has(key)) return row[key] || '—';
  if (key === 'performanceFactor')
    return `${(Number(row[key]) * 100).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}%`;
  return statisticFields.has(key) ? row[key] : currency(Number(row[key]));
}
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">F</span>
        <div><strong>飞德慕</strong><span>管理系统</span></div>
      </div>
      <div class="nav-section">
        <p>财务部门</p>
        <nav aria-label="薪酬管理">
          <button
            v-for="entry in navigation"
            :key="entry.id"
            type="button"
            :class="{ 'nav-current': page === entry.id }"
            :aria-current="page === entry.id ? 'page' : undefined"
            :aria-label="entry.title"
            @click="navigate(entry.id)"
          >
            <component :is="entry.icon" :size="17" aria-hidden="true" />
            <span>{{ entry.title }}</span>
          </button>
        </nav>
      </div>
      <div class="sidebar-footer">
        <span class="demo-dot"></span> 本地演示环境
      </div>
    </aside>

    <div class="workspace">
      <header class="topbar">
        <div class="breadcrumb">
          <span>财务部门</span><ChevronRight :size="13" /><strong>薪酬管理</strong>
        </div>
        <div class="account">
          <span class="account-avatar">财</span><span>财务经办</span>
        </div>
      </header>
      <main class="content">
        <div class="page-intro">
          <div>
            <h1>{{ page === 'overview' ? '薪酬管理' : current.title }}</h1>
            <p>{{ current.description }}</p>
          </div>
          <div v-if="page !== 'settings'" class="actions">
            <button class="button" type="button" @click="startImport">
              <Upload :size="16" /> 导入工资表
            </button>
            <button
              class="button primary"
              type="button"
              :disabled="!eligibleRows.length"
              @click="startSend"
            >
              <Bell :size="16" /> 发送工资条
            </button>
          </div>
        </div>

        <div v-if="page !== 'settings'" class="filters">
          <label class="filter"><span>工资月份</span><input
              :value="month"
              type="month"
              min="2000-01"
              max="2099-12"
              aria-label="工资月份"
              @change="changeMonth"
          /></label>
          <label class="filter"><span>所属公司</span><select v-model="company" aria-label="所属公司">
              <option value="">全部公司</option>
              <option v-for="name in companies" :key="name">
                {{ name }}
              </option></select><ChevronDown :size="13" />
          </label>
          <label class="filter"><span>部门</span><select v-model="department" aria-label="部门">
              <option value="">全部部门</option>
              <option v-for="item in departments" :key="item">
                {{ item }}
              </option></select><ChevronDown :size="13" />
          </label>
          <span v-if="activeBatch" class="source" :title="activeBatch.source">
            <span class="source-dot"></span>{{
              activeBatch.importedAt
                ? `更新于 ${dateTime(activeBatch.importedAt)}`
                : '数据来源 · 演示数据'
            }}
          </span>
        </div>

        <template v-if="page === 'overview'">
          <div class="metric-grid">
            <article
              v-for="metric in metrics"
              :key="metric.title"
              class="metric"
              :class="metric.symbol"
            >
              <div class="metric-top">
                <h2>{{ metric.title }}</h2>
                <span class="metric-symbol" aria-hidden="true">{{
                  { gross: '¥', net: '¥', people: '人', average: '均' }[
                    metric.symbol
                  ]
                }}</span>
              </div>
              <div class="metric-value">
                {{ metric.value
                }}<span v-if="metric.suffix">{{ metric.suffix }}</span>
              </div>
              <div class="metric-foot">
                <template v-if="metric.delta !== undefined">
                  <span class="delta" :class="{ down: metric.delta < 0 }"><ArrowUp v-if="metric.delta > 0" :size="12" /><ArrowDown
                      v-else-if="metric.delta < 0"
                      :size="12"
                    />{{ Math.abs(metric.delta).toFixed(metric.suffix ? 0 : 1)
                    }}{{ metric.suffix || '%' }}</span>
                  <span>{{ metric.foot }}</span>
                </template>
                <span v-else>暂无可比上月数据</span>
              </div>
            </article>
          </div>

          <div class="dashboard-grid">
            <section class="panel trend">
              <div class="panel-head">
                <div>
                  <h2>薪酬趋势</h2>
                  <p>近 6 个月 · 单位万元</p>
                </div>
                <div class="legend">
                  <span><i></i>应发</span><span><i></i>实发</span>
                </div>
              </div>
              <div
                v-if="trend.some((item) => item.loaded)"
                class="plot"
                aria-label="最近六个月的应发和实发"
              >
                <div class="plot-area">
                  <div
                    v-for="line in chartRange.lines"
                    :key="line"
                    class="plot-line"
                    :style="{ bottom: `${chartPercent(line)}%` }"
                  >
                    <span>{{ line / 1_000_000 }}</span>
                  </div>
                  <div class="plot-columns">
                    <div
                      v-for="item in trend"
                      :key="item.period"
                      class="plot-group"
                      :class="{ 'plot-current': item.period === month }"
                    >
                      <div
                        v-if="item.loaded"
                        class="plot-pair"
                        tabindex="0"
                        :aria-label="item.description"
                      >
                        <div
                          class="plot-bar chart-gross"
                          :style="barStyle(item.gross)"
                        ></div>
                        <div
                          class="plot-bar chart-net"
                          :style="barStyle(item.net)"
                        ></div>
                        <div class="plot-tooltip">
                          <b>{{ monthLabel(item.period) }}</b><span>应发 {{ currency(item.gross) }}</span><span>实发 {{ currency(item.net) }}</span>
                        </div>
                      </div>
                      <span class="plot-label">{{ item.label }}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div v-else class="empty">所选范围内暂无薪酬数据</div>
            </section>

            <section class="panel rank">
              <div class="panel-head">
                <div>
                  <h2>实发薪酬排行</h2>
                  <p>点击查看员工明细</p>
                </div>
                <div class="segment" aria-label="排行维度">
                  <button
                    type="button"
                    :aria-pressed="rankBy === 'department'"
                    @click="rankBy = 'department'"
                  >
                    部门
                  </button>
                  <button
                    type="button"
                    :aria-pressed="rankBy === 'company'"
                    @click="rankBy = 'company'"
                  >
                    公司
                  </button>
                </div>
              </div>
              <div v-if="ranking.length" class="rank-list">
                <button
                  v-for="item in ranking"
                  :key="item.label"
                  type="button"
                  class="rank-row"
                  @click="drillDown(item.label)"
                >
                  <span class="rank-name">{{ item.label }} <small>{{ item.people }}人</small></span>
                  <span class="rank-value">{{ currency(item.net) }}</span>
                  <span class="rank-track"><i
                      :style="{
                        width: `${(Math.abs(item.net) / rankingMaximum) * 100}%`,
                      }"
                    ></i></span>
                </button>
              </div>
              <div v-else class="empty">本月暂无实发排行</div>
            </section>

            <section class="panel composition">
              <div class="panel-head">
                <div>
                  <h2>应发薪酬构成</h2>
                  <p>含单位缴费及考勤扣款</p>
                </div>
              </div>
              <div v-if="visibleRows.length" class="composition-body">
                <div class="composition-bar" aria-hidden="true">
                  <span
                    v-for="item in composition.filter(({ cents }) => cents)"
                    :key="item.title"
                    :style="{
                      width: `${(Math.abs(item.cents) / compositionTotal) * 100}%`,
                      background: item.color,
                    }"
                  ></span>
                </div>
                <div class="composition-list">
                  <div v-for="item in composition" :key="item.title">
                    <i :style="{ background: item.color }"></i><span>{{ item.title }}</span><strong>{{ currency(item.cents) }}</strong>
                  </div>
                </div>
              </div>
              <div v-else class="empty">本月暂无薪酬构成</div>
            </section>

            <section class="panel send-track">
              <div class="panel-head">
                <div>
                  <h2>工资条进度</h2>
                  <p>当前筛选范围</p>
                </div>
                <button
                  type="button"
                  class="text-button"
                  @click="navigate('delivery')"
                >
                  发放记录 <ChevronRight :size="14" />
                </button>
              </div>
              <div class="send-states">
                <div v-for="item in stateCounts" :key="item.label">
                  <span class="status" :data-status="item.label">{{
                    item.label
                  }}</span><strong>{{ item.count }}<small> 人</small></strong>
                </div>
              </div>
            </section>
          </div>
        </template>

        <section v-else-if="page === 'detail'" class="panel wide-table">
          <div class="panel-head">
            <div>
              <h2>{{ monthLabel(month) }}工资明细</h2>
              <p>{{ filteredRows.length }} 名员工</p>
            </div>
            <label class="search"><Search :size="16" /><input
                v-model="query"
                aria-label="员工姓名"
                placeholder="搜索员工姓名"
                type="search"
            /></label>
          </div>
          <div class="table-scroll">
            <table v-if="filteredRows.length">
              <thead>
                <tr>
                  <th>员工</th>
                  <th>所属公司</th>
                  <th>部门</th>
                  <th class="numeric">应发合计</th>
                  <th class="numeric">实发数</th>
                  <th>工资条状态</th>
                  <th><span class="sr-only">操作</span></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in pagedRows" :key="row.id">
                  <td>
                    <button
                      class="employee-link"
                      type="button"
                      @click="showEmployee(row)"
                    >
                      <span class="employee-avatar" aria-hidden="true">{{
                        row.name.slice(-2)
                      }}</span>{{ row.name }}
                    </button>
                  </td>
                  <td>{{ row.company }}</td>
                  <td>{{ row.department }}</td>
                  <td class="numeric">{{ currency(row.gross) }}</td>
                  <td class="numeric strong">{{ currency(row.net) }}</td>
                  <td>
                    <span class="status" :data-status="rowStatus(row)">{{
                      rowStatus(row)
                    }}</span>
                  </td>
                  <td>
                    <button
                      class="text-button"
                      type="button"
                      @click="showEmployee(row)"
                    >
                      查看明细 <ChevronRight :size="14" />
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
            <div v-else class="empty">
              {{ query ? '没有找到匹配的员工' : '所选范围内暂无工资明细' }}
            </div>
          </div>
          <div v-if="filteredRows.length" class="pagination">
            <span>第 {{ tablePage }} / {{ pageCount }} 页</span>
            <button
              type="button"
              class="icon-button"
              aria-label="上一页"
              :disabled="tablePage === 1"
              @click="tablePage--"
            >
              <ChevronLeft :size="17" />
            </button>
            <button
              type="button"
              class="icon-button"
              aria-label="下一页"
              :disabled="tablePage === pageCount"
              @click="tablePage++"
            >
              <ChevronRight :size="17" />
            </button>
          </div>
        </section>

        <template v-else-if="page === 'delivery'">
          <div class="delivery-summary panel">
            <div v-for="item in stateCounts" :key="item.label">
              <span class="status" :data-status="item.label">{{
                item.label
              }}</span><strong>{{ item.count }}<small> 人</small></strong>
            </div>
          </div>
          <section class="panel wide-table">
            <div class="panel-head">
              <div>
                <h2>发放记录</h2>
                <p>渠道 · 钉钉企业应用工作通知</p>
              </div>
              <span class="demo-label"><span class="demo-dot"></span> 模拟发送</span>
            </div>
            <div v-if="periodDeliveries.length" class="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>收件人</th>
                    <th>所属公司 / 部门</th>
                    <th>发送时间</th>
                    <th>查看时长</th>
                    <th>查看状态</th>
                    <th><span class="sr-only">操作</span></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in periodDeliveries" :key="item.id">
                    <td class="strong">{{ item.slip.name }}</td>
                    <td>
                      {{ item.slip.company }} / {{ item.slip.department }}
                    </td>
                    <td>{{ dateTime(item.sentAt) }}</td>
                    <td>{{ item.minutes }} 分钟</td>
                    <td>
                      <span
                        class="status"
                        :data-status="deliveryStatus(item)"
                        >{{ deliveryStatus(item) }}</span>
                    </td>
                    <td>
                      <button
                        type="button"
                        class="text-button"
                        @click="showNotice(item)"
                      >
                        预览通知 <ChevronRight :size="14" />
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else class="empty delivery-empty">
              <History :size="24" /><strong>暂无发放记录</strong><span>发送后可在这里查看通知及员工查阅状态。</span>
            </div>
          </section>
        </template>

        <section v-else class="panel settings-panel">
          <div class="panel-head">
            <div>
              <h2>工资条查看规则</h2>
              <p>面向钉钉工作通知中的员工详情页</p>
            </div>
            <span class="settings-icon"><LockKeyhole :size="20" /></span>
          </div>
          <form class="settings-body" @submit.prevent="saveSettings">
            <div class="setting-row">
              <div>
                <label for="view-minutes">查看时长</label>
                <p>
                  员工首次通过身份校验并打开工资条时开始计时。到期后隐藏金额和明细。
                </p>
              </div>
              <label class="number-field"><input
                  id="view-minutes"
                  v-model="draftMinutes"
                  type="number"
                  min="1"
                  max="1440"
                  step="1"
                  required
                /><span>分钟</span></label>
            </div>
            <div class="setting-row">
              <div>
                <strong>打开方式</strong>
                <p>钉钉内免登，进入单张工资条的轻量页面。</p>
              </div>
              <span class="settings-method"><LockKeyhole :size="15" /> 钉钉免登</span>
            </div>
            <div class="setting-note">
              <CircleAlert :size="16" />
              设置适用于下一次发送，已发送工资条沿用其发送时的时长。
            </div>
            <button class="button primary" type="submit">
              <Check :size="16" /> 保存设置
            </button>
          </form>
        </section>
      </main>
    </div>

    <dialog
      ref="dialog"
      class="dialog"
      aria-labelledby="modal-title"
      :class="{ 'dialog-notice': mode === 'notice' }"
    >
      <div class="dialog-header">
        <h2 id="modal-title">{{ modalTitle }}</h2>
        <button
          class="icon-button"
          type="button"
          aria-label="关闭"
          @click="closeDialog"
        >
          <X :size="20" />
        </button>
      </div>

      <template v-if="mode === 'import'">
        <div class="dialog-body">
          <div class="import-top">
            <label class="filter"><span>导入月份</span><input
                v-model="importMonth"
                type="month"
                min="2000-01"
                max="2099-12"
                aria-label="导入月份"
            /></label>
            <button type="button" class="text-button" @click="getTemplate">
              <Download :size="16" /> 下载空白模板
            </button>
          </div>
          <label
            class="drop-zone"
            :class="{ dragging: dragOver }"
            @dragover.prevent="dragOver = true"
            @dragleave="dragOver = false"
            @drop.prevent="handleDrop"
          >
            <input
              type="file"
              accept=".xlsx"
              aria-label="选择工资表"
              @change="handleFileInput"
            />
            <span class="upload-icon"><CloudUpload :size="23" /></span>
            <strong>{{ uploadName || '点击选择或拖入工资表' }}</strong>
            <small>Excel .xlsx，最大 5 MB</small>
          </label>
          <p class="helper">
            请保留模板第 3 行表头，并在 Excel
            中计算、保存后导入。文件仅在当前演示页面读取。
          </p>
          <p v-if="importBusy" role="status" class="helper">
            正在读取与校验工资表…
          </p>
          <div
            v-if="importError || importResult?.errors.length"
            class="callout error"
            role="alert"
          >
            <CircleAlert :size="16" />
            <div>
              <strong>{{ importError || '工资表校验未通过' }}</strong>
              <ul v-if="importResult?.errors.length">
                <li
                  v-for="(error, index) in importResult.errors.slice(0, 8)"
                  :key="index"
                >
                  {{ error }}
                </li>
              </ul>
              <small v-if="(importResult?.errors.length || 0) > 8">另有
                {{ (importResult?.errors.length || 0) - 8 }} 项问题。</small>
            </div>
          </div>
          <template v-if="importResult?.rows.length">
            <div class="import-summary">
              <Check :size="16" /><b>{{ importResult.rows.length }} 条通过校验</b><span>{{ importResult.sheet }}</span>
            </div>
            <div class="table-scroll import-preview">
              <table>
                <thead>
                  <tr>
                    <th>姓名</th>
                    <th>部门</th>
                    <th class="numeric">应发合计</th>
                    <th class="numeric">实发数</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="row in importResult.rows.slice(0, 5)"
                    :key="row.id"
                  >
                    <td>{{ row.name }}</td>
                    <td>{{ row.department }}</td>
                    <td class="numeric">{{ currency(row.gross) }}</td>
                    <td class="numeric">{{ currency(row.net) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-if="batches[importMonth]" class="helper">
              确认后替换该月份的工资数据，其他月份继续保留。
            </p>
          </template>
        </div>
        <div class="dialog-footer">
          <button type="button" class="button" @click="closeDialog">
            取消
          </button>
          <button
            type="button"
            class="button primary"
            :disabled="
              importBusy ||
              !importResult?.rows.length ||
              !!importResult.errors.length
            "
            @click="confirmImport"
          >
            <Plus :size="16" /> 确认导入
          </button>
        </div>
      </template>

      <template v-else-if="mode === 'send'">
        <div class="dialog-body">
          <div class="send-info">
            <strong>{{ monthLabel(month) }}工资条</strong><small>钉钉工作通知 · 首次打开后可查看 {{ savedMinutes }} 分钟</small>
          </div>
          <div class="callout">
            <CircleAlert :size="16" /><span>这是模拟发送。通知卡片只显示月份和查询入口。</span>
          </div>
          <div class="recipient-head">
            <label><input
                type="checkbox"
                :checked="recipients.length === selectedIds.length"
                @change="
                  selectedIds = ($event.target as HTMLInputElement).checked
                    ? recipients.map(({ id }) => id)
                    : []
                "
              />
              全部选中</label><span>已选 {{ selectedIds.length }} / {{ recipients.length }} 人</span>
          </div>
          <div class="recipients">
            <label v-for="row in recipients" :key="row.id">
              <input
                v-model="selectedIds"
                type="checkbox"
                :value="row.id"
              /><span>{{ row.name }}</span><small>{{ row.company }} · {{ row.department }}</small>
            </label>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="button" type="button" @click="closeDialog">
            取消
          </button>
          <button
            class="button primary"
            type="button"
            :disabled="!selectedIds.length"
            @click="confirmSend"
          >
            <Bell :size="16" /> 模拟发送 {{ selectedIds.length }} 条
          </button>
        </div>
      </template>

      <template v-else-if="mode === 'employee' && employee">
        <div class="dialog-body">
          <div class="employee-head">
            <div class="employee-avatar large">
              {{ employee.name.slice(-2) }}
            </div>
            <div>
              <strong>{{ employee.name }}</strong><small>{{ employee.company }} · {{ employee.department }} ·
                {{ monthLabel(month) }}</small>
            </div>
          </div>
          <div class="detail-totals">
            <div>
              <span>应发合计</span><strong>{{ currency(employee.gross) }}</strong>
            </div>
            <div>
              <span>应发至实发扣减</span><strong>{{
                currency(groupSum([employee], deductionFields))
              }}</strong>
            </div>
            <div>
              <span>实发数</span><strong>{{ currency(employee.net) }}</strong>
            </div>
          </div>
          <div class="field-heading">
            <div class="segment" aria-label="员工明细视图">
              <button
                type="button"
                :aria-pressed="employeePane === 'items'"
                @click="employeePane = 'items'"
              >
                工资项目
              </button>
              <button
                type="button"
                :aria-pressed="employeePane === 'history'"
                @click="employeePane = 'history'"
              >
                近 6 个月对比
              </button>
            </div>
            <button
              v-if="employeePane === 'items'"
              type="button"
              class="text-button"
              @click="showAllFields = !showAllFields"
            >
              {{ showAllFields ? '收起' : '显示全部字段' }}
              <ChevronDown :size="13" />
            </button>
          </div>
          <dl v-if="employeePane === 'items'" class="employee-fields">
            <div v-for="[key, label] in displayedFields" :key="key">
              <dt>{{ label }}</dt>
              <dd>{{ fieldValue(employee, key) }}</dd>
            </div>
          </dl>
          <div v-else class="table-scroll import-preview employee-history">
            <table>
              <thead>
                <tr>
                  <th>工资月份</th>
                  <th class="numeric">应发合计</th>
                  <th class="numeric">实发数</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="{ period, row } in employeeHistory" :key="period">
                  <td>{{ monthLabel(period) }}</td>
                  <td class="numeric">{{ row ? currency(row.gross) : '—' }}</td>
                  <td class="numeric">{{ row ? currency(row.net) : '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="button" type="button" @click="closeDialog">
            关闭
          </button>
          <button
            class="button primary"
            type="button"
            @click="previewEmployee(employee)"
          >
            <ExternalLink :size="16" /> 预览员工工资条
          </button>
        </div>
      </template>

      <template v-else-if="mode === 'notice' && notice">
        <div class="dialog-body notice-body">
          <div class="notice-sender">
            <span class="brand-mark" aria-hidden="true">F</span><span>飞德慕管理系统</span><small>{{ dateTime(notice.sentAt) }}</small>
          </div>
          <div class="notification-card">
            <div class="notice-cover" aria-hidden="true">
              <div><strong>工资条</strong><span>飞德慕 · 财务部</span></div>
              <div class="paper-motif"><i></i><i></i><i></i></div>
            </div>
            <div class="notice-content">
              <h3>{{ monthLabel(notice.slip.month) }}工资条</h3>
              <p>本月工资条已生成，请点击下方按钮查阅。</p>
              <button type="button" @click="viewNotice(notice)">
                查看明细 <ChevronRight :size="15" />
              </button>
            </div>
          </div>
        </div>
      </template>
    </dialog>

    <div v-if="toast" class="toast" role="status">
      <InspectionPanel :size="17" />{{ toast }}
    </div>
  </div>
</template>
