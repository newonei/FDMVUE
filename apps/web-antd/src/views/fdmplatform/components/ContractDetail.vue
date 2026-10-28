<script setup lang="ts">
import type { DocumentKind } from '../documents/model';
import type { DetailTab, WorkspaceKey } from '../workspaces';
import type { ContractDocumentKind } from './contract-document-launcher';
import type { MainlineAction } from './contract-mainline';
import type { RelatedDocGroup, RelatedDocRow } from './contract-related-docs';
import type { WorkboardLaunch } from './contract-workboard';
import type { LineColumn } from './line-table-model';

import type {
  BusinessRecord,
  Contract,
  Directory,
  DocumentRow,
  MasterRecord,
  PageResource,
} from '#/api/fdmplatform';
import type { ContractFileListing } from '#/api/fdmplatform/contract-files';
import type { ProcurementFinanceRecord } from '#/api/fdmplatform/procurement-finance';
import type { StockIn, StockOut } from '#/api/fdmplatform/warehouse';

import { computed, defineAsyncComponent, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import {
  Alert,
  Button,
  Card,
  Dropdown,
  Input,
  Menu,
  message,
  Modal,
  Space,
  TabPane,
  Tabs,
  Tag,
  Tooltip,
} from 'ant-design-vue';

import {
  contractAction,
  getContractAudit,
  newIdempotencyKey,
} from '#/api/fdmplatform';
import { getContractFiles } from '#/api/fdmplatform/contract-files';
import { getContractRelatedSummary } from '#/api/fdmplatform/contract-progress';
import { getCustomsSummary } from '#/api/fdmplatform/customs';
import { downloadContractProductAttachment } from '#/api/fdmplatform/products';
import { getStockOuts } from '#/api/fdmplatform/warehouse';
import { FdmResizableDrawer } from '#/components/fdm-resizable-drawer';
import AiCheckPanel from '#/views/fdmaicheck/components/AiCheckPanel.vue';

import { productCategoryLabel } from '../contract-categories';
import { errorText, label, rows } from '../data';
import { departmentLabel, personLabel, personName } from '../directory';
import BusinessDocumentDetail from '../documents/BusinessDocumentDetail.vue';
import DocumentAction from '../documents/DocumentAction.vue';
import ImportedContractCompletion from '../documents/ImportedContractCompletion.vue';
import { nativeMoney } from '../documents/migration-display';
import MigrationSource from '../documents/MigrationSource.vue';
import { documentDefinitions } from '../documents/model';
import { entityTarget } from '../documents/navigation';
import RecordDetail from '../documents/RecordDetail.vue';
import RelatedLink from '../documents/RelatedLink.vue';
import FinanceDocument from '../finance/procurement/components/FinanceDocument.vue';
import ContractEditor from '../products/components/ContractEditor.vue';
import OrderSubDocMenu from '../purchase/manage/components/OrderSubDocMenu.vue';
import { linesTitle } from '../purchase/warehouse/model';
import { salesChannelOf } from '../sales-channel';
import { detailTabFor } from '../workspaces';
import { contractMainline, contractNextStep } from './contract-mainline';
import { contractItemPipeline } from './contract-progress';
import { loadContractRelatedDocs } from './contract-related-docs';
import { contractWorkboard, workboardDocumentRow } from './contract-workboard';
import { contractQuickActionReason } from './contract-workflow';
import ContractDocumentDialog from './ContractDocumentDialog.vue';
import ContractFilesPanel from './ContractFilesPanel.vue';
import ContractMainline from './ContractMainline.vue';
import ContractRelatedDocs from './ContractRelatedDocs.vue';
import ContractTimeline from './ContractTimeline.vue';
import ContractWorkboard from './ContractWorkboard.vue';
import FilePreviewButton from './FilePreviewButton.vue';
import LineTable from './LineTable.vue';
import RecordTable from './RecordTable.vue';
import SummaryCards from './SummaryCards.vue';

const props = defineProps<{
  /** 打开后自动办理主线的“下一步”（列表行上的办理按钮） */
  autoNext?: boolean;
  contract?: Contract;
  directory?: Directory;
  initialTab: DetailTab;
  loading: boolean;
  master: MasterRecord[];
  open: boolean;
  pools: BusinessRecord[];
  recordContext?: { record: BusinessRecord; resource: PageResource };
  workspace: WorkspaceKey;
}>();

const emit = defineEmits<{
  autoNextDone: [];
  close: [];
  copy: [value: Contract];
  refresh: [];
  updated: [value: Contract];
}>();

/** 出库单：新建弹窗、详情抽屉和库存中心同一组件，在合同订单里直接弹出 */
const StockOutDialog = defineAsyncComponent(
  () => import('../purchase/warehouse/StockOutDialog.vue'),
);
const StockDocDrawer = defineAsyncComponent(
  () => import('../inventory-center/components/StockDocDrawer.vue'),
);
const stockOutOpen = ref(false);
const stockOutViewing = ref<StockOut>();
const stockOuts = ref<StockOut[]>([]);
const stockOutsError = ref('');
async function loadStockOuts() {
  const id = props.contract?.id;
  if (!id) return;
  stockOutsError.value = '';
  try {
    const page = await getStockOuts({
      pageNo: 1,
      pageSize: 100,
      contractId: id,
    });
    if (props.contract?.id === id) stockOuts.value = page.list;
  } catch (error) {
    stockOutsError.value = errorText(error);
  }
}
function openStockOut() {
  if (!props.contract || childOpen.value) return;
  if (ended.value) {
    message.warning('合同已结束，不能再出库');
    return;
  }
  stockOutOpen.value = true;
}
function stockOutSaved(value: StockOut) {
  stockOutOpen.value = false;
  message.success(`已出库 ${value.code}`);
  stockOutViewing.value = value;
  void loadStockOuts();
  void loadRelatedDocs();
  emit('refresh');
}

/**
 * 下属单据页签（#112）：合同下每类单据一个页签，没有这类单据就不显示。
 * 点单号打开原来的详情：采购类、发货、收款开票走单据详情，出入库走库存单据抽屉，付款与报销走财务单据。
 */
type RelatedTabKey = `doc:${string}`;
const relatedDocs = ref<RelatedDocGroup[]>([]);
const relatedDocsError = ref('');
let relatedDocsSequence = 0;
const stockInViewing = ref<StockIn>();
const financeViewing = ref<ProcurementFinanceRecord>();
const standaloneViewing = ref<{ id: string; kind: DocumentKind }>();
async function loadRelatedDocs() {
  const id = props.contract?.id;
  if (!id) return;
  const run = ++relatedDocsSequence;
  relatedDocsError.value = '';
  try {
    const groups = await loadContractRelatedDocs(id);
    if (run !== relatedDocsSequence || id !== props.contract?.id) return;
    relatedDocs.value = groups;
    if (
      activeTab.value.startsWith('doc:') &&
      !groups.some((group) => `doc:${group.key}` === activeTab.value)
    )
      activeTab.value = 'products';
  } catch (error) {
    if (run === relatedDocsSequence)
      relatedDocsError.value = `下属单据未读取：${errorText(error)}`;
  }
}
function openRelatedDoc(row: RelatedDocRow) {
  if (!props.contract || childOpen.value) return;
  const target = row.ref;
  if (target.source === 'stockIn') stockInViewing.value = target.stockIn;
  else if (target.source === 'stockOut')
    stockOutViewing.value = target.stockOut;
  else if (target.source === 'finance') financeViewing.value = target.record;
  else if (target.row.standaloneId)
    standaloneViewing.value = {
      id: target.row.standaloneId,
      kind: target.kind,
    };
  else {
    workRow.value = target.row;
    workLaunch.value = { kind: target.kind };
  }
}
function relatedDocChanged() {
  void loadRelatedDocs();
  emit('refresh');
}

/** 采购单执行抽屉：和采购订单页同一个组件，在合同订单里直接弹出 */
const PurchaseOrderExecution = defineAsyncComponent(
  () => import('../purchase/manage/index.vue'),
);

const documentKind = ref<ContractDocumentKind>();
const documentMode = ref<'create' | 'list'>();
const documentsOpen = ref(false);
const workLaunch = ref<WorkboardLaunch>();
const workRow = ref<DocumentRow>();
const attachmentBusy = ref(false);
const terminating = ref(false);
const terminateAction = ref<'CANCEL_CONTRACT' | 'CLOSE_CONTRACT'>();
const terminateReason = ref('');
let terminateKey = newIdempotencyKey();
const childOpen = computed(
  () =>
    documentsOpen.value ||
    editorOpen.value ||
    completionOpen.value ||
    reimbursementOpen.value ||
    stockOutOpen.value ||
    !!stockOutViewing.value ||
    !!stockInViewing.value ||
    !!financeViewing.value ||
    !!standaloneViewing.value ||
    !!workLaunch.value ||
    !!purchaseOrder.value ||
    activating.value ||
    attachmentBusy.value ||
    !!terminateAction.value,
);
/** 各部门页签底部的“全部单据”入口；到货、采购退货、自产进度已改到工序库存，不再列出 */
const departmentLists: Record<
  'delivery' | 'finance' | 'purchase',
  DocumentKind[]
> = {
  purchase: ['requests', 'tasks', 'quotes', 'plans', 'orders'],
  delivery: ['shipments', 'salesReturns'],
  finance: ['receipts', 'refunds', 'invoices', 'allocations', 'costs'],
};
function quickActionReason(action: string) {
  if (props.loading) return '正在刷新合同，请稍后再试';
  if (childOpen.value) return '请先完成或关闭当前办理窗口';
  return contractQuickActionReason(props.contract, action);
}
function openQuickDocument(entry: { action: string; kind: DocumentKind }) {
  const reason = quickActionReason(entry.action);
  if (reason) {
    message.warning(reason);
    return;
  }
  startWork({ kind: entry.kind, action: entry.action });
}
const activeTab = ref<DetailTab | RelatedTabKey>('products');
const editorOpen = ref(false);
const completionOpen = ref(false);
const reimbursementOpen = ref(false);
const activating = ref(false);
let activationKey = newIdempotencyKey();
const attachments = ref<ContractFileListing>();
const attachmentError = ref('');
const attachmentLoading = ref(false);
const audit = ref<BusinessRecord[]>([]);
const auditError = ref('');
const customs = ref<Awaited<ReturnType<typeof getCustomsSummary>>>();
const customsError = ref('');
const related = ref<Awaited<ReturnType<typeof getContractRelatedSummary>>>();
const relatedError = ref('');
let summarySequence = 0;
const company = computed(
  () =>
    props.directory?.companies.find(
      (item) => item.companyId === props.contract?.companyId,
    )?.companyName ??
    props.contract?.companyName ??
    '',
);
const standardFiles = computed(() => [
  ...new Map(
    (props.contract?.items ?? []).flatMap((item) =>
      (item.productAttachmentRefs ?? []).map(
        (file) => [file.id, { ...file, skuName: item.skuName }] as const,
      ),
    ),
  ).values(),
]);
const pipeline = computed(() => contractItemPipeline(props.contract));
const lineColumns: LineColumn[] = [
  { key: 'skuName', title: '产品名称', width: 240, locked: true },
  { key: 'skuCode', title: '产品编号', width: 140, optional: true },
  { key: 'specification', title: '规格', width: 200 },
  { key: 'material', title: '材质', optional: true },
  { key: 'size', title: '尺寸', optional: true },
  { key: 'color', title: '颜色', optional: true },
  { key: 'shape', title: '形状', width: 110, optional: true },
  { key: 'printing', title: '印刷', optional: true },
  { key: 'packaging', title: '包装', optional: true },
  { key: 'quantity', title: '数量', width: 110, align: 'right' },
  { key: 'unit', title: '单位', width: 80 },
  { key: 'unitPrice', title: '单价', width: 110, align: 'right' },
  { key: 'lineAmount', title: '金额', width: 130, align: 'right' },
  { key: 'requiredDate', title: '交期', width: 120 },
  { key: 'remark', title: '明细备注', width: 200 },
  { key: 'requestedQuantity', title: '已申请', width: 100, align: 'right' },
  { key: 'orderedQuantity', title: '已下单', width: 100, align: 'right' },
  { key: 'arrivedQuantity', title: '已到货', width: 100, align: 'right' },
  { key: 'shippedQuantity', title: '已发货', width: 100, align: 'right' },
  {
    key: 'suggestedSupplierName',
    title: '建议供应商',
    width: 180,
    optional: true,
  },
];
/** 主线只给第一项；全部可办理事项收在下面，可展开逐项办理 */
const allTasks = computed(() =>
  props.contract
    ? contractWorkboard(props.contract).reduce(
        (sum, group) => sum + group.records.length,
        0,
      )
    : 0,
);
/** 内销合同没有报关和阿里信保 */
const domestic = computed(
  () => salesChannelOf(props.contract?.businessType) === 'DOMESTIC',
);
/** 内销只显示内部单号；历史单没填时退回订单号 */
const contractTitle = computed(() => {
  const value = props.contract;
  if (!value) return '';
  return domestic.value
    ? value.name || value.code || ''
    : [value.code, value.name].filter(Boolean).join(' · ');
});
const ended = computed(() =>
  ['CANCELLED', 'CLOSED'].includes(props.contract?.status ?? ''),
);
const allowed = (action: string) =>
  Boolean(props.contract?.allowedActions.includes(action));
const summary = computed(() => props.contract?.financeSummary);
const totalQuantity = computed(() => {
  const units = new Set(pipeline.value.map((item) => item.unit));
  const sum = pipeline.value.reduce(
    (total, item) => total + Number(item.quantity ?? 0),
    0,
  );
  return units.size === 1
    ? `${sum.toLocaleString('en-US')} ${[...units][0] ?? ''}`
    : `${pipeline.value.length} 项`;
});
const purchaseRows = computed(() => {
  const contract = props.contract;
  if (!contract) return { requests: [], orders: [], quotes: [], tasks: [] };
  return {
    requests: rows(contract.requests).filter(
      (row) => row.status !== 'CANCELLED',
    ),
    tasks: rows(contract.assignments).filter(
      (row) => row.status !== 'CANCELLED',
    ),
    quotes: rows(contract.quotes),
    orders: rows(contract.purchaseOrders),
  };
});
const shipmentRows = computed(() => rows(props.contract?.shipments));
const receiptRows = computed(() => rows(props.contract?.finance?.receipts));
const invoiceRows = computed(() => rows(props.contract?.finance?.invoices));
const itemName = (id: unknown) =>
  props.contract?.items.find((item) => item.id === id)?.skuName ?? '未匹配明细';
function orderProgress(order: BusinessRecord) {
  let quantity = 0;
  let arrived = 0;
  for (const line of rows(order.lines)) {
    quantity +=
      Number(line.quantity ?? 0) - Number(line.cancelledQuantity ?? 0);
    arrived += Number(line.arrivedQuantity ?? 0);
  }
  return `${arrived.toLocaleString('en-US')} / ${quantity.toLocaleString('en-US')}`;
}
function requestDue(request: BusinessRecord) {
  const dates = rows(request.items)
    .map((item) => String(item.requiredDate ?? ''))
    .filter(Boolean)
    .toSorted();
  return dates[0] ?? '未填写';
}
const auditRows = computed(() =>
  audit.value.map((row) => ({
    ...row,
    action: label(row.action),
    actor_id: personLabel(props.directory, row.actor_id),
    created_at: String(row.created_at ?? '')
      .replace('T', ' ')
      .slice(0, 16),
  })),
);
const columns = (...pairs: string[]) =>
  pairs.map((pair) => {
    const [key, title] = pair.split('|');
    return { key: key!, title: title! };
  });
async function loadFiles() {
  if (!props.contract) return;
  const id = props.contract.id;
  attachmentLoading.value = true;
  attachmentError.value = '';
  try {
    const result = await getContractFiles(id);
    if (id === props.contract?.id) attachments.value = result;
  } catch (error) {
    attachmentError.value = errorText(error);
  } finally {
    attachmentLoading.value = false;
  }
}
async function loadSummary() {
  if (!props.contract) return;
  const id = props.contract.id;
  const run = ++summarySequence;
  customsError.value = '';
  relatedError.value = '';
  related.value = undefined;
  customs.value = undefined;
  const [customsResult, relatedResult] = await Promise.allSettled([
    getCustomsSummary(id),
    getContractRelatedSummary(id),
  ]);
  if (run !== summarySequence || id !== props.contract?.id || !props.open)
    return;
  if (customsResult.status === 'fulfilled') customs.value = customsResult.value;
  else customsError.value = errorText(customsResult.reason);
  if (relatedResult.status === 'fulfilled') related.value = relatedResult.value;
  else
    relatedError.value = `关联单据统计未读取：${errorText(relatedResult.reason)}`;
}
async function loadAudit() {
  if (!props.contract) return;
  const id = props.contract.id;
  auditError.value = '';
  try {
    const result = await getContractAudit(id);
    if (id === props.contract?.id)
      audit.value = result.map((item, index) => ({
        ...item,
        id: String(index),
      }));
  } catch (error) {
    auditError.value = errorText(error);
  }
}
let autoRanFor: string | undefined;
function runAutoNext() {
  const contract = props.contract;
  if (
    !props.autoNext ||
    !contract ||
    props.loading ||
    autoRanFor === contract.id
  )
    return;
  autoRanFor = contract.id;
  emit('autoNextDone');
  const next = contractNextStep(
    contract,
    contractMainline(contract),
    contractWorkboard(contract),
  );
  if (next.action) runNext(next.action);
}
watch(
  () => [props.open, props.contract?.id],
  () => {
    ++summarySequence;
    activationKey = newIdempotencyKey();
    documentsOpen.value = false;
    editorOpen.value = false;
    completionOpen.value = false;
    reimbursementOpen.value = false;
    stockOutOpen.value = false;
    stockOutViewing.value = undefined;
    stockOuts.value = [];
    ++relatedDocsSequence;
    relatedDocs.value = [];
    relatedDocsError.value = '';
    stockInViewing.value = undefined;
    financeViewing.value = undefined;
    standaloneViewing.value = undefined;
    workLaunch.value = undefined;
    workRow.value = undefined;
    terminateAction.value = undefined;
    related.value = undefined;
    if (!props.open) autoRanFor = undefined;
    if (props.open && props.contract) {
      activeTab.value = detailTabFor(props.workspace, props.initialTab);
      attachments.value = undefined;
      audit.value = [];
      customs.value = undefined;
      void loadFiles();
      void loadSummary();
      void loadStockOuts();
      void loadRelatedDocs();
      if (activeTab.value === 'audit') void loadAudit();
    }
  },
  { immediate: true },
);
watch(
  () => [props.autoNext, props.contract?.id, props.loading, props.open],
  () => {
    if (props.open) runAutoNext();
  },
  { immediate: true },
);
watch(
  () => props.contract?.version,
  () => {
    if (!props.open) return;
    void loadSummary();
    void loadRelatedDocs();
  },
);
watch(activeTab, (tab) => {
  if (tab === 'audit') void loadAudit();
});
function openDocuments(kind: ContractDocumentKind, mode?: 'create' | 'list') {
  if (!props.contract || childOpen.value) return;
  documentKind.value = kind;
  documentMode.value = mode;
  documentsOpen.value = true;
}
const purchaseOrder = ref<{ contractId: string; orderId: string }>();
function openPurchaseOrder(orderId: string) {
  if (!props.contract || childOpen.value) return;
  purchaseOrder.value = { contractId: props.contract.id, orderId };
}
function startWork(launch: WorkboardLaunch) {
  if (!props.contract || props.loading || childOpen.value) return;
  try {
    if (launch.action && !props.contract.allowedActions.includes(launch.action))
      throw new Error('此操作当前不可用，请刷新订单后重试');
    workRow.value = launch.recordId
      ? workboardDocumentRow(props.contract, launch.kind, launch.recordId)
      : undefined;
    workLaunch.value = launch;
  } catch (error) {
    message.warning(errorText(error));
  }
}
function documentUpdated(value: Contract) {
  if (value.id !== props.contract?.id) return;
  emit('updated', value);
  void loadSummary();
  void loadFiles();
  if (activeTab.value === 'audit') void loadAudit();
}
async function activateContract() {
  const current = props.contract;
  if (
    !current ||
    childOpen.value ||
    props.loading ||
    current.status !== 'DRAFT' ||
    !current.allowedActions.includes('CONFIRM_CONTRACT')
  )
    return;
  activating.value = true;
  try {
    const result = await contractAction(
      current.id,
      'CONFIRM_CONTRACT',
      current.version,
      activationKey,
      {},
    );
    if (props.contract?.id !== current.id) return;
    activationKey = newIdempotencyKey();
    documentUpdated(result);
    message.success('合同已生效，可以继续办理采购、交付和收付款');
  } catch (error) {
    message.error(errorText(error));
  } finally {
    activating.value = false;
  }
}
function startTerminate(action: 'CANCEL_CONTRACT' | 'CLOSE_CONTRACT') {
  if (!props.contract || childOpen.value || props.loading) return;
  terminateReason.value = '';
  terminateKey = newIdempotencyKey();
  terminateAction.value = action;
}
async function terminate() {
  const current = props.contract;
  const action = terminateAction.value;
  if (!current || !action) return;
  const reason = terminateReason.value.trim();
  if (!reason) {
    message.warning(
      action === 'CANCEL_CONTRACT' ? '请填写取消原因' : '请填写结案说明',
    );
    return;
  }
  terminating.value = true;
  try {
    const result = await contractAction(
      current.id,
      action,
      current.version,
      terminateKey,
      { reason },
    );
    terminateAction.value = undefined;
    documentUpdated(result);
    message.success(action === 'CANCEL_CONTRACT' ? '合同已取消' : '合同已结案');
  } catch (error) {
    message.error(errorText(error));
  } finally {
    terminating.value = false;
  }
}
const router = useRouter();
/**
 * 「下属单据新建」（金智同款）：按部门分组，从合同订单直接新建，自动关联本合同。
 * 不能办理的项灰显并提示原因。
 */
const subDocItems = computed(() => {
  const entry = (
    key: string,
    label: string,
    group: string,
    action?: string,
  ) => {
    const reason = action ? quickActionReason(action) : undefined;
    return {
      key,
      label,
      group,
      disabled: Boolean(reason),
      title: reason || undefined,
    };
  };
  return [
    {
      key: 'reimbursement',
      label: '费用报销',
      group: '办公',
      disabled: ended.value,
      title: ended.value ? '合同已结束' : undefined,
    },
    entry('receipt', '回款记录', '合同', 'CREATE_RECEIPT'),
    entry('invoice', '开票记录', '合同', 'CREATE_INVOICE'),
    entry('request', '采购申请单', '采购', 'CREATE_REQUEST'),
    ...(allowed('GENERATE_ORDERS')
      ? [entry('orders', '采购单（按采购方案生成）', '采购', 'GENERATE_ORDERS')]
      : []),
    {
      key: 'shipment',
      label: '出库单',
      group: '库存',
      disabled: ended.value,
      title: ended.value ? '合同已结束' : undefined,
    },
  ];
});
function pickSubDoc(key: string) {
  if (key === 'reimbursement') reimbursementOpen.value = true;
  else if (key === 'receipt')
    openQuickDocument({ action: 'CREATE_RECEIPT', kind: 'receipts' });
  else if (key === 'invoice')
    openQuickDocument({ action: 'CREATE_INVOICE', kind: 'invoices' });
  else if (key === 'request')
    openQuickDocument({ action: 'CREATE_REQUEST', kind: 'requests' });
  else if (key === 'orders')
    openQuickDocument({ action: 'GENERATE_ORDERS', kind: 'orders' });
  else if (key === 'shipment') openStockOut();
}
/** 右侧「摘要」（金智同款）：总金额、未回款、实际回款、待确认、已开票、未开票 */
const summaryCards = computed(() => {
  const contract = props.contract;
  const raw = (key: string) => {
    const value = summary.value?.[key];
    return value === null || value === undefined ? undefined : Number(value);
  };
  const show = (value?: number) =>
    value === undefined || Number.isNaN(value)
      ? '待核对'
      : nativeMoney(value, contract?.currency);
  const total = Number(contract?.amount ?? 0);
  const percent = (part?: number) =>
    part === undefined || !(total > 0)
      ? undefined
      : Math.min(100, Math.round((part / total) * 100));
  const received = raw('confirmedReceipts');
  const unpaid = raw('unpaidAmount');
  const invoiced = raw('effectiveInvoices');
  const uninvoiced =
    invoiced === undefined ? undefined : Math.max(0, total - invoiced);
  return [
    {
      key: 'total',
      label: '总金额',
      value: nativeMoney(contract?.amount, contract?.currency),
    },
    {
      key: 'unpaid',
      label: '未回款额',
      value: show(unpaid),
      percent: percent(unpaid),
      alert: (unpaid ?? 0) > 0,
      tab: 'finance',
    },
    {
      key: 'received',
      label: '实际回款',
      value: show(received),
      percent: percent(received),
      tab: 'finance',
    },
    {
      key: 'pending',
      label: '待财务确认',
      value: show(raw('pendingReceipts')),
      alert: (raw('pendingReceipts') ?? 0) > 0,
      tab: 'finance',
    },
    {
      key: 'invoiced',
      label: '已开票额',
      value: show(invoiced),
      percent: percent(invoiced),
      tab: 'finance',
    },
    {
      key: 'uninvoiced',
      label: '未开票额',
      value: show(uninvoiced),
      percent: percent(uninvoiced),
      tab: 'finance',
    },
  ];
});
/** 下属单据数量，显示在页签上（金智：付款记录 (1)…） */
const timelineCount = computed(
  () =>
    purchaseRows.value.requests.length +
    purchaseRows.value.orders.length +
    shipmentRows.value.length +
    receiptRows.value.length +
    invoiceRows.value.length,
);
function moreAction(key: string) {
  if (!props.contract) return;
  if (key === 'copy') emit('copy', props.contract);
  else if (key === 'close') startTerminate('CLOSE_CONTRACT');
  else if (key === 'cancel') startTerminate('CANCEL_CONTRACT');
  else emit('refresh');
}
function runNext(action: MainlineAction) {
  if (!props.contract || props.loading || childOpen.value) return;
  switch (action.type) {
    case 'activate': {
      void activateContract();
      break;
    }
    case 'complete': {
      completionOpen.value = true;
      break;
    }
    case 'documents': {
      openDocuments(action.kind, 'list');
      break;
    }
    case 'edit': {
      editorOpen.value = true;
      break;
    }
    case 'launch': {
      startWork(action.launch);
      break;
    }
    case 'quick': {
      openQuickDocument({ kind: action.kind, action: action.action });
      break;
    }
    case 'route': {
      void router.push({ path: action.path, query: action.query });
      break;
    }
    case 'stockOut': {
      openStockOut();
      break;
    }
  }
}
function close() {
  if (!childOpen.value) emit('close');
}
async function download(file: { id: string; name: string }) {
  if (!props.contract) return;
  try {
    const blob = await downloadContractProductAttachment(
      props.contract.id,
      file.id,
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  } catch (error) {
    message.error(errorText(error));
  }
}
</script>
<template>
  <FdmResizableDrawer
    resize-key="contract-detail"
    :open="open"
    :title="contract ? contractTitle : '合同详情'"
    width="min(1320px,96vw)"
    :closable="!childOpen"
    :mask-closable="!childOpen"
    :keyboard="!childOpen"
    @close="close"
  >
    <template #title>
      <div v-if="contract" class="contract-title">
        <span class="doc-type">合同单</span>
        <span>{{ contractTitle }}</span>
      </div>
      <span v-else>合同详情</span>
    </template>
    <template #extra>
      <Space v-if="contract">
        <OrderSubDocMenu
          :items="subDocItems"
          :disabled="childOpen || loading"
          @pick="pickSubDoc"
        />
        <Button
          v-if="contract.allowedActions.includes('UPDATE_CONTRACT')"
          :disabled="childOpen || loading"
          @click="editorOpen = true"
        >
          编辑
        </Button>
        <Dropdown :trigger="['click']" :disabled="childOpen">
          <Button>更多</Button>
          <template #overlay>
            <Menu
              :items="[
                {
                  key: 'refresh',
                  label: '刷新合同',
                  disabled: loading || childOpen,
                },
                { key: 'copy', label: '复制为新合同', disabled: childOpen },
                ...(allowed('CLOSE_CONTRACT')
                  ? [
                      {
                        key: 'close',
                        label: '结案',
                        disabled: childOpen || loading,
                      },
                    ]
                  : []),
                ...(allowed('CANCEL_CONTRACT')
                  ? [
                      {
                        key: 'cancel',
                        label: '取消合同',
                        danger: true,
                        disabled: childOpen || loading,
                      },
                    ]
                  : []),
              ]"
              @click="
                (info: { key: string | number }) => moreAction(String(info.key))
              "
            />
          </template>
        </Dropdown>
      </Space>
    </template>
    <div v-if="contract" class="contract-detail contract-layout">
      <div class="contract-main">
        <section class="identity">
          <div class="identity-tags">
            <Tag
              :color="
                ended
                  ? 'default'
                  : contract.status === 'DRAFT'
                    ? 'default'
                    : 'blue'
              "
            >
              {{ label(contract.status) }}
            </Tag>
            <Tag>{{ productCategoryLabel(contract.productCategory) }}</Tag>
            <Tag v-if="contract.businessType">
              {{ label(contract.businessType) }}
            </Tag>
          </div>
          <dl class="info-grid">
            <dt>对应客户</dt>
            <dd>
              <RelatedLink
                :target="entityTarget('customer', contract.customerId)"
              >
                {{ contract.customerName }}
              </RelatedLink>
            </dd>
            <template v-if="!domestic">
              <dt>合同单号</dt>
              <dd>{{ contract.code || '—' }}</dd>
            </template>
            <dt>{{ domestic ? '内部单号' : '内部名称' }}</dt>
            <dd :class="contract.name ? 'internal-name' : 'muted'">
              {{ contract.name || '未填写' }}
            </dd>
            <dt>签单日期</dt>
            <dd>{{ contract.signedDate ?? '未填写' }}</dd>
            <dt>总金额</dt>
            <dd>{{ nativeMoney(contract.amount, contract.currency) }}</dd>
            <dt>所有者</dt>
            <dd>{{ personLabel(directory, contract.ownerUserId) }}</dd>
            <dt>合同主体</dt>
            <dd>{{ company || '待补齐' }}</dd>
            <dt>业务部门</dt>
            <dd>{{ departmentLabel(directory, contract.departmentId) }}</dd>
            <template v-if="!domestic">
              <dt>阿里信保</dt>
              <dd>
                {{
                  contract.alibabaTradeAssuranceNo ||
                  (contract.useTradeAssurance ? '是' : '否')
                }}
              </dd>
            </template>
            <dt>付款条件</dt>
            <dd :class="{ muted: !contract.paymentTerms }">
              {{ contract.paymentTerms || '未填写' }}
            </dd>
            <dt>交付要求</dt>
            <dd :class="{ muted: !contract.deliveryRequirement }">
              {{ contract.deliveryRequirement || '未填写' }}
            </dd>
          </dl>
          <div v-if="contract.salesCharges?.length" class="charges">
            <div
              v-for="charge in contract.salesCharges"
              :key="charge.name"
              class="charge"
            >
              <span>{{ charge.name }}</span><span>{{ nativeMoney(charge.amount, contract.currency) }}</span>
            </div>
          </div>
        </section>

        <AiCheckPanel v-if="!ended" doc-type="CONTRACT" :doc-id="contract.id" />

        <Button
          v-if="
            contract.allowedActions.includes('COMPLETE_IMPORTED_CONTRACT') &&
            !contract.blockReasons?.length
          "
          :disabled="childOpen || loading"
          @click="completionOpen = true"
        >
          补齐办理资料
        </Button>
        <MigrationSource
          :migration="contract.migration"
          :block-reasons="contract.blockReasons"
          :native-source="{ kind: 'CONTRACT', nativeId: contract.id }"
        />
        <section class="products-card" aria-label="产品明细">
          <LineTable
            table="contract"
            :columns="lineColumns"
            :data-source="pipeline"
          >
            <template #extra>
              <Tooltip
                title="数量只统计已匹配到本合同明细的单据；未匹配或独立单据计入关联总数。数量缺失时显示待核对，不按零判定完成。"
              >
                <span class="note" tabindex="0">数量口径说明</span>
              </Tooltip>
            </template>
            <template #bodyCell="{ column, record: item }">
              <div v-if="column.key === 'skuName'" class="prod">
                <img
                  v-if="item.productImageUrl"
                  :src="item.productImageUrl"
                  alt=""
                  class="thumb"
                />
                <span class="strong" :title="item.skuName">{{
                  item.skuName
                }}</span>
              </div>
              <span v-else-if="column.key === 'specification'">{{
                item.specification || item.size || '—'
              }}</span>
              <span v-else-if="column.key === 'quantity'">{{
                Number(item.quantity).toLocaleString('en-US')
              }}</span>
              <span v-else-if="column.key === 'unitPrice'">{{
                item.unitPrice ?? '待定价'
              }}</span>
              <span v-else-if="column.key === 'lineAmount'">{{
                item.lineAmount
                  ? Number(item.lineAmount).toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                    })
                  : '—'
              }}</span>
              <span v-else-if="column.key === 'requiredDate'">{{
                item.requiredDate ?? '未约定'
              }}</span>
              <span
                v-else-if="
                  ['requestedQuantity', 'shippedQuantity'].includes(
                    String(column.key),
                  )
                "
                :class="{
                  done:
                    column.key === 'shippedQuantity' && item.deliveryComplete,
                }"
                >{{ item[String(column.key)] ?? '待核对' }}</span>
              <span
                v-else-if="
                  ['orderedQuantity', 'arrivedQuantity'].includes(
                    String(column.key),
                  )
                "
                >{{ item[String(column.key)] ?? '—' }}</span>
            </template>
            <template #footer>
              <p class="line-total">
                <span>合计 {{ pipeline.length }} 项</span>
                <span>数量 {{ totalQuantity }}</span>
                <span>金额
                  {{ nativeMoney(contract.amount, contract.currency) }}</span>
                <span class="sub">{{
                  Number(contract.additionalAmount) > 0
                    ? `含附加费用 ${nativeMoney(contract.additionalAmount, contract.currency)}`
                    : '没有附加费用'
                }}</span>
              </p>
            </template>
          </LineTable>
        </section>
        <Tabs v-model:active-key="activeTab">
          <TabPane
            key="products"
            :tab="timelineCount ? `时间线 (${timelineCount})` : '时间线'"
          >
            <ContractTimeline
              :requests="purchaseRows.requests"
              :orders="purchaseRows.orders"
              :shipments="shipmentRows"
              :receipts="receiptRows"
              :invoices="invoiceRows"
              @open="(value) => (activeTab = value as DetailTab)"
              @open-order="openPurchaseOrder"
            />
          </TabPane>

          <TabPane
            key="purchase"
            :tab="`采购${related?.requests?.total ? ` ${related.requests.total}` : ''}`"
          >
            <div class="dept">
              <div class="dept-actions">
                <span
                  v-for="entry in [
                    {
                      action: 'CREATE_REQUEST',
                      kind: 'requests' as DocumentKind,
                      title: '新建采购申请',
                    },
                  ]"
                  :key="entry.action"
                  :title="quickActionReason(entry.action)"
                >
                  <Button
                    type="primary"
                    :disabled="Boolean(quickActionReason(entry.action))"
                    @click="openQuickDocument(entry)"
                    >{{ entry.title }}</Button>
                </span>
              </div>
              <h4>采购申请</h4>
              <div v-if="purchaseRows.requests.length" class="mini-table">
                <div
                  v-for="request in purchaseRows.requests"
                  :key="request.id"
                  class="mini-row"
                >
                  <span class="strong">{{
                    request.code || request.name || '采购申请'
                  }}</span>
                  <span>{{ rows(request.items).length }} 项 · 需求
                    {{ requestDue(request) }}</span>
                  <span>{{ label(request.assignmentStatus) }}</span>
                </div>
              </div>
              <p v-else class="muted">还没有采购申请</p>
              <h4>采购任务与报价</h4>
              <div v-if="purchaseRows.tasks.length" class="mini-table">
                <div
                  v-for="task in purchaseRows.tasks"
                  :key="task.id"
                  class="mini-row"
                >
                  <span class="strong">{{
                    itemName(task.contractItemId)
                  }}</span>
                  <span>{{ label(task.method) }} {{ task.quantity }} ·
                    {{ personName(directory, task.ownerUserId) }}</span>
                  <span>{{
                    purchaseRows.quotes.filter(
                      (quote) => quote.assignmentId === task.id,
                    ).length
                      ? `${purchaseRows.quotes.filter((quote) => quote.assignmentId === task.id).length} 份报价`
                      : '还没报价'
                  }}</span>
                </div>
              </div>
              <p v-else class="muted">采购还没接单</p>
              <h4>采购单</h4>
              <div v-if="purchaseRows.orders.length" class="mini-table">
                <button
                  v-for="order in purchaseRows.orders"
                  :key="order.id"
                  type="button"
                  class="mini-row mini-link"
                  :disabled="childOpen"
                  title="打开采购单"
                  @click="openPurchaseOrder(String(order.id))"
                >
                  <span class="strong">{{ order.code || '采购单' }} ·
                    {{ order.supplierName || '供应商未注明' }}</span>
                  <span>{{ nativeMoney(order.amount, order.currency) }}</span>
                  <span>到货 {{ orderProgress(order) }} ·
                    {{ label(order.status) }}</span>
                </button>
              </div>
              <p v-else class="muted">还没有采购单</p>
              <div class="all-links">
                <span class="muted">全部单据：</span>
                <Button
                  v-for="kind in departmentLists.purchase"
                  :key="kind"
                  size="small"
                  :disabled="childOpen"
                  @click="openDocuments(kind, 'list')"
                >
                  {{ documentDefinitions[kind].title }}
                </Button>
              </div>
            </div>
          </TabPane>

          <TabPane key="delivery" :tab="domestic ? '发货' : '发货与报关'">
            <div class="dept">
              <div class="dept-actions">
                <Button
                  type="primary"
                  :disabled="ended || childOpen"
                  @click="openStockOut"
                >
                  新建出库单
                </Button>
                <span class="muted">从工厂仓库按合同销售出库，数量自动记到本合同。</span>
              </div>
              <h4>出库单（{{ stockOuts.length }}）</h4>
              <Alert
                v-if="stockOutsError"
                :message="stockOutsError"
                type="warning"
              />
              <div v-if="stockOuts.length" class="mini-table">
                <div v-for="out in stockOuts" :key="out.id" class="mini-row">
                  <a
                    class="strong"
                    :class="{ muted: out.status === 'VOIDED' }"
                    @click="childOpen || (stockOutViewing = out)"
                    >{{ out.code }}</a>
                  <span>{{ out.warehouseName }}</span>
                  <span>{{ linesTitle(out.lines) }}</span>
                  <span>{{
                    out.status === 'VOIDED' ? '已作废' : out.shippedDate
                  }}</span>
                </div>
              </div>
              <p v-else-if="!stockOutsError" class="muted">还没有出库单</p>
              <h4>发货记录</h4>
              <div v-if="shipmentRows.length" class="mini-table">
                <div
                  v-for="shipment in shipmentRows"
                  :key="shipment.id"
                  class="mini-row"
                >
                  <span class="strong">{{
                    itemName(shipment.contractItemId)
                  }}</span>
                  <span>{{ shipment.kind === 'RETURN' ? '退回 ' : ''
                    }}{{ shipment.quantity }}</span>
                  <span>{{
                    String(
                      shipment.shippedDate ?? shipment.occurredAt ?? '',
                    ).slice(0, 10) || '日期未填'
                  }}</span>
                </div>
              </div>
              <p v-else class="muted">还没有发货记录</p>
              <h4 v-if="!domestic">报关</h4>
              <p v-if="customs && !domestic" class="muted">
                {{
                  customs.total
                    ? `${customs.completed} / ${customs.total} 批已完成，${customs.pending} 批办理中`
                    : '还没有报关批次'
                }}
              </p>
              <Alert
                v-if="customsError && !domestic"
                :message="customsError"
                type="warning"
              />
              <div class="all-links">
                <span class="muted">全部单据：</span>
                <Button
                  v-for="kind in departmentLists.delivery"
                  :key="kind"
                  size="small"
                  :disabled="childOpen"
                  @click="openDocuments(kind, 'list')"
                >
                  {{ documentDefinitions[kind].title }}
                </Button>
                <Button
                  v-if="!domestic"
                  size="small"
                  :disabled="childOpen"
                  @click="openDocuments('customs', 'list')"
                >
                  报关跟进
                </Button>
              </div>
            </div>
          </TabPane>

          <TabPane
            key="finance"
            :tab="`收款与开票${receiptRows.length ? ` ${receiptRows.length}` : ''}`"
          >
            <div class="dept">
              <div class="dept-actions">
                <span
                  v-for="entry in [
                    {
                      action: 'CREATE_RECEIPT',
                      kind: 'receipts' as DocumentKind,
                      title: '登记回款',
                    },
                    {
                      action: 'CREATE_INVOICE',
                      kind: 'invoices' as DocumentKind,
                      title: '开票办理',
                    },
                  ]"
                  :key="entry.action"
                  :title="quickActionReason(entry.action)"
                >
                  <Button
                    :type="
                      entry.action === 'CREATE_RECEIPT' ? 'primary' : 'default'
                    "
                    :disabled="Boolean(quickActionReason(entry.action))"
                    @click="openQuickDocument(entry)"
                    >{{ entry.title }}</Button>
                </span>
                <Button
                  :disabled="childOpen || ended"
                  @click="reimbursementOpen = true"
                >
                  费用报销
                </Button>
              </div>
              <h4>回款</h4>
              <div v-if="receiptRows.length" class="mini-table">
                <div
                  v-for="receipt in receiptRows"
                  :key="receipt.id"
                  class="mini-row"
                >
                  <span class="strong">{{ receipt.receivedAt ?? '日期未填' }} ·
                    {{ label(receipt.kind) }}</span>
                  <span>{{ nativeMoney(receipt.amount, receipt.currency)
                    }}{{
                      receipt.rmbAmount
                        ? ` · 折 CNY ${Number(receipt.rmbAmount).toLocaleString('en-US')}`
                        : ''
                    }}{{
                      receipt.contractAmount !== undefined &&
                      receipt.contractAmount !== null &&
                      receipt.currency !== contract?.currency
                        ? ` · 计入合同 ${nativeMoney(receipt.contractAmount, contract?.currency)}`
                        : ''
                    }}</span>
                  <span><Tag
                      :color="
                        receipt.status === 'CONFIRMED' ? 'green' : 'orange'
                      "
                      >{{ label(receipt.status) }}</Tag></span>
                </div>
              </div>
              <p v-else class="muted">还没有登记回款</p>
              <h4>发票</h4>
              <div v-if="invoiceRows.length" class="mini-table">
                <div
                  v-for="invoice in invoiceRows"
                  :key="invoice.id"
                  class="mini-row"
                >
                  <span class="strong">{{ invoice.invoiceNumber || '发票号未填' }} ·
                    {{ label(invoice.type) }}</span>
                  <span>{{
                    nativeMoney(invoice.amount, invoice.currency)
                  }}</span>
                  <span>{{ invoice.issuedAt ?? '' }}
                    {{ label(invoice.status) }}</span>
                </div>
              </div>
              <p v-else class="muted">还没有开票</p>
              <div class="all-links">
                <span class="muted">全部单据：</span>
                <Button
                  v-for="kind in departmentLists.finance"
                  :key="kind"
                  size="small"
                  :disabled="childOpen"
                  @click="openDocuments(kind, 'list')"
                >
                  {{ documentDefinitions[kind].title }}
                </Button>
              </div>
            </div>
          </TabPane>

          <TabPane
            v-for="group in relatedDocs"
            :key="`doc:${group.key}`"
            :tab="`${group.title} ${group.total}`"
          >
            <ContractRelatedDocs
              :group="group"
              :disabled="childOpen"
              @open="openRelatedDoc"
              @more="group.kind && openDocuments(group.kind, 'list')"
            />
          </TabPane>

          <TabPane key="attachments" tab="合同附件">
            <ContractFilesPanel
              :contract-id="contract.id"
              :listing="attachments"
              :directory="directory"
              :error="attachmentError"
              :loading="attachmentLoading"
              uploadable
              @refresh="loadFiles"
              @busy="(value) => (attachmentBusy = value)"
            />
          </TabPane>
          <TabPane key="audit" tab="操作记录">
            <Alert v-if="auditError" :message="auditError" type="error" />
            <RecordTable
              :data="auditRows"
              :columns="
                columns(
                  'action|业务动作',
                  'actor_id|操作人',
                  'created_at|时间',
                  'document_version|保存版本',
                )
              "
            />
          </TabPane>
        </Tabs>
        <Alert
          v-if="relatedDocsError"
          :message="relatedDocsError"
          type="warning"
        >
          <template #action>
            <Button size="small" @click="loadRelatedDocs">重新读取</Button>
          </template>
        </Alert>
        <Alert v-if="relatedError" :message="relatedError" type="warning">
          <template #action>
            <Button size="small" @click="loadSummary">重新读取</Button>
          </template>
        </Alert>
      </div>
      <aside class="contract-side">
        <SummaryCards
          :cards="summaryCards"
          @open="(value) => (activeTab = value as DetailTab)"
        />
        <section class="side-card" aria-label="待办任务">
          <h3 class="section-title">待办任务</h3>
          <ContractMainline
            :contract="contract"
            :busy="activating"
            :disabled="childOpen"
            :loading="loading"
            @next="runNext"
          />
          <details v-if="allTasks > 0" class="other-tasks">
            <summary>全部待办（{{ allTasks }} 项）</summary>
            <ContractWorkboard
              :contract="contract"
              :disabled="childOpen"
              :loading="loading"
              @launch="startWork"
            />
          </details>
        </section>
        <Card v-if="standardFiles.length" size="small" title="产品标准资料">
          <div v-for="file in standardFiles" :key="file.id" class="file-row">
            <Button
              type="link"
              size="small"
              class="file-link"
              @click="download(file)"
            >
              {{ file.skuName }} · {{ file.name }}
            </Button>
            <FilePreviewButton
              v-if="contract"
              :name="file.name"
              size="small"
              :load="
                () => downloadContractProductAttachment(contract!.id, file.id)
              "
            />
          </div>
        </Card>
      </aside>
    </div>
  </FdmResizableDrawer>
  <Modal
    :open="open && !!terminateAction"
    :title="terminateAction === 'CANCEL_CONTRACT' ? '取消合同' : '合同结案'"
    :confirm-loading="terminating"
    :ok-text="terminateAction === 'CANCEL_CONTRACT' ? '确认取消' : '确认结案'"
    :ok-button-props="{ danger: terminateAction === 'CANCEL_CONTRACT' }"
    :mask-closable="!terminating"
    :closable="!terminating"
    :z-index="2100"
    @cancel="!terminating && (terminateAction = undefined)"
    @ok="terminate"
  >
    <p class="terminate-note">
      {{
        terminateAction === 'CANCEL_CONTRACT'
          ? '取消后合同只能查看，不能再办理采购、发货和收款。还有采购单、到货或回款时系统会拒绝取消。'
          : '结案前系统会核对发货、采购和收款都已办完。'
      }}
      系统要核对库存和财务单据，可能需要等一会儿。
    </p>
    <Input.TextArea
      v-model:value="terminateReason"
      :rows="3"
      :maxlength="1000"
      :disabled="terminating"
      :placeholder="
        terminateAction === 'CANCEL_CONTRACT'
          ? '取消原因（必填）'
          : '结案说明（必填）'
      "
    />
  </Modal>
  <ContractDocumentDialog
    :open="open && documentsOpen"
    :kind="documentKind"
    :mode="documentMode"
    :contract="contract"
    @close="documentsOpen = false"
    @updated="documentUpdated"
  /><ContractEditor
    :open="editorOpen"
    :contract="contract"
    :directory="directory"
    :master="master"
    @close="editorOpen = false"
    @saved="
      (value) => {
        editorOpen = false;
        emit('updated', value);
      }
    "
  /><ImportedContractCompletion
    :open="completionOpen && open"
    :contract="contract"
    :directory="directory"
    @close="completionOpen = false"
    @saved="(value) => emit('updated', value)"
  /><FinanceDocument
    :open="open && reimbursementOpen"
    type="REIMBURSEMENT"
    :context="{ contractId: contract?.id, currency: contract?.currency }"
    @close="reimbursementOpen = false"
    @updated="emit('refresh')"
  />
  <DocumentAction
    v-if="workLaunch?.action"
    :open="open"
    :kind="workLaunch.kind"
    :action="workLaunch.action"
    :contract-id="contract?.id"
    :row="workRow"
    :source="workLaunch.source"
    lock-contract
    @close="workLaunch = undefined"
    @updated="documentUpdated"
  />
  <StockOutDialog
    v-if="stockOutOpen && open && contract"
    :open="stockOutOpen"
    :contract-id="contract.id"
    @close="stockOutOpen = false"
    @saved="stockOutSaved"
  />
  <StockDocDrawer
    v-if="open && (stockOutViewing || stockInViewing)"
    :stock-out="stockOutViewing"
    :stock-in="stockInViewing"
    @close="
      stockOutViewing = undefined;
      stockInViewing = undefined;
    "
  />
  <FinanceDocument
    v-if="open && financeViewing"
    open
    :type="financeViewing.type"
    :record-id="financeViewing.id"
    @close="financeViewing = undefined"
    @updated="relatedDocChanged"
  />
  <BusinessDocumentDetail
    :open="open && !!standaloneViewing"
    :id="standaloneViewing?.id"
    :kind="standaloneViewing?.kind ?? 'requests'"
    :contract-id="contract?.id"
    embedded
    @close="standaloneViewing = undefined"
    @updated="relatedDocChanged"
  />
  <PurchaseOrderExecution
    v-if="purchaseOrder && open"
    :embedded-order="purchaseOrder"
    @close="purchaseOrder = undefined"
    @updated="emit('refresh')"
  />
  <RecordDetail
    v-if="workLaunch && !workLaunch.action"
    :open="open"
    :kind="workLaunch.kind"
    :row="workRow"
    embedded
    @close="workLaunch = undefined"
    @updated="relatedDocChanged"
  />
</template>
<style scoped>
/* 合同订单详情（金智式）：左侧基本信息、产品明细、下属单据页签，右侧摘要与待办 */
.contract-title {
  display: flex;
  gap: 8px;
  align-items: center;
}

.doc-type {
  padding: 0 6px;
  font-size: 12px;
  line-height: 20px;
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 10%);
  border-radius: 4px;
}

.contract-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 16px;
  align-items: start;
}

.contract-main {
  display: flex;
  flex-direction: column;
  gap: 14px;
  align-self: stretch;
  min-width: 0;
}

.contract-side {
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.side-card,
.products-card,
section.identity {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 16px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.section-title {
  padding-left: 8px;
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  border-left: 3px solid hsl(var(--primary));
}

.info-grid {
  display: grid;
  grid-template-columns: 90px minmax(0, 1fr) 90px minmax(0, 1fr);
  gap: 8px 12px;
  margin: 0;
  font-size: 13px;
}

.info-grid dt {
  color: hsl(var(--muted-foreground));
}

.info-grid dd {
  margin: 0;
  overflow-wrap: anywhere;
}

@media (max-width: 1000px) {
  .contract-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .contract-side {
    position: static;
  }

  .info-grid {
    grid-template-columns: 90px minmax(0, 1fr);
  }
}

.contract-detail {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.identity {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px 16px;
  align-items: center;
}

.identity-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.identity-line {
  display: flex;
  flex-wrap: wrap;
  grid-column: 1;
  gap: 4px 14px;
  margin: 0;
  font-size: 13px;
  color: hsl(var(--muted-foreground));
}

.identity-actions {
  display: flex;
  grid-row: 1 / span 2;
  grid-column: 2;
  gap: 6px;
}

.moneybar {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  overflow: hidden;
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
}

.moneybar div {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 8px 14px;
}

.moneybar div + div {
  border-left: 1px solid hsl(var(--border));
}

.moneybar span {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.moneybar b {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 15px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.moneybar b.pending {
  color: color-mix(in srgb, hsl(var(--warning)) 55%, hsl(var(--foreground)));
}

.other-tasks > summary {
  padding: 4px 0;
  font-size: 13px;
  color: hsl(var(--primary));
  cursor: pointer;
}

.products-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 250px;
  gap: 14px;
}

.line-total {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 20px;
  align-items: baseline;
  margin: 8px 0 0;
  font-size: 12.5px;
  font-weight: 600;
}

.line-total .sub {
  font-weight: normal;
}

.done {
  color: hsl(var(--success));
}

.prod {
  display: flex;
  gap: 8px;
  align-items: center;
  min-width: 0;
}

.thumb {
  flex: none;
  width: 34px;
  height: 34px;
  object-fit: cover;
  border-radius: 6px;
}

.strong {
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 600;
  white-space: nowrap;
}

.sub {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
}

.note {
  padding: 6px 12px;
  margin: 0;
  font-size: 12px;
  color: hsl(var(--primary));
  cursor: help;
}

.side {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.kv {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 12px;
  margin: 0;
  font-size: 12.5px;
}

.kv dt,
.muted {
  color: hsl(var(--muted-foreground));
}

.kv dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
}

.charges {
  padding-top: 6px;
  margin-top: 8px;
  border-top: 1px dashed hsl(var(--border));
}

.charge {
  display: flex;
  justify-content: space-between;
  font-size: 12.5px;
}

.file-row {
  display: flex;
  gap: 4px;
  align-items: flex-start;
}

.file-link {
  display: block;
  flex: 1;
  min-width: 0;
  height: auto;
  padding: 2px 0;
  text-align: left;
  white-space: normal;
}

.dept {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dept h4 {
  margin: 8px 0 0;
  font-size: 13px;
  font-weight: 600;
}

.dept-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.mini-table {
  overflow: hidden;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.mini-row {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(0, 1.2fr) minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  padding: 7px 12px;
  font-size: 12.5px;
}

.mini-link {
  width: 100%;
  color: inherit;
  text-align: left;
  cursor: pointer;
  background: none;
  border: 0;
}

.mini-link:hover:not(:disabled) {
  background: hsl(var(--accent));
}

.mini-row + .mini-row {
  border-top: 1px solid hsl(var(--border));
}

.all-links {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  padding-top: 8px;
  margin-top: 4px;
  border-top: 1px dashed hsl(var(--border));
}

.terminate-note {
  font-size: 13px;
  color: hsl(var(--muted-foreground));
}

@media (max-width: 900px) {
  .products-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .moneybar {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .identity {
    grid-template-columns: minmax(0, 1fr);
  }

  .identity-actions {
    grid-row: auto;
    grid-column: 1;
  }
}

.internal-name {
  font-weight: 600;
  color: hsl(var(--primary));
}
</style>
