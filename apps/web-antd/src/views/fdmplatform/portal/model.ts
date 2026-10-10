import type {
  CurrencyAmounts,
  PortalDepartment,
  PortalSummary,
  PortalTodo,
  PortalTrend,
} from '#/api/fdmplatform/portal';

export interface PortalLink {
  path: string;
  query?: Record<string, string>;
}
export interface TodoDefinition {
  key: string;
  label: string;
  /** Shown instead of a preview when nothing is waiting. */
  empty: string;
  /** Highlighted when it has items: money or a customer is waiting. */
  hot?: boolean;
  target: (todo: PortalTodo) => PortalLink;
}
export interface MetricValue {
  main: string;
  sub: string;
}
export interface MetricDefinition {
  label: string;
  value: (metrics: PortalSummary['metrics']) => MetricValue;
}
export interface FunctionEntry {
  title: string;
  description: string;
  link: PortalLink;
}
export interface PortalDefinition {
  department: PortalDepartment;
  name: string;
  dataTitle: string;
  primary: { label: string; link: PortalLink };
  todos: TodoDefinition[];
  listTitle: string;
  listMore: PortalLink;
  listEmpty: string;
  metrics: MetricDefinition[];
  trendLabel: string;
  functions: { group: string; items: FunctionEntry[] }[];
}

const CONTRACTS = '/fdmwaimao/platform-contracts';
const SHIPMENTS = '/fdmwaimao/platform-shipments';
const TASKS = '/fdmprocurement/platform-tasks';
const ORDERS = '/fdmprocurement/platform-orders';
const RECEIPTS = '/caiwu/platform-receipts';
const PAYMENTS = '/caiwu/platform-procurement-requests';

export function contractLink(contractId: string): PortalLink {
  return { path: CONTRACTS, query: { contractId } };
}
/** One waiting contract opens directly; several open the filtered list. */
function contractOr(list: PortalLink) {
  return (todo: PortalTodo): PortalLink =>
    todo.count === 1 && todo.contractId ? contractLink(todo.contractId) : list;
}
function task(stage: string) {
  return (): PortalLink => ({ path: TASKS, query: { stage, mine: 'true' } });
}

export function formatNumber(value: unknown, digits = 2) {
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toLocaleString('zh-CN', { maximumFractionDigits: digits })
    : '—';
}
/** Largest amount first; each currency stays on its own line and zero currencies are left out. */
export function moneyLines(amounts: unknown): string[] {
  if (!amounts || typeof amounts !== 'object') return [];
  return Object.entries(amounts as CurrencyAmounts)
    .filter(
      ([, value]) => Number.isFinite(Number(value)) && Number(value) !== 0,
    )
    .toSorted(([, a], [, b]) => Math.abs(Number(b)) - Math.abs(Number(a)))
    .map(([currency, value]) => `${currency} ${formatNumber(value)}`);
}
function money(key: string, emptySub: string) {
  return (metrics: PortalSummary['metrics']): MetricValue => {
    const lines = moneyLines(metrics[key]);
    return {
      main: lines[0] ?? '0',
      sub: lines.slice(1).join(' · ') || emptySub,
    };
  };
}
function count(
  key: string,
  unit: string,
  sub: (m: PortalSummary['metrics']) => string,
) {
  return (metrics: PortalSummary['metrics']): MetricValue => ({
    main: `${formatNumber(metrics[key] ?? 0, 0)} ${unit}`,
    sub: sub(metrics),
  });
}

/** The series with the largest total; other currencies are named in the label. */
export function pickTrend(trend: PortalTrend | undefined) {
  const entries = Object.entries(trend?.series ?? {}).map(
    ([key, values]) =>
      [key, values.map((value) => Number(value) || 0)] as const,
  );
  const sum = (values: readonly number[]) =>
    values.reduce((total, value) => total + Math.abs(value), 0);
  const sorted = entries.toSorted(([, a], [, b]) => sum(b) - sum(a));
  const months = (trend?.months ?? []).map(
    (month) => `${Number(month.slice(5))}月`,
  );
  const [key, values] = sorted[0] ?? ['', months.map(() => 0)];
  return {
    key,
    values: [...values],
    months,
    others: sorted.slice(1).map(([name]) => name),
  };
}

export const portalDefinitions: Record<PortalDepartment, PortalDefinition> = {
  trade: {
    department: 'trade',
    name: '外贸门户',
    dataTitle: '我的数据',
    primary: {
      label: '新建合同',
      link: { path: CONTRACTS, query: { create: 'contract' } },
    },
    todos: [
      {
        key: 'draft',
        label: '草稿待生效',
        empty: '没有未生效的草稿',
        target: contractOr({
          path: CONTRACTS,
          query: { mine: 'true', status: 'DRAFT' },
        }),
      },
      {
        key: 'request',
        label: '待提交采购申请',
        empty: '合同产品都已申请',
        target: contractOr({
          path: CONTRACTS,
          query: { mine: 'true', status: 'EXECUTING' },
        }),
      },
      {
        key: 'receipt',
        label: '回款待确认',
        empty: '没有待确认的回款',
        hot: true,
        target: contractOr({ path: RECEIPTS, query: { view: 'receipts' } }),
      },
      {
        key: 'ship',
        label: '待安排发货',
        empty: '到货后会出现在这里',
        target: contractOr({ path: SHIPMENTS }),
      },
      {
        key: 'quote',
        label: '报价需更新',
        empty: '报价都在有效期内',
        hot: true,
        target: (todo) => ({
          path: '/fdmprocurement/platform-quotes',
          query: todo.contractId ? { contractId: todo.contractId } : undefined,
        }),
      },
      {
        key: 'history',
        label: '金智合同未发齐',
        empty: '最近签的金智合同都已发齐',
        target: () => ({ path: CONTRACTS, query: { scope: 'pending' } }),
      },
    ],
    listTitle: '我负责的合同进度',
    listMore: { path: CONTRACTS, query: { mine: 'true' } },
    listEmpty: '你还没有负责的合同，新建合同后会显示办理进度。',
    metrics: [
      {
        label: '执行中合同',
        value: count(
          'activeContracts',
          '份',
          (m) => `本月新签 ${formatNumber(m.newThisMonth ?? 0, 0)} 份`,
        ),
      },
      {
        label: '本月签约额',
        value: money('signedThisMonth', '按签订日期统计'),
      },
      {
        label: '已确认回款',
        value: (m) => ({
          main: moneyLines(m.confirmedReceipts)[0] ?? '0',
          sub:
            moneyLines(m.pendingReceipts).length > 0
              ? `待确认 ${moneyLines(m.pendingReceipts).join(' · ')}`
              : '没有待确认回款',
        }),
      },
      { label: '未回款', value: money('unpaid', '执行中合同合计') },
    ],
    trendLabel: '近 6 个月签约额',
    functions: [
      {
        group: '日常办理',
        items: [
          {
            title: '客户管理',
            description: '客户档案与往来汇总',
            link: { path: '/fdmwaimao/platform-customers' },
          },
          {
            title: '合同订单',
            description: '新建、生效、跟进主线',
            link: { path: CONTRACTS },
          },
          {
            title: '采购申请',
            description: '提交给采购的需求',
            link: { path: '/fdmwaimao/platform-requests' },
          },
          {
            title: '发货与退货',
            description: '发货单 · 销售退货单',
            link: { path: SHIPMENTS },
          },
        ],
      },
      {
        group: '查询协作',
        items: [
          {
            title: '采购进度',
            description: '采购工作台',
            link: { path: TASKS },
          },
          {
            title: '回款情况',
            description: '收款与开票',
            link: { path: RECEIPTS },
          },
          {
            title: '产品档案',
            description: '选品与销售价格',
            link: { path: '/fdmproducts/catalog' },
          },
          {
            title: '汇率中心',
            description: '回款折算参考',
            link: { path: '/caiwu/platform-exchange-rates' },
          },
        ],
      },
    ],
  },
  purchase: {
    department: 'purchase',
    name: '采购门户',
    dataTitle: '我的数据',
    primary: {
      label: '打开我的采购任务',
      link: { path: TASKS, query: { mine: 'true' } },
    },
    todos: [
      {
        key: 'intake',
        label: '待接单',
        empty: '没有待接单的申请',
        target: task('intake'),
      },
      {
        key: 'quote',
        label: '待报价',
        empty: '没有待报价的任务',
        hot: true,
        target: task('quote'),
      },
      {
        key: 'plan',
        label: '待编方案',
        empty: '有效报价确认后出现',
        target: task('plan'),
      },
      {
        key: 'order',
        label: '待下单',
        empty: '方案确认后出现',
        target: task('order'),
      },
      {
        key: 'arrival',
        label: '待到货',
        empty: '没有在途采购单',
        target: task('arrival'),
      },
      {
        key: 'customs',
        label: '我负责的报关',
        empty: '没有进行中的报关批次',
        target: () => ({ path: '/fdmprocurement/platform-customs' }),
      },
    ],
    listTitle: '临近交期的任务',
    listMore: { path: TASKS, query: { mine: 'true' } },
    listEmpty: '你名下的采购任务都没有约定交期，或者目前没有任务。',
    metrics: [
      {
        label: '我负责的采购单',
        value: count(
          'orders',
          '张',
          (m) => `在途 ${formatNumber(m.openOrders ?? 0, 0)} 张`,
        ),
      },
      {
        label: '本月下单额',
        value: money('orderedThisMonth', '按下单日期统计'),
      },
      { label: '未付款', value: money('unpaid', '已扣除已确认付款') },
      {
        label: '待到货明细',
        value: count('awaitingLines', '行', () => '按采购单行统计'),
      },
    ],
    trendLabel: '近 6 个月下单额',
    functions: [
      {
        group: '日常办理',
        items: [
          {
            title: '采购工作台',
            description: '接单、报价、选价下单',
            link: { path: TASKS },
          },
          {
            title: '报价与方案',
            description: '供应商报价 · 采购方案',
            link: { path: '/fdmprocurement/platform-quotes' },
          },
          {
            title: '采购单',
            description: '采购单 · 到货 · 退货 · 自产',
            link: { path: ORDERS },
          },
          {
            title: '报关跟进',
            description: '批次、资料与费用',
            link: { path: '/fdmprocurement/platform-customs' },
          },
          {
            title: '原材料采购',
            description: '工厂原料下单与到货',
            link: { path: '/fdmprocurement/raw-purchase' },
          },
        ],
      },
      {
        group: '资料与设置',
        items: [
          {
            title: '供应商管理',
            description: '供应商与联系人',
            link: { path: '/fdmprocurement/platform-suppliers' },
          },
          {
            title: '采购设置',
            description: '合同模板 · 分派规则',
            link: { path: '/fdmprocurement/platform-templates' },
          },
          {
            title: '业务通知',
            description: '审批与提醒',
            link: { path: '/fdmprocurement/platform-approvals' },
          },
          {
            title: '产品档案',
            description: '规格与标准资料',
            link: { path: '/fdmproducts/catalog' },
          },
        ],
      },
    ],
  },
  finance: {
    department: 'finance',
    name: '财务门户',
    dataTitle: '部门数据',
    primary: {
      label: '确认回款',
      link: { path: RECEIPTS, query: { view: 'receipts' } },
    },
    todos: [
      {
        key: 'receipt',
        label: '回款待确认到账',
        empty: '没有待确认的回款',
        hot: true,
        target: (todo) => ({
          path: RECEIPTS,
          query: {
            view: 'receipts',
            ...(todo.count === 1 && todo.contractId && todo.recordId
              ? { contractId: todo.contractId, documentId: todo.recordId }
              : {}),
          },
        }),
      },
      {
        key: 'allocation',
        label: '可核销',
        empty: '没有待核销的回款和发票',
        target: () => ({ path: RECEIPTS, query: { view: 'allocations' } }),
      },
      {
        key: 'request',
        label: '采购请款待付款',
        empty: '没有待付款的请款',
        hot: true,
        target: (todo) => ({
          path: PAYMENTS,
          query: {
            view: 'requests',
            ...(todo.count === 1 && todo.recordId
              ? { financeId: todo.recordId }
              : {}),
          },
        }),
      },
      {
        key: 'reimbursement',
        label: '报销待确认',
        empty: '没有待确认的报销',
        target: () => ({ path: PAYMENTS, query: { view: 'reimbursements' } }),
      },
      {
        key: 'history',
        label: '历史财务单据待补齐',
        empty: '没有待补齐的历史单据',
        target: () => ({
          path: RECEIPTS,
          query: { view: 'receipts', scope: 'pending' },
        }),
      },
    ],
    listTitle: '待确认的款项',
    listMore: { path: RECEIPTS, query: { view: 'receipts' } },
    listEmpty: '没有待确认的回款或待付款的请款。',
    metrics: [
      {
        label: '本月确认回款',
        value: (m) => ({
          main: `CNY ${formatNumber(m.confirmedThisMonthRmb ?? 0)}`,
          sub:
            Number(m.missingSnapshots) > 0
              ? `${formatNumber(m.missingSnapshots, 0)} 笔缺汇率快照未计入`
              : '按回款冻结汇率折算',
        }),
      },
      { label: '应收未回款', value: money('receivable', '执行中合同合计') },
      {
        label: '本月开票',
        value: (m) => ({
          main: moneyLines(m.invoicedThisMonth)[0] ?? '0',
          sub: `${formatNumber(m.invoicesThisMonth ?? 0, 0)} 张有效发票`,
        }),
      },
      { label: '待付款', value: money('payable', '已提交的采购请款') },
    ],
    trendLabel: '近 6 个月确认回款',
    functions: [
      {
        group: '收付款',
        items: [
          {
            title: '收款与开票',
            description: '回款 · 退款 · 开票 · 核销',
            link: { path: RECEIPTS },
          },
          {
            title: '付款与报销',
            description: '请款 · 付款 · 报销',
            link: { path: PAYMENTS },
          },
          {
            title: '成本与利润',
            description: '合同成本 · 采购成本归属',
            link: { path: '/caiwu/platform-costs' },
          },
          {
            title: '汇率中心',
            description: '参考汇率与折算',
            link: { path: '/caiwu/platform-exchange-rates' },
          },
        ],
      },
      {
        group: '查询',
        items: [
          {
            title: '合同订单',
            description: '合同与办理主线',
            link: { path: CONTRACTS },
          },
          {
            title: '采购单',
            description: '采购单付款进度',
            link: { path: ORDERS },
          },
        ],
      },
    ],
  },
};

/** Items still needing someone today; imported history is reported separately. */
export function actionableCount(summary: PortalSummary | undefined) {
  return (summary?.todos ?? [])
    .filter((todo) => !['history', 'stocktake'].includes(todo.key))
    .reduce((total, todo) => total + (Number(todo.count) || 0), 0);
}

export function greeting(now: Date) {
  const hour = now.getHours();
  if (hour < 11) return '上午好';
  if (hour < 13) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

/** Days until a due date in business time; negative when overdue. */
export function daysUntil(date: string | undefined, today: Date) {
  if (!date || !/^\d{4}-\d{2}-\d{2}/.test(date)) return undefined;
  const due = Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
  );
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((due - now) / 86_400_000);
}

export interface PipelineStep {
  key: string;
  label: string;
  /** Workbench stages or order todos summed into this step. */
  todos: string[];
  hint: string;
  /** Waiting on the buyer (counted in the headline), not on suppliers or other departments. */
  mine: boolean;
  target: (todos: PortalTodo[]) => PortalLink;
}
const ORDER_TODO_TARGET = (todos: PortalTodo[]): PortalLink => {
  const only =
    todos.length === 1 && todos[0]!.count === 1 ? todos[0] : undefined;
  return only?.contractId && only.orderId
    ? {
        path: ORDERS,
        query: { contractId: only.contractId, documentId: only.orderId },
      }
    : { path: ORDERS, query: { mine: 'true' } };
};
/** The buyer's work in order: each step leads into the next. */
export const purchasePipeline: PipelineStep[] = [
  {
    key: 'intake',
    label: '待接单',
    todos: ['intake'],
    hint: '外贸提交的申请',
    mine: true,
    target: task('intake'),
  },
  {
    key: 'quote',
    label: '待报价',
    todos: ['quote'],
    hint: '找供应商询价',
    mine: true,
    target: task('quote'),
  },
  {
    key: 'order',
    label: '待下单',
    todos: ['plan', 'order'],
    hint: '有报价，选价下单',
    mine: true,
    target: task('plan'),
  },
  {
    key: 'sign',
    label: '待签回',
    todos: ['sign'],
    hint: '合同未签回',
    mine: true,
    target: ORDER_TODO_TARGET,
  },
  {
    key: 'transit',
    label: '在途',
    todos: ['transit'],
    hint: '等待到货入库',
    mine: false,
    target: ORDER_TODO_TARGET,
  },
  {
    key: 'pay',
    label: '待付款',
    todos: ['pay'],
    hint: '还有未付金额',
    mine: true,
    target: ORDER_TODO_TARGET,
  },
  {
    key: 'customs',
    label: '报关中',
    todos: ['customs'],
    hint: '进行中的批次',
    mine: true,
    target: () => ({ path: '/fdmprocurement/platform-customs' }),
  },
];
export function pipelineCounts(summary: PortalSummary | undefined) {
  return purchasePipeline.map((step) => {
    const todos = (summary?.todos ?? []).filter((todo) =>
      step.todos.includes(todo.key),
    );
    const count = todos.reduce(
      (sum, todo) => sum + (Number(todo.count) || 0),
      0,
    );
    const preview = todos.find((todo) => Number(todo.count) > 0)?.preview ?? '';
    return { ...step, count, preview, link: step.target(todos) };
  });
}
