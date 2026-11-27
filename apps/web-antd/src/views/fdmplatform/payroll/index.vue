<script setup lang="ts">
import type { PayrollFilters } from './payroll-filters';

import type {
  PayrollBatch,
  PayrollCandidate,
  PayrollDelivery,
  PayrollDepartmentMonth,
  PayrollImportPreview,
  PayrollMonthlyAnalytics,
  PayrollMonthlyTotals,
  PayrollOrganization,
  PayrollPeriodDelivery,
  PayrollRangeRow,
  PayrollRecipient,
  PayrollRow,
  PayrollRowStatus,
  PayrollSettings,
  PayrollSlipField,
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
  Grid,
  History,
  InspectionPanel,
  LayoutGrid,
  List,
  LockKeyhole,
  RefreshCw,
  Settings,
  Upload,
  UserRoundPen,
  X,
} from '@vben/icons';

import { message } from 'ant-design-vue';

import {
  commitPayrollImport,
  getPayrollAnalyticsOptions,
  getPayrollCandidates,
  getPayrollDeliveries,
  getPayrollDeliveryProgress,
  getPayrollDeliveryRange,
  getPayrollDepartmentMonths,
  getPayrollEmployeeMonths,
  getPayrollMonth,
  getPayrollMonthlyAnalytics,
  getPayrollRows,
  getPayrollSettings,
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
  payrollRegions,
  statusLabels,
  total,
  validMonth,
} from './model';
import PayrollAnalytics from './PayrollAnalytics.vue';
import PayrollFiltersBar from './PayrollFilters.vue';
import PayrollSlipFields from './PayrollSlipFields.vue';
import PayrollTrend from './PayrollTrend.vue';

defineOptions({ name: 'FdmPlatformPayroll' });

const tabs = [
  {
    id: 'overall',
    label: '薪酬总览',
    icon: LayoutGrid,
    description: '查看月度与年度薪资总额，比较各年同月变化。',
  },
  {
    id: 'employee',
    label: '员工薪资',
    icon: UserRoundPen,
    description: '按姓名查找员工，查看历史明细、薪资趋势及构成。',
  },
  {
    id: 'cost',
    label: '人力成本',
    icon: InspectionPanel,
    description: '按区域、公司和部门分析工资趋势、单位缴费及人均薪资。',
  },
  {
    id: 'departments',
    label: '部门统计',
    icon: Grid,
    description: '查询各部门月度和年度薪资，按金额比较部门分布。',
  },
  {
    id: 'overview',
    label: '工资核算',
    icon: History,
    description: '按所选期间核对工资成本、人员分布与发放进度。',
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
    description: '配置工资条的默认显示字段和查看时长。',
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

const tab = ref<Tab>('overall');
const analyticsView = computed(() => {
  const value = tab.value;
  if (
    value === 'overall' ||
    value === 'employee' ||
    value === 'cost' ||
    value === 'departments'
  )
    return value;
  return undefined;
});
const monthlyWork = computed(
  () => !analyticsView.value && tab.value !== 'settings',
);
const initialMonth = ref(monthOffset(currentMonth(), -1));
const filters = ref<PayrollFilters>({
  employeeName: '',
  endMonth: initialMonth.value,
  startMonth: initialMonth.value,
});
let initializedPeriod = false;
const month = computed(() => filters.value.endMonth);
const singleMonth = computed(() => filters.value.startMonth === month.value);
const rangeLabel = computed(() =>
  singleMonth.value
    ? monthLabel(month.value)
    : `${monthLabel(filters.value.startMonth)} 至 ${monthLabel(month.value)}`,
);
const company = ref('');
const department = ref('');
const region = ref('');
const scope = computed(() => ({
  company: company.value || undefined,
  department: department.value || undefined,
  endMonth: month.value,
  keyword: filters.value.employeeName || undefined,
  region: region.value || undefined,
  startMonth: filters.value.startMonth,
}));
const rankBy = ref<'company' | 'department'>('department');
const batch = ref<PayrollBatch>();
const sendingMonth = ref('');
const monthDeliveries = ref<PayrollDelivery[]>([]);
const sendScopeReady = ref(false);
const sendScopeError = ref('');
const organizations = ref<PayrollOrganization[]>([]);
const organizationError = ref('');
const monthly = ref<PayrollMonthlyAnalytics[]>([]);
const departmentTotals = ref<PayrollDepartmentMonth[]>([]);
const overviewError = ref('');
const overviewLoading = ref(false);
const detailPage = ref(1);
const detailPageSize = 12;
const detailTotal = ref(0);
const detailRows = ref<PayrollRangeRow[]>([]);
const detailError = ref('');
const detailLoading = ref(false);
const detailPages = computed(() =>
  Math.max(1, Math.ceil(detailTotal.value / detailPageSize)),
);
const deliveryPage = ref(1);
const deliveryPageSize = 15;
const deliveryTotal = ref(0);
const deliveryRows = ref<PayrollPeriodDelivery[]>([]);
const deliveryPages = computed(() =>
  Math.max(1, Math.ceil(deliveryTotal.value / deliveryPageSize)),
);
const deliveryError = ref('');
const deliveryLoading = ref(false);
const progress = ref<Partial<Record<PayrollRowStatus, number>>>({});
const progressReady = ref(false);
const progressError = ref('');
const active = ref(false);
const refresh = ref(0);
let organizationRequest = 0;
let monthRequest = 0;
let overviewRequest = 0;
let detailRequest = 0;
let deliveryRequest = 0;
let progressRequest = 0;

const currentTab = computed(() => tabs.find(({ id }) => id === tab.value)!);
const regions = computed(() =>
  [
    ...new Set(
      organizations.value.flatMap((row) => (row.region ? [row.region] : [])),
    ),
  ].toSorted((a, b) => a.localeCompare(b, 'zh-CN')),
);
const companies = computed(() =>
  [
    ...new Set(
      organizations.value
        .filter((row) => !region.value || row.region === region.value)
        .map((row) => row.company),
    ),
  ].toSorted((a, b) => a.localeCompare(b, 'zh-CN')),
);
const departments = computed(() =>
  [
    ...new Set(
      organizations.value
        .filter(
          (row) =>
            (!region.value || row.region === region.value) &&
            (!company.value || row.company === company.value),
        )
        .map((row) => row.department),
    ),
  ].toSorted((a, b) => a.localeCompare(b, 'zh-CN')),
);

const latestByRow = computed(() => latestDeliveries(monthDeliveries.value));
const eligibleRows = computed(() => {
  if (
    !singleMonth.value ||
    !sendScopeReady.value ||
    sendingMonth.value !== month.value
  )
    return [];
  const keyword = filters.value.employeeName;
  return (batch.value?.rows ?? []).filter(
    (row) =>
      (!company.value || row.company === company.value) &&
      (!department.value || row.department === department.value) &&
      (!region.value || row.region === region.value) &&
      row.name.includes(keyword) &&
      ['EXPIRED', 'FAILED', 'PENDING'].includes(
        latestByRow.value.get(row.id)?.status ?? 'PENDING',
      ),
  );
});
const stateCounts = computed(() => {
  const counts = progress.value;
  return [
    { code: 'PENDING', label: '待发送', count: counts.PENDING ?? 0 },
    {
      code: 'ACCEPTED',
      label: '已提交 / 已送达',
      count:
        (counts.ACCEPTED ?? 0) +
        (counts.DELIVERED ?? 0) +
        (counts.QUEUED ?? 0) +
        (counts.SENDING ?? 0),
    },
    { code: 'VIEWED', label: '已查看', count: counts.VIEWED ?? 0 },
    {
      code: 'EXPIRED',
      label: '已到期 / 已失效',
      count: (counts.EXPIRED ?? 0) + (counts.REVOKED ?? 0),
    },
    {
      code: 'FAILED',
      label: '失败 / 待核实',
      count: (counts.FAILED ?? 0) + (counts.UNCERTAIN ?? 0),
    },
  ];
});

watch(scope, () => {
  detailPage.value = 1;
  detailRows.value = [];
  detailTotal.value = 0;
  deliveryPage.value = 1;
  deliveryRows.value = [];
  deliveryTotal.value = 0;
  progressReady.value = false;
  progressError.value = '';
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

const trend = computed(() =>
  monthly.value.filter((item) => item.month >= filters.value.startMonth),
);
const overviewTotals = computed(() => {
  const totals = { gross: 0, net: 0, people: 0 };
  for (const item of trend.value) {
    totals.gross += item.gross;
    totals.net += item.net;
    totals.people += item.people;
  }
  return totals;
});
const metrics = computed(() => {
  const { gross, net, people } = overviewTotals.value;
  const prior =
    singleMonth.value && people > 0
      ? monthly.value.find(
          (item) => item.month < month.value && item.people > 0,
        )
      : undefined;
  const avg = people > 0 ? Math.round(net / people) : 0;
  return [
    {
      title: '应发合计',
      value: people > 0 ? currency(gross) : '—',
      delta: prior && percentChange(gross, prior.gross),
      symbol: 'gross',
      unit: '%',
    },
    {
      title: '实发合计',
      value: people > 0 ? currency(net) : '—',
      delta: prior && percentChange(net, prior.net),
      symbol: 'net',
      unit: '%',
    },
    {
      title: singleMonth.value ? '核算人数' : '核算人次',
      value: String(people),
      delta: prior && people - prior.people,
      symbol: 'people',
      unit: '人',
    },
    {
      title: singleMonth.value ? '人均实发' : '每人次平均实发',
      value: people > 0 ? currency(avg) : '—',
      delta: prior && percentChange(avg, prior.net / prior.people),
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
  for (const row of departmentTotals.value) {
    const label = row[rankBy.value];
    const item = grouped.get(label) ?? { label, people: 0, net: 0 };
    item.people += row.people;
    item.net += row.net;
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
    cents: trend.value.reduce(
      (sum, row) =>
        sum + keys.reduce((amount, key) => amount + (row.income[key] ?? 0), 0),
      0,
    ),
  })),
);
const compositionTotal = computed(() =>
  composition.value.reduce((sum, item) => sum + Math.abs(item.cents), 0),
);

async function loadOrganizations() {
  const request = ++organizationRequest;
  organizationError.value = '';
  try {
    const options = await getPayrollAnalyticsOptions();
    if (request !== organizationRequest) return;
    organizations.value = options.organizations;
    const latest = options.months.at(-1);
    if (
      !initializedPeriod &&
      latest &&
      validMonth(latest) &&
      filters.value.startMonth === initialMonth.value &&
      filters.value.endMonth === initialMonth.value &&
      !filters.value.employeeName
    ) {
      filters.value = {
        employeeName: '',
        startMonth: latest,
        endMonth: latest,
      };
    }
    initializedPeriod = true;
    if (latest && validMonth(latest)) initialMonth.value = latest;
  } catch (error) {
    if (request === organizationRequest)
      organizationError.value = errorText(error);
  }
}

async function loadMonth() {
  const request = ++monthRequest;
  const period = month.value;
  sendScopeReady.value = false;
  sendScopeError.value = '';
  try {
    const [result, deliveries] = await Promise.all([
      getPayrollMonth(period),
      canSend.value ? getPayrollDeliveries(period) : Promise.resolve([]),
    ]);
    if (
      request !== monthRequest ||
      period !== month.value ||
      !singleMonth.value
    )
      return;
    batch.value = result;
    monthDeliveries.value = deliveries;
    sendingMonth.value = period;
    sendScopeReady.value = true;
  } catch (error) {
    if (request === monthRequest) sendScopeError.value = errorText(error);
  }
}

async function loadOverview() {
  const request = ++overviewRequest;
  overviewLoading.value = true;
  overviewError.value = '';
  const params = scope.value;
  const previous = monthOffset(params.startMonth, -1);
  try {
    const [summaries, departments] = await Promise.all([
      getPayrollMonthlyAnalytics({
        ...params,
        startMonth:
          singleMonth.value && previous >= '2000-01'
            ? previous
            : params.startMonth,
      }),
      getPayrollDepartmentMonths(params),
    ]);
    if (request !== overviewRequest) return;
    monthly.value = summaries;
    departmentTotals.value = departments;
  } catch (error) {
    if (request === overviewRequest) overviewError.value = errorText(error);
  } finally {
    if (request === overviewRequest) overviewLoading.value = false;
  }
}

async function loadDetails() {
  const request = ++detailRequest;
  detailLoading.value = true;
  detailError.value = '';
  try {
    const result = await getPayrollRows({
      ...scope.value,
      page: detailPage.value,
      pageSize: detailPageSize,
    });
    if (request === detailRequest) {
      detailRows.value = result.items;
      detailTotal.value = result.total;
    }
  } catch (error) {
    if (request === detailRequest) detailError.value = errorText(error);
  } finally {
    if (request === detailRequest) detailLoading.value = false;
  }
}

async function loadDeliveries() {
  const request = ++deliveryRequest;
  deliveryLoading.value = true;
  deliveryError.value = '';
  try {
    const result = await getPayrollDeliveryRange({
      ...scope.value,
      page: deliveryPage.value,
      pageSize: deliveryPageSize,
    });
    if (request === deliveryRequest) {
      deliveryRows.value = result.items;
      deliveryTotal.value = result.total;
    }
  } catch (error) {
    if (request === deliveryRequest) deliveryError.value = errorText(error);
  } finally {
    if (request === deliveryRequest) deliveryLoading.value = false;
  }
}

async function loadProgress() {
  const request = ++progressRequest;
  progressError.value = '';
  try {
    const result = await getPayrollDeliveryProgress(scope.value);
    if (request === progressRequest) {
      progress.value = result;
      progressReady.value = true;
    }
  } catch (error) {
    if (request === progressRequest) progressError.value = errorText(error);
  }
}

function refreshDeliveries() {
  void loadDeliveries();
  void loadProgress();
  if (singleMonth.value && canSend.value) void loadMonth();
}

const workError = computed(() =>
  tab.value === 'overview' ? overviewError.value : detailError.value,
);
const workLoading = computed(() =>
  tab.value === 'overview' ? overviewLoading.value : detailLoading.value,
);
const loadWork = () =>
  tab.value === 'overview' ? loadOverview() : loadDetails();

watch(
  [active, canQuery, refresh],
  ([isActive, allowed]) => {
    if (isActive && allowed) void loadOrganizations();
  },
  { flush: 'post' },
);
watch(
  [month, singleMonth, active, canQuery, canSend, monthlyWork, refresh],
  () => {
    if (
      active.value &&
      canQuery.value &&
      monthlyWork.value &&
      singleMonth.value
    )
      void loadMonth();
    else {
      monthRequest++;
      sendScopeReady.value = false;
      sendScopeError.value = '';
    }
  },
  { flush: 'post' },
);
watch(
  [scope, active, canQuery, tab, refresh],
  () => {
    if (!active.value || !canQuery.value) return;
    if (tab.value === 'overview') void loadOverview();
    if (tab.value === 'overview' || tab.value === 'delivery')
      void loadProgress();
  },
  { flush: 'post' },
);
watch(
  [scope, active, canQuery, tab, detailPage, refresh],
  () => {
    if (active.value && canQuery.value && tab.value === 'detail')
      void loadDetails();
  },
  { flush: 'post' },
);
watch(
  [scope, active, canQuery, tab, deliveryPage, refresh],
  () => {
    if (active.value && canQuery.value && tab.value === 'delivery')
      void loadDeliveries();
  },
  { flush: 'post' },
);

function navigate(next: Tab) {
  if (next === 'settings' && !canConfigure.value) return;
  tab.value = next;
  if (next === 'settings') void loadSettings();
}

function changeRegion(event: Event) {
  region.value = (event.target as HTMLSelectElement).value;
  company.value = '';
  department.value = '';
}

function changeCompany(event: Event) {
  company.value = (event.target as HTMLSelectElement).value;
  department.value = '';
}

function drillDown(label: string) {
  if (rankBy.value === 'company') company.value = label;
  else department.value = label;
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
      !document.hidden &&
      !deliveryLoading.value
    ) {
      refreshDeliveries();
    }
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
const availableSlipFields = ref<PayrollSlipField[]>([]);
const defaultSlipFields = ref<string[]>([]);
const draftSlipFields = ref<string[]>([]);
const settingsLoading = ref(false);
const settingsSaving = ref(false);
const settingsError = ref('');
const settingsDirty = computed(
  () =>
    draftMinutes.value !== minutes.value ||
    draftSlipFields.value.length !== defaultSlipFields.value.length ||
    draftSlipFields.value.some((key) => !defaultSlipFields.value.includes(key)),
);

function applySettings(settings: PayrollSettings) {
  availableSlipFields.value = settings.availableFields;
  minutes.value = draftMinutes.value = Number(settings.minutes);
  defaultSlipFields.value = settings.fields;
  draftSlipFields.value = [...settings.fields];
}

async function loadSettings() {
  if (settingsLoading.value) return;
  settingsLoading.value = true;
  settingsError.value = '';
  try {
    const settings = await getPayrollSettings();
    applySettings(settings);
    if (mode.value === 'send') sendSlipFields.value = [...settings.fields];
  } catch (error) {
    availableSlipFields.value = [];
    minutes.value = undefined;
    settingsError.value = errorText(error);
  } finally {
    settingsLoading.value = false;
  }
}

async function saveSettings() {
  const next = Number(draftMinutes.value);
  if (
    !canConfigure.value ||
    settingsLoading.value ||
    settingsSaving.value ||
    minutes.value === undefined ||
    !settingsDirty.value ||
    draftSlipFields.value.length === 0 ||
    !Number.isInteger(next) ||
    next < 1 ||
    next > 1440
  )
    return;
  settingsSaving.value = true;
  settingsError.value = '';
  try {
    const settings = await updatePayrollSettings(next, draftSlipFields.value);
    applySettings(settings);
    message.success('工资条设置已保存');
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
const notice = ref<PayrollPeriodDelivery>();
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
      send: '批量发送工资条',
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
  selectedRecipientRows.value = [];
  sendSlipFields.value = [];
  candidates.value = {};
  mode.value = undefined;
}

function showEmployee(row: PayrollRow, period = month.value) {
  employee.value = row;
  employeeMonth.value = period;
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
    const result = await getPayrollEmployeeMonths({
      employeeKey: row.employeeKey,
      endMonth: filters.value.endMonth,
      region: row.region ?? '',
      startMonth: filters.value.startMonth,
    });
    if (request === historyRequest) {
      employeeHistory.value = result
        .toSorted((a, b) => b.month.localeCompare(a.month))
        .map(({ month, row }) => ({
          gross: row.gross,
          month,
          net: row.net,
          people: 1,
        }));
    }
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
  'region',
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
  if (importMonth.value > currentMonth()) {
    importError.value = '导入月份不能晚于当前月份。';
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
    region.value = '';
    filters.value = { employeeName: '', startMonth: period, endMonth: period };
    navigate('overview');
    dialog.value?.close();
    refresh.value++;
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
const selectedRecipientRows = ref<string[]>([]);
const sendSlipFields = ref<string[]>([]);
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
    return !selectedRecipientRows.value.includes(row.id) ||
      userId === undefined ||
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
const sendFieldLabels = computed(() =>
  availableSlipFields.value
    .filter(({ key }) => sendSlipFields.value.includes(key))
    .map(({ label }) => label),
);
const canSubmitSend = computed(
  () =>
    canSend.value &&
    recipientSelection.value.length > 0 &&
    sendFieldLabels.value.length > 0 &&
    sendFieldLabels.value.length === sendSlipFields.value.length &&
    !candidateLoading.value &&
    !candidateError.value &&
    !sending.value &&
    minutes.value !== undefined &&
    !settingsLoading.value &&
    !settingsError.value,
);

async function loadCandidates(group = 1) {
  const request = ++candidateRequest;
  sendGroup.value = group;
  candidateLoading.value = true;
  candidateError.value = '';
  candidates.value = {};
  selectedCandidates.value = {};
  selectedRecipientRows.value = [];
  try {
    const result = await getPayrollCandidates(
      groupRows.value.map((row) => row.id),
    );
    if (request !== candidateRequest) return;
    candidates.value = result;
    for (const row of groupRows.value) {
      const options = result[row.id];
      if (options?.length === 1) {
        selectedCandidates.value[row.id] = options[0]!.userId;
      }
    }
  } catch (error) {
    if (request === candidateRequest) candidateError.value = errorText(error);
  } finally {
    if (request === candidateRequest) candidateLoading.value = false;
  }
}
function chooseMatchingCandidates() {
  const selected = new Set(selectedRecipientRows.value);
  for (const row of groupRows.value) {
    if (candidates.value[row.id]?.length === 1) selected.add(row.id);
  }
  selectedRecipientRows.value = [...selected];
}
function unselectRecipient(rowId: string) {
  selectedRecipientRows.value = selectedRecipientRows.value.filter(
    (selected) => selected !== rowId,
  );
}
function startSend() {
  if (!canSend.value || eligibleRows.value.length === 0) return;
  candidateRows.value = eligibleRows.value;
  sendSlipFields.value = [];
  showNoticeInSend.value = false;
  showDialog('send');
  void loadSettings();
  void loadCandidates();
}
async function confirmSend() {
  if (!canSubmitSend.value) return;
  sending.value = true;
  candidateError.value = '';
  try {
    const records = await sendPayrollSlips(
      recipientSelection.value,
      sendSlipFields.value,
    );
    if (!active.value) return;
    const currentIds = new Set(records.map(({ id }) => id));
    monthDeliveries.value = [
      ...records,
      ...monthDeliveries.value.filter(({ id }) => !currentIds.has(id)),
    ];
    const sentRows = new Set(records.map(({ rowId }) => rowId));
    const remaining = candidateRows.value.filter(({ id }) => !sentRows.has(id));
    if (groups.value > 1 && remaining.length > 0) {
      candidateRows.value = remaining;
      void loadCandidates(Math.min(sendGroup.value, groups.value));
    } else {
      dialog.value?.close();
      navigate('delivery');
      deliveryPage.value = 1;
    }
    refresh.value++;
    message.success(
      `已提交 ${records.length} 条工资条，发放状态将在记录中更新`,
    );
  } catch (error) {
    candidateError.value = errorText(error);
    if (active.value) refreshDeliveries();
  } finally {
    sending.value = false;
  }
}
function showNotice(item: PayrollPeriodDelivery) {
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
            v-if="canSend && monthlyWork"
            class="button primary"
            type="button"
            :disabled="!eligibleRows.length"
            :title="!singleMonth ? '请选择一个工资月份发送工资条' : undefined"
            @click="startSend"
          >
            <Bell :size="16" /> 批量发送工资条
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

        <PayrollFiltersBar
          v-show="tab !== 'settings'"
          v-model="filters"
          :initial-month="initialMonth"
        />

        <PayrollAnalytics
          v-if="analyticsView"
          :view="analyticsView"
          :report-month="initialMonth"
          :filters="filters"
          @detail="showEmployee"
        />

        <div v-if="monthlyWork" class="filters">
          <label class="filter">
            <span>所属区域</span>
            <select
              :value="region"
              aria-label="所属区域"
              @change="changeRegion"
            >
              <option value="">全部区域</option>
              <option v-for="item in regions" :key="item" :value="item">
                {{ item }}
              </option>
            </select>
            <ChevronDown :size="13" />
          </label>
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
          <span
            v-if="singleMonth && sendingMonth === month && batch?.importedAt"
            class="source"
            :title="batch.source"
          >
            <span class="source-dot"></span>更新于
            {{ dateTime(batch.importedAt) }}
          </span>
        </div>

        <div
          v-if="monthlyWork && organizationError"
          class="callout error table-feedback"
          role="alert"
        >
          {{ organizationError }}
          <button type="button" class="text-button" @click="loadOrganizations">
            重新加载组织选项
          </button>
        </div>
        <div
          v-if="monthlyWork && canSend && singleMonth && sendScopeError"
          class="callout error table-feedback"
          role="alert"
        >
          {{ sendScopeError }}
          <button type="button" class="text-button" @click="loadMonth">
            重新加载发送范围
          </button>
        </div>

        <div
          v-if="(tab === 'overview' || tab === 'detail') && workError"
          class="panel empty"
          role="alert"
        >
          <p>{{ workError }}</p>
          <button type="button" class="button" @click="loadWork">
            重新加载
          </button>
        </div>
        <div
          v-else-if="(tab === 'overview' || tab === 'detail') && workLoading"
          class="panel empty"
          role="status"
        >
          正在加载工资数据…
        </div>
        <template v-else-if="tab === 'overview'">
          <div v-if="!overviewTotals.people" class="panel empty overview-empty">
            <strong>{{ rangeLabel }}暂无工资数据</strong>
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
                }}<span v-if="metric.symbol === 'people'">{{
                  singleMonth ? '人' : '人次'
                }}</span>
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
                <span v-else>{{
                  singleMonth ? '暂无可比上月数据' : '所选期间'
                }}</span>
              </div>
            </article>
          </div>

          <div class="dashboard-grid">
            <section class="panel dashboard-panel">
              <div class="panel-head">
                <div>
                  <h2>薪酬趋势</h2>
                  <p>{{ rangeLabel }} · 单位万元</p>
                </div>
                <div class="legend">
                  <span><i></i>应发</span><span><i></i>实发</span>
                </div>
              </div>
              <PayrollTrend v-if="trend.length" :month="month" :rows="trend" />
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
                  <span class="rank-name">{{ item.label }}
                    <small>{{ item.people }}
                      {{ singleMonth ? '人' : '人次' }}</small></span>
                  <span class="rank-value">{{ currency(item.net) }}</span>
                  <span class="rank-track"><i
                      :style="{
                        width: `${(Math.abs(item.net) / rankingMaximum) * 100}%`,
                      }"
                    ></i></span>
                </button>
              </div>
              <div v-else class="empty">所选期间暂无实发排行</div>
            </section>

            <section class="panel dashboard-panel">
              <div class="panel-head">
                <div>
                  <h2>应发薪酬构成</h2>
                  <p>含单位缴费及考勤扣款</p>
                </div>
              </div>
              <template v-if="overviewTotals.people">
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
              <div v-else class="empty">所选期间暂无薪酬构成</div>
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
              <div v-if="progressReady && !progressError" class="send-states">
                <div v-for="item in stateCounts" :key="item.code">
                  <span class="status" :data-status="item.code">{{
                    item.label
                  }}</span><strong>{{ item.count }}<small> 条</small></strong>
                </div>
              </div>
              <div v-else class="empty">
                {{
                  progressError ? '暂时无法读取发放进度' : '正在读取发放进度…'
                }}
              </div>
            </section>
          </div>
        </template>

        <section v-else-if="tab === 'detail'" class="panel wide-table">
          <div class="panel-head">
            <div>
              <h2>工资明细</h2>
              <p>{{ rangeLabel }} · {{ detailTotal }} 条</p>
            </div>
          </div>
          <div v-if="detailRows.length" class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>员工</th>
                  <th>工资月份</th>
                  <th>所属区域</th>
                  <th>所属公司</th>
                  <th>部门</th>
                  <th class="numeric">应发合计</th>
                  <th class="numeric">实发数</th>
                  <th>工资条状态</th>
                  <th><span class="sr-only">操作</span></th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="{ month: rowMonth, row, status } in detailRows"
                  :key="row.id"
                >
                  <td>
                    <button
                      class="employee-link"
                      type="button"
                      @click="showEmployee(row, rowMonth)"
                    >
                      <span class="employee-avatar" aria-hidden="true">{{
                        row.name.slice(-2)
                      }}</span>{{ row.name }}
                    </button>
                  </td>
                  <td>{{ monthLabel(rowMonth) }}</td>
                  <td>{{ row.region || '—' }}</td>
                  <td>{{ row.company }}</td>
                  <td>{{ row.department }}</td>
                  <td class="numeric">{{ currency(row.gross) }}</td>
                  <td class="numeric strong">{{ currency(row.net) }}</td>
                  <td>
                    <span class="status" :data-status="status">{{
                      statusLabels[status]
                    }}</span>
                  </td>
                  <td>
                    <button
                      type="button"
                      class="text-button"
                      @click="showEmployee(row, rowMonth)"
                    >
                      查看明细 <ChevronRight :size="14" />
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="empty">
            {{
              filters.employeeName
                ? '没有找到匹配的员工'
                : '所选范围内暂无工资明细'
            }}
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
            v-if="progressReady && !progressError"
            class="send-states panel summary"
          >
            <div v-for="item in stateCounts" :key="item.code">
              <span class="status" :data-status="item.code">{{
                item.label
              }}</span><strong>{{ item.count }}<small> 条</small></strong>
            </div>
          </div>
          <section class="panel wide-table">
            <div class="panel-head">
              <div>
                <h2>发放记录</h2>
                <p>{{ rangeLabel }} · {{ deliveryTotal }} 条</p>
              </div>
              <button
                type="button"
                class="text-button"
                :disabled="deliveryLoading"
                @click="refreshDeliveries"
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
                    <th>工资月份</th>
                    <th>提交时间</th>
                    <th>查看时长</th>
                    <th>状态</th>
                    <th><span class="sr-only">操作</span></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="entry in deliveryRows" :key="entry.delivery.id">
                    <td>
                      <strong>{{ entry.delivery.name }}</strong><small
                        v-if="entry.delivery.recipient"
                        class="secondary"
                        >{{ entry.delivery.recipient }}</small>
                    </td>
                    <td>
                      {{ entry.delivery.company }} /
                      {{ entry.delivery.department }}
                    </td>
                    <td>{{ monthLabel(entry.month) }}</td>
                    <td>{{ dateTime(entry.delivery.sentAt) }}</td>
                    <td>{{ entry.delivery.minutes }} 分钟</td>
                    <td>
                      <span
                        class="status"
                        :data-status="entry.delivery.status"
                        >{{ statusLabels[entry.delivery.status] }}</span><small
                        v-if="entry.delivery.error"
                        class="secondary record-error"
                        >{{ entry.delivery.error }}</small>
                    </td>
                    <td>
                      <button
                        type="button"
                        class="text-button"
                        @click="showNotice(entry)"
                      >
                        预览通知 <ChevronRight :size="14" />
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else-if="deliveryLoading" class="empty" role="status">
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

        <section
          v-else-if="tab === 'settings' && canConfigure"
          class="panel settings-panel"
        >
          <div class="panel-head">
            <div>
              <h2>工资条默认设置</h2>
              <p>适用于钉钉里的员工工资条。发送时可调整本批字段。</p>
            </div>
            <span class="settings-icon"><LockKeyhole :size="20" /></span>
          </div>
          <div v-if="settingsLoading" class="empty" role="status">
            正在读取工资条设置…
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
                  :disabled="minutes === undefined || settingsSaving"
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
            <section v-if="availableSlipFields.length" class="setting-fields">
              <div class="field-heading">
                <h3>默认显示字段</h3>
                <span>已选 {{ draftSlipFields.length }} 项</span>
              </div>
              <p>姓名和工资月份固定显示。请选择其余显示字段。</p>
              <PayrollSlipFields
                v-model="draftSlipFields"
                :disabled="settingsSaving"
                :options="availableSlipFields"
              />
              <p v-if="!draftSlipFields.length">请至少勾选一个字段。</p>
            </section>
            <div class="setting-note">
              <CircleAlert :size="16" /> 设置从下次发送起生效。
            </div>
            <button
              class="button primary"
              type="submit"
              :disabled="
                minutes === undefined ||
                settingsSaving ||
                !settingsDirty ||
                !draftSlipFields.length
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
                  :max="currentMonth()"
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
              「所属区域」填写子公司所在区域，如{{
                payrollRegions.join('、')
              }}。 姓名和部门须与钉钉组织架构一致。请保留模板第 3 行的表头，在
              Excel 中计算并保存后导入。
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
                      <th>所属区域</th>
                      <th>所属公司</th>
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
                      <td>{{ row.region || '—' }}</td>
                      <td>{{ row.company }}</td>
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
            <details
              v-if="
                availableSlipFields.length && !settingsLoading && !settingsError
              "
              class="send-fields"
            >
              <summary>
                调整本批显示字段 · 已选 {{ sendFieldLabels.length }} 项
              </summary>
              <PayrollSlipFields
                v-model="sendSlipFields"
                :disabled="sending"
                :options="availableSlipFields"
              />
            </details>
            <p
              v-if="
                availableSlipFields.length && !settingsLoading && !settingsError
              "
              class="send-fields-summary"
            >
              {{
                sendFieldLabels.length
                  ? `员工可见字段：姓名、工资月份、${sendFieldLabels.join('、')}`
                  : '请至少勾选一个字段。'
              }}
            </p>
            <div class="callout">
              <CircleAlert :size="16" /><span>核对钉钉账号后勾选收件人，本批选中的员工使用同一组显示字段。</span>
            </div>
            <div v-if="settingsError" class="callout error" role="alert">
              {{ settingsError }}
              <button type="button" class="text-button" @click="loadSettings">
                重新读取设置
              </button>
            </div>
            <div v-if="candidateError" class="callout error" role="alert">
              <CircleAlert :size="16" /> {{ candidateError }}
              <button
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
                <div class="recipient-actions">
                  <button
                    class="text-button"
                    type="button"
                    :disabled="!matched || sending"
                    @click="chooseMatchingCandidates"
                  >
                    勾选唯一匹配项
                  </button>
                  <button
                    class="text-button"
                    type="button"
                    :disabled="!selectedRecipientRows.length || sending"
                    @click="selectedRecipientRows = []"
                  >
                    清空勾选
                  </button>
                </div>
                <span>本批已选 {{ recipientSelection.length }} /
                  {{ groupRows.length }} 人</span>
              </div>
              <div class="recipients">
                <div
                  v-for="row in groupRows"
                  :key="row.id"
                  class="recipient-row"
                >
                  <label class="recipient-checkbox">
                    <input
                      v-model="selectedRecipientRows"
                      :value="row.id"
                      type="checkbox"
                      :disabled="
                        selectedCandidates[row.id] === undefined || sending
                      "
                    />
                    <span>
                      <strong>{{ row.name }}</strong><small>{{ row.company }} · {{ row.department }}</small>
                    </span>
                  </label>
                  <span
                    v-if="candidates[row.id]?.length === 1"
                    class="candidate-account"
                  >
                    {{ candidates[row.id]![0]!.nickname }}（{{
                      candidates[row.id]![0]!.userId
                    }}）
                  </span>
                  <label
                    v-else-if="candidates[row.id]?.length"
                    class="candidate-field"
                  >
                    <span class="sr-only">{{ row.name }}的钉钉账号</span>
                    <select
                      v-model="selectedCandidates[row.id]"
                      :disabled="sending"
                      @change="unselectRecipient(row.id)"
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
              :disabled="!canSubmitSend"
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
                  所选期间对比
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
            <span class="brand-mark" aria-hidden="true">F</span><span>飞德慕管理系统</span><small>{{ dateTime(notice.delivery.sentAt) }}</small>
          </div>
          <div class="notification-card">
            <h3>{{ monthLabel(notice.month) }}工资条</h3>
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
