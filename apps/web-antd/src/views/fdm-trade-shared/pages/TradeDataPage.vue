<script setup lang="ts">
import type { TradeAiSelectedDocument } from '../ai-assistant';
import type { TradeSummaryItem } from '../components';
import type { PrototypeDocumentType } from '../document-routing';
import type {
  ContractOrder,
  CreateOrderDraftInput,
  DemandAnalysis,
  OkkiCustomer,
  PurchaseRequisition,
  QuantityString,
  ReceiptWriteOffInput,
  ReceivableSummary,
} from '../domain/types';
import type { TradePageKey, TradePageRow } from '../page-config';

import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';

import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { IconifyIcon } from '@vben/icons';

import {
  Alert,
  Button,
  Card,
  Descriptions,
  Dropdown,
  Form,
  Input,
  InputNumber,
  List,
  Menu,
  message,
  Modal,
  Popconfirm,
  Select,
  Space,
  Tabs,
  Tag,
} from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';

import {
  MetricCard,
  StatusTag,
  TradeDetailDrawer,
  TradeListShell,
} from '../components';
import DocumentDetailContent from '../components/DocumentDetailContent.vue';
import TradeAiAssistant from '../components/TradeAiAssistant.vue';
import {
  documentDrawerLocation,
  documentPageLocation,
} from '../document-routing';
import { MAIN_ORDER_ID } from '../domain/mock-data';
import { money, sum } from '../domain/money';
import { useTradePrototypeStore } from '../domain/store';
import { findPageRow, moneyText, rowsForPage } from '../page-adapter';
import { TRADE_PAGE_CONFIGS } from '../page-config';
import { statusLabel, statusTone } from '../status';

import '../page-styles.css';

defineOptions({ name: 'FdmTradeDataPage' });

const props = defineProps<{ pageKey: TradePageKey }>();

type ActionKind =
  | 'create-order'
  | 'create-shipment'
  | 'edit-demand'
  | 'okki'
  | 'receipt';

interface DemandEditLine {
  factoryQty: QuantityString;
  id: string;
  orderLineId: string;
  purchaseQty: QuantityString;
  stockQty: QuantityString;
}

const route = useRoute();
const router = useRouter();
const store = useTradePrototypeStore();
const config = computed(() => TRADE_PAGE_CONFIGS[props.pageKey]);

const activeTab = ref(
  typeof route.query.tab === 'string'
    ? route.query.tab
    : config.value.tabs?.[0]?.key,
);
const actionKind = ref<ActionKind>();
const actionRow = ref<TradePageRow>();
const actionOpen = computed({
  get: () => Boolean(actionKind.value),
  set: (open: boolean) => {
    if (!open) {
      actionKind.value = undefined;
      actionRow.value = undefined;
    }
  },
});
const actionBusy = ref(false);
const aiOpen = ref(false);

const okkiKeyword = ref('');
const okkiCandidates = ref<OkkiCustomer[]>([]);
const demandEditLines = ref<DemandEditLine[]>([]);
const receiptForm = reactive<ReceiptWriteOffInput>({
  account: '中国银行武汉分行 · USD 账户',
  actor: '财务专员 金丽丽',
  actualAmount: '12000.00',
  consumedBalanceAmount: '0.00',
  currency: 'USD',
  orderId: MAIN_ORDER_ID,
  payer: 'NOVA FITNESS GMBH',
  rate: '7.18',
  receivedAt: '2026-08-27',
  waiverAmount: '0.00',
});

const pageRows = computed(() =>
  rowsForPage(store.state, props.pageKey, activeTab.value),
);

const detailId = computed(() =>
  typeof route.query.detail === 'string' ? route.query.detail : undefined,
);
const selectedRow = computed(() =>
  detailId.value
    ? findPageRow(store.state, props.pageKey, detailId.value)
    : undefined,
);
const detailOpen = computed(() => Boolean(selectedRow.value));
const aiSelectedDocument = computed<TradeAiSelectedDocument | undefined>(() => {
  const row = selectedRow.value;
  if (!row) return undefined;
  return {
    id: row.id,
    label: row.primary,
    type: row.rawType as TradeAiSelectedDocument['type'],
  };
});
const receivableSummary = ref<ReceivableSummary>();

const searchSchema: VbenFormSchema[] = [
  {
    component: 'Input',
    componentProps: {
      allowClear: true,
      placeholder: '搜索单号、名称、客户或供应商',
    },
    fieldName: 'keyword',
    label: '关键词',
  },
  {
    component: 'Select',
    componentProps: {
      allowClear: true,
      options: [
        { label: '草稿', value: 'DRAFT' },
        { label: '执行中', value: 'IN_PROGRESS' },
        { label: '已确认', value: 'CONFIRMED' },
        { label: '已完成', value: 'COMPLETED' },
        { label: 'AI 草稿', value: 'AI_DRAFT' },
        { label: '已齐套', value: 'READY' },
      ],
      placeholder: '全部状态',
    },
    fieldName: 'status',
    label: '状态',
  },
  {
    component: 'Input',
    componentProps: { allowClear: true, placeholder: '输入负责人' },
    fieldName: 'owner',
    label: '负责人',
  },
  {
    component: 'RangePicker',
    componentProps: {
      allowClear: true,
      placeholder: ['开始日期', '结束日期'],
      valueFormat: 'YYYY-MM-DD',
    },
    fieldName: 'dateRange',
    label: '关键日期',
  },
];

function filterRows(rows: TradePageRow[], formValues: Record<string, unknown>) {
  const keyword = String(formValues.keyword ?? '')
    .trim()
    .toLowerCase();
  const status = String(formValues.status ?? '').trim();
  const owner = String(formValues.owner ?? '')
    .trim()
    .toLowerCase();
  const dateRange = Array.isArray(formValues.dateRange)
    ? formValues.dateRange.map(String)
    : [];

  return rows.filter((row) => {
    const searchable = [
      row.id,
      row.primary,
      row.secondary,
      row.partner,
      row.source,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (keyword && !searchable.includes(keyword)) return false;
    if (status && row.status !== status) return false;
    if (owner && !row.owner?.toLowerCase().includes(owner)) return false;
    if (
      dateRange.length === 2 &&
      row.date &&
      (row.date < dateRange[0]! || row.date > dateRange[1]!)
    ) {
      return false;
    }
    return true;
  });
}

const [Grid, gridApi] = useVbenVxeGrid({
  formOptions: {
    collapsed: true,
    collapsedRows: 1,
    schema: searchSchema,
    showCollapseButton: true,
    wrapperClass: 'grid-cols-1 md:grid-cols-2 xl:grid-cols-4',
  },
  gridOptions: {
    border: true,
    columns: config.value.columns,
    height: 'auto',
    keepSource: true,
    pagerConfig: { pageSize: 20 },
    proxyConfig: {
      ajax: {
        query: async ({ page }, formValues) => {
          const filtered = filterRows(pageRows.value, formValues);
          const pageSize = page?.pageSize ?? 20;
          const currentPage = page?.currentPage ?? 1;
          const start = (currentPage - 1) * pageSize;
          return {
            list: filtered.slice(start, start + pageSize),
            total: filtered.length,
          };
        },
      },
    },
    rowConfig: { isHover: true, keyField: 'id' },
    showOverflow: true,
    toolbarConfig: {
      custom: true,
      refresh: true,
      search: true,
      zoom: true,
    },
  } as VxeTableGridOptions<TradePageRow>,
});

const summaryItems = computed<TradeSummaryItem[]>(() => {
  const result: TradeSummaryItem[] = [
    {
      key: 'count',
      label: '当前页签记录',
      value: `${pageRows.value.length} 条`,
    },
    {
      key: 'attention',
      label: '需关注',
      tone: 'warning',
      value: `${pageRows.value.filter((row) => row.risk === 'HIGH' || row.status === 'BLOCKED').length} 条`,
    },
  ];
  for (const currency of ['CNY', 'EUR', 'USD']) {
    const rows = pageRows.value.filter(
      (row) => row.currency === currency && row.amount,
    );
    if (rows.length > 0) {
      result.push({
        key: `amount-${currency}`,
        label: `${currency} 当前筛选口径`,
        value: moneyText(
          currency,
          money(sum(rows, (row) => row.amount ?? '0')),
        ),
      });
    }
  }
  return result;
});

const detailMetrics = computed(() => {
  const row = selectedRow.value;
  if (!row) return [];
  if (row.rawType === 'ORDER' && receivableSummary.value) {
    const order = row.raw as unknown as ContractOrder;
    return [
      {
        key: 'contract',
        label: '合同有效金额',
        value: moneyText(order.currency, order.totalAmount),
        icon: 'lucide:file-signature',
      },
      {
        key: 'actual',
        label: '实际回款',
        value: moneyText(
          order.currency,
          receivableSummary.value.actualReceiptAmount,
        ),
        icon: 'lucide:landmark',
        tone: 'success' as const,
      },
      {
        key: 'writeoff',
        label: '回款冲销',
        value: moneyText(
          order.currency,
          receivableSummary.value.writeOffAmount,
        ),
        icon: 'lucide:badge-check',
      },
      {
        key: 'outstanding',
        label: '未回款',
        value: moneyText(
          order.currency,
          receivableSummary.value.outstandingAmount,
        ),
        icon: 'lucide:triangle-alert',
        tone:
          receivableSummary.value.outstandingAmount === '0.00'
            ? ('success' as const)
            : ('warning' as const),
      },
    ];
  }
  return [
    {
      key: 'amount',
      label: row.currency ? '业务金额' : '业务记录',
      value: row.currency ? moneyText(row.currency, row.amount) : row.primary,
      icon: 'lucide:badge-dollar-sign',
    },
    {
      key: 'status',
      label: '当前状态',
      value: row.statusLabel,
      icon: 'lucide:circle-dot-dashed',
    },
    {
      key: 'owner',
      label: '责任人 / 部门',
      value: row.owner ?? config.value.department,
      icon: 'lucide:user-round-check',
    },
    {
      key: 'next',
      label: '下一步',
      value: row.nextStep ?? defaultNextStep(row),
      icon: 'lucide:route',
    },
  ];
});

function defaultNextStep(row: TradePageRow) {
  if (row.rawType === 'DEMAND_ANALYSIS') return '人工校验并确认拆分';
  if (row.rawType === 'PURCHASE_REQUISITION') return '采购确认供应商';
  if (row.rawType === 'FOLLOW_UP_TASK') return '补齐资料并人工复核';
  if (row.rawType === 'FACTORY_TASK') return '供应链更新完成数量';
  if (row.rawType === 'RECEIPT') return '财务确认分配与冲销';
  return '查看关联单据并继续执行';
}

function pageDocumentType(row: TradePageRow): PrototypeDocumentType {
  if (row.rawType === 'WRITE_OFF_ITEM') return 'WRITE_OFF_ITEM';
  return row.rawType as PrototypeDocumentType;
}

async function openDetail(row: TradePageRow) {
  if (window.innerWidth < 1200) {
    await router.push(documentPageLocation(pageDocumentType(row), row.id));
    return;
  }
  await router.push({
    path: route.path,
    query: { ...route.query, detail: row.id },
  });
}

async function closeDetail() {
  const closingId = detailId.value;
  const query = { ...route.query };
  delete query.detail;
  await router.replace({ path: route.path, query });
  await nextTick();
  if (closingId) {
    document
      .querySelector<HTMLElement>(
        `[data-trade-detail-id="${CSS.escape(closingId)}"]`,
      )
      ?.focus();
  }
}

async function openIndependentPage() {
  const row = selectedRow.value;
  if (!row) return;
  await router.push(documentPageLocation(pageDocumentType(row), row.id));
}

async function navigateDocument(type: PrototypeDocumentType, id: string) {
  await router.push(documentDrawerLocation(type, id));
}

function handleDocumentNavigation(event: Event) {
  const customEvent = event as CustomEvent<{ path?: string }>;
  if (customEvent.detail?.path) void router.push(customEvent.detail.path);
}

function changeTab(tab: number | string) {
  const nextTab = String(tab);
  activeTab.value = nextTab;
  void router.replace({
    path: route.path,
    query: { ...route.query, tab: nextTab },
  });
  void nextTick(() => gridApi.query());
}

function openAction(kind: ActionKind, row?: TradePageRow) {
  actionKind.value = kind;
  actionRow.value = row;
  if (kind === 'edit-demand' && row) {
    const value = row.raw as unknown as DemandAnalysis;
    demandEditLines.value = value.lines.map((line) => ({
      factoryQty: line.factoryQty,
      id: line.id,
      orderLineId: line.orderLineId,
      purchaseQty: line.purchaseQty,
      stockQty: line.stockQty,
    }));
  }
}

async function searchOkki() {
  try {
    okkiCandidates.value = await store.searchOkkiCustomers(okkiKeyword.value);
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error));
  }
}

async function importOkki(candidate: OkkiCustomer) {
  actionBusy.value = true;
  try {
    const customer = await store.importTradingCustomer(
      candidate.id,
      '外贸业务员',
    );
    message.success(
      candidate.mappedCustomerId
        ? `已选用现有交易客户：${customer.name}`
        : `已导入并创建交易客户：${customer.name}`,
    );
    actionOpen.value = false;
    await gridApi.query();
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error));
  } finally {
    actionBusy.value = false;
  }
}

function orderDraftInput(customerId: string): CreateOrderDraftInput {
  return {
    additionalFee: '180.00',
    company: '飞德慕国际贸易有限公司',
    currency: 'USD',
    customerId,
    destinationPort: 'Rotterdam, Netherlands',
    exchangeRate: '7.18',
    incoterm: 'FOB Shanghai',
    lines: [
      {
        amount: '6780.00',
        availableStockQty: '40',
        customerSku: 'DEMO-TPE-300',
        packagingVersion: 'PKG-DEMO-V1',
        productName: '6mm TPE 瑜伽垫（演示外销 SKU）',
        productVersion: 'TPE-2026-V2',
        quantity: '300',
        sku: 'MAT-TPE-06',
        specification: '1830 × 610 × 6 mm / 客户色',
        suggestedFactoryQty: '260',
        suggestedPurchaseQty: '0',
        suggestedStockQty: '40',
        unit: '张',
        unitPrice: '22.60',
      },
    ],
    originPort: '上海港',
    owner: '林晓月',
    paymentTerms: '30% 定金，70% 出货前',
    requiredShipAt: '2026-10-30',
    signedAt: '2026-08-27',
    type: 'BULK',
  };
}

async function createOrderForCustomer(row?: TradePageRow) {
  const customerId = row?.id ?? store.state.customers[0]?.id;
  if (!customerId) return message.warning('请先导入交易客户');
  actionBusy.value = true;
  try {
    const order = await store.createOrderDraft(
      orderDraftInput(customerId),
      '外贸业务员',
    );
    message.success(`已创建合同订单草稿 ${order.id}`);
    actionOpen.value = false;
    await router.push(documentDrawerLocation('ORDER', order.id));
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error));
  } finally {
    actionBusy.value = false;
  }
}

async function generateDemand(row?: TradePageRow) {
  const orderId =
    row?.rawType === 'ORDER'
      ? row.id
      : (store.state.orders.find(
          (order) =>
            !store.state.demandAnalyses.some(
              (analysis) => analysis.orderId === order.id,
            ),
        )?.id ?? MAIN_ORDER_ID);
  actionBusy.value = true;
  try {
    const analysis = await store.generateDemandDraft(orderId);
    message.success(`AI 已生成需求分析草稿 ${analysis.id}，等待人工确认`);
    await router.push(documentDrawerLocation('DEMAND_ANALYSIS', analysis.id));
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error));
  } finally {
    actionBusy.value = false;
  }
}

async function saveDemandEdits() {
  const row = actionRow.value;
  if (!row) return;
  actionBusy.value = true;
  try {
    for (const line of demandEditLines.value) {
      await store.updateDemandSplit(
        row.id,
        line.id,
        {
          factoryQty: line.factoryQty,
          purchaseQty: line.purchaseQty,
          stockQty: line.stockQty,
        },
        '外贸业务员',
      );
    }
    message.success('人工调整已保存；系统将在确认时再次执行数量守恒校验');
    actionOpen.value = false;
    await gridApi.query();
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error));
  } finally {
    actionBusy.value = false;
  }
}

async function saveAndConfirmDemand() {
  const row = actionRow.value;
  if (!row) return;
  actionBusy.value = true;
  try {
    for (const line of demandEditLines.value) {
      await store.updateDemandSplit(
        row.id,
        line.id,
        {
          factoryQty: line.factoryQty,
          purchaseQty: line.purchaseQty,
          stockQty: line.stockQty,
        },
        '外贸业务员',
      );
    }
    const result = await store.confirmDemandSplit(row.id, '外贸业务员');
    message.success(
      `数量守恒校验通过；已生成 ${result.purchaseRequisitions.length} 张采购申请、${result.factoryTasks.length} 张工厂任务草稿`,
    );
    actionOpen.value = false;
    await gridApi.query();
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error));
  } finally {
    actionBusy.value = false;
  }
}

async function adoptSuggestion(row: TradePageRow) {
  const requisition = row.raw as unknown as PurchaseRequisition;
  const line =
    requisition.lines.find(
      (item) => !item.selectedSupplierId && item.suggestions.length > 0,
    ) ?? requisition.lines[0];
  const supplierId =
    line?.selectedSupplierId ?? line?.suggestions[0]?.supplierId;
  if (!line || !supplierId)
    return message.warning('当前申请没有可采用的供应商建议');
  actionBusy.value = true;
  try {
    const result = await store.adoptSupplierSuggestion(
      requisition.id,
      line.id,
      supplierId,
      '采购专员',
    );
    message.success(
      `已采用供应商建议并生成采购订单草稿 ${result.purchaseOrder.id}`,
    );
    await router.push(
      documentDrawerLocation('PURCHASE_ORDER', result.purchaseOrder.id),
    );
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error));
  } finally {
    actionBusy.value = false;
  }
}

async function checkCustoms(row?: TradePageRow) {
  const taskId =
    row?.rawType === 'FOLLOW_UP_TASK'
      ? row.id
      : store.state.followUpTasks[0]?.id;
  if (!taskId) return message.warning('暂无跟单与报关任务');
  actionBusy.value = true;
  try {
    const result = await store.checkCustomsReadiness(taskId);
    if (result.readiness === 'READY') {
      message.success('AI 检查完成：资料齐套；仍需采购跟单人员复核');
    } else {
      message.warning(
        `AI 检查完成：缺少 ${result.missingDocumentIds.length} 项资料，不能进入正式申报`,
      );
    }
    await gridApi.query();
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error));
  } finally {
    actionBusy.value = false;
  }
}

async function updateFactoryProgress(row: TradePageRow) {
  const value = row.raw as unknown as { requiredQty: QuantityString };
  actionBusy.value = true;
  try {
    await store.updateFactoryTaskProgress(
      row.id,
      value.requiredQty,
      '供应链专员',
    );
    message.success('工厂完成数量已更新为要求数量（模拟）');
    await gridApi.query();
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error));
  } finally {
    actionBusy.value = false;
  }
}

async function createShipment(row?: TradePageRow) {
  const orderId = row?.rawType === 'ORDER' ? row.id : MAIN_ORDER_ID;
  const order = store.state.orders.find((item) => item.id === orderId);
  if (!order) return message.warning('未找到可发货合同');
  actionBusy.value = true;
  try {
    const result = await store.createShipmentDraft(
      {
        batch: `演示批次 ${store.state.shipments.length + 1}`,
        eta: '2026-11-23',
        etd: '2026-10-25',
        lines: order.lines.map((line) => ({
          orderLineId: line.id,
          quantity: line.quantity,
          sources: [
            {
              quantity: line.quantity,
              sourceId: line.id,
              sourceLocation:
                line.suggestedFactoryQty === '0' ? '武汉仓' : '黄石飞德慕工厂',
              sourceType:
                line.suggestedFactoryQty === '0' ? 'WAREHOUSE' : 'FACTORY',
            },
          ],
        })),
        orderId,
        owner: '供应链专员',
      },
      '外贸业务员',
    );
    message.success(
      `已创建发货草稿 ${result.shipment.id}、${result.outboundDocuments.length} 张出库草稿和跟单任务`,
    );
    actionOpen.value = false;
    await router.push(documentDrawerLocation('SHIPMENT', result.shipment.id));
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error));
  } finally {
    actionBusy.value = false;
  }
}

async function recordReceipt() {
  actionBusy.value = true;
  try {
    const result = await store.recordReceiptAndWriteOff({ ...receiptForm });
    message.success(
      `已登记：实际回款 ${moneyText(receiptForm.currency, result.summary.actualReceiptAmount)}；回款冲销 ${moneyText(receiptForm.currency, result.summary.writeOffAmount)}；未回款 ${moneyText(receiptForm.currency, result.summary.outstandingAmount)}`,
    );
    actionOpen.value = false;
    await router.push(documentDrawerLocation('RECEIPT', result.receipt.id));
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error));
  } finally {
    actionBusy.value = false;
  }
}

function handlePrimaryAction() {
  if (props.pageKey === 'customer') return openAction('okki');
  if (props.pageKey === 'contract-order') return openAction('create-order');
  if (props.pageKey === 'demand-analysis') return void generateDemand();
  if (props.pageKey === 'follow-up-customs') return void checkCustoms();
  if (props.pageKey === 'shipment-outbound')
    return openAction('create-shipment');
  if (props.pageKey === 'receipt-writeoff') return openAction('receipt');
  message.info('此入口用于查看和处理已生成的跨部门单据');
}

function nextActionLabel(row: TradePageRow) {
  if (row.rawType === 'CUSTOMER') return '创建合同草稿';
  if (
    row.rawType === 'ORDER' &&
    !store.state.demandAnalyses.some((item) => item.orderId === row.id)
  ) {
    return '运行 AI 需求';
  }
  if (row.rawType === 'DEMAND_ANALYSIS' && row.status === 'AI_DRAFT') {
    return '调整 / 确认';
  }
  if (
    row.rawType === 'PURCHASE_REQUISITION' &&
    row.status === 'DRAFT' &&
    !store.state.purchaseOrders.some((item) => item.requisitionId === row.id)
  ) {
    return '采用建议';
  }
  if (row.rawType === 'FOLLOW_UP_TASK') return 'AI 检查资料';
  if (row.rawType === 'FACTORY_TASK' && row.status !== 'COMPLETED') {
    return '更新进度';
  }
  return undefined;
}

function runNextAction(row: TradePageRow) {
  if (row.rawType === 'CUSTOMER') return void createOrderForCustomer(row);
  if (row.rawType === 'ORDER') return void generateDemand(row);
  if (row.rawType === 'DEMAND_ANALYSIS') return openAction('edit-demand', row);
  if (row.rawType === 'PURCHASE_REQUISITION') return void adoptSuggestion(row);
  if (row.rawType === 'FOLLOW_UP_TASK') return void checkCustoms(row);
  if (row.rawType === 'FACTORY_TASK') return void updateFactoryProgress(row);
}

function handleSubordinateMenu({ key }: { key: number | string }) {
  const row = selectedRow.value;
  if (!row) return;
  if (key === 'demand') void generateDemand(row);
  if (key === 'shipment') openAction('create-shipment', row);
  if (key === 'expense') {
    message.info('费用申请草稿将在“应付与费用”权威页面建立；首版不模拟审批。');
  }
}

async function resetPrototype() {
  try {
    await store.reset();
    message.success('演示数据已恢复；只重置当前外贸 CRM 原型会话数据');
    await closeDetail();
    await gridApi.query();
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error));
  }
}

watch(
  () => route.query.tab,
  (value) => {
    const tab = typeof value === 'string' ? value : config.value.tabs?.[0]?.key;
    if (tab && tab !== activeTab.value) activeTab.value = tab;
  },
);

watch(
  selectedRow,
  async (row) => {
    receivableSummary.value = undefined;
    if (row?.rawType === 'ORDER') {
      try {
        receivableSummary.value = await store.getReceivableSummary(row.id);
      } catch {
        // The store exposes the error and the drawer keeps its generic summary.
      }
    }
  },
  { immediate: true },
);

onMounted(async () => {
  window.addEventListener('fdm-trade:navigate', handleDocumentNavigation);
  try {
    if (!store.initialized) await store.initialize();
    await gridApi.query();
  } catch (error) {
    message.warning(
      `原型会话恢复失败，已使用固定演示数据：${error instanceof Error ? error.message : String(error)}`,
    );
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('fdm-trade:navigate', handleDocumentNavigation);
});
</script>

<template>
  <TradeListShell
    :description="`${config.department} · ${config.description}`"
    :loading="store.loading"
    :summary-items="summaryItems"
    :title="config.title"
  >
    <template #actions>
      <Button ghost type="primary" @click="aiOpen = true">
        <template #icon>
          <IconifyIcon icon="lucide:bot" />
        </template>
        询问 AI 助手
      </Button>
      <Button
        v-if="config.primaryAction"
        :loading="actionBusy"
        type="primary"
        @click="handlePrimaryAction"
      >
        <template #icon>
          <IconifyIcon icon="lucide:plus" />
        </template>
        {{ config.primaryAction }}
      </Button>
      <Popconfirm
        title="只重置当前外贸 CRM 原型的浏览器会话数据，确定继续？"
        @confirm="resetPrototype"
      >
        <Button>
          <template #icon><IconifyIcon icon="lucide:rotate-ccw" /></template>
          重置演示数据
        </Button>
      </Popconfirm>
    </template>

    <template v-if="config.tabs" #scope>
      <Tabs :active-key="activeTab" @change="changeTab">
        <Tabs.TabPane
          v-for="tab in config.tabs"
          :key="tab.key"
          :tab="tab.label"
        />
      </Tabs>
    </template>

    <Alert
      v-if="store.error"
      banner
      closable
      :message="store.error"
      show-icon
      type="error"
    />

    <Grid>
      <template #primary="{ row }">
        <Button
          :data-trade-detail-id="row.id"
          type="link"
          @click="openDetail(row)"
        >
          {{ row.primary }}
        </Button>
        <div v-if="row.secondary" class="fdm-trade-cell-subtext">
          {{ row.secondary }}
        </div>
      </template>
      <template #status="{ row }">
        <StatusTag :text="row.statusLabel" :tone="statusTone(row.status)" />
      </template>
      <template #amount="{ row }">
        <span class="fdm-trade-money">
          {{ moneyText(row.currency, row.amount) }}
        </span>
      </template>
      <template #actions="{ row }">
        <Space :size="2">
          <Button type="link" @click="openDetail(row)">查看</Button>
          <Button
            v-if="nextActionLabel(row)"
            type="link"
            @click="runNextAction(row)"
          >
            {{ nextActionLabel(row) }}
          </Button>
          <Dropdown>
            <Button type="link">更多</Button>
            <template #overlay>
              <Menu>
                <Menu.Item key="source" disabled>查看来源关系</Menu.Item>
                <Menu.Item key="audit" disabled>查看审计记录</Menu.Item>
              </Menu>
            </template>
          </Dropdown>
        </Space>
      </template>
    </Grid>

    <TradeDetailDrawer
      :document-type="config.detailTitle"
      :loading="store.loading"
      :open="detailOpen"
      show-independent-page
      :status="selectedRow?.statusLabel"
      :status-tone="statusTone(selectedRow?.status)"
      :subtitle="selectedRow?.partner || selectedRow?.source"
      :title="selectedRow?.primary || config.detailTitle"
      @close="closeDetail"
      @independent-page="openIndependentPage"
      @update:open="$event || closeDetail()"
    >
      <template #header-actions>
        <Button @click="aiOpen = true">
          <template #icon>
            <IconifyIcon icon="lucide:sparkles" />
          </template>
          AI 分析当前单据
        </Button>
        <Dropdown v-if="selectedRow?.rawType === 'ORDER'">
          <Button type="primary">
            下属单据新建
            <IconifyIcon icon="lucide:chevron-down" />
          </Button>
          <template #overlay>
            <Menu @click="handleSubordinateMenu">
              <Menu.Item key="demand">生成 AI 需求分析草稿</Menu.Item>
              <Menu.Item key="shipment">创建发货批次草稿</Menu.Item>
              <Menu.Item key="expense">创建订单费用申请草稿</Menu.Item>
            </Menu>
          </template>
        </Dropdown>
      </template>

      <template #metrics>
        <MetricCard
          v-for="metric in detailMetrics"
          :key="metric.key"
          :icon="metric.icon"
          :label="metric.label"
          :tone="metric.tone"
          :value="metric.value"
        />
      </template>

      <DocumentDetailContent
        v-if="selectedRow"
        :page-key="pageKey"
        :receivable-summary="receivableSummary"
        :row="selectedRow"
        :state="store.state"
        @navigate-document="navigateDocument"
      />

      <template #context>
        <Card :bordered="false" size="small" title="业务上下文">
          <Descriptions :column="1" size="small">
            <Descriptions.Item label="权威部门">
              {{ config.department }}
            </Descriptions.Item>
            <Descriptions.Item label="当前风险">
              <StatusTag
                :text="statusLabel(selectedRow?.risk)"
                :tone="statusTone(selectedRow?.risk)"
              />
            </Descriptions.Item>
            <Descriptions.Item label="下一步">
              {{ selectedRow ? defaultNextStep(selectedRow) : '—' }}
            </Descriptions.Item>
            <Descriptions.Item label="接口状态">
              <Tag>浏览器会话模拟</Tag>
            </Descriptions.Item>
          </Descriptions>
        </Card>
        <Alert
          class="fdm-trade-context-alert"
          message="首版不模拟审批"
          description="这里只显示业务状态、责任部门和下一步；正式接入时复用现有钉钉审批能力。"
          show-icon
          type="info"
        />
      </template>
    </TradeDetailDrawer>
  </TradeListShell>

  <TradeAiAssistant
    v-model:open="aiOpen"
    :active-tab="activeTab"
    :page-key="pageKey"
    :selected-document="aiSelectedDocument"
  />

  <Modal
    v-model:open="actionOpen"
    :confirm-loading="actionBusy"
    :footer="actionKind === 'okki' ? null : undefined"
    :title="
      actionKind === 'okki'
        ? '从 OKKI 选择交易客户'
        : actionKind === 'create-order'
          ? '创建合同订单草稿'
          : actionKind === 'edit-demand'
            ? '人工调整需求拆分'
            : actionKind === 'receipt'
              ? '登记模拟到账与冲销'
              : actionKind === 'create-shipment'
                ? '创建发货批次草稿'
                : '确认业务动作'
    "
    width="760px"
    @ok="
      actionKind === 'create-order'
        ? createOrderForCustomer(actionRow)
        : actionKind === 'edit-demand'
          ? saveDemandEdits()
          : actionKind === 'receipt'
            ? recordReceipt()
            : actionKind === 'create-shipment'
              ? createShipment(actionRow)
              : undefined
    "
  >
    <template v-if="actionKind === 'edit-demand'" #footer>
      <Space>
        <Button :disabled="actionBusy" @click="actionOpen = false">
          取消
        </Button>
        <Button :loading="actionBusy" @click="saveDemandEdits">
          保存调整
        </Button>
        <Button
          :loading="actionBusy"
          type="primary"
          @click="saveAndConfirmDemand"
        >
          校验并确认
        </Button>
      </Space>
    </template>

    <div v-if="actionKind === 'okki'" class="fdm-trade-action-modal">
      <Input.Search
        v-model:value="okkiKeyword"
        enter-button="搜索 OKKI"
        placeholder="输入客户名称、联系人、国家或 OKKI 编号"
        @search="searchOkki"
      />
      <Alert
        message="原型使用模拟 OKKI 客户；正式接入时先读取企业字段字典再执行字段映射。"
        show-icon
        type="info"
      />
      <List
        :data-source="okkiCandidates"
        :locale="{ emptyText: '输入关键词开始搜索' }"
      >
        <template #renderItem="{ item }">
          <List.Item>
            <List.Item.Meta
              :description="`${item.country} · ${item.contactName} · ${item.stage} · 负责人 ${item.owner}`"
              :title="`${item.name} (${item.serialId})`"
            />
            <Button
              :loading="actionBusy"
              type="primary"
              @click="importOkki(item)"
            >
              {{ item.mappedCustomerId ? '直接选用' : '导入交易客户' }}
            </Button>
          </List.Item>
        </template>
      </List>
    </div>

    <Alert
      v-else-if="actionKind === 'create-order'"
      message="将使用当前交易客户和模拟外销 SKU 创建合同订单草稿。AI 不会自动提交正式订单。"
      show-icon
      type="info"
    />

    <div
      v-else-if="actionKind === 'edit-demand'"
      class="fdm-trade-action-modal"
    >
      <Alert
        message="库存满足 + 内部工厂 + 外部采购必须等于订单数量；保存调整不会自动确认。"
        show-icon
        type="warning"
      />
      <div
        v-for="line in demandEditLines"
        :key="line.id"
        class="fdm-trade-demand-edit-row"
      >
        <strong>{{ line.orderLineId }}</strong>
        <Form.Item label="库存满足">
          <InputNumber
            v-model:value="line.stockQty"
            class="w-full"
            min="0"
            string-mode
          />
        </Form.Item>
        <Form.Item label="内部工厂">
          <InputNumber
            v-model:value="line.factoryQty"
            class="w-full"
            min="0"
            string-mode
          />
        </Form.Item>
        <Form.Item label="外部采购">
          <InputNumber
            v-model:value="line.purchaseQty"
            class="w-full"
            min="0"
            string-mode
          />
        </Form.Item>
      </div>
    </div>

    <Form
      v-else-if="actionKind === 'receipt'"
      class="fdm-trade-receipt-form"
      layout="vertical"
    >
      <Alert
        message="实际回款与冲销金额分开统计；输入余额消费和减免不会增加实际回款。"
        show-icon
        type="info"
      />
      <div class="fdm-trade-receipt-form__grid">
        <Form.Item label="合同订单">
          <Select
            v-model:value="receiptForm.orderId"
            :options="
              store.state.orders.map((order) => ({
                label: `${order.id} · ${moneyText(order.currency, order.totalAmount)}`,
                value: order.id,
              }))
            "
          />
        </Form.Item>
        <Form.Item label="币种">
          <Select
            v-model:value="receiptForm.currency"
            :options="
              ['USD', 'EUR', 'CNY'].map((value) => ({ label: value, value }))
            "
          />
        </Form.Item>
        <Form.Item label="真实到款金额">
          <InputNumber
            v-model:value="receiptForm.actualAmount"
            class="w-full"
            min="0"
            string-mode
          />
        </Form.Item>
        <Form.Item label="客户余额消费">
          <InputNumber
            v-model:value="receiptForm.consumedBalanceAmount"
            class="w-full"
            min="0"
            string-mode
          />
        </Form.Item>
        <Form.Item label="审核减免 / 坏账">
          <InputNumber
            v-model:value="receiptForm.waiverAmount"
            class="w-full"
            min="0"
            string-mode
          />
        </Form.Item>
        <Form.Item label="回款日汇率">
          <InputNumber
            v-model:value="receiptForm.rate"
            class="w-full"
            min="0"
            string-mode
          />
        </Form.Item>
        <Form.Item label="付款方">
          <Input v-model:value="receiptForm.payer" />
        </Form.Item>
        <Form.Item label="到款账户">
          <Input v-model:value="receiptForm.account" />
        </Form.Item>
      </div>
    </Form>

    <Alert
      v-else-if="actionKind === 'create-shipment'"
      message="将按来源地点生成发货草稿、出库草稿和跟单任务；不会直接确认库存扣减。"
      show-icon
      type="info"
    />
  </Modal>
</template>
