<script setup lang="ts">
import type {
  PayrollBatch,
  PayrollCandidate,
  PayrollDelivery,
  PayrollImportPreview,
  PayrollMonthlyTotals,
  PayrollRecipient,
  PayrollRow,
} from '#/api/fdmplatform/payroll';

import {
  computed,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  ref,
  watch,
} from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
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
  History,
  LayoutGrid,
  List,
  LockKeyhole,
  RefreshCw,
  Search,
  Settings,
  Upload,
  X,
} from '@vben/icons';

import { message } from 'ant-design-vue';

import {
  commitPayrollImport,
  getPayrollCandidates,
  getPayrollDeliveries,
  getPayrollHistory,
  getPayrollMonth,
  getPayrollSettings,
  getPayrollTrend,
  previewPayrollImport,
  sendPayrollSlips,
  updatePayrollSettings,
} from '#/api/fdmplatform/payroll';

import { errorText } from '../data';
import {
  currency,
  currentMonth,
  dateTime,
  deductionFields,
  downloadBlankTemplate,
  fields,
  fieldValue,
  incomeGroups,
  latestDeliveries,
  monthLabel,
  monthOffset,
  statusLabels,
  total,
  validMonth,
} from './model';
import PayrollTrend from './PayrollTrend.vue';

defineOptions({ name: 'FdmPlatformPayroll' });

const tabs = [
  {
    id: 'overview',
    label: '薪酬总览',
    icon: LayoutGrid,
    description: '按月核对工资成本、人员分布与发放进度。',
  },
  {
    id: 'detail',
    label: '工资明细',
    icon: List,
    description: '按公司、部门和员工查阅工资核算数据。',
  },
  {
    id: 'delivery',
    label: '工资条发放',
    icon: Bell,
    description: '核对接收范围，发送钉钉工作通知并查看发放记录。',
  },
  {
    id: 'settings',
    label: '薪酬设置',
    icon: Settings,
    description: '管理员工工资条的查看规则。',
  },
] as const;

type Tab = (typeof tabs)[number]['id'];
type DialogMode = 'employee' | 'import' | 'notice' | 'send';

const { hasAccessByCodes } = useAccess();
const canQuery = computed(() =>
  hasAccessByCodes(['fdmplatform:payroll:query']),
);
const canImport = computed(() =>
  hasAccessByCodes(['fdmplatform:payroll:import']),
);
const canSend = computed(() => hasAccessByCodes(['fdmplatform:payroll:send']));
const canConfigure = computed(() =>
  hasAccessByCodes(['fdmplatform:payroll:settings']),
);

const tab = ref<Tab>('overview');
const month = ref(monthOffset(currentMonth(), -1));
const company = ref('');
const department = ref('');
const query = ref('');
const rankBy = ref<'company' | 'department'>('department');
const detailPage = ref(1);
const batch = ref<PayrollBatch>();
const trend = ref<PayrollMonthlyTotals[]>([]);
const deliveries = ref<PayrollDelivery[]>([]);
const batchError = ref('');
const batchLoading = ref(false);
const trendError = ref('');
const trendLoading = ref(false);
const deliveryError = ref('');
const deliveryLoading = ref(false);
const deliveryReady = ref(false);
const active = ref(false);
let monthRequest = 0;
let trendRequest = 0;
let deliveryRequest = 0;

const currentTab = computed(() => tabs.find(({ id }) => id === tab.value)!);
const companies = computed(() =>
  [...new Set(batch.value?.rows.map((row) => row.company))].toSorted(),
);
const departments = computed(() =>
  [
    ...new Set(
      batch.value?.rows
        .filter((row) => !company.value || row.company === company.value)
        .map((row) => row.department),
    ),
  ].toSorted(),
);

function inScope(row: { company: string; department: string }) {
  return (
    (!company.value || row.company === company.value) &&
    (!department.value || row.department === department.value)
  );
}

const visibleRows = computed(() => batch.value?.rows.filter(inScope) ?? []);
const filteredRows = computed(() =>
  visibleRows.value.filter((row) => row.name.includes(query.value.trim())),
);
const detailPageSize = 12;
const detailPages = computed(() =>
  Math.max(1, Math.ceil(filteredRows.value.length / detailPageSize)),
);
const detailRows = computed(() =>
  filteredRows.value.slice(
    (detailPage.value - 1) * detailPageSize,
    detailPage.value * detailPageSize,
  ),
);
const deliveryPage = ref(1);
const deliveryPageSize = 15;
const scopedDeliveries = computed(() => deliveries.value.filter(inScope));
const deliveryPages = computed(() =>
  Math.max(1, Math.ceil(scopedDeliveries.value.length / deliveryPageSize)),
);
const deliveryRows = computed(() =>
  scopedDeliveries.value.slice(
    (deliveryPage.value - 1) * deliveryPageSize,
    deliveryPage.value * deliveryPageSize,
  ),
);
const latestByRow = computed(() => latestDeliveries(deliveries.value));
const rowStatus = (row: PayrollRow) =>
  latestByRow.value.get(row.id)?.status ?? 'PENDING';
const eligibleRows = computed(() => {
  if (!deliveryReady.value || deliveryError.value) return [];
  const list = tab.value === 'detail' ? filteredRows.value : visibleRows.value;
  return list.filter((row) =>
    ['EXPIRED', 'FAILED', 'PENDING'].includes(rowStatus(row)),
  );
});
const stateCounts = computed(() => {
  const statuses = visibleRows.value.map(rowStatus);
  return [
    {
      code: 'PENDING',
      label: '待发送',
      count: statuses.filter((status) => status === 'PENDING').length,
    },
    {
      code: 'ACCEPTED',
      label: '已提交 / 已送达',
      count: statuses.filter((status) =>
        ['ACCEPTED', 'DELIVERED', 'QUEUED', 'SENDING'].includes(status),
      ).length,
    },
    {
      code: 'VIEWED',
      label: '已查看',
      count: statuses.filter((status) => status === 'VIEWED').length,
    },
    {
      code: 'EXPIRED',
      label: '已到期',
      count: statuses.filter((status) => status === 'EXPIRED').length,
    },
    {
      code: 'FAILED',
      label: '失败 / 待核实',
      count: statuses.filter((status) =>
        ['FAILED', 'UNCERTAIN'].includes(status),
      ).length,
    },
  ];
});
watch([company, department, query], () => {
  detailPage.value = 1;
  deliveryPage.value = 1;
});
watch(detailPages, (pages) => {
  detailPage.value = Math.min(detailPage.value, pages);
});
watch(deliveryPages, (pages) => {
  deliveryPage.value = Math.min(deliveryPage.value, pages);
});

function percentChange(next: number, previous: number) {
  return previous === 0
    ? undefined
    : ((next - previous) / Math.abs(previous)) * 100;
}

const metrics = computed(() => {
  const rows = visibleRows.value;
  const last = trend.value.find(
    (item) => item.month === monthOffset(month.value, -1),
  );
  const prior = rows.length > 0 && last && last.people > 0 ? last : undefined;
  const net = total(rows, ['net']);
  const gross = total(rows, ['gross']);
  const avg = rows.length > 0 ? Math.round(net / rows.length) : 0;
  return [
    {
      title: '应发合计',
      value: rows.length > 0 ? currency(gross) : '—',
      delta: prior && percentChange(gross, Number(prior.gross)),
      symbol: 'gross',
      unit: '%',
    },
    {
      title: '实发合计',
      value: rows.length > 0 ? currency(net) : '—',
      delta: prior && percentChange(net, Number(prior.net)),
      symbol: 'net',
      unit: '%',
    },
    {
      title: '核算人数',
      value: String(rows.length),
      delta: prior && rows.length - Number(prior.people),
      symbol: 'people',
      unit: '人',
    },
    {
      title: '人均实发',
      value: rows.length > 0 ? currency(avg) : '—',
      delta: prior && percentChange(avg, Number(prior.net) / prior.people),
      symbol: 'average',
      unit: '%',
    },
  ];
});

const ranking = computed(() => {
  const grouped = new Map<
    string,
    { label: string; net: number; people: number }
  >();
  for (const row of batch.value?.rows ?? []) {
    if (company.value && row.company !== company.value) continue;
    if (
      rankBy.value === 'company' &&
      department.value &&
      row.department !== department.value
    )
      continue;
    const label = row[rankBy.value];
    const item = grouped.get(label) ?? { label, people: 0, net: 0 };
    item.people++;
    item.net += Number(row.net);
    grouped.set(label, item);
  }
  return [...grouped.values()].toSorted(
    (a, b) => b.net - a.net || a.label.localeCompare(b.label, 'zh-CN'),
  );
});
const rankingMaximum = computed(() =>
  Math.max(1, ...ranking.value.map(({ net }) => Math.abs(net))),
);
const composition = computed(() =>
  incomeGroups.map(({ title, color, keys }) => ({
    title,
    color,
    cents: total(visibleRows.value, keys),
  })),
);
const compositionTotal = computed(() =>
  composition.value.reduce((sum, item) => sum + Math.abs(item.cents), 0),
);

async function loadMonth() {
  const request = ++monthRequest;
  batchLoading.value = true;
  batchError.value = '';
  try {
    const result = await getPayrollMonth(month.value);
    if (request === monthRequest) batch.value = result;
  } catch (error) {
    if (request === monthRequest) batchError.value = errorText(error);
  } finally {
    if (request === monthRequest) batchLoading.value = false;
  }
}

async function loadTrend() {
  const request = ++trendRequest;
  trendLoading.value = true;
  trendError.value = '';
  trend.value = [];
  try {
    const result = await getPayrollTrend(
      month.value,
      company.value,
      department.value,
    );
    if (request === trendRequest) trend.value = result;
  } catch (error) {
    if (request === trendRequest) trendError.value = errorText(error);
  } finally {
    if (request === trendRequest) trendLoading.value = false;
  }
}

async function loadDeliveries() {
  if (deliveryLoading.value) return;
  const request = ++deliveryRequest;
  deliveryLoading.value = true;
  try {
    const result = await getPayrollDeliveries(month.value);
    if (request !== deliveryRequest) return;
    deliveries.value = result;
    deliveryError.value = '';
    deliveryReady.value = true;
  } catch (error) {
    if (request === deliveryRequest) deliveryError.value = errorText(error);
  } finally {
    if (request === deliveryRequest) deliveryLoading.value = false;
  }
}

function resetPeriod() {
  monthRequest++;
  trendRequest++;
  deliveryRequest++;
  deliveries.value = [];
  deliveryReady.value = false;
  deliveryError.value = '';
  deliveryLoading.value = false;
  batch.value = undefined;
  trend.value = [];
  detailPage.value = 1;
  deliveryPage.value = 1;
}

watch(
  [month, active, canQuery],
  ([, isActive, allowed]) => {
    resetPeriod();
    if (isActive && allowed) {
      void loadMonth();
      void loadDeliveries();
    }
  },
  { flush: 'sync' },
);

watch(
  [month, active, canQuery, company, department, tab],
  () => {
    if (active.value && tab.value === 'overview' && canQuery.value)
      void loadTrend();
  },
  { flush: 'post' },
);

function navigate(next: Tab) {
  if (next === 'settings' && !canConfigure.value) return;
  tab.value = next;
  if (next === 'settings') void loadSettings();
  if (next === 'delivery') void loadDeliveries();
}

function changeMonth(event: Event) {
  const input = event.target as HTMLInputElement;
  if (!validMonth(input.value)) {
    input.value = month.value;
    return;
  }
  company.value = '';
  department.value = '';
  query.value = '';
  month.value = input.value;
}

function changeCompany(event: Event) {
  company.value = (event.target as HTMLSelectElement).value;
  department.value = '';
}

function drillDown(label: string) {
  if (rankBy.value === 'company') company.value = label;
  else department.value = label;
  query.value = '';
  navigate('detail');
}

let poll: ReturnType<typeof setInterval> | undefined;
function activate() {
  active.value = true;
  if (tab.value === 'settings' && canConfigure.value) void loadSettings();
}
function deactivate() {
  active.value = false;
  dialog.value?.close();
  releaseDialog();
}
onMounted(() => {
  activate();
  poll = setInterval(() => {
    if (
      active.value &&
      canQuery.value &&
      tab.value === 'delivery' &&
      !document.hidden
    )
      void loadDeliveries();
  }, 5000);
});
onActivated(activate);
onDeactivated(deactivate);
onBeforeUnmount(() => {
  clearInterval(poll);
  deactivate();
});

const minutes = ref<number>();
const draftMinutes = ref<number>();
const settingsLoading = ref(false);
const settingsSaving = ref(false);
const settingsError = ref('');
async function loadSettings() {
  if (settingsLoading.value) return;
  settingsLoading.value = true;
  settingsError.value = '';
  try {
    const settings = await getPayrollSettings();
    minutes.value = draftMinutes.value = Number(settings.minutes);
  } catch (error) {
    settingsError.value = errorText(error);
  } finally {
    settingsLoading.value = false;
  }
}

async function saveSettings() {
  const next = Number(draftMinutes.value);
  if (
    !canConfigure.value ||
    settingsSaving.value ||
    !Number.isInteger(next) ||
    next < 1 ||
    next > 1440
  )
    return;
  settingsSaving.value = true;
  settingsError.value = '';
  try {
    const settings = await updatePayrollSettings(next);
    minutes.value = draftMinutes.value = Number(settings.minutes);
    message.success('查看时长已保存');
  } catch (error) {
    settingsError.value = errorText(error);
  } finally {
    settingsSaving.value = false;
  }
}

const dialog = ref<HTMLDialogElement>();
const mode = ref<DialogMode>();
const employee = ref<PayrollRow>();
const employeeMonth = ref('');
const notice = ref<PayrollDelivery>();
const showAllFields = ref(false);
const employeePane = ref<'history' | 'items'>('items');
const employeeHistory = ref<PayrollMonthlyTotals[]>();
const historyLoading = ref(false);
const historyError = ref('');
let historyRequest = 0;

const dialogTitle = computed(
  () =>
    ({
      import: '导入工资表',
      send: '发送工资条',
      employee: '员工工资明细',
      notice: '钉钉工作通知预览',
    })[mode.value ?? 'import'],
);

function showDialog(next: DialogMode) {
  mode.value = next;
  if (!dialog.value?.open) dialog.value?.showModal();
}
function cancelDialog(event?: Event) {
  if (importSaving.value || sending.value) {
    event?.preventDefault();
    return;
  }
  dialog.value?.close();
}
function releaseDialog() {
  importRequest++;
  candidateRequest++;
  historyRequest++;
  worksheetFile.value = undefined;
  importResult.value = undefined;
  importError.value = '';
  dragOver.value = false;
  employee.value = undefined;
  employeeHistory.value = undefined;
  notice.value = undefined;
  candidateRows.value = [];
  selectedCandidates.value = {};
  candidates.value = {};
  mode.value = undefined;
}

function showEmployee(row: PayrollRow) {
  employee.value = row;
  employeeMonth.value = month.value;
  employeePane.value = 'items';
  showAllFields.value = false;
  employeeHistory.value = undefined;
  historyLoading.value = false;
  historyError.value = '';
  showDialog('employee');
}
async function showHistory() {
  const row = employee.value;
  employeePane.value = 'history';
  if (!row || employeeHistory.value || historyLoading.value) return;
  const request = ++historyRequest;
  historyLoading.value = true;
  historyError.value = '';
  try {
    const result = await getPayrollHistory(row.id);
    if (request === historyRequest)
      employeeHistory.value = result.toSorted((a, b) =>
        b.month.localeCompare(a.month),
      );
  } catch (error) {
    if (request === historyRequest) historyError.value = errorText(error);
  } finally {
    if (request === historyRequest) historyLoading.value = false;
  }
}
const primaryFields = new Set([
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
]);
const displayedFields = computed(() =>
  fields.filter(([key]) => showAllFields.value || primaryFields.has(key)),
);

const importMonth = ref(month.value);
const worksheetFile = ref<File>();
const importResult = ref<PayrollImportPreview>();
const importLoading = ref(false);
const importSaving = ref(false);
const importError = ref('');
const dragOver = ref(false);
let importRequest = 0;

function startImport() {
  if (!canImport.value) return;
  importMonth.value = month.value;
  importLoading.value = false;
  showDialog('import');
}

async function processFile(file?: File) {
  if (!file || importSaving.value) return;
  worksheetFile.value = file;
  const request = ++importRequest;
  importError.value = '';
  importResult.value = undefined;
  importLoading.value = false;
  if (!validMonth(importMonth.value)) {
    importError.value = '请先选择工资月份。';
    return;
  }
  if (
    !file.name.toLowerCase().endsWith('.xlsx') ||
    file.size > 5 * 1024 * 1024
  ) {
    importError.value = '请选择 5 MB 以内的 .xlsx 工资表。';
    return;
  }
  importLoading.value = true;
  try {
    const result = await previewPayrollImport(file, importMonth.value);
    if (request === importRequest) importResult.value = result;
  } catch (error) {
    if (request === importRequest) importError.value = errorText(error);
  } finally {
    if (request === importRequest) importLoading.value = false;
  }
}

function selectFile(event: Event) {
  const input = event.target as HTMLInputElement;
  void processFile(input.files?.[0]);
  input.value = '';
}
function dropFile(event: DragEvent) {
  dragOver.value = false;
  void processFile(event.dataTransfer?.files[0]);
}
watch(importMonth, () => void processFile(worksheetFile.value));

async function downloadTemplate() {
  if (!validMonth(importMonth.value)) {
    importError.value = '请先选择工资月份。';
    return;
  }
  try {
    await downloadBlankTemplate(importMonth.value);
  } catch {
    importError.value = '无法下载空白模板，请重试。';
  }
}

const canConfirmImport = computed(() =>
  Boolean(
    worksheetFile.value &&
    importResult.value?.rows.length &&
    importResult.value.errors.length === 0 &&
    !importLoading.value &&
    !importSaving.value,
  ),
);

async function confirmImport() {
  const file = worksheetFile.value;
  const preview = importResult.value;
  const period = importMonth.value;
  if (!canImport.value || !canConfirmImport.value || !file || !preview) return;
  importSaving.value = true;
  importError.value = '';
  try {
    const result = await commitPayrollImport(file, period, preview.version);
    if (!active.value) return;
    company.value = '';
    department.value = '';
    query.value = '';
    month.value = period;
    monthRequest++;
    batch.value = result;
    batchLoading.value = false;
    batchError.value = '';
    deliveryRequest++;
    deliveryLoading.value = false;
    deliveryReady.value = false;
    dialog.value?.close();
    navigate('overview');
    void loadTrend();
    void loadDeliveries();
    message.success(`已导入 ${result.rows.length} 条工资明细`);
  } catch (error) {
    importError.value = errorText(error);
    importResult.value = undefined;
  } finally {
    importSaving.value = false;
  }
}

const sendGroup = ref(1);
const sendGroupSize = 100;
const candidateRows = ref<PayrollRow[]>([]);
const candidates = ref<Record<string, PayrollCandidate[]>>({});
const selectedCandidates = ref<
  Partial<Record<string, PayrollCandidate['userId']>>
>({});
const candidateLoading = ref(false);
const candidateError = ref('');
const sending = ref(false);
const showNoticeInSend = ref(false);
let candidateRequest = 0;

const groups = computed(() =>
  Math.max(1, Math.ceil(candidateRows.value.length / sendGroupSize)),
);
const groupRows = computed(() =>
  candidateRows.value.slice(
    (sendGroup.value - 1) * sendGroupSize,
    sendGroup.value * sendGroupSize,
  ),
);
const recipientSelection = computed<PayrollRecipient[]>(() =>
  groupRows.value.flatMap((row) => {
    const userId = selectedCandidates.value[row.id];
    return userId === undefined ||
      !candidates.value[row.id]?.some((item) => item.userId === userId)
      ? []
      : [{ rowId: row.id, userId }];
  }),
);
const matched = computed(
  () =>
    groupRows.value.filter((row) => candidates.value[row.id]?.length === 1)
      .length,
);

async function loadCandidates(group = 1) {
  const request = ++candidateRequest;
  sendGroup.value = group;
  candidateLoading.value = true;
  candidateError.value = '';
  candidates.value = {};
  selectedCandidates.value = {};
  try {
    const result = await getPayrollCandidates(
      groupRows.value.map((row) => row.id),
    );
    if (request === candidateRequest) candidates.value = result;
  } catch (error) {
    if (request === candidateRequest) candidateError.value = errorText(error);
  } finally {
    if (request === candidateRequest) candidateLoading.value = false;
  }
}
function chooseMatchingCandidates() {
  for (const row of groupRows.value) {
    const options = candidates.value[row.id];
    if (
      options?.length === 1 &&
      selectedCandidates.value[row.id] === undefined
    ) {
      selectedCandidates.value[row.id] = options[0]!.userId;
    }
  }
}
function startSend() {
  if (!canSend.value || eligibleRows.value.length === 0) return;
  candidateRows.value = eligibleRows.value;
  showNoticeInSend.value = false;
  showDialog('send');
  void loadSettings();
  void loadCandidates();
}
async function confirmSend() {
  if (
    !canSend.value ||
    recipientSelection.value.length === 0 ||
    candidateLoading.value ||
    candidateError.value ||
    sending.value ||
    minutes.value === undefined ||
    settingsLoading.value ||
    settingsError.value
  )
    return;
  sending.value = true;
  candidateError.value = '';
  try {
    const records = await sendPayrollSlips(recipientSelection.value);
    if (!active.value) return;
    deliveryRequest++;
    deliveryLoading.value = false;
    const currentIds = new Set(records.map(({ id }) => id));
    deliveries.value = [
      ...records,
      ...deliveries.value.filter(({ id }) => !currentIds.has(id)),
    ];
    dialog.value?.close();
    navigate('delivery');
    deliveryPage.value = 1;
    message.success(
      `已提交 ${records.length} 条工资条，发放状态将在记录中更新`,
    );
  } catch (error) {
    candidateError.value = errorText(error);
    if (active.value) void loadDeliveries();
  } finally {
    sending.value = false;
  }
}
function showNotice(item: PayrollDelivery) {
  notice.value = item;
  showDialog('notice');
}
</script>

<template>
  <Page content-class="!p-0">
    <div class="payroll-workspace">
      <div class="page-intro">
        <div>
          <h1>薪酬管理</h1>
          <p>{{ currentTab.description }}</p>
        </div>
        <div v-if="canQuery && tab !== 'settings'" class="actions">
          <button
            v-if="canImport"
            class="button"
            type="button"
            @click="startImport"
          >
            <Upload :size="16" /> 导入工资表
          </button>
          <button
            v-if="canSend"
            class="button primary"
            type="button"
            :disabled="!eligibleRows.length"
            @click="startSend"
          >
            <Bell :size="16" /> 发送工资条
          </button>
        </div>
      </div>

      <div v-if="!canQuery" class="panel empty">
        当前账号无薪酬数据查询权限。
      </div>
      <template v-else>
        <nav class="payroll-nav" aria-label="薪酬管理视图">
          <template v-for="item in tabs" :key="item.id">
            <button
              v-if="item.id !== 'settings' || canConfigure"
              type="button"
              :aria-current="tab === item.id ? 'page' : undefined"
              @click="navigate(item.id)"
            >
              <component :is="item.icon" :size="16" aria-hidden="true" />{{
                item.label
              }}
            </button>
          </template>
        </nav>

        <div v-if="tab !== 'settings'" class="filters">
          <label class="filter"><span>工资月份</span><input
              :value="month"
              type="month"
              min="2000-01"
              max="2099-12"
              aria-label="工资月份"
              @change="changeMonth"
          /></label>
          <label class="filter"><span>所属公司</span><select
              :value="company"
              aria-label="所属公司"
              @change="changeCompany"
            >
              <option value="">全部公司</option>
              <option v-for="name in companies" :key="name">
                {{ name }}
              </option></select><ChevronDown :size="13" /></label>
          <label class="filter"><span>部门</span><select v-model="department" aria-label="部门">
              <option value="">全部部门</option>
              <option v-for="item in departments" :key="item">
                {{ item }}
              </option></select><ChevronDown :size="13" /></label>
          <span v-if="batch?.importedAt" class="source" :title="batch.source">
            <span class="source-dot"></span>更新于
            {{ dateTime(batch.importedAt) }}
          </span>
        </div>

        <div
          v-if="tab !== 'settings' && batchError"
          class="panel empty"
          role="alert"
        >
          <p>{{ batchError }}</p>
          <button type="button" class="button" @click="loadMonth">
            重新加载
          </button>
        </div>
        <div
          v-else-if="tab !== 'settings' && batchLoading"
          class="panel empty"
          role="status"
        >
          正在加载工资数据…
        </div>
        <template v-else-if="tab === 'overview'">
          <div v-if="!batch?.rows.length" class="panel empty overview-empty">
            <strong>{{ monthLabel(month) }}暂无工资数据</strong>
            <p v-if="canImport">导入工资表后可查看应发、实发及人员分布。</p>
          </div>

          <div class="metric-grid">
            <article
              v-for="metric in metrics"
              :key="metric.symbol"
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
                }}<span v-if="metric.symbol === 'people'">人</span>
              </div>
              <div class="metric-foot">
                <template v-if="metric.delta !== undefined">
                  <span class="delta" :class="{ down: metric.delta < 0 }">
                    <ArrowUp v-if="metric.delta > 0" :size="12" /><ArrowDown
                      v-else-if="metric.delta < 0"
                      :size="12"
                    />
                    {{
                      Math.abs(metric.delta).toFixed(
                        metric.unit === '人' ? 0 : 1,
                      )
                    }}{{ metric.unit }}
                  </span>
                  <span>较上月</span>
                </template>
                <span v-else>暂无可比上月数据</span>
              </div>
            </article>
          </div>

          <div class="dashboard-grid">
            <section class="panel dashboard-panel">
              <div class="panel-head">
                <div>
                  <h2>薪酬趋势</h2>
                  <p>近 6 个月 · 单位万元</p>
                </div>
                <div class="legend">
                  <span><i></i>应发</span><span><i></i>实发</span>
                </div>
              </div>
              <div v-if="trendError" class="empty" role="alert">
                {{ trendError }}
                <button type="button" class="text-button" @click="loadTrend">
                  重试
                </button>
              </div>
              <div v-else-if="trendLoading" class="empty" role="status">
                正在加载趋势…
              </div>
              <PayrollTrend
                v-else-if="trend.some((item) => item.people > 0)"
                :month="month"
                :rows="trend"
              />
              <div v-else class="empty">所选范围内暂无薪酬趋势</div>
            </section>

            <section class="panel dashboard-panel">
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
                  <span class="rank-name">{{ item.label }} <small>{{ item.people }} 人</small></span>
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

            <section class="panel dashboard-panel">
              <div class="panel-head">
                <div>
                  <h2>应发薪酬构成</h2>
                  <p>含单位缴费及考勤扣款</p>
                </div>
              </div>
              <template v-if="visibleRows.length">
                <div
                  v-if="compositionTotal"
                  class="composition-bar"
                  aria-hidden="true"
                >
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
              </template>
              <div v-else class="empty">本月暂无薪酬构成</div>
            </section>

            <section class="panel dashboard-panel">
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
              <div v-if="deliveryReady && !deliveryError" class="send-states">
                <div v-for="item in stateCounts" :key="item.code">
                  <span class="status" :data-status="item.code">{{
                    item.label
                  }}</span><strong>{{ item.count }}<small> 人</small></strong>
                </div>
              </div>
              <div v-else class="empty">
                {{
                  deliveryError ? '暂时无法读取发放进度' : '正在读取发放进度…'
                }}
              </div>
            </section>
          </div>
        </template>

        <section v-else-if="tab === 'detail'" class="panel wide-table">
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
          <div v-if="detailRows.length" class="table-scroll">
            <table>
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
                <tr v-for="row in detailRows" :key="row.id">
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
                    <span
                      v-if="deliveryReady && !deliveryError"
                      class="status"
                      :data-status="rowStatus(row)"
                      >{{ statusLabels[rowStatus(row)] }}</span><span v-else>—</span>
                  </td>
                  <td>
                    <button
                      type="button"
                      class="text-button"
                      @click="showEmployee(row)"
                    >
                      查看明细 <ChevronRight :size="14" />
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="empty">
            {{ query ? '没有找到匹配的员工' : '所选范围内暂无工资明细' }}
          </div>
          <div v-if="detailPages > 1" class="pagination">
            <span>第 {{ detailPage }} / {{ detailPages }} 页</span>
            <button
              type="button"
              class="icon-button"
              aria-label="上一页"
              :disabled="detailPage === 1"
              @click="detailPage--"
            >
              <ChevronLeft :size="17" />
            </button>
            <button
              type="button"
              class="icon-button"
              aria-label="下一页"
              :disabled="detailPage === detailPages"
              @click="detailPage++"
            >
              <ChevronRight :size="17" />
            </button>
          </div>
        </section>

        <template v-else-if="tab === 'delivery'">
          <div
            v-if="deliveryReady && !deliveryError"
            class="send-states panel summary"
          >
            <div v-for="item in stateCounts" :key="item.code">
              <span class="status" :data-status="item.code">{{
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
              <button
                type="button"
                class="text-button"
                :disabled="deliveryLoading"
                @click="loadDeliveries"
              >
                <RefreshCw :size="15" /> 刷新状态
              </button>
            </div>
            <p
              v-if="deliveryError"
              class="callout error table-feedback"
              role="alert"
            >
              {{ deliveryError }}
            </p>
            <div v-if="deliveryRows.length" class="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>员工 / 收件账号</th>
                    <th>所属公司 / 部门</th>
                    <th>提交时间</th>
                    <th>查看时长</th>
                    <th>状态</th>
                    <th><span class="sr-only">操作</span></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in deliveryRows" :key="item.id">
                    <td>
                      <strong>{{ item.name }}</strong><small v-if="item.recipient" class="secondary">{{
                        item.recipient
                      }}</small>
                    </td>
                    <td>{{ item.company }} / {{ item.department }}</td>
                    <td>{{ dateTime(item.sentAt) }}</td>
                    <td>{{ item.minutes }} 分钟</td>
                    <td>
                      <span class="status" :data-status="item.status">{{
                        statusLabels[item.status]
                      }}</span><small
                        v-if="item.error"
                        class="secondary record-error"
                        >{{ item.error }}</small>
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
            <div
              v-else-if="deliveryLoading && !deliveryReady"
              class="empty"
              role="status"
            >
              正在加载发放记录…
            </div>
            <div v-else-if="!deliveryError" class="empty delivery-empty">
              <History :size="24" /><strong>暂无发放记录</strong><span>可在这里查看通知发送和员工查阅状态。</span>
            </div>
            <div v-if="deliveryPages > 1" class="pagination">
              <span>第 {{ deliveryPage }} / {{ deliveryPages }} 页</span>
              <button
                type="button"
                class="icon-button"
                aria-label="上一页"
                :disabled="deliveryPage === 1"
                @click="deliveryPage--"
              >
                <ChevronLeft :size="17" />
              </button>
              <button
                type="button"
                class="icon-button"
                aria-label="下一页"
                :disabled="deliveryPage === deliveryPages"
                @click="deliveryPage++"
              >
                <ChevronRight :size="17" />
              </button>
            </div>
          </section>
        </template>

        <section v-else-if="canConfigure" class="panel settings-panel">
          <div class="panel-head">
            <div>
              <h2>工资条查看规则</h2>
              <p>面向钉钉工作通知中的员工详情页</p>
            </div>
            <span class="settings-icon"><LockKeyhole :size="20" /></span>
          </div>
          <div v-if="settingsLoading" class="empty" role="status">
            正在读取查看时长…
          </div>
          <form v-else class="settings-body" @submit.prevent="saveSettings">
            <div v-if="settingsError" class="callout error" role="alert">
              {{ settingsError }}
              <button type="button" class="text-button" @click="loadSettings">
                重新读取
              </button>
            </div>
            <div class="setting-row">
              <div>
                <label for="payroll-view-minutes">查看时长</label>
                <p>
                  员工首次通过身份校验并打开工资条时开始计时。到期后隐藏金额和明细。
                </p>
              </div>
              <label class="number-field"><input
                  id="payroll-view-minutes"
                  v-model.number="draftMinutes"
                  type="number"
                  min="1"
                  max="1440"
                  step="1"
                  :disabled="minutes === undefined"
                  required
                /><span>分钟</span></label>
            </div>
            <div class="setting-row">
              <div>
                <strong>打开方式</strong>
                <p>钉钉内免登，进入单张工资条的独立页面。</p>
              </div>
              <span class="settings-method"><LockKeyhole :size="15" /> 钉钉免登</span>
            </div>
            <div class="setting-note">
              <CircleAlert :size="16" /> 设置从下次发送起生效。
            </div>
            <button
              class="button primary"
              type="submit"
              :disabled="
                minutes === undefined ||
                settingsSaving ||
                draftMinutes === minutes
              "
            >
              <Check :size="16" /> 保存设置
            </button>
          </form>
        </section>
      </template>

      <dialog
        ref="dialog"
        class="dialog"
        :class="{
          'dialog-notice': mode === 'notice',
          'dialog-send': mode === 'send',
        }"
        aria-labelledby="payroll-dialog-title"
        @cancel="cancelDialog"
        @close="releaseDialog"
      >
        <div class="dialog-header">
          <h2 id="payroll-dialog-title">{{ dialogTitle }}</h2>
          <button
            class="icon-button"
            type="button"
            aria-label="关闭"
            :disabled="importSaving || sending"
            @click="cancelDialog()"
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
                  :disabled="importSaving"
              /></label>
              <button
                type="button"
                class="text-button"
                :disabled="importSaving"
                @click="downloadTemplate"
              >
                <Download :size="16" /> 下载空白模板
              </button>
            </div>
            <label
              class="drop-zone"
              :class="{ dragging: dragOver }"
              @dragover.prevent="dragOver = true"
              @dragleave="dragOver = false"
              @drop.prevent="dropFile"
            >
              <input
                type="file"
                accept=".xlsx"
                aria-label="选择工资表"
                :disabled="importSaving"
                @change="selectFile"
              />
              <span class="upload-icon"><CloudUpload :size="23" /></span>
              <strong>{{
                worksheetFile?.name || '点击选择或拖入工资表'
              }}</strong>
              <small>Excel .xlsx，最大 5 MB</small>
            </label>
            <p class="helper">
              请保留模板第 3 行的表头，在 Excel 中计算并保存后导入。
            </p>
            <p v-if="importLoading" class="helper" role="status">
              正在校验工资表…
            </p>
            <p v-if="importSaving" class="helper" role="status">
              正在保存工资数据…
            </p>
            <div
              v-if="importError || importResult?.errors.length"
              class="callout error"
              role="alert"
            >
              <CircleAlert :size="16" />
              <div>
                <strong>{{ importError || '工资表校验未通过' }}</strong>
                <ul v-if="importResult?.errors.length" class="import-errors">
                  <li
                    v-for="(error, index) in importResult.errors"
                    :key="index"
                  >
                    {{ error }}
                  </li>
                </ul>
                <button
                  v-if="importError && worksheetFile"
                  class="text-button"
                  type="button"
                  @click="processFile(worksheetFile)"
                >
                  重新校验工资表
                </button>
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
                      v-for="(row, index) in importResult.rows.slice(0, 5)"
                      :key="index"
                    >
                      <td>{{ row.name }}</td>
                      <td>{{ row.department }}</td>
                      <td class="numeric">{{ currency(row.gross) }}</td>
                      <td class="numeric">{{ currency(row.net) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p v-if="Number(importResult.version) > 0" class="callout">
                <CircleAlert :size="16" />
                确认导入将替换所选月份的工资数据，并使该月仍可打开的旧工资条失效。
              </p>
            </template>
          </div>
          <div class="dialog-footer">
            <button
              type="button"
              class="button"
              :disabled="importSaving"
              @click="cancelDialog()"
            >
              取消
            </button>
            <button
              type="button"
              class="button primary"
              :disabled="!canConfirmImport"
              @click="confirmImport"
            >
              <Check :size="16" />{{
                Number(importResult?.version) > 0 ? '确认覆盖导入' : '确认导入'
              }}
            </button>
          </div>
        </template>

        <template v-else-if="mode === 'send'">
          <div class="dialog-body">
            <div class="send-top">
              <div class="send-info">
                <strong>{{ monthLabel(month) }}工资条</strong><small>钉钉工作通知<span
                    v-if="minutes !== undefined && !settingsLoading"
                  >
                    · 首次打开后可查看 {{ minutes }} 分钟</span></small>
              </div>
              <button
                type="button"
                class="text-button"
                :aria-expanded="showNoticeInSend"
                @click="showNoticeInSend = !showNoticeInSend"
              >
                预览通知 <ChevronDown :size="14" />
              </button>
            </div>
            <div v-if="showNoticeInSend" class="notification-card">
              <h3>{{ monthLabel(month) }}工资条</h3>
              <p>本月工资条已生成，请点击下方按钮查阅。</p>
              <div class="notice-button">查看明细</div>
            </div>
            <div class="callout">
              <CircleAlert :size="16" /><span>请选择并核对每行对应的钉钉账号，只有选定账号的工资条会提交发送。</span>
            </div>
            <div v-if="settingsError" class="callout error" role="alert">
              {{ settingsError }}
              <button type="button" class="text-button" @click="loadSettings">
                重新读取时长
              </button>
            </div>
            <div v-if="candidateError" class="callout error" role="alert">
              <CircleAlert :size="16" /> {{ candidateError }}
              <button
                v-if="!Object.keys(candidates).length"
                type="button"
                class="text-button"
                @click="loadCandidates(sendGroup)"
              >
                重新匹配
              </button>
            </div>
            <div v-if="candidateLoading" class="empty" role="status">
              正在校验钉钉绑定…
            </div>
            <template v-else>
              <div class="recipient-head">
                <button
                  class="text-button"
                  type="button"
                  :disabled="!matched || sending"
                  @click="chooseMatchingCandidates"
                >
                  选择唯一匹配项
                </button>
                <span>本批已选 {{ recipientSelection.length }} /
                  {{ groupRows.length }} 人</span>
              </div>
              <div class="recipients">
                <div
                  v-for="row in groupRows"
                  :key="row.id"
                  class="recipient-row"
                >
                  <div>
                    <strong>{{ row.name }}</strong><small>{{ row.company }} · {{ row.department }}</small>
                  </div>
                  <label
                    v-if="candidates[row.id]?.length"
                    class="candidate-field"
                  >
                    <span class="sr-only">{{ row.name }}的钉钉账号</span>
                    <select
                      v-model="selectedCandidates[row.id]"
                      :disabled="sending"
                    >
                      <option :value="undefined">请选择钉钉账号</option>
                      <option
                        v-for="item in candidates[row.id]"
                        :key="item.userId"
                        :value="item.userId"
                      >
                        {{ item.nickname }} · {{ item.dingTalkName }} ·
                        {{ item.department }}（{{ item.userId }}）
                      </option>
                    </select>
                  </label>
                  <span v-else class="secondary">无匹配的钉钉账号</span>
                </div>
              </div>
              <div v-if="groups > 1" class="pagination">
                <span>第 {{ sendGroup }} / {{ groups }} 批 · 每批最多 100 人</span>
                <button
                  type="button"
                  class="icon-button"
                  aria-label="上一批"
                  :disabled="sendGroup === 1 || sending"
                  @click="loadCandidates(sendGroup - 1)"
                >
                  <ChevronLeft :size="17" />
                </button>
                <button
                  type="button"
                  class="icon-button"
                  aria-label="下一批"
                  :disabled="sendGroup === groups || sending"
                  @click="loadCandidates(sendGroup + 1)"
                >
                  <ChevronRight :size="17" />
                </button>
              </div>
            </template>
          </div>
          <div class="dialog-footer">
            <button
              class="button"
              type="button"
              :disabled="sending"
              @click="cancelDialog()"
            >
              取消
            </button>
            <button
              class="button primary"
              type="button"
              :disabled="
                !recipientSelection.length ||
                candidateLoading ||
                !!candidateError ||
                settingsLoading ||
                !!settingsError ||
                minutes === undefined ||
                sending
              "
              @click="confirmSend"
            >
              <Bell :size="16" />{{
                sending
                  ? '正在提交…'
                  : `确认发送 ${recipientSelection.length} 条`
              }}
            </button>
          </div>
        </template>

        <template v-else-if="mode === 'employee' && employee">
          <div class="dialog-body">
            <div class="employee-head">
              <div class="employee-avatar large" aria-hidden="true">
                {{ employee.name.slice(-2) }}
              </div>
              <div>
                <strong>{{ employee.name }}</strong><small>{{ employee.company }} · {{ employee.department }} ·
                  {{ monthLabel(employeeMonth) }}</small>
              </div>
            </div>
            <div class="detail-totals">
              <div>
                <span>应发合计</span><strong>{{ currency(employee.gross) }}</strong>
              </div>
              <div>
                <span>应发至实发扣减</span><strong>{{
                  currency(total([employee], deductionFields))
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
                  @click="showHistory"
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
            <div v-else-if="historyError" class="callout error" role="alert">
              {{ historyError }}
              <button type="button" class="text-button" @click="showHistory">
                重试
              </button>
            </div>
            <div v-else-if="historyLoading" class="empty" role="status">
              正在加载历史工资…
            </div>
            <div
              v-else-if="employeeHistory?.length"
              class="table-scroll import-preview employee-history"
            >
              <table>
                <thead>
                  <tr>
                    <th>工资月份</th>
                    <th class="numeric">应发合计</th>
                    <th class="numeric">实发数</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in employeeHistory" :key="row.month">
                    <td>{{ monthLabel(row.month) }}</td>
                    <td class="numeric">
                      {{ row.people > 0 ? currency(row.gross) : '—' }}
                    </td>
                    <td class="numeric">
                      {{ row.people > 0 ? currency(row.net) : '—' }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else class="empty">暂无个人历史工资。</div>
          </div>
          <div class="dialog-footer">
            <button class="button" type="button" @click="cancelDialog()">
              关闭
            </button>
          </div>
        </template>

        <div
          v-else-if="mode === 'notice' && notice"
          class="dialog-body notice-body"
        >
          <div class="notice-sender">
            <span class="brand-mark" aria-hidden="true">F</span><span>飞德慕管理系统</span><small>{{ dateTime(notice.sentAt) }}</small>
          </div>
          <div class="notification-card">
            <h3>{{ monthLabel(month) }}工资条</h3>
            <p>本月工资条已生成，请点击下方按钮查阅。</p>
            <div class="notice-button">查看明细</div>
          </div>
          <p class="helper">员工可在钉钉工作通知中打开这张工资条。</p>
        </div>
      </dialog>
    </div>
  </Page>
</template>

<style scoped src="./payroll.css"></style>
