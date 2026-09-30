import type { DocumentKind } from '../documents/model';
import type { WorkboardGroup, WorkboardLaunch } from './contract-workboard';

import type { BusinessRecord, Contract } from '#/api/fdmplatform';

import BigNumber from 'bignumber.js';

import { rows } from '../data';
import { nativeMoney } from '../documents/migration-display';
import { contractItemProgress } from './contract-progress';
import { contractQuickActionReason } from './contract-workflow';

export type MainlineState =
  | 'active'
  | 'closed'
  | 'done'
  | 'unknown'
  | 'waiting';
export type MainlineKey =
  | 'arrival'
  | 'contract'
  | 'invoice'
  | 'purchase'
  | 'receipt'
  | 'shipment';
export interface MainlineStage {
  key: MainlineKey;
  title: string;
  state: MainlineState;
  /** 0–100 only when every input is known; otherwise the stage shows 待核对. */
  percent?: number;
  summary: string;
  details: string[];
}
export type MainlineAction =
  | { action: string; kind: DocumentKind; type: 'quick' }
  | { kind: DocumentKind; type: 'documents' }
  | { launch: WorkboardLaunch; type: 'launch' }
  | { type: 'activate' }
  | { type: 'complete' }
  | { type: 'edit' };
export interface MainlineNext {
  title: string;
  description: string;
  department?: string;
  button?: string;
  action?: MainlineAction;
}

export const mainlineStateLabels: Record<MainlineState, string> = {
  active: '进行中',
  closed: '已取消',
  done: '已完成',
  unknown: '待核对',
  waiting: '未开始',
};

type Quantity = BigNumber | undefined;

function decimal(value: unknown): Quantity {
  if (
    (typeof value !== 'string' && typeof value !== 'number') ||
    String(value).trim() === ''
  )
    return undefined;
  const number = new BigNumber(String(value));
  return number.isFinite() ? number : undefined;
}
function sum(values: Quantity[]): Quantity {
  let total = new BigNumber(0);
  for (const value of values) {
    if (!value) return undefined;
    total = total.plus(value);
  }
  return total;
}
function text(value: BigNumber) {
  return value.toFixed(value.decimalPlaces() ?? 0);
}
function percentOf(done: BigNumber, total: BigNumber) {
  if (total.isLessThanOrEqualTo(0)) return undefined;
  return BigNumber.minimum(done.dividedBy(total), 1)
    .multipliedBy(100)
    .integerValue(BigNumber.ROUND_FLOOR)
    .toNumber();
}
function stateOf(percent: number | undefined): MainlineState {
  if (percent === undefined) return 'unknown';
  if (percent >= 100) return 'done';
  return percent > 0 ? 'active' : 'waiting';
}
const activeRecord = (record: BusinessRecord) =>
  !['CANCELLED', 'CLOSED'].includes(String(record.status));

interface ItemFacts {
  name: string;
  unit: string;
  quantity: Quantity;
  arranged: Quantity;
  received: Quantity;
  shipped: Quantity;
}

/** Only records matched to a contract product count; unmatched or standalone documents stay in 关联单据. */
function itemFacts(contract: Contract): ItemFacts[] {
  const lines = (contract.purchaseOrders ?? [])
    .filter((order) => activeRecord(order))
    .flatMap((order) => rows(order.lines));
  const assignments = (contract.assignments ?? []).filter(
    (assignment) => assignment.status !== 'CANCELLED',
  );
  return contractItemProgress(contract).map((item) => {
    const orderLines = lines.filter((line) => line.contractItemId === item.id);
    const own = assignments.filter(
      (assignment) =>
        assignment.contractItemId === item.id &&
        ['MAKE', 'STOCK'].includes(String(assignment.method)),
    );
    const produced = own
      .filter((assignment) => assignment.method === 'MAKE')
      .map((assignment) => {
        let completed = new BigNumber(0);
        for (const progress of rows(contract.productionProgress))
          if (progress.assignmentId === assignment.id) {
            const value = decimal(progress.completedQuantity);
            if (value) completed = BigNumber.maximum(completed, value);
          }
        return completed;
      });
    const stocked = own
      .filter((assignment) => assignment.method === 'STOCK')
      .map((assignment) => decimal(assignment.quantity));
    const ordered = orderLines.map((line) => {
      const quantity = decimal(line.quantity);
      const cancelled = decimal(line.cancelledQuantity ?? 0);
      return quantity && cancelled ? quantity.minus(cancelled) : undefined;
    });
    const arrived = orderLines.map((line) => {
      const value = decimal(line.arrivedQuantity ?? 0);
      const returned = decimal(line.returnedQuantity ?? 0);
      return value && returned ? value.minus(returned) : undefined;
    });
    return {
      name: String(item.skuName || item.skuCode || '产品'),
      unit: String(item.unit ?? ''),
      quantity: decimal(item.quantity),
      arranged: sum([...ordered, ...own.map((row) => decimal(row.quantity))]),
      received: sum([...arrived, ...produced, ...stocked]),
      shipped: decimal(item.shippedQuantity),
    };
  });
}

function quantityStage(
  key: MainlineKey,
  title: string,
  items: ItemFacts[],
  value: (item: ItemFacts) => Quantity,
  note: string,
): MainlineStage {
  if (items.length === 0)
    return {
      key,
      title,
      state: 'unknown',
      summary: '暂无产品明细',
      details: ['合同没有可核对的产品明细'],
    };
  let known = true;
  let ratio = new BigNumber(0);
  let complete = 0;
  const details: string[] = [];
  for (const item of items) {
    const done = value(item);
    if (!item.quantity || item.quantity.isLessThanOrEqualTo(0) || !done) {
      known = false;
      details.push(`${item.name}：数量待核对`);
      continue;
    }
    const clamped = BigNumber.maximum(done, 0);
    ratio = ratio.plus(BigNumber.minimum(clamped.dividedBy(item.quantity), 1));
    if (clamped.isGreaterThanOrEqualTo(item.quantity)) complete++;
    details.push(
      `${item.name}：${text(clamped)} / ${text(item.quantity)} ${item.unit}`.trim(),
    );
  }
  details.push(note);
  if (!known)
    return { key, title, state: 'unknown', summary: '数量待核对', details };
  const percent = ratio
    .dividedBy(items.length)
    .multipliedBy(100)
    .integerValue(BigNumber.ROUND_FLOOR)
    .toNumber();
  return {
    key,
    title,
    state: stateOf(percent),
    percent,
    summary: `${complete} / ${items.length} 项完成`,
    details,
  };
}

function contractStage(contract: Contract): MainlineStage {
  const details = [
    `合同金额：${nativeMoney(contract.amount, contract.currency)}`,
  ];
  if (contract.blockReasons?.length)
    return {
      key: 'contract',
      title: '合同',
      state: 'unknown',
      summary: '待补齐资料',
      details: [...details, ...contract.blockReasons],
    };
  const summaries: Record<string, [MainlineState, string]> = {
    DRAFT: ['active', '草稿待生效'],
    CONFIRMED: ['done', '已生效'],
    EXECUTING: ['done', '执行中'],
    CLOSED: ['done', '已结案'],
    CANCELLED: ['closed', '已取消'],
  };
  const [state, summary] = summaries[contract.status] ?? [
    'unknown',
    '状态待核对',
  ];
  return {
    key: 'contract',
    title: '合同',
    state,
    percent: state === 'done' ? 100 : undefined,
    summary,
    details,
  };
}

/** Amounts come only from the server ledger summary; unread or incomplete ledgers stay 待核对. */
function ledger(contract: Contract) {
  const summary = contract.financeSummary;
  if (
    !summary ||
    summary.complete === false ||
    (Array.isArray(summary.issues) && summary.issues.length > 0) ||
    !/^[A-Z]{3}$/.test(String(contract.currency ?? ''))
  )
    return undefined;
  const value = (key: string) => decimal(summary[key]);
  const confirmed = value('confirmedReceipts');
  const unpaid = value('unpaidAmount');
  if (!confirmed || !unpaid) return undefined;
  return {
    confirmed,
    unpaid,
    receivable: confirmed.plus(unpaid).minus(value('overpaidAmount') ?? 0),
    pending: value('pendingReceipts'),
    invoiced: value('effectiveInvoices'),
    bound: value('boundAmount'),
  };
}

function moneyStage(
  key: MainlineKey,
  title: string,
  contract: Contract,
  pick: (facts: NonNullable<ReturnType<typeof ledger>>) => {
    details: [string, BigNumber | undefined][];
    done: BigNumber | undefined;
  },
): MainlineStage {
  const facts = ledger(contract);
  const money = (value: BigNumber | undefined) =>
    value ? nativeMoney(value.toFixed(0), contract.currency) : '待核对';
  if (!facts)
    return {
      key,
      title,
      state: 'unknown',
      summary: contract.financeSummary ? '金额待核对' : '未读取',
      details: ['财务汇总未读取、币种未确认或存在待核对事项'],
    };
  const picked = pick(facts);
  const details = [
    `应收合计：${money(facts.receivable)}`,
    ...picked.details.map(([name, value]) => `${name}：${money(value)}`),
  ];
  if (!picked.done)
    return { key, title, state: 'unknown', summary: '金额待核对', details };
  const percent = percentOf(picked.done, facts.receivable);
  if (percent === undefined)
    return {
      key,
      title,
      state: 'unknown',
      summary: '应收为 0，待核对',
      details,
    };
  return {
    key,
    title,
    state: stateOf(percent),
    percent,
    summary: `${money(picked.done)}`,
    details,
  };
}

/** Upstream work already under way is 进行中 even while the measured amount is still zero. */
function begun(stage: MainlineStage, started: boolean): MainlineStage {
  return stage.state === 'waiting' && started
    ? { ...stage, state: 'active' }
    : stage;
}

export function contractMainline(contract: Contract): MainlineStage[] {
  const items = itemFacts(contract);
  const [purchase, arrival, shipment, receipt, invoice] = [
    quantityStage(
      'purchase',
      '采购',
      items,
      (item) => item.arranged,
      '外采按采购单数量（扣除取消），自产和库存按已分派数量。',
    ),
    quantityStage(
      'arrival',
      '到货',
      items,
      (item) => item.received,
      '外采按到货净数量（扣除退货），自产按累计完工，库存按已分派数量。',
    ),
    quantityStage(
      'shipment',
      '发货',
      items,
      (item) => item.shipped,
      '原已发货量与已匹配的发货、退货明细合计。',
    ),
    moneyStage('receipt', '回款', contract, (facts) => ({
      done: facts.confirmed,
      details: [
        ['已确认回款', facts.confirmed],
        ['待确认', facts.pending],
        ['未回款', facts.unpaid],
      ],
    })),
    moneyStage('invoice', '开票', contract, (facts) => ({
      done: facts.invoiced,
      details: [
        ['有效发票', facts.invoiced],
        ['已核销', facts.bound],
      ],
    })),
  ] as const;
  return [
    contractStage(contract),
    begun(
      purchase,
      (contract.requests ?? []).some(
        (request) => request.status === 'ACTIVE',
      ) ||
        (contract.assignments ?? []).some(
          (assignment) => assignment.status !== 'CANCELLED',
        ),
    ),
    begun(
      arrival,
      items.some((item) => item.arranged?.isGreaterThan(0)),
    ),
    shipment,
    begun(
      receipt,
      Boolean(
        decimal(contract.financeSummary?.pendingReceipts)?.isGreaterThan(0),
      ),
    ),
    invoice,
  ];
}

const groupDepartments: Record<string, string> = { receipt: '财务部门' };

function quick(
  contract: Contract,
  kind: DocumentKind,
  action: string,
  next: Omit<MainlineNext, 'action' | 'button'> & { button: string },
): MainlineNext {
  const reason = contractQuickActionReason(contract, action);
  return reason
    ? { ...next, button: undefined, description: reason }
    : { ...next, action: { type: 'quick', kind, action } };
}

/** One suggestion along the main line; every other entry stays available below. */
export function contractNextStep(
  contract: Contract,
  stages: MainlineStage[],
  groups: WorkboardGroup[],
): MainlineNext {
  const allowed = (action: string) => contract.allowedActions.includes(action);
  if (['CANCELLED', 'CLOSED'].includes(contract.status))
    return {
      title: '合同已结束',
      description: '可在“流程进度与关联单据”查看历史单据。',
    };
  if (contract.blockReasons?.length)
    return allowed('COMPLETE_IMPORTED_CONTRACT')
      ? {
          title: '补齐办理资料',
          description: contract.blockReasons.join('；'),
          department: '外贸部门',
          button: '补齐办理资料',
          action: { type: 'complete' },
        }
      : {
          title: '等待补齐办理资料',
          description: contract.blockReasons.join('；'),
        };
  if (contract.status === 'DRAFT') {
    const unpriced =
      contract.pricingComplete === false ||
      contract.items.some(
        (item) =>
          item.unitPrice === null ||
          item.unitPrice === undefined ||
          item.unitPrice === '',
      );
    if (unpriced && allowed('UPDATE_CONTRACT'))
      return {
        title: '补齐产品成交单价',
        description: '合同生效前需要每个产品都有成交单价。',
        department: '外贸部门',
        button: '编辑合同与产品',
        action: { type: 'edit' },
      };
    return allowed('CONFIRM_CONTRACT')
      ? {
          title: '确认合同并生效',
          description: '生效后即可提交采购申请、登记回款和安排发货。',
          department: '外贸部门',
          button: '合同生效',
          action: { type: 'activate' },
        }
      : {
          title: '等待合同生效',
          description: '草稿合同需由外贸部门确认生效。',
        };
  }
  const first = groups[0];
  if (first?.records.length) {
    const others =
      first.records.length -
      1 +
      groups.slice(1).reduce((total, group) => total + group.records.length, 0);
    return {
      title: first.title,
      description: `${first.records[0]!.title}${others > 0 ? `；另有 ${others} 项见下方“接下来可办理”` : ''}`,
      department: groupDepartments[first.key] ?? '采购部门',
      button: first.button,
      action: { type: 'launch', launch: first.records[0]!.launch },
    };
  }
  const stage = (key: MainlineKey) => stages.find((item) => item.key === key)!;
  const open = (key: MainlineKey) =>
    ['active', 'waiting'].includes(stage(key).state);
  if (open('purchase')) {
    const missing = contractItemProgress(contract).filter((item) => {
      const value = decimal(item.remainingRequestQuantity);
      return value?.isGreaterThan(0);
    }).length;
    if (missing > 0)
      return quick(contract, 'requests', 'CREATE_REQUEST', {
        title: '提交采购申请',
        description: `还有 ${missing} 项产品未提交采购申请。`,
        department: '外贸部门',
        button: '新建采购申请',
      });
    return {
      title: '等待采购部门安排',
      description: '采购申请已提交，采购部门在“采购待办”中分派、报价并下单。',
      department: '采购部门',
    };
  }
  if (open('arrival'))
    return {
      title: '等待到货',
      description: '采购单已下达，到货或完工后由采购部门登记。',
      department: '采购部门',
    };
  if (open('shipment'))
    return {
      title: '安排发货',
      description: '先预留库存，再按实际出货分批登记发货。',
      department: '工厂部门',
      button: '办理发货',
      action: { type: 'documents', kind: 'shipments' },
    };
  if (open('receipt'))
    return quick(contract, 'receipts', 'CREATE_RECEIPT', {
      title: '登记回款',
      description: '客户付款到账后登记，财务确认后计入已回款。',
      department: '财务部门',
      button: '登记回款',
    });
  if (open('invoice'))
    return quick(contract, 'invoices', 'CREATE_INVOICE', {
      title: '开具发票',
      description: '登记已开具的发票，再与回款核销。',
      department: '财务部门',
      button: '开票办理',
    });
  if (stages.some((item) => item.state === 'unknown'))
    return {
      title: '核对待确认数据',
      description: '部分环节数据待核对，悬停上方环节查看原因。',
    };
  return {
    title: '各环节已完成',
    description: '核对无误后可由销售经理办理结案。',
  };
}
