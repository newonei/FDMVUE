<script setup lang="ts">
import type { ActionDefinition } from '../../data';
import type { CompletionScope } from '../../documents/completion-scope';
import type { DocumentKind } from '../../documents/model';

import type { AttachmentView, Contract, DocumentRow } from '#/api/fdmplatform';
import type { MigrationInfo } from '#/api/fdmplatform/business-documents';
import type {
  CreatedProcurementOrders,
  ProcurementOrderRow,
  ProcurementOrdersOverview,
  ProcurementOrderView,
  PurchaseInvoice,
} from '#/api/fdmplatform/procurement';
import type { PurchaseReturn, StockIn } from '#/api/fdmplatform/warehouse';

import { computed, h, nextTick, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { formatDate } from '@vben/utils';

import {
  Alert,
  Button,
  Dropdown,
  Empty,
  Input,
  Menu,
  message,
  Modal,
  Progress,
  Space,
  Table,
  TableSummary,
  TableSummaryCell,
  TableSummaryRow,
  TabPane,
  Tabs,
  Tag,
} from 'ant-design-vue';

import {
  getAttachments,
  getContract,
  newIdempotencyKey,
} from '#/api/fdmplatform';
import {
  createdOrdersText,
  downloadProcurementFile,
  endProcurementOrder,
  exportProcurementOrder,
  getOrderInvoices,
  getProcurementOrder,
  getProcurementOrders,
  getProcurementOrdersOverview,
  procurementOrderAction,
  uploadProcurementSigned,
} from '#/api/fdmplatform/procurement';
import { getProcurementFinanceSummary } from '#/api/fdmplatform/procurement-finance';
import { getPurchaseReturns, getStockIns } from '#/api/fdmplatform/warehouse';
import { FdmResizableDrawer } from '#/components/fdm-resizable-drawer';

import ActionDialog from '../../components/ActionDialog.vue';
import AttachmentPanel from '../../components/AttachmentPanel.vue';
import CompletionScopeFilter from '../../components/CompletionScope.vue';
import ContractDocumentDialog from '../../components/ContractDocumentDialog.vue';
import RecordTable from '../../components/RecordTable.vue';
import { errorText, field, rows } from '../../data';
import BusinessDocumentDetail from '../../documents/BusinessDocumentDetail.vue';
import {
  completionFilter,
  defaultCompletionScope,
  scopeFromQuery,
} from '../../documents/completion-scope';
import DocumentAction from '../../documents/DocumentAction.vue';
import MigrationSource from '../../documents/MigrationSource.vue';
import { documentActionUnavailableReason } from '../../documents/model';
import {
  contractTarget,
  detailLocation,
  entityTarget,
  relatedDocumentLinks,
  resolveDocumentRow,
  standaloneLocation,
  withoutDetailQuery,
} from '../../documents/navigation';
import RecordDetail from '../../documents/RecordDetail.vue';
import RelatedLink from '../../documents/RelatedLink.vue';
import { useRouteOwner } from '../../documents/useRouteOwner';
import FinanceDocument from '../../finance/procurement/components/FinanceDocument.vue';
import OrderFinance from '../../finance/procurement/components/OrderFinance.vue';
import PaymentRecordDialog from '../../finance/procurement/components/PaymentRecordDialog.vue';
import { hasPayableBalance } from '../../finance/procurement/model';
import ProcurementPageHeader from '../components/ProcurementPageHeader.vue';
import ProcurementStatusBadge from '../components/ProcurementStatusBadge.vue';
import { localDate } from '../quotes/comparison';
import StockInDialog from '../warehouse/StockInDialog.vue';
import { batchOrders, batchProblem, batchSelectable } from './batch-model';
import BatchInvoiceDialog from './components/BatchInvoiceDialog.vue';
import BatchPaymentDialog from './components/BatchPaymentDialog.vue';
import OrderContract from './components/OrderContract.vue';
import OrderDetails from './components/OrderDetails.vue';
import OrderExportMenu from './components/OrderExportMenu.vue';
import OrderInvoices from './components/OrderInvoices.vue';
import OrderLines from './components/OrderLines.vue';
import OrderStockDocs from './components/OrderStockDocs.vue';
import OrderSubDocMenu from './components/OrderSubDocMenu.vue';
import OrderSummaryCards from './components/OrderSummaryCards.vue';
import OrderTimeline from './components/OrderTimeline.vue';
import PurchaseOrderEditor from './components/PurchaseOrderEditor.vue';
import StandaloneOrderFiles from './components/StandaloneOrderFiles.vue';
import {
  canRecordOrderArrival,
  canReturnOrderArrival,
  downloadBlob,
  orderArrivalProgress,
  orderCopySource,
  orderDetailsPayload,
  orderMoney,
  orderPaymentProgress,
  orderRowDue,
  orderRowFlags,
  purchaseRowLabels,
} from './model';

import '../../components/compact-tables.css';
import '../components/procurement.css';

/**
 * 嵌入模式（金智式「下属单据」弹窗）：合同订单等页面直接弹出同一个采购单执行抽屉，
 * 只渲染抽屉和它的子弹窗，不渲染列表；关闭和变化通知调用方。
 */
const props = defineProps<{
  embeddedOrder?: { contractId: string; orderId: string };
}>();
const emit = defineEmits<{ close: []; updated: [] }>();
const route = useRoute();
const router = useRouter();
const embedded = computed(() => !!props.embeddedOrder);
const active = useRouteOwner();
const records = ref<ProcurementOrderRow[]>([]);
/**
 * 列表批量操作（金智「选中付款 / 转入库单 / 选中结束」）：只对新系统采购单，金智历史单不可选。
 * 选择只在当前页有效，翻页或筛选后清空。
 */
const selectedKeys = ref<string[]>([]);
const selectedOrders = computed(() =>
  batchOrders(
    records.value.filter((row) =>
      selectedKeys.value.includes(String(row.standaloneId ?? row.id)),
    ),
  ),
);
const batchPaymentOpen = ref(false);
const batchInvoiceOpen = ref(false);
const batchStockInTargets =
  ref<{ code: string; contractId: string; orderId: string }[]>();
function runBatch(mode: 'end' | 'invoice' | 'payment' | 'stockIn') {
  const problem = batchProblem(selectedOrders.value, mode);
  if (problem) {
    message.warning(problem);
    return;
  }
  const active = selectedOrders.value.filter((order) => !order.ended);
  if (mode === 'payment') batchPaymentOpen.value = true;
  else if (mode === 'invoice') batchInvoiceOpen.value = true;
  else if (mode === 'stockIn')
    batchStockInTargets.value = active.map((order) => ({
      code: order.code,
      contractId: order.contractId,
      orderId: order.orderId,
    }));
  else endSelected(active);
}
function endSelected(orders: ReturnType<typeof batchOrders>) {
  let reason = '';
  const key = crypto.randomUUID();
  Modal.confirm({
    title: `结束 ${orders.length} 张采购单？`,
    content: () =>
      h('div', [
        h(
          'p',
          '未到货的余额全部取消，不再入库；已到货、已付款的记录保留。有未付请款的单会被拦下。',
        ),
        h(Input, {
          placeholder: '结束原因（必填），如：供应商停产、改由其他供应商',
          'onUpdate:value': (value: string) => {
            reason = value;
          },
        }),
      ]),
    okText: '结束',
    okButtonProps: { danger: true },
    onOk: async () => {
      if (!reason.trim()) {
        message.error('请填写结束原因');
        throw new Error('missing reason');
      }
      const failed: string[] = [];
      let ended = 0;
      for (const order of orders) {
        try {
          const lines = await endProcurementOrder(
            order.contractId,
            order.orderId,
            {
              reason: reason.trim(),
              idempotencyKey: `${key}:${order.key}`,
            },
          );
          if (lines > 0) ended += 1;
        } catch (error) {
          failed.push(`${order.code}：${errorText(error)}`);
        }
      }
      if (ended > 0) message.success(`已结束 ${ended} 张采购单`);
      if (failed.length > 0)
        Modal.warning({
          title: '部分采购单没有结束',
          content: failed.join('\n'),
        });
      selectedKeys.value = [];
      void loadList();
    },
  });
}
function batchDone() {
  batchPaymentOpen.value = false;
  batchInvoiceOpen.value = false;
  batchStockInTargets.value = undefined;
  selectedKeys.value = [];
  void loadList();
}
const total = ref(0);
const page = ref(Number(route.query.page) || 1);
const keyword = ref(
  typeof route.query.keyword === 'string' ? route.query.keyword : '',
);
const status = ref<string | undefined>(
  typeof route.query.status === 'string' ? route.query.status : undefined,
);
type Operation = 'COMPLETED' | 'ENDED' | 'IN_PROGRESS';
const operation = ref<Operation | undefined>(
  ['COMPLETED', 'ENDED', 'IN_PROGRESS'].includes(String(route.query.operation))
    ? (route.query.operation as Operation)
    : undefined,
);
const mine = ref(route.query.mine === 'true');
const loading = ref(false);
const detailLoading = ref(false);
const saving = ref(false);
const pageError = ref('');
const listError = ref('');
const view = ref<ProcurementOrderView>();
const contract = ref<Contract>();
const migration = computed(
  () => view.value?.order.migration as MigrationInfo | undefined,
);
const actionOpen = ref(false);
const createAction = ref<string>();
const createKind = ref<DocumentKind>('orders');
const plansOpen = ref(false);
const nestedFinanceBusy = ref(false);
const contactEditorBusy = ref(false);
const arrivalId = ref<string>();
const financeType = ref<'REIMBURSEMENT'>();
/** 登记付款记录（每付一笔一张，分期就是多张） */
const paymentOpen = ref(false);
const financeRevision = ref(0);
const financeSummary = ref<Record<string, unknown>>({});
const financeLoading = ref(false);
const financeError = ref('');
let financeSequence = 0;
const childOpen = computed(
  () =>
    actionOpen.value ||
    !!createAction.value ||
    plansOpen.value ||
    reasonOpen.value ||
    !!financeType.value ||
    paymentOpen.value ||
    !!arrivalId.value ||
    stockInOpen.value ||
    editorOpen.value ||
    nestedFinanceBusy.value ||
    contactEditorBusy.value ||
    saving.value,
);
const reasonOpen = ref(false);
const reasonDefinition = ref<ActionDefinition>();
const orderAttachments = ref<AttachmentView>();
const attachmentsLoading = ref(false);
const attachmentsError = ref('');
const commandKeys = new Map<string, string>();
const historyActionNames: Record<string, string> = {
  SAVE_DETAILS: '保存采购资料',
  CONFIRM_DETAILS: '确认采购资料',
  WITHDRAW_DETAILS: '撤回并编辑',
  REVISE_DETAILS: '新建资料变更版本',
};
const historyRows = computed(() =>
  (view.value?.history ?? []).map((entry) => ({
    ...entry,
    action: historyActionNames[String(entry.action)] ?? entry.action,
    occurredAt:
      formatDate(
        entry.occurredAt === null || entry.occurredAt === undefined
          ? undefined
          : String(entry.occurredAt),
        'YYYY-MM-DD HH:mm',
      ) || '—',
  })),
);
let sequence = 0;
let listSequence = 0;
let listQueryKey = '';
const selection = ref<{ contractId: string; documentId: string }>();
const localStandaloneId = ref<string>();
const localTab = ref('details');
let selectionTrigger: HTMLElement | undefined;
const detailId = computed(
  () =>
    selection.value?.documentId ??
    (typeof route.query.documentId === 'string'
      ? route.query.documentId
      : undefined),
);
const standaloneId = computed(
  () =>
    localStandaloneId.value ??
    (typeof route.query.standaloneId === 'string'
      ? route.query.standaloneId
      : undefined),
);
const contractId = computed(() =>
  typeof route.query.contractId === 'string'
    ? route.query.contractId
    : undefined,
);
const scope = ref<CompletionScope>(
  scopeFromQuery(route.query.scope) ?? defaultCompletionScope(contractId.value),
);
const pendingTotal = ref(0);
let pendingSequence = 0;
/** Only the queue size; it decides whether the scope switch is shown at all. */
async function loadPendingTotal() {
  if (embedded.value || !active.value) return;
  const run = ++pendingSequence;
  try {
    const result = await getProcurementOrders({
      contractId: contractId.value,
      pageNo: 1,
      pageSize: 1,
      pendingCompletion: true,
    });
    if (run === pendingSequence) pendingTotal.value = result.total;
  } catch {
    if (run === pendingSequence) pendingTotal.value = 0;
  }
}
function changeScope() {
  page.value = 1;
  void loadList();
}
const tab = computed({
  get: () => {
    let value = 'details';
    if (selection.value) value = localTab.value;
    else if (typeof route.query.tab === 'string') value = route.query.tab;
    // 「采购单模板」页签已撤，旧链接落到附件里的导出记录
    return value === 'contract' ? 'attachments' : value;
  },
  set: (tab: string) => {
    if (selection.value) localTab.value = tab;
    else void router.replace({ query: { ...route.query, tab } });
  },
});
const arrivalProgress = computed(() =>
  view.value ? orderArrivalProgress(view.value.order) : [],
);
const arrivalRows = computed(() =>
  rows(contract.value?.arrivals).filter(
    (entry) => entry.orderId === view.value?.id,
  ),
);
/** 没有采购入库单的到货（如工厂以前的外采到货 DH…），入库比例算它们，入库单页签单独列出。 */
const otherArrivals = computed(() =>
  arrivalRows.value.filter(
    (entry) => !String(entry.evidenceRef ?? '').startsWith('stock-in:'),
  ),
);
const arrivalRow = computed(() =>
  contract.value && arrivalId.value
    ? resolveDocumentRow(contract.value, 'arrivals', arrivalId.value)
    : undefined,
);
/** 选了收货工厂的采购单由工厂在「到货入库」确认收货，采购仓库不再入库。 */
const receiveFactory = computed(() =>
  view.value?.order.receiveFactoryId
    ? String(view.value.order.receiveFactoryName ?? '收货工厂')
    : '',
);
/** 「入库单」不能点时的说明。 */
const stockInHint = computed(() => {
  if (receiveFactory.value)
    return `由「${receiveFactory.value}」在到货入库里确认收货`;
  return canReceive.value ? undefined : '没有未入库的数量';
});
/** 外采到货由采购在这里开采购入库单，不再进工厂的工序库存。 */
const canReceive = computed(
  () =>
    !!view.value &&
    !receiveFactory.value &&
    (standaloneOrder(view.value.contractId) ||
      ['CONFIRMED', 'EXECUTING'].includes(String(contract.value?.status))) &&
    canRecordOrderArrival(view.value.order),
);
const stockInOpen = ref(false);
/** 不关联合同的采购单：contractId 为空或占位 standalone。 */
function standaloneOrder(id: string | undefined) {
  return !id || id === 'standalone';
}
const editorOpen = ref(false);
/** 「⋯」菜单复制时的原采购单；新建时为空 */
const copySource = ref<{ contractId: string; orderId: string }>();
function openEditor(source?: { contractId: string; orderId: string }) {
  if (childOpen.value) return;
  copySource.value = source;
  editorOpen.value = true;
}
/** 每行「⋯」菜单：对这张采购单的操作，目前只有复制。 */
function rowMenu(row: ProcurementOrderRow) {
  return [
    {
      key: 'copy',
      label: orderCopySource(row) ? '复制' : '复制（金智历史单不能复制）',
      disabled: !orderCopySource(row),
    },
  ];
}
function rowMenuClick(row: ProcurementOrderRow, key: string) {
  if (key === 'copy') openEditor(orderCopySource(row));
}
/** 收票合计（抽屉摘要卡）；收票页签改动后重新读 */
const invoicedTotal = ref<string>();
/** 下属单据（时间线、页签数量用）：付款发票、入库单、退货单 */
const orderInvoiceList = ref<PurchaseInvoice[]>([]);
const orderStockIns = ref<StockIn[]>([]);
const orderReturns = ref<PurchaseReturn[]>([]);
async function loadInvoiced() {
  const current = view.value;
  if (!current) return;
  const [invoices, stockIns, returns] = await Promise.allSettled([
    getOrderInvoices(current.contractId, current.id),
    getStockIns({ pageNo: 1, pageSize: 100, orderId: current.id }),
    getPurchaseReturns({ pageNo: 1, pageSize: 100, orderId: current.id }),
  ]);
  if (view.value?.id !== current.id) return;
  if (invoices.status === 'fulfilled') {
    invoicedTotal.value = String(invoices.value.invoicedAmount);
    orderInvoiceList.value = invoices.value.invoices;
  } else {
    invoicedTotal.value = undefined;
    orderInvoiceList.value = [];
  }
  orderStockIns.value =
    stockIns.status === 'fulfilled' ? stockIns.value.list : [];
  orderReturns.value = returns.status === 'fulfilled' ? returns.value.list : [];
}
function rowFlags(row: ProcurementOrderRow) {
  return orderRowFlags(row, receivedNames);
}
/** 本页合计（金智列表底部）：采购金额、未付，按币种分开 */
const pageTotals = computed(() => {
  const sum = (field: 'orderAmount' | 'unpaidAmount') => {
    const totals = new Map<string, number>();
    for (const row of records.value as ProcurementOrderRow[]) {
      const value = Number(
        field === 'orderAmount'
          ? (row.orderAmount ?? row.record.amount)
          : row.unpaidAmount,
      );
      if (!Number.isFinite(value)) continue;
      const currency = String(row.record.currency ?? 'CNY');
      totals.set(currency, (totals.get(currency) ?? 0) + value);
    }
    return (
      [...totals.entries()]
        .map(([currency, value]) => orderMoney(value, currency))
        .join(' / ') || '—'
    );
  };
  return { amount: sum('orderAmount'), unpaid: sum('unpaidAmount') };
});
/** 「下属单据新建」：按部门分组，从采购单直接新建并自动关联 */
const subDocItems = computed(() => {
  const order = view.value?.order;
  const payable = hasPayableBalance(
    financeSummary.value.availablePaymentAmount,
  );
  const returnable =
    !!order &&
    !!contract.value?.allowedActions.includes('RETURN_ARRIVAL') &&
    canReturnOrderArrival(order);
  return [
    {
      key: 'payment',
      label: '付款记录',
      group: '采购',
      disabled: !payable,
      title: payable ? undefined : '已付清，或付款摘要未读取',
    },
    { key: 'invoice', label: '付款发票', group: '采购' },
    ...(contract.value?.allowedActions.includes('RETURN_ARRIVAL')
      ? [
          {
            key: 'return',
            label: '采购退货单',
            group: '采购',
            disabled: !returnable,
            title: returnable ? undefined : '当前订单没有可退到货数量',
          },
        ]
      : []),
    {
      key: 'stockIn',
      label: '入库单',
      group: '库存',
      disabled: !canReceive.value,
      title: stockInHint.value,
    },
    { key: 'reimbursement', label: '费用报销', group: '办公' },
  ];
});
function pickSubDoc(key: string) {
  if (childOpen.value) return;
  if (key === 'payment') openPayment();
  else if (key === 'invoice') tab.value = 'invoices';
  else if (key === 'return') createRelated('purchaseReturns', 'RETURN_ARRIVAL');
  else if (key === 'stockIn') stockInOpen.value = true;
  else if (key === 'reimbursement') openFinance('REIMBURSEMENT');
}
/** 页签上的下属单据数量（金智：付款记录 (1)、入库单 (1)…） */
const subDocCounts = computed(() => {
  const payments = Array.isArray(financeSummary.value.payments)
    ? financeSummary.value.payments.length
    : 0;
  const invoices = orderInvoiceList.value.length;
  const stock =
    orderStockIns.value.length +
    orderReturns.value.length +
    otherArrivals.value.length;
  return { payments, invoices, stock, all: payments + invoices + stock };
});
function counted(label: string, count: number) {
  return count > 0 ? `${label} (${count})` : label;
}
const arrivalPercent = computed(() => {
  const groups = arrivalProgress.value.filter(
    (group) => group.percent !== undefined,
  );
  if (groups.length === 0) return undefined;
  return Math.round(
    groups.reduce((sum, group) => sum + Number(group.percent), 0) /
      groups.length,
  );
});
/** 采购终止（金智同款）：未到货余额全部取消，已到货、已付款的保留 */
function endCurrentOrder() {
  const current = view.value;
  if (!current || childOpen.value) return;
  let reason = '';
  Modal.confirm({
    title: `结束采购单 ${purchaseRowLabels({ ...current, record: current.order }).order}？`,
    content: () =>
      h('div', [
        h(
          'p',
          '未到货的余额全部取消，不再入库；已到货、已付款的记录保留。有未付请款的单会被拦下。',
        ),
        h(Input, {
          placeholder: '结束原因（必填）',
          'onUpdate:value': (value: string) => {
            reason = value;
          },
        }),
      ]),
    okText: '结束',
    okButtonProps: { danger: true },
    onOk: async () => {
      if (!reason.trim()) {
        message.error('请填写结束原因');
        throw new Error('missing reason');
      }
      try {
        const lines = await endProcurementOrder(
          current.contractId,
          current.id,
          {
            reason: reason.trim(),
            idempotencyKey: key('END_ORDER'),
          },
        );
        message.success(lines > 0 ? '采购单已结束' : '没有需要结束的余额');
        await Promise.all([refreshFacts(), loadList()]);
      } catch (error) {
        message.error(errorText(error));
        throw error;
      }
    },
  });
}
async function invoicesChanged() {
  await refreshFacts();
  void loadList();
}
function editorSaved(value: CreatedProcurementOrders) {
  editorOpen.value = false;
  message.success(createdOrdersText(value));
  void loadList();
  localTab.value = 'details';
  selection.value = {
    contractId: value.contractId || 'standalone',
    documentId: value.orderId,
  };
}
function stockInSaved(value: StockIn) {
  stockInOpen.value = false;
  message.success(
    value.directShip
      ? `已入库 ${value.code}，并直发出库 ${value.stockOutCode}`
      : `已入库 ${value.code}`,
  );
  void refreshFacts();
  void loadList();
}
/**
 * 采购单下属单据各自独立（模板、入库、付款没有先后），这里只汇总各自进度。
 * 采购单模板：下单资料确认后可生成 Word，盖章件为选填附件。
 */
const templateState = computed(() => {
  if (!view.value) return undefined;
  const words = view.value.exports?.length ?? 0;
  const signed = (view.value.files ?? []).filter(
    (file) => file.kind === 'SIGNED',
  ).length;
  if (view.value.details.status !== 'CONFIRMED')
    return { label: '下单资料未确认', sub: '确认后可在右上角导出' };
  if (words === 0)
    return { label: '可导出', sub: '右上角「导出」PDF / Word / Excel' };
  return {
    label: `已生成 ${words} 版`,
    sub: signed > 0 ? `已上传盖章件 ${signed} 份` : '盖章件选填',
  };
});
/** 与后端统计同一天（中国时区），列表倒计时和顶部超期数才对得上。 */
const today = computed(() => overview.value?.asOf ?? localDate());
const selectedIndex = computed(() =>
  records.value.findIndex((row) => row.id === view.value?.id),
);
const financeContext = computed(() => ({
  contractId: view.value?.contractId,
  orderId: view.value?.id,
  currency: financeSummary.value.currency ?? view.value?.order.currency,
}));
const previousPayments = computed(() =>
  Array.isArray(financeSummary.value.payments)
    ? (financeSummary.value.payments as Array<Record<string, unknown>>)
    : [],
);

async function loadFinanceSummary() {
  const current = view.value;
  if (!current || !active.value) return;
  const run = ++financeSequence;
  financeLoading.value = true;
  financeError.value = '';
  try {
    const value = await getProcurementFinanceSummary(
      current.contractId,
      current.id,
    );
    if (
      run === financeSequence &&
      current.id === view.value?.id &&
      active.value
    )
      financeSummary.value = value;
  } catch (error) {
    if (run === financeSequence && current.id === view.value?.id)
      financeError.value = errorText(error);
  } finally {
    if (run === financeSequence) financeLoading.value = false;
  }
}
function openFinance(type: 'REIMBURSEMENT') {
  if (childOpen.value || !view.value) return;
  financeType.value = type;
}
function openPayment() {
  if (
    childOpen.value ||
    !view.value ||
    !hasPayableBalance(financeSummary.value.availablePaymentAmount)
  )
    return;
  paymentOpen.value = true;
}
async function paymentSaved(record: { code: string }) {
  paymentOpen.value = false;
  message.success(`已登记付款 ${record.code}`);
  financeRevision.value += 1;
  await financeChanged();
}
async function financeChanged() {
  await Promise.all([refreshFacts(), loadList()]);
}
async function loadOrderAttachments() {
  const current = view.value;
  // 独立采购单的附件由 StandaloneOrderFiles 读自己的单据附件
  if (!current || !active.value || standaloneOrder(current.contractId)) return;
  attachmentsLoading.value = true;
  attachmentsError.value = '';
  try {
    const value = await getAttachments(current.contractId, {
      targetKind: 'purchaseOrders',
      targetId: current.id,
    });
    if (view.value?.id === current.id && active.value)
      orderAttachments.value = value;
  } catch (error) {
    if (view.value?.id === current.id && active.value)
      attachmentsError.value = errorText(error);
  } finally {
    if (view.value?.id === current.id) attachmentsLoading.value = false;
  }
}
watch(
  () => [view.value?.id, tab.value, active.value],
  () => {
    orderAttachments.value = undefined;
    if (tab.value === 'attachments') void loadOrderAttachments();
  },
);
const links = computed(() =>
  view.value && contract.value
    ? relatedDocumentLinks(contract.value, 'orders', view.value.order)
    : [],
);
const mainLinks = computed(() =>
  links.value.filter(
    (link) =>
      link.target.type === 'contract' ||
      link.target.type === 'customer' ||
      link.target.type === 'supplier' ||
      (link.target.type === 'document' &&
        ['plans', 'requests'].includes(link.target.kind)),
  ),
);
const productLinks = computed(() =>
  links.value.filter((link) => !mainLinks.value.includes(link)),
);
const recordRow = computed(() =>
  view.value && contract.value
    ? resolveDocumentRow(contract.value, 'orders', view.value.id)
    : undefined,
);
const cancelReason = computed(() =>
  view.value && contract.value
    ? documentActionUnavailableReason(
        contract.value,
        'CANCEL_ORDER',
        view.value.order,
      )
    : undefined,
);
function key(action: string) {
  let id = commandKeys.get(action);
  if (!id) {
    id = newIdempotencyKey();
    commandKeys.set(action, id);
  }
  return id;
}
const overview = ref<ProcurementOrdersOverview>();
let overviewSequence = 0;
/** Native orders only; refreshed with the list so the cards follow 只看我负责的. */
async function loadOverview() {
  if (embedded.value) return;
  const run = ++overviewSequence;
  try {
    const result = await getProcurementOrdersOverview(mine.value);
    if (run === overviewSequence) overview.value = result;
  } catch {
    if (run === overviewSequence) overview.value = undefined;
  }
}
function amountLines(amounts?: Record<string, number | string>) {
  return Object.entries(amounts ?? {})
    .filter(([, value]) => Number(value) !== 0)
    .map(([currency, value]) => orderMoney(value, currency));
}
const attentionClass: Record<string, string> = {
  OVERDUE: 'is-overdue',
  UNSIGNED: 'is-unsigned',
  ARRIVED_UNPAID: 'is-unpaid',
};
const attentionNames: Record<string, string> = {
  OVERDUE: '超期未到',
  UNSIGNED: '合同未签回',
  ARRIVED_UNPAID: '已到货未付',
};
function openAttention(row: ProcurementOrdersOverview['attention'][number]) {
  openRow({ contractId: row.contractId, id: row.orderId } as DocumentRow);
}
function showOperation(value?: Operation) {
  operation.value = operation.value === value ? undefined : value;
  page.value = 1;
  void loadList();
}
const operationNames: Record<Operation, { color: string; label: string }> = {
  IN_PROGRESS: { label: '进行中', color: 'processing' },
  COMPLETED: { label: '已完成', color: 'success' },
  ENDED: { label: '已结束', color: 'default' },
};
const receivedNames: Record<string, string> = {
  NONE: '未入库',
  PARTIAL: '部分入库',
  ALL: '已入齐',
};
async function loadList() {
  if (embedded.value) {
    emit('updated');
    return;
  }
  if (!active.value) return;
  selectedKeys.value = selectedKeys.value.filter((key) =>
    records.value.some((row) => String(row.standaloneId ?? row.id) === key),
  );
  void loadOverview();
  const run = ++listSequence;
  const params = {
    contractId: contractId.value,
    pageNo: page.value,
    pageSize: 10,
    keyword: keyword.value || undefined,
    status: status.value,
    operation: operation.value,
    mine: mine.value || undefined,
    pendingCompletion: completionFilter(scope.value),
  };
  const queryKey = JSON.stringify(params);
  if (queryKey !== listQueryKey) {
    records.value = [];
    total.value = 0;
    listQueryKey = queryKey;
  }
  loading.value = true;
  listError.value = '';
  try {
    const result = await getProcurementOrders(params);
    if (run === listSequence && active.value) {
      records.value = result.list;
      total.value = result.total;
    }
  } catch (error) {
    if (run === listSequence) listError.value = errorText(error);
  } finally {
    if (run === listSequence) loading.value = false;
  }
}
async function loadDetail() {
  const run = ++sequence;
  view.value = undefined;
  contract.value = undefined;
  actionOpen.value = false;
  reasonOpen.value = false;
  pageError.value = '';
  createAction.value = undefined;
  plansOpen.value = false;
  arrivalId.value = undefined;
  stockInOpen.value = false;
  financeType.value = undefined;
  paymentOpen.value = false;
  financeSummary.value = {};
  financeSequence++;
  if (!active.value) return;
  try {
    if (!selection.value && standaloneLocation(route.query)) return;
    const target = selection.value ?? detailLocation(route.query);
    if (!target) return;
    detailLoading.value = true;
    const [value, parent] = await Promise.all([
      getProcurementOrder(target.contractId, target.documentId),
      standaloneOrder(target.contractId)
        ? Promise.resolve(undefined)
        : getContract(target.contractId),
    ]);
    if (run !== sequence || !active.value) return;
    view.value = value;
    contract.value = parent;
    commandKeys.clear();
    void loadFinanceSummary();
    invoicedTotal.value = undefined;
    void loadInvoiced();
  } catch (error) {
    if (run === sequence)
      pageError.value = `无法打开采购单：${errorText(error)}`;
  } finally {
    if (run === sequence) detailLoading.value = false;
  }
}
async function refreshFacts() {
  if (!view.value) return;
  const currentId = view.value.id;
  try {
    const [value, parent] = await Promise.all([
      getProcurementOrder(view.value.contractId, currentId),
      standaloneOrder(view.value.contractId)
        ? Promise.resolve(undefined)
        : getContract(view.value.contractId),
    ]);
    if (view.value?.id === currentId) {
      view.value = value;
      contract.value = parent;
      void loadFinanceSummary();
      void loadInvoiced();
    }
  } catch (error) {
    pageError.value = errorText(error);
  }
}
function createRelated(kind: DocumentKind, action: string) {
  if (!active.value || childOpen.value) return;
  createKind.value = kind;
  createAction.value = action;
}
async function created(value: Contract) {
  if (
    !active.value ||
    ((view.value?.contractId ?? contractId.value) &&
      value.id !== (view.value?.contractId ?? contractId.value))
  )
    return;
  createAction.value = undefined;
  if (view.value) await refreshFacts();
  await loadList();
}
async function plansChanged(value: Contract) {
  if (!active.value || value.id !== view.value?.contractId) return;
  await refreshFacts();
}
function openRow(row: DocumentRow, selectedTab = 'details', event?: Event) {
  if (childOpen.value) return;
  selectionTrigger =
    event?.currentTarget instanceof HTMLElement
      ? event.currentTarget
      : undefined;
  // 新建的独立采购单（不关联合同）走完整采购单抽屉；金智迁入的历史单仍是补齐页
  const native =
    !!row.standaloneId &&
    (row as ProcurementOrderRow).nativeStandalone === true;
  if (row.standaloneId && !native) {
    localStandaloneId.value = row.standaloneId;
    return;
  }
  if (native) {
    localTab.value = selectedTab;
    selection.value = {
      contractId: 'standalone',
      documentId: row.standaloneId!,
    };
    return;
  }
  localTab.value = selectedTab;
  selection.value = { contractId: row.contractId, documentId: row.id };
}
function selectAdjacent(offset: number) {
  const row = records.value[selectedIndex.value + offset];
  if (row) openRow(row);
}
async function back() {
  if (childOpen.value) return;
  if (embedded.value) {
    emit('close');
    return;
  }
  const wasLocal = !!selection.value || !!localStandaloneId.value;
  selection.value = undefined;
  localStandaloneId.value = undefined;
  if (!wasLocal || route.query.documentId || route.query.standaloneId) {
    const query = withoutDetailQuery(route.query);
    delete query.tab;
    await router.replace({ query });
  }
  await nextTick();
  selectionTrigger?.focus();
}
async function clear() {
  page.value = 1;
  keyword.value = '';
  status.value = undefined;
  operation.value = undefined;
  mine.value = false;
  if (Object.keys(route.query).length > 0) await router.replace({ query: {} });
  void loadList();
}
async function command(
  action: string,
  payload: Record<string, unknown> = {},
  operationKey = key(action),
) {
  if (!view.value) return;
  saving.value = true;
  pageError.value = '';
  try {
    const args = {
      expectedVersion: view.value.details.version,
      contractVersion: view.value.version,
      idempotencyKey: operationKey,
    };
    const previousExports = new Set(view.value.exports.map((file) => file.id));
    const value =
      action === 'EXPORT_CONTRACT'
        ? await exportProcurementOrder(view.value.contractId, view.value.id, {
            ...args,
            format: String(payload.format ?? 'DOCX') as 'DOCX' | 'PDF' | 'XLSX',
          })
        : await procurementOrderAction(view.value.contractId, view.value.id, {
            ...args,
            action,
            payload: orderDetailsPayload(payload),
          });
    view.value = value;
    if (action === 'EXPORT_CONTRACT') {
      const file =
        value.exports.find((entry) => !previousExports.has(entry.id)) ??
        value.exports.at(-1);
      if (file)
        downloadBlob(
          await downloadProcurementFile(value.contractId, value.id, file.id),
          file.name,
        );
    }
    commandKeys.delete(action);
    reasonOpen.value = false;
    let successMessage = '采购资料已更新';
    if (action === 'WITHDRAW_DETAILS' || action === 'REVISE_DETAILS')
      successMessage = '已进入资料草稿，可直接编辑';
    else if (action === 'CONFIRM_DETAILS')
      successMessage = '下单资料已确认，可在右上角「导出」生成采购单';
    else if (action === 'SAVE_DETAILS') successMessage = '草稿已保存';
    else if (action === 'EXPORT_CONTRACT')
      successMessage = '采购单已导出，导出记录在「附件」页签';
    message.success(successMessage);
    void loadList();
  } catch (error) {
    pageError.value = errorText(error);
  } finally {
    saving.value = false;
  }
}
function action(name: string) {
  if (['REVISE_DETAILS', 'WITHDRAW_DETAILS'].includes(name)) {
    reasonDefinition.value = {
      action: name,
      title: name === 'REVISE_DETAILS' ? '新建资料变更版本' : '撤回并编辑',
      description:
        name === 'REVISE_DETAILS'
          ? '保留原采购执行及已付事实，仅建立联系人、交货、签约资料的新版本。'
          : '撤回仅开放附加资料字段，已有执行事实时按后台条件阻断。',
      fields: [field('reason', '原因', 'textarea')],
    };
    reasonOpen.value = true;
  } else void command(name);
}
async function upload(file: File, exportId: string) {
  if (!view.value) return;
  saving.value = true;
  pageError.value = '';
  try {
    view.value = await uploadProcurementSigned(
      view.value.contractId,
      view.value.id,
      file,
      {
        exportId,
        expectedVersion: view.value.details.version,
        contractVersion: view.value.version,
        idempotencyKey: key('UPLOAD_SIGNED'),
      },
    );
    commandKeys.delete('UPLOAD_SIGNED');
    message.success('签章版本已保存');
  } catch (error) {
    pageError.value = errorText(error);
  } finally {
    saving.value = false;
  }
}
watch(
  () => [
    active.value,
    detailId.value,
    selection.value?.contractId,
    route.query.contractId,
  ],
  () => {
    createAction.value = undefined;
    plansOpen.value = false;
    actionOpen.value = false;
    reasonOpen.value = false;
    financeType.value = undefined;
    paymentOpen.value = false;
    arrivalId.value = undefined;
    stockInOpen.value = false;
    if (detailId.value) void loadDetail();
    else {
      view.value = undefined;
      contract.value = undefined;
      sequence++;
      financeSequence++;
      financeSummary.value = {};
    }
  },
  { immediate: true, flush: 'post' },
);
watch(
  () => [active.value, route.query.contractId],
  (next, previous) => {
    if (previous && next[1] !== previous[1]) {
      scope.value = defaultCompletionScope(contractId.value);
      pendingTotal.value = 0;
    }
    void loadList();
    void loadPendingTotal();
  },
  { immediate: true },
);
watch(
  () => [
    route.query.documentId,
    route.query.standaloneId,
    route.query.contractId,
  ],
  () => {
    if (embedded.value) return;
    selection.value = undefined;
    localStandaloneId.value = undefined;
  },
);
watch(
  () => props.embeddedOrder,
  (order) => {
    if (!order) return;
    localTab.value = 'details';
    selection.value = {
      contractId: order.contractId || 'standalone',
      documentId: order.orderId,
    };
  },
  { immediate: true },
);
watch(financeType, (value, previous) => {
  if (!value && previous) financeRevision.value++;
});
</script>
<template>
  <component
    :is="embedded ? 'div' : Page"
    v-bind="embedded ? {} : { autoContentHeight: true }"
  >
    <div v-if="!embedded" class="procurement-workspace order-workspace">
      <ProcurementPageHeader
        title="采购订单"
        description="跟进交付与付款，在当前订单直接办理关联业务。"
      >
        <template #actions>
          <Button :loading="loading" @click="loadList">刷新</Button>
          <Button
            :disabled="childOpen"
            @click="createRelated('orders', 'GENERATE_ORDERS')"
          >
            从方案生成
          </Button>
          <Button type="primary" :disabled="childOpen" @click="openEditor()">
            新建采购单
          </Button>
        </template>
      </ProcurementPageHeader>
      <Alert
        v-if="listError"
        type="error"
        :message="listError"
        description="列表未刷新成功，已保留上次结果。"
        show-icon
      />
      <section class="order-kpis" aria-label="采购单概况">
        <button
          type="button"
          class="order-kpi"
          :class="{ selected: operation === 'IN_PROGRESS' }"
          :aria-pressed="operation === 'IN_PROGRESS'"
          @click="showOperation('IN_PROGRESS')"
        >
          <span>进行中</span>
          <b>{{
            overview ? `${overview.inProgress ?? overview.open} 张` : '—'
          }}</b>
          <small>入库或付款还没办完</small>
        </button>
        <div class="order-kpi" :class="{ alert: (overview?.overdue ?? 0) > 0 }">
          <span>超期未入库</span>
          <b>{{ overview ? `${overview.overdue} 张` : '—' }}</b>
          <small>{{
            overview?.overdue
              ? `最长超期 ${overview.maxOverdueDays} 天`
              : '按交货日期或报价承诺交期'
          }}</small>
        </div>
        <div class="order-kpi">
          <span>未付款</span>
          <b>{{
            amountLines(overview?.unpaidAmount)[0] ?? (overview ? '0' : '—')
          }}</b>
          <small>{{
            amountLines(overview?.arrivedUnpaidAmount)[0]
              ? `已入库 ${amountLines(overview?.arrivedUnpaidAmount)[0]}`
              : overview
                ? `${overview.unpaid} 张有未付金额`
                : ''
          }}</small>
        </div>
        <button
          type="button"
          class="order-kpi"
          :class="{ selected: operation === 'COMPLETED' }"
          :aria-pressed="operation === 'COMPLETED'"
          @click="showOperation('COMPLETED')"
        >
          <span>已完成</span>
          <b>{{ overview ? `${overview.completed ?? 0} 张` : '—' }}</b>
          <small>入库已齐且已付清</small>
        </button>
      </section>
      <section
        v-if="overview?.attention.length"
        class="order-attention"
        aria-label="需要处理的采购单"
      >
        <span class="procurement-muted">需要处理</span>
        <button
          v-for="row in overview.attention"
          :key="`${row.reason}:${row.orderId}`"
          type="button"
          :class="attentionClass[row.reason]"
          @click="openAttention(row)"
        >
          <b>{{ row.code }}</b>
          <span>{{ row.supplierName }}</span>
          <em>{{
            row.reason === 'OVERDUE'
              ? `超期 ${row.days} 天`
              : attentionNames[row.reason]
          }}</em>
        </button>
      </section>
      <p
        v-else-if="overview && overview.orders === 0"
        class="procurement-muted order-empty-hint"
      >
        新系统还没有采购单：在采购工作台或报价页「选价下单」后，采购单会出现在这里，统计卡会跟着更新。
      </p>
      <div class="order-surface">
        <div class="order-views" aria-label="采购状态视图">
          <button
            v-for="item in [
              { value: undefined, label: '全部' },
              { value: 'IN_PROGRESS', label: '进行中' },
              { value: 'COMPLETED', label: '已完成' },
              { value: 'ENDED', label: '已结束' },
            ] as { label: string; value?: Operation }[]"
            :key="item.label"
            type="button"
            :class="{ selected: operation === item.value }"
            :aria-pressed="operation === item.value"
            @click="
              operation = item.value;
              page = 1;
              loadList();
            "
          >
            {{ item.label }}
          </button>
        </div>
        <div class="procurement-toolbar">
          <Input.Search
            v-model:value="keyword"
            allow-clear
            placeholder="搜索订单、客户、供应商"
            class="order-search"
            @search="
              page = 1;
              loadList();
            "
          />
          <div class="procurement-toolbar-actions">
            <CompletionScopeFilter
              v-model="scope"
              :pending-total="pendingTotal"
              @change="changeScope"
            />
            <button
              type="button"
              class="mine-toggle"
              :class="{ on: mine }"
              :aria-pressed="mine"
              @click="
                mine = !mine;
                page = 1;
                loadList();
              "
            >
              {{ mine ? '✓ ' : '' }}只看我负责的
            </button>
            <span class="procurement-muted">当前筛选共 {{ total }} 单</span>
            <Button
              v-if="keyword || status || operation || contractId || mine"
              type="text"
              @click="clear"
            >
              清除筛选
            </Button>
          </div>
        </div>
        <Alert
          v-if="contractId"
          type="info"
          message="正在查看关联合同的采购单"
          banner
        />
        <Table
          :row-selection="{
            selectedRowKeys: selectedKeys,
            onChange: (keys: (number | string)[]) =>
              (selectedKeys = keys.map(String)),
            getCheckboxProps: (row: ProcurementOrderRow) => ({
              disabled: !batchSelectable(row),
            }),
          }"
          class="fdm-business-table order-table"
          size="middle"
          table-layout="fixed"
          :scroll="{ x: 1300 }"
          :data-source="records"
          :loading="loading"
          :row-key="(row: ProcurementOrderRow) => row.standaloneId ?? row.id"
          :row-class-name="
            (row: ProcurementOrderRow) =>
              view?.id === row.id ? 'procurement-row-selected' : ''
          "
          :pagination="{
            current: page,
            pageSize: 10,
            total,
            showSizeChanger: false,
            showTotal: (value: number) => `共 ${value} 单`,
          }"
          :columns="[
            { title: '操作/状态', key: 'flags', width: 130 },
            { title: '采购单 / 供应商', key: 'supplier', width: 250 },
            { title: '关联合同 / 客户', key: 'contract', width: 200 },
            { title: '采购日期', key: 'date', width: 110 },
            { title: '采购金额', key: 'amount', width: 140, align: 'right' },
            { title: '入库', key: 'received', width: 140 },
            { title: '付款', key: 'payment', width: 170 },
            { title: '操作状态', key: 'operation', width: 100 },
            { title: '', key: 'action', width: 80, fixed: 'right' },
          ]"
          @change="
            (value) => {
              page = value.current ?? 1;
              loadList();
            }
          "
        >
          <template #emptyText>
            <Empty description="没有符合条件的采购订单">
              <Button
                v-if="keyword || status || operation || contractId || mine"
                @click="clear"
              >
                清除筛选
              </Button>
              <Button
                v-else
                type="primary"
                @click="router.push('/fdmprocurement/platform-tasks')"
              >
                去采购工作台选价下单
              </Button>
            </Empty>
          </template>
          <template #summary>
            <TableSummary v-if="records.length > 0">
              <TableSummaryRow class="order-summary-row">
                <TableSummaryCell :index="0" />
                <TableSummaryCell :index="1" />
                <TableSummaryCell :index="2">本页合计</TableSummaryCell>
                <TableSummaryCell :index="3" />
                <TableSummaryCell :index="4" />
                <TableSummaryCell :index="5" align="right">
                  <span class="procurement-number">{{
                    pageTotals.amount
                  }}</span>
                </TableSummaryCell>
                <TableSummaryCell :index="6" />
                <TableSummaryCell :index="7">
                  <span class="procurement-muted">未付 {{ pageTotals.unpaid }}</span>
                </TableSummaryCell>
                <TableSummaryCell :index="8" />
                <TableSummaryCell :index="9" />
              </TableSummaryRow>
            </TableSummary>
          </template>
          <template #bodyCell="{ column, record }">
            <span v-if="column.key === 'flags'" class="order-flags">
              <Dropdown :trigger="['click']" :disabled="childOpen">
                <button
                  type="button"
                  class="order-row-menu"
                  title="更多操作"
                  aria-label="更多操作"
                >
                  <IconifyIcon icon="lucide:ellipsis" />
                </button>
                <template #overlay>
                  <Menu
                    :items="rowMenu(record as ProcurementOrderRow)"
                    @click="
                      (info: { key: string | number }) =>
                        rowMenuClick(
                          record as ProcurementOrderRow,
                          String(info.key),
                        )
                    "
                  />
                </template>
              </Dropdown>
              <i
                v-for="flag in rowFlags(record as ProcurementOrderRow)"
                :key="flag.key"
                :class="`flag-${flag.tone}`"
                :title="flag.title"
                >{{ flag.text }}</i>
            </span>
            <div v-else-if="column.key === 'supplier'" class="order-cell">
              <span class="order-code-line">
                <button
                  type="button"
                  class="order-record-link"
                  @click="openRow(record as DocumentRow, 'details', $event)"
                >
                  {{ purchaseRowLabels(record as ProcurementOrderRow).order }}
                </button>
                <ProcurementStatusBadge
                  :status="String(record.record.status ?? '')"
                />
              </span>
              <RelatedLink
                class="procurement-muted"
                :target="
                  entityTarget(
                    'supplier',
                    purchaseRowLabels(record as ProcurementOrderRow).supplierId,
                  )
                "
              >
                {{ purchaseRowLabels(record as ProcurementOrderRow).supplier }}
              </RelatedLink>
            </div>
            <div v-else-if="column.key === 'contract'" class="order-cell">
              <template v-if="record.contractId">
                <RelatedLink :target="contractTarget(record.contractId)">
                  {{
                    purchaseRowLabels(record as ProcurementOrderRow).contract
                  }}
                </RelatedLink>
                <span class="procurement-muted order-ellipsis">{{
                  record.customerName || '客户未注明'
                }}</span>
              </template>
              <span v-else class="procurement-muted">未关联合同</span>
            </div>
            <span
              v-else-if="column.key === 'date'"
              class="procurement-number"
              >{{
                String(record.record.createdAt ?? '').slice(0, 10) || '—'
              }}</span>
            <span
              v-else-if="column.key === 'amount'"
              class="procurement-number order-amount"
              >{{
                orderMoney(
                  record.orderAmount ?? record.record.amount,
                  record.record.currency,
                )
              }}</span>
            <div
              v-else-if="column.key === 'received'"
              class="order-cell"
              :class="`due-${orderRowDue(record as ProcurementOrderRow, today).tone}`"
            >
              <span>{{ receivedNames[record.receivedState ?? 'NONE'] }}</span>
              <small>{{
                record.receivedState === 'ALL'
                  ? ''
                  : [
                      orderRowDue(record as ProcurementOrderRow, today).main,
                      orderRowDue(record as ProcurementOrderRow, today).sub,
                    ]
                      .filter((part) => part && part !== '—')
                      .join(' · ')
              }}</small>
            </div>
            <button
              v-else-if="column.key === 'payment'"
              type="button"
              class="order-payment-link"
              @click="openRow(record as DocumentRow, 'payments', $event)"
            >
              <Progress
                :percent="
                  orderPaymentProgress({
                    orderAmount: record.orderAmount,
                    unpaidAmount: record.unpaidAmount,
                    paidAmount: record.paidAmount,
                  }) ?? 0
                "
                :show-info="false"
                size="small"
                :stroke-color="
                  Number(record.unpaidAmount) > 0 ? undefined : '#52c41a'
                "
              />
              <span
                v-if="Number(record.unpaidAmount) > 0"
                class="procurement-muted"
                >未付
                {{
                  orderMoney(record.unpaidAmount, record.record.currency)
                }}</span>
              <span v-else class="procurement-muted">已付清</span>
            </button>
            <Tag
              v-else-if="column.key === 'operation'"
              :color="
                operationNames[
                  (record.operationStatus ?? 'IN_PROGRESS') as Operation
                ].color
              "
            >
              {{
                operationNames[
                  (record.operationStatus ?? 'IN_PROGRESS') as Operation
                ].label
              }}
            </Tag>
            <Button
              v-else-if="column.key === 'action'"
              type="link"
              size="small"
              @click="openRow(record as DocumentRow, 'details', $event)"
            >
              查看
            </Button>
          </template>
        </Table>
        <div class="order-batch-bar">
          <Button
            size="small"
            :disabled="selectedKeys.length === 0"
            @click="runBatch('payment')"
          >
            集中付款
          </Button>
          <Button
            size="small"
            :disabled="selectedKeys.length === 0"
            @click="runBatch('invoice')"
          >
            集中收票
          </Button>
          <Button
            size="small"
            :disabled="selectedKeys.length === 0"
            @click="runBatch('stockIn')"
          >
            转入库
          </Button>
          <Button
            size="small"
            :disabled="selectedKeys.length === 0"
            @click="runBatch('end')"
          >
            选中结束
          </Button>
          <span v-if="selectedKeys.length > 0">已选 {{ selectedKeys.length }} 张
            <Button size="small" type="link" @click="selectedKeys = []">清除选择</Button>
          </span>
          <span v-else class="procurement-muted">勾选采购单后可集中付款、集中收票、转入库或结束；除结束外都要求同一家供应商</span>
        </div>
      </div>
    </div>

    <FdmResizableDrawer
      resize-key="purchase-order"
      :open="Boolean(detailId) && active"
      width="min(1320px, 96vw)"
      root-class-name="procurement-record-drawer"
      :closable="!childOpen"
      :mask-closable="!childOpen"
      :keyboard="!childOpen"
      :destroy-on-close="true"
      @close="back"
    >
      <template #title>
        <div v-if="view" class="order-title">
          <Tag color="blue">采购单</Tag>
          <span class="order-title-code">{{
            purchaseRowLabels({ ...view, record: view.order }).order
          }}</span>
          <ProcurementStatusBadge :status="String(view.order.status ?? '')" />
          <Button
            v-if="selectedIndex >= 0"
            size="small"
            type="text"
            :disabled="childOpen || selectedIndex <= 0"
            title="上一单"
            @click="selectAdjacent(-1)"
          >
            上一单
          </Button>
          <Button
            v-if="selectedIndex >= 0"
            size="small"
            type="text"
            :disabled="childOpen || selectedIndex >= records.length - 1"
            title="下一单"
            @click="selectAdjacent(1)"
          >
            下一单
          </Button>
        </div>
        <span v-else>采购单</span>
      </template>
      <template #extra>
        <Space v-if="view && active">
          <OrderSubDocMenu
            :items="subDocItems"
            :disabled="childOpen"
            @pick="pickSubDoc"
          />
          <OrderExportMenu
            :ready="view.allowedActions.includes('EXPORT_CONTRACT')"
            :saving="saving"
            :disabled="childOpen"
            @export="(format) => command('EXPORT_CONTRACT', { format })"
            @files="tab = 'attachments'"
            @not-ready="
              () => {
                message.warning(
                  view?.details.status === 'CONFIRMED'
                    ? '文件存储未配置，暂时不能导出'
                    : '请先在「详情」确认下单资料，再导出采购单',
                );
                if (view?.details.status !== 'CONFIRMED') tab = 'details';
              }
            "
          />
          <Button
            v-if="
              !['CANCELLED', 'RECEIVED', 'ENDED'].includes(
                String(view.order.status ?? ''),
              )
            "
            :disabled="childOpen"
            @click="endCurrentOrder"
          >
            采购终止
          </Button>
          <Dropdown :trigger="['click']" :disabled="childOpen">
            <Button>更多</Button>
            <template #overlay>
              <Menu
                :items="[
                  ...(view.allowedActions.includes('REVISE_DETAILS')
                    ? [{ key: 'revise', label: '新建资料变更版本' }]
                    : []),
                  ...(contract
                    ? [{ key: 'plans', label: '采购方案变更' }]
                    : []),
                  ...(contract?.allowedActions.includes('CANCEL_ORDER')
                    ? [
                        {
                          key: 'cancel',
                          label: '取消采购余额',
                          danger: true,
                          disabled: !!cancelReason,
                          title: cancelReason,
                        },
                      ]
                    : []),
                  { key: 'refresh', label: '刷新' },
                ]"
                @click="
                  (info: { key: string | number }) => {
                    if (info.key === 'revise') action('REVISE_DETAILS');
                    else if (info.key === 'plans') plansOpen = true;
                    else if (info.key === 'cancel') actionOpen = true;
                    else loadDetail();
                  }
                "
              />
            </template>
          </Dropdown>
        </Space>
        <Button
          v-else
          size="small"
          :disabled="childOpen"
          :loading="detailLoading"
          @click="loadDetail"
        >
          刷新
        </Button>
      </template>
      <div class="procurement-workspace order-execution">
        <Alert v-if="pageError" type="error" :message="pageError" show-icon />
        <Alert
          v-if="detailLoading && !view"
          type="info"
          message="正在读取采购单…"
        />
        <div v-if="view && active" class="order-layout">
          <div class="order-main">
            <section class="order-info">
              <dl>
                <dt>供应商</dt>
                <dd>
                  {{
                    purchaseRowLabels({ ...view, record: view.order }).supplier
                  }}
                </dd>
                <dt>采购单号</dt>
                <dd>{{ String(view.order.code ?? '—') }}</dd>
                <dt>采购金额</dt>
                <dd class="procurement-number">
                  {{
                    orderMoney(
                      financeSummary.orderAmount,
                      financeSummary.currency ?? view.order.currency,
                    )
                  }}
                </dd>
                <dt>所属公司</dt>
                <dd>{{ view.companyName || '待补齐' }}</dd>
                <dt>交期</dt>
                <dd>{{ view.details.deliveryDate || '未定' }}</dd>
                <dt>收票</dt>
                <dd>{{ view.details.noInvoice ? '无需收票' : '需要收票' }}</dd>
                <template v-if="receiveFactory">
                  <dt>收货工厂</dt>
                  <dd>{{ receiveFactory }}（工厂在到货入库里确认收货）</dd>
                </template>
              </dl>
              <div class="order-context">
                <Space
                  v-for="link in mainLinks"
                  :key="JSON.stringify(link.target)"
                  size="small"
                >
                  <span class="procurement-muted">{{ link.label }}</span><RelatedLink :target="link.target">
                    {{ link.value }}
                  </RelatedLink>
                </Space>
              </div>
            </section>
            <Alert
              v-if="financeError"
              type="warning"
              :message="`付款摘要暂未读取：${financeError}`"
              show-icon
            >
              <template #action>
                <Button
                  size="small"
                  :loading="financeLoading"
                  @click="loadFinanceSummary"
                >
                  重试
                </Button>
              </template>
            </Alert>
            <OrderLines :view="view" />
            <Tabs v-model:active-key="tab" class="order-tabs">
              <TabPane
                key="timeline"
                :tab="counted('时间线', subDocCounts.all)"
              >
                <OrderTimeline
                  :currency="
                    String(financeSummary.currency ?? view.order.currency ?? '')
                  "
                  :payments="previousPayments"
                  :invoices="orderInvoiceList"
                  :stock-ins="orderStockIns"
                  :returns="orderReturns"
                  @open="(value) => (tab = value)"
                />
              </TabPane>
              <TabPane key="details" tab="详情">
                <OrderDetails
                  :view="view"
                  :saving="saving"
                  @busy="contactEditorBusy = $event"
                  @save="(payload) => command('SAVE_DETAILS', payload)"
                  @confirm="(payload) => command('CONFIRM_DETAILS', payload)"
                  @action="action"
                />
                <section class="order-arrivals">
                  <h3>
                    到货记录
                    <span class="procurement-muted">{{ arrivalRows.length }} 笔</span>
                  </h3>
                  <Table
                    :data-source="arrivalRows"
                    size="small"
                    row-key="id"
                    :pagination="false"
                    :scroll="{ x: 620 }"
                    :columns="[
                      { title: '到货批次', key: 'batch' },
                      { title: '产品', key: 'product' },
                      { title: '到货数量', dataIndex: 'quantity' },
                      { title: '合格数量', dataIndex: 'acceptedQuantity' },
                    ]"
                  >
                    <template #emptyText>暂未登记到货</template>
                    <template #bodyCell="{ column, record }">
                      <Button
                        v-if="column.key === 'batch'"
                        type="link"
                        :disabled="childOpen"
                        @click="arrivalId = String(record.id)"
                      >
                        {{ record.batchNo || '查看到货单' }}
                      </Button>
                      <span v-else-if="column.key === 'product'">{{
                        contract?.items.find(
                          (item) => item.id === record.contractItemId,
                        )?.productName || '产品未注明'
                      }}</span>
                    </template>
                  </Table>
                </section>
                <div v-if="productLinks.length" class="order-context">
                  <Space
                    v-for="link in productLinks"
                    :key="JSON.stringify(link.target)"
                    size="small"
                  >
                    <span class="procurement-muted">{{ link.label }}</span><RelatedLink :target="link.target">
                      {{ link.value }}
                    </RelatedLink>
                  </Space>
                </div>
              </TabPane>
              <TabPane key="stock" :tab="counted('入库单', subDocCounts.stock)">
                <OrderStockDocs
                  :contract-id="view.contractId"
                  :order-id="view.id"
                  :can-receive="canReceive"
                  :other-arrivals="otherArrivals"
                  @changed="invoicesChanged"
                />
              </TabPane>
              <TabPane
                key="payments"
                :tab="counted('付款记录', subDocCounts.payments)"
              >
                <OrderFinance
                  :key="financeRevision"
                  :contract-id="view.contractId"
                  :order-id="view.id"
                  :order-code="String(view.order.code ?? '')"
                  :supplier-name="String(view.order.supplierName ?? '')"
                  :invoiced="invoicedTotal"
                  mode="payments"
                  @busy="nestedFinanceBusy = $event"
                  @changed="financeChanged"
                />
              </TabPane>
              <TabPane
                key="invoices"
                :tab="counted('付款发票', subDocCounts.invoices)"
              >
                <OrderInvoices
                  :view="view"
                  :payments="previousPayments"
                  :order-amount="financeSummary.orderAmount"
                  @changed="invoicesChanged"
                />
              </TabPane>
              <TabPane key="costs" tab="成本归属">
                <OrderFinance
                  :key="financeRevision"
                  :contract-id="view.contractId"
                  :order-id="view.id"
                  mode="costs"
                  @busy="nestedFinanceBusy = $event"
                  @changed="financeChanged"
                />
              </TabPane>
              <TabPane key="attachments" tab="附件">
                <OrderContract
                  :view="view"
                  :saving="saving"
                  style="margin-bottom: 12px"
                  @signed="upload"
                />
                <StandaloneOrderFiles
                  v-if="standaloneOrder(view.contractId)"
                  :order-id="view.id"
                />
                <AttachmentPanel
                  v-else
                  :contract-id="view.contractId"
                  :target="{ targetKind: 'purchaseOrders', targetId: view.id }"
                  :view="orderAttachments"
                  :categories="orderAttachments?.uploadCategories ?? []"
                  :loading="attachmentsLoading"
                  :error="attachmentsError"
                  @refresh="loadOrderAttachments"
                />
              </TabPane>
              <TabPane key="history" tab="操作记录">
                <MigrationSource
                  :migration="migration"
                  :native-source="{
                    kind: 'CONTRACT',
                    nativeId: view.contractId,
                    recordId: view.id,
                  }"
                />
                <RecordTable
                  :data="historyRows"
                  :columns="[
                    { key: 'action', title: '操作' },
                    { key: 'actorId', title: '经办人' },
                    { key: 'occurredAt', title: '时间' },
                    { key: 'version', title: '资料版本' },
                    { key: 'reason', title: '原因' },
                  ]"
                />
              </TabPane>
            </Tabs>
          </div>
          <aside class="order-side">
            <OrderSummaryCards
              :currency="
                String(financeSummary.currency ?? view.order.currency ?? '')
              "
              :order-amount="financeSummary.orderAmount"
              :paid="financeSummary.paidAmount"
              :unpaid="financeSummary.unpaidAmount"
              :invoiced="invoicedTotal"
              :no-invoice="!!view.details.noInvoice"
              :arrival-percent="arrivalPercent"
              @open="(value) => (tab = value)"
            />
            <section v-if="templateState" class="order-side-card">
              <span class="procurement-muted">采购单导出</span>
              <strong>{{ templateState.label }}</strong>
              <span class="procurement-muted">{{ templateState.sub }}</span>
            </section>
          </aside>
        </div>
      </div>
    </FdmResizableDrawer>
    <PurchaseOrderEditor
      :open="editorOpen && active"
      :copy-from="copySource"
      @close="editorOpen = false"
      @saved="editorSaved"
    />
    <BatchPaymentDialog
      :open="batchPaymentOpen && active"
      :orders="selectedOrders"
      @close="batchDone"
      @done="(count) => message.success(`已登记 ${count} 张付款记录`)"
    />
    <BatchInvoiceDialog
      :open="batchInvoiceOpen && active"
      :orders="selectedOrders"
      @close="batchInvoiceOpen = false"
      @done="
        () => {
          message.success('付款发票已登记');
          batchDone();
        }
      "
    />
    <StockInDialog
      :open="!!batchStockInTargets && active"
      :targets="batchStockInTargets"
      @close="batchStockInTargets = undefined"
      @saved="
        (_value, all) => {
          message.success(`已生成 ${all.length} 张入库单`);
          batchDone();
        }
      "
    />
    <StockInDialog
      :open="stockInOpen && active"
      :contract-id="view?.contractId"
      :order-id="view?.id"
      @close="stockInOpen = false"
      @saved="stockInSaved"
    />
    <ActionDialog
      :open="reasonOpen && active"
      :definition="reasonDefinition"
      :saving="saving"
      :error="pageError"
      @close="reasonOpen = false"
      @submit="
        (payload, key) => command(reasonDefinition!.action, payload, key)
      "
    />
    <DocumentAction
      :open="actionOpen && active"
      kind="orders"
      action="CANCEL_ORDER"
      :row="recordRow"
      :contract-id="view?.contractId"
      @close="actionOpen = false"
      @updated="
        actionOpen = false;
        financeChanged();
      "
    />
    <DocumentAction
      :open="!!createAction && active"
      :kind="createKind"
      :action="createAction"
      :contract-id="view?.contractId ?? contractId"
      :source="view ? { kind: 'orders', id: view.id } : undefined"
      :lock-contract="Boolean(view?.contractId ?? contractId)"
      @close="createAction = undefined"
      @updated="created"
    />
    <ContractDocumentDialog
      :open="plansOpen && active"
      :contract="contract"
      kind="plans"
      @close="plansOpen = false"
      @updated="plansChanged"
    />
    <FinanceDocument
      :open="!!financeType && active"
      :type="financeType ?? 'REIMBURSEMENT'"
      :context="financeContext"
      @close="financeType = undefined"
      @updated="financeChanged"
    />
    <PaymentRecordDialog
      v-if="view"
      :open="paymentOpen && active"
      :contract-id="view.contractId"
      :order-id="view.id"
      :order-code="String(view.order.code ?? '')"
      :supplier-name="String(view.order.supplierName ?? '')"
      :currency="String(financeSummary.currency ?? view.order.currency ?? '')"
      :available="financeSummary.availablePaymentAmount"
      :previous="previousPayments"
      :reference="{
        orderAmount: financeSummary.orderAmount,
        paid: financeSummary.paidAmount,
        unpaid: financeSummary.unpaidAmount,
        invoiced: invoicedTotal,
      }"
      @close="paymentOpen = false"
      @saved="paymentSaved"
    />
    <RecordDetail
      :open="!!arrivalId && active"
      kind="arrivals"
      :row="arrivalRow"
      @close="arrivalId = undefined"
      @updated="financeChanged"
    />
  </component>
  <BusinessDocumentDetail
    :id="standaloneId"
    :open="Boolean(standaloneId) && active"
    kind="orders"
    @close="back"
    @updated="loadList"
  />
</template>

<style scoped>
.order-flags {
  display: inline-flex;
  gap: 3px;
}

.order-row-menu {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 18px;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  border-radius: 4px;
}

.order-row-menu:hover {
  color: hsl(var(--primary));
  background: hsl(var(--accent));
}

.order-flags i {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  font-size: 11px;
  font-style: normal;
  border-radius: 4px;
}

.order-flags .flag-done {
  color: #fff;
  background: #52c41a;
}

.order-flags .flag-part {
  color: #fff;
  background: #fa8c16;
}

.order-flags .flag-none {
  color: hsl(var(--muted-foreground));
  background: hsl(var(--accent));
}

.order-flags .flag-skip {
  color: hsl(var(--muted-foreground));
  text-decoration: line-through;
  background: hsl(var(--accent));
}

.order-summary-row :deep(td) {
  font-weight: 600;
  background: hsl(var(--accent));
}

/* 采购单详情（金智式）：左侧基本信息 + 下属单据页签，右侧摘要 */
.order-title {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.order-title-code {
  font-size: 16px;
  font-weight: 600;
}

.order-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 16px;
  align-items: start;
}

.order-main {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.order-side {
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.order-side-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.order-info {
  padding: 12px 16px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.order-info dl {
  display: grid;
  grid-template-columns: 80px minmax(0, 1fr) 80px minmax(0, 1fr);
  gap: 8px 12px;
  margin: 0 0 8px;
  font-size: 13px;
}

.order-info dt {
  color: hsl(var(--muted-foreground));
}

.order-info dd {
  margin: 0;
  overflow-wrap: anywhere;
}

@media (max-width: 1000px) {
  .order-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .order-side {
    position: static;
  }

  .order-info dl {
    grid-template-columns: 80px minmax(0, 1fr);
  }
}

.order-workspace {
  display: grid;
  gap: 16px;
}

.order-surface {
  overflow: hidden;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.order-views {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  padding: 0 20px;
  border-bottom: 1px solid hsl(var(--border));
}

.order-views button {
  padding: 16px 0 13px;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  background: transparent;
  border: 0;
  border-bottom: 2px solid transparent;
}

.order-views .selected {
  font-weight: 600;
  color: hsl(var(--primary));
  border-bottom-color: hsl(var(--primary));
}

.order-views button:focus-visible,
.order-record-link:focus-visible,
.order-payment-link:focus-visible {
  outline: 2px solid hsl(var(--primary));
  outline-offset: 3px;
}

.order-surface .procurement-toolbar {
  padding: 16px 20px;
}

.order-search {
  width: 320px;
  max-width: 100%;
}

.order-cell {
  display: flex;
  flex-direction: column;
  gap: 5px;
  align-items: flex-start;
}

.order-record-link {
  max-width: 100%;
  padding: 0;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-weight: 600;
  color: hsl(var(--primary));
  text-align: left;
  overflow-wrap: anywhere;
  cursor: pointer;
  background: transparent;
  border: 0;
}

.order-code-line {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.order-ellipsis {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.order-amount {
  font-weight: 600;
}

.due-late,
.due-late small {
  color: hsl(var(--destructive));
}

.due-soon small {
  color: color-mix(in srgb, hsl(var(--warning)) 55%, hsl(var(--foreground)));
}

.due-done small,
.due-none small {
  color: hsl(var(--muted-foreground));
}

.order-record-link:hover {
  color: hsl(var(--primary));
}

.order-payment-link {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: 0;
  font-variant-numeric: tabular-nums;
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 0;
}

.order-payment-link:hover {
  color: hsl(var(--primary));
}

.order-batch-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding: 8px 20px;
  background: hsl(var(--primary) / 6%);
  border-top: 1px solid hsl(var(--border));
}

.order-summary-link {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
  padding: 0;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 0;
}

.order-summary-link:hover strong {
  color: hsl(var(--primary));
}

.order-quantity {
  width: 100%;
}

.order-open {
  height: auto;
  padding: 0;
}

.order-execution {
  display: grid;
  gap: 20px;
}

.order-execution-header {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
}

.order-heading-line {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  margin-bottom: 6px;
}

.order-heading-line h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.order-kpis {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

.order-kpi {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 12px 14px;
  font: inherit;
  color: inherit;
  text-align: left;
  background: var(--procurement-surface);
  border: 1px solid var(--procurement-line);
  border-radius: 10px;
}

button.order-kpi {
  cursor: pointer;
}

button.order-kpi:hover,
button.order-kpi:focus-visible {
  outline: none;
  border-color: var(--procurement-accent);
}

.order-kpi.selected {
  border-color: var(--procurement-accent);
  box-shadow: inset 0 0 0 1px var(--procurement-accent);
}

.order-kpi span,
.order-kpi small {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  color: var(--procurement-secondary);
  white-space: nowrap;
}

.order-kpi b {
  font-size: 20px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.order-kpi.alert b {
  color: hsl(var(--destructive));
}

.order-attention {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
}

.order-attention button {
  display: inline-flex;
  gap: 6px;
  align-items: baseline;
  padding: 4px 10px;
  font: inherit;
  font-size: 12px;
  color: inherit;
  cursor: pointer;
  background: var(--procurement-surface);
  border: 1px solid var(--procurement-line);
  border-radius: 999px;
}

.order-attention button:hover,
.order-attention button:focus-visible {
  outline: none;
  border-color: var(--procurement-accent);
}

.order-attention em {
  font-style: normal;
  color: var(--procurement-secondary);
}

.order-attention .is-overdue em {
  color: hsl(var(--destructive));
}

.order-attention .is-unpaid em {
  color: hsl(var(--warning));
}

.order-empty-hint {
  margin: 0 0 12px;
}

@media (max-width: 960px) {
  .order-kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.mine-toggle {
  padding: 3px 10px;
  font: inherit;
  font-size: 13px;
  color: var(--procurement-secondary);
  cursor: pointer;
  background: var(--procurement-surface);
  border: 1px solid var(--procurement-line);
  border-radius: 999px;
}

.mine-toggle.on {
  color: var(--procurement-accent);
  background: var(--procurement-selected);
  border-color: var(--procurement-accent);
}

.mine-toggle:focus-visible {
  outline: 2px solid var(--procurement-accent);
  outline-offset: 2px;
}

.order-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 24px;
  padding: 20px;
  background: hsl(var(--accent));
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.order-summary-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.order-summary-item strong {
  font-size: 17px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.order-secondary-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.order-context {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
  font-size: 12px;
}

.order-more {
  position: relative;
  font-size: 13px;
}

.order-more summary {
  padding: 5px 12px;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
}

.order-more-content {
  position: absolute;
  top: 36px;
  right: 0;
  z-index: 5;
  display: grid;
  gap: 10px;
  width: 240px;
  padding: 12px;
  background: hsl(var(--popover));
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  box-shadow: 0 6px 16px hsl(var(--foreground) / 8%);
}

.order-arrivals {
  margin-top: 24px;
}

.order-arrivals h3 {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 12px;
  font-size: 14px;
  font-weight: 600;
}

.order-tabs :deep(.ant-tabs-nav) {
  margin-top: 0;
}

.order-tabs :deep(.ant-card) {
  border: 0;
  box-shadow: none;
}

.order-tabs :deep(.ant-card-head) {
  min-height: 40px;
  padding: 0;
}

.order-tabs :deep(.ant-card-body) {
  padding: 16px 0;
}

.order-tabs :deep(.ant-table) {
  font-size: 14px;
}

.order-summary :deep(.ant-progress),
.order-quantity :deep(.ant-progress) {
  margin: 0;
  line-height: 1;
}

@media (max-width: 720px) {
  .order-summary {
    grid-template-columns: 1fr;
    gap: 20px;
    padding: 16px;
  }

  .order-execution-header {
    align-items: flex-start;
  }

  .order-heading-line h2 {
    font-size: 18px;
  }

  .order-views {
    gap: 16px;
    padding: 0 16px;
  }

  .order-views button {
    padding-top: 12px;
  }
}
</style>
