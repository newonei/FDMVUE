<script lang="ts" setup>
import type {
  ContractOrder,
  Customer,
  OkkiCustomer,
  PrototypeData,
  PrototypeView,
} from './mock-data';

import { computed, reactive, ref, watch } from 'vue';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  Descriptions,
  DescriptionsItem,
  Divider,
  Drawer,
  Empty,
  Form,
  FormItem,
  Input,
  InputNumber,
  message,
  Modal,
  Progress,
  Radio,
  RadioGroup,
  Row,
  Select,
  SelectOption,
  Space,
  Spin,
  Statistic,
  Steps,
  Table,
  Tabs,
  Tag,
  Timeline,
  TimelineItem,
  Tooltip,
} from 'ant-design-vue';

import {
  createPrototypeData,
  mainOrderId,
  supplierRecommendations,
} from './mock-data';

defineOptions({ name: 'FdmWaimaoCrmPrototype' });

const storageKey = 'fdm:foreign-trade-crm-prototype:v1';

function loadPrototypeData() {
  try {
    const cached = sessionStorage.getItem(storageKey);
    return cached
      ? (JSON.parse(cached) as PrototypeData)
      : createPrototypeData();
  } catch {
    return createPrototypeData();
  }
}

const data = ref<PrototypeData>(loadPrototypeData());
watch(
  data,
  (value) => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // Session storage is only a convenience for the demo; the prototype still
      // works fully in memory when the browser blocks it.
    }
  },
  { deep: true },
);

const activeView = ref<PrototypeView>('overview');
const selectedOrderId = ref(mainOrderId);
const orderDrawerOpen = ref(false);
const orderDrawerTab = ref('overview');
const okkiModalOpen = ref(false);
const newOrderModalOpen = ref(false);
const newOrderStep = ref(0);
const confirmSplitModalOpen = ref(false);
const responsibilityChecked = ref(false);
const analysisRunning = ref(false);
const supplierDrawerOpen = ref(false);
const selectedSupplierId = ref(supplierRecommendations[0].id);
const shipmentDrawerOpen = ref(false);
const receiptDrawerOpen = ref(false);
const aiDrawerOpen = ref(false);
const resetModalOpen = ref(false);
const documentModalOpen = ref(false);
const documentDetail = ref<null | {
  details: string[];
  id: string;
  source: string;
  status: string;
  title: string;
}>(null);

const navigationTabs = [
  { key: 'overview', label: '经营工作台' },
  { key: 'customers', label: '交易客户' },
  { key: 'orders', label: '合同订单' },
  { key: 'demand', label: 'AI 需求分析' },
  { key: 'supply', label: '供给与采购' },
  { key: 'shipment', label: '发货与报关' },
  { key: 'finance', label: '回款与冲销' },
] satisfies Array<{ key: PrototypeView; label: string }>;

const flowStages = [
  { icon: 'lucide:contact', label: '交易客户', view: 'customers' },
  { icon: 'lucide:file-signature', label: '合同订单', view: 'orders' },
  { icon: 'lucide:sparkles', label: 'AI 需求拆分', view: 'demand' },
  { icon: 'lucide:factory', label: '供给与采购', view: 'supply' },
  { icon: 'lucide:ship', label: '发货报关', view: 'shipment' },
  { icon: 'lucide:badge-dollar-sign', label: '回款冲销', view: 'finance' },
] satisfies Array<{ icon: string; label: string; view: PrototypeView }>;

const customerColumns = [
  { title: '客户编号', dataIndex: 'code', key: 'code', width: 138 },
  { title: '交易客户', dataIndex: 'name', key: 'name', width: 220 },
  { title: '国家/地区', dataIndex: 'country', key: 'country', width: 100 },
  { title: '联系人', dataIndex: 'contact', key: 'contact', width: 140 },
  { title: '中台负责人', dataIndex: 'owner', key: 'owner', width: 110 },
  { title: '客户等级', dataIndex: 'level', key: 'level', width: 90 },
  { title: '合同数', dataIndex: 'orderCount', key: 'orderCount', width: 80 },
  {
    title: '累计交易额',
    dataIndex: 'transactionAmount',
    key: 'transactionAmount',
    width: 135,
  },
  {
    title: '未回款',
    dataIndex: 'outstandingAmount',
    key: 'outstandingAmount',
    width: 120,
  },
  {
    title: 'OKKI 同步',
    dataIndex: 'syncStatus',
    key: 'syncStatus',
    width: 108,
  },
];

const orderColumns = [
  {
    title: '合同订单编号',
    dataIndex: 'id',
    key: 'id',
    width: 176,
  },
  { title: '客户', dataIndex: 'customerName', key: 'customerName', width: 210 },
  { title: '国家', dataIndex: 'country', key: 'country', width: 84 },
  { title: '类型', dataIndex: 'type', key: 'type', width: 100 },
  {
    title: '订单金额',
    dataIndex: 'totalAmount',
    key: 'totalAmount',
    width: 138,
  },
  {
    title: '要求发货',
    dataIndex: 'requiredShipAt',
    key: 'requiredShipAt',
    width: 116,
  },
  {
    title: '实际回款',
    dataIndex: 'actualReceipt',
    key: 'actualReceipt',
    width: 125,
  },
  {
    title: '回款冲销',
    dataIndex: 'writeOffAmount',
    key: 'writeOffAmount',
    width: 125,
  },
  {
    title: '未回款',
    dataIndex: 'outstandingAmount',
    key: 'outstandingAmount',
    width: 120,
  },
  {
    title: '供给进度',
    dataIndex: 'supplyStatus',
    key: 'supplyStatus',
    width: 158,
  },
  {
    title: '发货进度',
    dataIndex: 'shipmentStatus',
    key: 'shipmentStatus',
    width: 150,
  },
  { title: '风险', dataIndex: 'risk', key: 'risk', width: 78 },
];

const demandColumns = [
  {
    title: '产品 / SKU',
    dataIndex: 'productName',
    key: 'productName',
    width: 230,
  },
  { title: '订单数量', dataIndex: 'quantity', key: 'quantity', width: 108 },
  { title: '库存满足', dataIndex: 'stockQty', key: 'stockQty', width: 130 },
  { title: '内部工厂', dataIndex: 'factoryQty', key: 'factoryQty', width: 130 },
  {
    title: '外部采购',
    dataIndex: 'purchaseQty',
    key: 'purchaseQty',
    width: 130,
  },
  {
    title: '供应策略 / AI 依据',
    dataIndex: 'strategy',
    key: 'strategy',
    width: 250,
  },
  { title: '置信度', dataIndex: 'confidence', key: 'confidence', width: 105 },
];

const purchaseColumns = [
  { title: '采购申请', dataIndex: 'id', key: 'id', width: 164 },
  { title: '产品', dataIndex: 'productNames', key: 'productNames', width: 240 },
  {
    title: '需求数量',
    dataIndex: 'quantitySummary',
    key: 'quantitySummary',
    width: 190,
  },
  { title: '建议供应商', dataIndex: 'supplier', key: 'supplier', width: 220 },
  { title: '要求到货', dataIndex: 'requiredAt', key: 'requiredAt', width: 112 },
  { title: '状态', dataIndex: 'status', key: 'status', width: 168 },
];

const factoryColumns = [
  { title: '供货任务', dataIndex: 'id', key: 'id', width: 164 },
  { title: '产品', dataIndex: 'productName', key: 'productName', width: 240 },
  { title: '工厂', dataIndex: 'factory', key: 'factory', width: 180 },
  {
    title: '要求数量',
    dataIndex: 'requiredQty',
    key: 'requiredQty',
    width: 110,
  },
  {
    title: '已完成',
    dataIndex: 'completedQty',
    key: 'completedQty',
    width: 100,
  },
  {
    title: '预计齐套',
    dataIndex: 'estimatedReadyAt',
    key: 'estimatedReadyAt',
    width: 112,
  },
  { title: '状态', dataIndex: 'status', key: 'status', width: 110 },
];

const shipmentColumns = [
  { title: '发货单', dataIndex: 'id', key: 'id', width: 154 },
  { title: '批次', dataIndex: 'batch', key: 'batch', width: 150 },
  {
    title: '货物摘要',
    dataIndex: 'quantitySummary',
    key: 'quantitySummary',
    width: 320,
  },
  {
    title: '提货来源',
    dataIndex: 'pickupLocations',
    key: 'pickupLocations',
    width: 220,
  },
  { title: '预计开航', dataIndex: 'etd', key: 'etd', width: 110 },
  {
    title: '报关状态',
    dataIndex: 'customsStatus',
    key: 'customsStatus',
    width: 170,
  },
  { title: '进度', dataIndex: 'progress', key: 'progress', width: 148 },
];

const receiptColumns = [
  { title: '回款单号', dataIndex: 'id', key: 'id', width: 160 },
  { title: '到账日期', dataIndex: 'receivedAt', key: 'receivedAt', width: 112 },
  { title: '付款方', dataIndex: 'payer', key: 'payer', width: 210 },
  { title: '实际到款', dataIndex: 'amount', key: 'amount', width: 135 },
  { title: '回款日汇率', dataIndex: 'rate', key: 'rate', width: 116 },
  { title: '折算人民币', dataIndex: 'cnyAmount', key: 'cnyAmount', width: 140 },
  {
    title: '分配到订单',
    dataIndex: 'allocatedAmount',
    key: 'allocatedAmount',
    width: 136,
  },
  { title: '状态', dataIndex: 'status', key: 'status', width: 140 },
];

const writeOffColumns = [
  { title: '记录编号', dataIndex: 'id', key: 'id', width: 150 },
  { title: '冲销来源', dataIndex: 'type', key: 'type', width: 150 },
  { title: '金额', dataIndex: 'amount', key: 'amount', width: 128 },
  { title: '审核日期', dataIndex: 'approvedAt', key: 'approvedAt', width: 112 },
  { title: '说明', dataIndex: 'remark', key: 'remark' },
  { title: '状态', dataIndex: 'status', key: 'status', width: 100 },
];

const auditColumns = [
  { title: '时间', dataIndex: 'time', key: 'time', width: 154 },
  { title: '类型', dataIndex: 'type', key: 'type', width: 100 },
  { title: '执行人', dataIndex: 'actor', key: 'actor', width: 130 },
  { title: '动作', dataIndex: 'action', key: 'action', width: 320 },
  { title: '结果', dataIndex: 'result', key: 'result' },
];

const okkiKeyword = ref('');
const selectedOkkiId = ref('OKKI-C-0981');
const filteredOkkiCustomers = computed(() => {
  const keyword = okkiKeyword.value.trim().toLowerCase();
  if (!keyword) return data.value.okkiCustomers;
  return data.value.okkiCustomers.filter((item) =>
    [item.name, item.country, item.email, item.owner].some((value) =>
      value.toLowerCase().includes(keyword),
    ),
  );
});
const selectedOkkiCustomer = computed(() =>
  data.value.okkiCustomers.find((item) => item.id === selectedOkkiId.value),
);

const selectedOrder = computed(() =>
  data.value.orders.find((item) => item.id === selectedOrderId.value),
);
const mainOrder = computed(() =>
  data.value.orders.find((item) => item.id === mainOrderId),
);
const mainDemandLines = computed(() =>
  data.value.demandLines.filter((item) => item.orderId === mainOrderId),
);
const mainPurchaseRequests = computed(() =>
  data.value.purchaseRequests.filter((item) => item.orderId === mainOrderId),
);
const mainFactoryTasks = computed(() =>
  data.value.factoryTasks.filter((item) => item.orderId === mainOrderId),
);
const mainShipments = computed(() =>
  data.value.shipments.filter((item) => item.orderId === mainOrderId),
);
const mainReceipts = computed(() =>
  data.value.receipts.filter((item) => item.orderId === mainOrderId),
);
const mainWriteOffItems = computed(() =>
  data.value.writeOffItems.filter((item) => item.orderId === mainOrderId),
);
const totalOutstanding = computed(() =>
  data.value.orders.reduce(
    (total, order) => total + order.outstandingAmount,
    0,
  ),
);
const demandSplitValid = computed(() =>
  mainDemandLines.value.every(
    (line) =>
      line.stockQty + line.factoryQty + line.purchaseQty === line.quantity,
  ),
);

const customsChecklist = reactive([
  { checked: true, key: 'contract', label: '合同 / PI 最终版' },
  { checked: true, key: 'packing', label: '装箱单草稿' },
  { checked: true, key: 'declaration', label: '报关要素与 HS Code' },
  { checked: false, key: 'origin', label: '原产地声明' },
  { checked: false, key: 'label', label: '客户唛头最终确认' },
]);
const allCustomsReady = computed(() =>
  customsChecklist.every((item) => item.checked),
);

const newOrderDraft = reactive({
  additionalFee: 1850,
  company: '飞德慕国际贸易有限公司',
  currency: 'USD' as const,
  customerId: 'CUS-1001',
  incoterm: 'FOB Shanghai',
  owner: '林晓月',
  paymentTerms: '30% 定金，70% 出货前',
  requiredShipAt: '2026-10-20',
  signedAt: '2026-08-27',
  type: '大货订单' as const,
});
const newOrderProducts = reactive([
  {
    amount: 65_000,
    name: '6mm TPE 瑜伽垫',
    price: 13,
    quantity: 5000,
    sku: 'MAT-TPE-06',
  },
  {
    amount: 12_000,
    name: '软木瑜伽砖',
    price: 6,
    quantity: 2000,
    sku: 'BRICK-CORK-01',
  },
  {
    amount: 7650,
    name: '五层出口纸箱',
    price: 1.5,
    quantity: 5100,
    sku: 'CTN-EXPORT-05',
  },
]);
const productTotal = computed(() =>
  newOrderProducts.reduce(
    (total, item) => total + item.quantity * item.price,
    0,
  ),
);
const newOrderTotal = computed(
  () => productTotal.value + newOrderDraft.additionalFee,
);

const receiptForm = reactive({
  account: '飞德慕美元账户（中国银行武汉分行）',
  amount: 51_900,
  balanceAmount: 1000,
  payer: 'NOVA FITNESS GMBH',
  rate: 7.16,
  receivedAt: '2026-09-03',
  waiverAmount: 100,
});

interface AssistantMessage {
  content: string;
  id: number;
  role: 'assistant' | 'user';
  tone?: 'blocked' | 'normal';
}

const assistantInput = ref('');
const assistantMessages = ref<AssistantMessage[]>([
  {
    id: 1,
    role: 'assistant',
    content:
      '我可以基于当前演示数据解释订单风险、生成草稿建议和核对单据关系，但不会直接提交采购、修改库存或确认回款。',
  },
]);
const assistantPrompts = [
  `${mainOrderId} 现在卡在哪里？`,
  '根据订单缺口生成采购申请草稿',
  '解释实际回款与回款冲销的差异',
  '直接把包装箱库存增加 360 个',
];

function formatMoney(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    currency,
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
    style: 'currency',
  }).format(amount);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('zh-CN').format(value);
}

function readNumericField(record: Record<string, unknown>, key: unknown) {
  if (typeof key !== 'string') return 0;
  const value = record[key];
  return typeof value === 'number' ? value : 0;
}

function riskColor(risk: string) {
  if (risk === '高') return 'red';
  if (risk === '中') return 'orange';
  return 'green';
}

function statusColor(status: string) {
  if (/完成|通过|已审核|已齐套|已签收/.test(status)) return 'green';
  if (/待|草稿|准备|分析/.test(status)) return 'blue';
  if (/延期|缺少|风险/.test(status)) return 'red';
  return 'orange';
}

function auditColor(type: string) {
  if (type === '规则拦截') return 'red';
  if (type === '人工确认') return 'green';
  if (type === 'AI建议') return 'purple';
  return 'blue';
}

function openView(view: PrototypeView) {
  activeView.value = view;
}

function openMainOrder(tab = 'overview') {
  selectedOrderId.value = mainOrderId;
  orderDrawerTab.value = tab;
  orderDrawerOpen.value = true;
}

function openOrder(order: ContractOrder | Record<string, any>) {
  if (typeof order.id !== 'string') return;
  selectedOrderId.value = order.id;
  orderDrawerTab.value = 'overview';
  orderDrawerOpen.value = true;
}

function goFromOrderDrawer(view: PrototypeView) {
  orderDrawerOpen.value = false;
  activeView.value = view;
}

function openOkkiImport() {
  okkiKeyword.value = '';
  selectedOkkiId.value = 'OKKI-C-0981';
  okkiModalOpen.value = true;
}

function chooseOkkiCustomer(customer: OkkiCustomer) {
  selectedOkkiId.value = customer.id;
}

function importSelectedOkkiCustomer() {
  const candidate = selectedOkkiCustomer.value;
  if (!candidate) {
    message.warning('请先选择一个 OKKI 客户');
    return;
  }
  if (candidate.mappedCustomerId) {
    newOrderDraft.customerId = candidate.mappedCustomerId;
    message.info('该客户已建立中台映射，已直接选用');
    okkiModalOpen.value = false;
    return;
  }
  const newId = `CUS-${1000 + data.value.customers.length + 1}`;
  const customer: Customer = {
    id: newId,
    code: `FT-CUS-${String(data.value.customers.length + 32).padStart(5, '0')}`,
    name: candidate.name,
    country: candidate.country,
    contact: candidate.contact,
    email: candidate.email,
    owner: candidate.owner === 'Linda Zhou' ? '林晓月' : '周雨晴',
    okkiOwner: candidate.owner,
    okkiSerialId: candidate.serialId,
    level: 'B',
    firstOrderDate: '-',
    orderCount: 0,
    transactionAmount: 0,
    outstandingAmount: 0,
    syncStatus: '已同步',
    lastSyncAt: '2026-08-27 10:06',
  };
  data.value.customers.unshift(customer);
  candidate.mappedCustomerId = newId;
  newOrderDraft.customerId = newId;
  data.value.audits.unshift({
    id: `AUD-${Date.now()}`,
    time: '2026-08-27 10:06',
    actor: '林晓月',
    action: `从 OKKI 导入 ${candidate.name}`,
    result: `创建交易客户 ${customer.code} 并保存 OKKI 映射`,
    type: '人工确认',
  });
  message.success('已创建中台交易客户并保存 OKKI 映射');
  okkiModalOpen.value = false;
}

function openNewOrder() {
  newOrderStep.value = 0;
  newOrderModalOpen.value = true;
}

function updateProductAmount(product: (typeof newOrderProducts)[number]) {
  product.amount = Number((product.quantity * product.price).toFixed(2));
}

function nextOrderStep() {
  if (newOrderStep.value === 0 && !newOrderDraft.customerId) {
    message.warning('请先选择交易客户');
    return;
  }
  if (newOrderStep.value === 1) {
    if (newOrderDraft.requiredShipAt <= newOrderDraft.signedAt) {
      message.warning('要求发货日期必须晚于签单日期');
      return;
    }
    if (newOrderProducts.some((item) => !item.sku || item.quantity <= 0)) {
      message.warning('所有产品行必须有 SKU 且数量大于 0');
      return;
    }
  }
  newOrderStep.value = Math.min(2, newOrderStep.value + 1);
}

function createDraftOrder() {
  const customer = data.value.customers.find(
    (item) => item.id === newOrderDraft.customerId,
  );
  if (!customer) {
    message.warning('请选择有效的交易客户');
    return;
  }
  const id = `SO-FTM-202608-${String(data.value.orders.length + 19).padStart(3, '0')}`;
  data.value.orders.unshift({
    id,
    customerId: customer.id,
    customerName: customer.name,
    country: customer.country,
    type: newOrderDraft.type,
    company: newOrderDraft.company,
    owner: newOrderDraft.owner,
    currency: newOrderDraft.currency,
    totalAmount: newOrderTotal.value,
    signedAt: newOrderDraft.signedAt,
    requiredShipAt: newOrderDraft.requiredShipAt,
    status: '草稿',
    supplyStatus: '待审核通过',
    shipmentStatus: '未开始',
    actualReceipt: 0,
    writeOffAmount: 0,
    outstandingAmount: newOrderTotal.value,
    risk: '低',
    incoterm: newOrderDraft.incoterm,
    paymentTerms: newOrderDraft.paymentTerms,
    originPort: '上海港',
    destinationPort:
      customer.country === '德国' ? 'Hamburg, Germany' : '待确认',
    exchangeRate: 7.18,
  });
  customer.orderCount += 1;
  customer.transactionAmount += newOrderTotal.value;
  customer.outstandingAmount += newOrderTotal.value;
  selectedOrderId.value = id;
  newOrderModalOpen.value = false;
  message.success(`合同订单草稿 ${id} 已创建`);
  openOrder(data.value.orders[0]!);
}

function runDemandAnalysis() {
  if (analysisRunning.value) return;
  analysisRunning.value = true;
  window.setTimeout(() => {
    data.value.journey.analysisStatus = 'AI草稿';
    const order = mainOrder.value;
    if (order) order.supplyStatus = 'AI 建议待人工确认';
    data.value.audits.unshift({
      id: `AUD-${Date.now()}`,
      time: '2026-08-27 10:12',
      actor: 'AI 需求助手',
      action: `分析 ${mainOrderId} 的 3 个产品行`,
      result: '已生成库存 600 件、工厂 4,500 件、外采 7,000 件的拆分草稿',
      type: 'AI建议',
    });
    analysisRunning.value = false;
    message.success('AI 需求分析草稿已生成，请人工核对数量');
  }, 850);
}

function openSplitConfirmation() {
  if (data.value.journey.analysisStatus === '待分析') {
    message.warning('请先运行 AI 需求分析');
    return;
  }
  if (!demandSplitValid.value) {
    message.error('供给拆分校验失败：每行库存、自制与外采之和必须等于订单数量');
    return;
  }
  responsibilityChecked.value = false;
  confirmSplitModalOpen.value = true;
}

function confirmSupplySplit() {
  if (!responsibilityChecked.value) return;
  if (mainPurchaseRequests.value.length === 0) {
    data.value.purchaseRequests.push({
      id: 'PR-202608-006',
      orderId: mainOrderId,
      productNames: '软木瑜伽砖；五层出口纸箱',
      quantitySummary: '瑜伽砖 2,000 只；纸箱 5,000 只',
      supplier: 'AI 推荐待采购确认',
      suggestedAmount: 16_580,
      requiredAt: '2026-10-02',
      status: '草稿 · 未提交',
      risk: '纸箱包装版本需确认',
    });
  }
  if (mainFactoryTasks.value.length === 0) {
    data.value.factoryTasks.push({
      id: 'FT-202608-004',
      orderId: mainOrderId,
      productName: '6mm TPE 瑜伽垫',
      factory: '黄石飞德慕工厂',
      requiredQty: 4500,
      completedQty: 0,
      requiredAt: '2026-10-04',
      estimatedReadyAt: '2026-10-03',
      owner: '王海峰',
      status: '草稿 · 待工厂接收',
    });
  }
  data.value.journey.analysisStatus = '已人工确认';
  const order = mainOrder.value;
  if (order) order.supplyStatus = '采购/工厂草稿已生成';
  data.value.audits.unshift({
    id: `AUD-${Date.now()}`,
    time: '2026-08-27 10:15',
    actor: '林晓月',
    action: '确认 AI 供给拆分建议',
    result: '生成采购申请草稿 PR-202608-006 与工厂任务草稿 FT-202608-004',
    type: '人工确认',
  });
  confirmSplitModalOpen.value = false;
  activeView.value = 'supply';
  message.success('执行草稿已生成；系统没有自动提交采购申请');
}

function adoptSupplierRecommendation() {
  const supplier = supplierRecommendations.find(
    (item) => item.id === selectedSupplierId.value,
  );
  if (!supplier || mainPurchaseRequests.value.length === 0) return;
  const request = mainPurchaseRequests.value[0]!;
  request.supplier = supplier.name;
  request.status = '已采用建议 · 待采购提交';
  data.value.journey.supplierAdopted = true;
  data.value.audits.unshift({
    id: `AUD-${Date.now()}`,
    time: '2026-08-27 10:18',
    actor: '采购专员 · 陈航',
    action: `采用 AI 供应商建议：${supplier.name}`,
    result: '已回填采购申请草稿，仍需采购人员正式提交',
    type: '人工确认',
  });
  supplierDrawerOpen.value = false;
  message.success('供应商建议已回填到采购申请草稿');
}

function createShipmentDraft() {
  if (data.value.journey.analysisStatus !== '已人工确认') {
    message.warning('请先确认供给拆分并生成执行草稿');
    return;
  }
  if (data.value.journey.shipmentDraftCreated) {
    message.info('主演示订单已经有一张发货草稿');
    shipmentDrawerOpen.value = false;
    return;
  }
  data.value.shipments.unshift({
    id: 'SH-202609-009',
    orderId: mainOrderId,
    batch: '第一批 / 部分发货',
    quantitySummary: '瑜伽垫 2,500 张；瑜伽砖 1,000 只；纸箱 2,600 只',
    pickupLocations: ['黄石飞德慕工厂', '外部供应商', '武汉仓'],
    warehouse: '多来源合并出运',
    etd: '2026-10-10',
    eta: '2026-11-04',
    status: '草稿 · 待跟单确认',
    customsStatus: '资料待齐套',
    progress: 28,
  });
  data.value.journey.shipmentDraftCreated = true;
  const order = mainOrder.value;
  if (order) order.shipmentStatus = '首批发货草稿已创建';
  data.value.audits.unshift({
    id: `AUD-${Date.now()}`,
    time: '2026-08-27 10:22',
    actor: '林晓月',
    action: '创建首批多来源发货草稿',
    result: '生成 SH-202609-009；未确认出库、未确认海关放行',
    type: '人工确认',
  });
  shipmentDrawerOpen.value = false;
  message.success('发货单与出运报关任务草稿已生成');
}

function completeMockDocuments() {
  customsChecklist.forEach((item) => {
    item.checked = true;
  });
  message.success('示例资料已补齐，仍需跟单人员人工复核');
}

function checkCustomsDocuments() {
  const shipment = mainShipments.value[0];
  if (!shipment) {
    message.warning('请先创建发货草稿');
    return;
  }
  if (!allCustomsReady.value) {
    const missing = customsChecklist
      .filter((item) => !item.checked)
      .map((item) => item.label)
      .join('、');
    shipment.customsStatus = `缺少：${missing}`;
    message.warning(`AI 检查发现资料未齐套：${missing}`);
    return;
  }
  shipment.customsStatus = 'AI 检查齐套 · 待人工复核';
  shipment.progress = Math.max(shipment.progress, 42);
  data.value.audits.unshift({
    id: `AUD-${Date.now()}`,
    time: '2026-08-27 10:25',
    actor: 'AI 报关助手',
    action: '检查首批发货的报关资料齐套性',
    result: '资料齐套；等待采购跟单人员人工复核',
    type: 'AI建议',
  });
  message.success('AI 检查通过，下一步仍由采购跟单人员确认');
}

function recordReceiptAndWriteOff() {
  if (mainReceipts.value.length > 0) {
    message.info('主演示回款已经登记，可在表格中查看拆分口径');
    receiptDrawerOpen.value = false;
    return;
  }
  const order = mainOrder.value;
  if (!order) return;
  const writeOffTotal =
    receiptForm.amount + receiptForm.balanceAmount + receiptForm.waiverAmount;
  if (writeOffTotal > order.totalAmount) {
    message.error('本次冲销总额不能超过订单有效金额');
    return;
  }
  data.value.receipts.unshift({
    id: 'RC-202609-012',
    orderId: mainOrderId,
    receivedAt: receiptForm.receivedAt,
    payer: receiptForm.payer,
    account: receiptForm.account,
    currency: 'USD',
    amount: receiptForm.amount,
    rate: receiptForm.rate,
    cnyAmount: Number((receiptForm.amount * receiptForm.rate).toFixed(2)),
    allocatedAmount: receiptForm.amount,
    status: '已人工确认分配',
  });
  data.value.writeOffItems.unshift(
    {
      id: 'WO-202609-021',
      orderId: mainOrderId,
      type: '客户余额消费',
      amount: receiptForm.balanceAmount,
      approvedAt: receiptForm.receivedAt,
      remark: '使用客户历史预收余额',
      status: '已审核',
    },
    {
      id: 'WO-202609-022',
      orderId: mainOrderId,
      type: '坏账或减免',
      amount: receiptForm.waiverAmount,
      approvedAt: receiptForm.receivedAt,
      remark: '银行手续费差额减免',
      status: '已审核',
    },
  );
  order.actualReceipt = receiptForm.amount;
  order.writeOffAmount = writeOffTotal;
  order.outstandingAmount = order.totalAmount - writeOffTotal;
  const customer = data.value.customers.find(
    (item) => item.id === order.customerId,
  );
  if (customer) customer.outstandingAmount = order.outstandingAmount;
  data.value.audits.unshift({
    id: `AUD-${Date.now()}`,
    time: '2026-09-03 10:31',
    actor: '财务专员 · 张倩',
    action: '确认回款分配、客户余额消费与手续费减免',
    result: `实际回款 ${formatMoney(receiptForm.amount)}；冲销 ${formatMoney(writeOffTotal)}；未回款 ${formatMoney(order.outstandingAmount)}`,
    type: '人工确认',
  });
  receiptDrawerOpen.value = false;
  message.success('回款与冲销已分别登记，订单金额口径已更新');
}

function openDocument(
  id: string,
  title: string,
  status: string,
  source: string,
  details: string[],
) {
  documentDetail.value = { details, id, source, status, title };
  documentModalOpen.value = true;
}

function startGuidedDemo() {
  openMainOrder();
  message.info('建议从“运行 AI 需求分析”开始，随后依次查看供给、发货和回款');
}

function sendAssistantPrompt(prompt?: string) {
  const text = (prompt ?? assistantInput.value).trim();
  if (!text) return;
  assistantMessages.value.push({
    content: text,
    id: Date.now(),
    role: 'user',
  });
  assistantInput.value = '';
  let response = '';
  let tone: AssistantMessage['tone'] = 'normal';
  if (/库存|直接修改|增加 360/.test(text)) {
    response =
      '我不能直接修改库存余额。库存必须由入库单、出库单或库存调整单驱动，并由有权限的人员确认。我已记录这次规则拦截。';
    tone = 'blocked';
    data.value.audits.unshift({
      id: `AUD-${Date.now()}`,
      time: '2026-08-27 10:36',
      actor: 'AI 业务助手',
      action: text,
      result: '已拒绝：不能绕过库存单据直接改数',
      type: '规则拦截',
    });
  } else if (/卡在哪里|风险/.test(text)) {
    response = `${mainOrderId} 当前主要卡在供给拆分尚未人工确认；软木瑜伽砖需要外采 2,000 只，纸箱包装 V4 还需复核。要求发货日是 2026-10-20，目前风险等级为中。`;
  } else if (/采购申请/.test(text)) {
    response =
      data.value.journey.analysisStatus === '待分析'
        ? '需要先运行需求分析。我可以生成采购申请草稿，但不会替业务人员提交。'
        : '建议生成一张采购申请草稿：瑜伽砖 2,000 只、出口纸箱 5,000 只；最终数量和供应商仍需人工确认。';
  } else if (/回款|冲销/.test(text)) {
    response =
      '实际回款只统计真实资金流入；回款冲销还包括客户余额消费和审核通过的减免。本订单演示口径是：实际回款 51,900 USD，冲销 53,000 USD，未回款 33,500 USD。';
  } else {
    response =
      '当前订单以合同订单为核心，并行连接回款、供给采购、发货报关和订单费用。你可以让我解释某条链路或打开对应演示模块。';
  }
  window.setTimeout(() => {
    assistantMessages.value.push({
      content: response,
      id: Date.now() + 1,
      role: 'assistant',
      tone,
    });
  }, 250);
}

function resetPrototype() {
  data.value = createPrototypeData();
  activeView.value = 'overview';
  selectedOrderId.value = mainOrderId;
  customsChecklist.forEach((item) => {
    item.checked = ['contract', 'declaration', 'packing'].includes(item.key);
  });
  assistantMessages.value = [
    {
      id: Date.now(),
      role: 'assistant',
      content: '演示数据已重置。可以从主演示订单重新开始。',
    },
  ];
  resetModalOpen.value = false;
  message.success('原型演示数据已重置');
}
</script>

<template>
  <Page auto-content-height>
    <div class="prototype-shell">
      <Card :bordered="false" class="hero-card">
        <div class="hero-row">
          <div>
            <div class="hero-eyebrow">
              <Tag color="purple">一期可点击原型</Tag>
              <span>成交后外贸业务中台</span>
            </div>
            <h1>外贸 CRM 订单执行工作台</h1>
            <p>
              OKKI
              负责成交前；飞德慕从交易客户和合同订单开始，向下并行驱动供给、发货、费用与财务。
            </p>
          </div>
          <Space wrap>
            <Tooltip title="仅清除当前浏览器会话中的模拟状态">
              <Button @click="resetModalOpen = true">
                <template #icon>
                  <IconifyIcon icon="lucide:rotate-ccw" />
                </template>
                重置演示
              </Button>
            </Tooltip>
            <Button type="primary" @click="startGuidedDemo">
              <template #icon><IconifyIcon icon="lucide:play" /></template>
              开始主演示
            </Button>
          </Space>
        </div>
        <Alert
          class="demo-alert"
          type="info"
          show-icon
          message="演示数据 · 未连接 OKKI、银行、物流、FDMServer 或数据库；所有变化只保存在当前浏览器会话。"
        />

        <div class="flow-strip">
          <button
            v-for="stage in flowStages"
            :key="stage.view"
            class="flow-stage"
            type="button"
            @click="openView(stage.view)"
          >
            <span class="flow-stage__icon">
              <IconifyIcon :icon="stage.icon" />
            </span>
            <span>{{ stage.label }}</span>
            <IconifyIcon
              class="flow-stage__arrow"
              icon="lucide:chevron-right"
            />
          </button>
        </div>
      </Card>

      <Card :bordered="false" class="module-card">
        <Tabs v-model:active-key="activeView" :items="navigationTabs" />

        <section v-if="activeView === 'overview'" class="view-section">
          <Row :gutter="[12, 12]">
            <Col :xs="24" :sm="12" :xl="6">
              <Card size="small" class="kpi-card">
                <Statistic title="执行中合同订单" :value="2" suffix="张" />
                <span class="kpi-note">1 张待确认 AI 需求拆分</span>
              </Card>
            </Col>
            <Col :xs="24" :sm="12" :xl="6">
              <Card size="small" class="kpi-card">
                <Statistic title="本月合同额" :value="186500" prefix="$" />
                <span class="kpi-note">含 1 张免费样品订单</span>
              </Card>
            </Col>
            <Col :xs="24" :sm="12" :xl="6">
              <Card size="small" class="kpi-card">
                <Statistic
                  title="未冲销金额"
                  :value="totalOutstanding"
                  prefix="$"
                />
                <span class="kpi-note kpi-note--warning">需按订单币种分别跟踪</span>
              </Card>
            </Col>
            <Col :xs="24" :sm="12" :xl="6">
              <Card size="small" class="kpi-card">
                <Statistic title="交期风险订单" :value="1" suffix="张" />
                <span class="kpi-note kpi-note--danger">Northstar 订单风险较高</span>
              </Card>
            </Col>
          </Row>

          <div class="overview-grid">
            <Card
              title="主演示订单 · 一个订单，四条并行业务链"
              class="focus-order-card"
            >
              <template #extra>
                <Button type="link" @click="openMainOrder()">
                  查看完整订单
                </Button>
              </template>
              <div class="order-heading">
                <div>
                  <Button
                    type="link"
                    class="order-link"
                    @click="openMainOrder()"
                  >
                    {{ mainOrder?.id }}
                  </Button>
                  <span>{{ mainOrder?.customerName }}</span>
                </div>
                <Space>
                  <Tag color="blue">{{ mainOrder?.status }}</Tag>
                  <Tag :color="riskColor(mainOrder?.risk || '低')">
                    {{ mainOrder?.risk }}风险
                  </Tag>
                </Space>
              </div>
              <div class="parallel-grid">
                <button
                  type="button"
                  class="chain-card"
                  @click="openView('finance')"
                >
                  <IconifyIcon icon="lucide:badge-dollar-sign" />
                  <div>
                    <strong>回款与冲销</strong>
                    <span>
                      {{ formatMoney(mainOrder?.writeOffAmount || 0) }} /
                      {{ formatMoney(mainOrder?.totalAmount || 0) }}
                    </span>
                  </div>
                  <Progress
                    :percent="
                      Math.round(
                        ((mainOrder?.writeOffAmount || 0) /
                          (mainOrder?.totalAmount || 1)) *
                          100,
                      )
                    "
                    :show-info="false"
                    size="small"
                  />
                </button>
                <button
                  type="button"
                  class="chain-card"
                  @click="openView('demand')"
                >
                  <IconifyIcon icon="lucide:sparkles" />
                  <div>
                    <strong>供给与采购</strong>
                    <span>{{ mainOrder?.supplyStatus }}</span>
                  </div>
                  <Progress
                    :percent="
                      data.journey.analysisStatus === '已人工确认'
                        ? 55
                        : data.journey.analysisStatus === 'AI草稿'
                          ? 28
                          : 8
                    "
                    :show-info="false"
                    size="small"
                  />
                </button>
                <button
                  type="button"
                  class="chain-card"
                  @click="openView('shipment')"
                >
                  <IconifyIcon icon="lucide:ship" />
                  <div>
                    <strong>发货与报关</strong>
                    <span>{{ mainOrder?.shipmentStatus }}</span>
                  </div>
                  <Progress
                    :percent="data.journey.shipmentDraftCreated ? 28 : 0"
                    :show-info="false"
                    size="small"
                  />
                </button>
                <button type="button" class="chain-card chain-card--muted">
                  <IconifyIcon icon="lucide:receipt-text" />
                  <div>
                    <strong>订单费用与利润</strong>
                    <span>预计费用 $5,640 · 后续建设</span>
                  </div>
                  <Progress :percent="12" :show-info="false" size="small" />
                </button>
              </div>
            </Card>

            <Card title="今天优先处理" class="action-card">
              <div class="action-list">
                <button type="button" @click="openView('demand')">
                  <span class="action-index">1</span>
                  <div>
                    <strong>确认主演示订单的 AI 需求拆分</strong>
                    <small>决定 500 库存、4,500 工厂供货、7,000 外采</small>
                  </div>
                  <Tag
                    :color="
                      data.journey.analysisStatus === '已人工确认'
                        ? 'green'
                        : 'orange'
                    "
                  >
                    {{ data.journey.analysisStatus }}
                  </Tag>
                </button>
                <button type="button" @click="openView('finance')">
                  <span class="action-index">2</span>
                  <div>
                    <strong>登记 NOVA 客户定金并人工分配</strong>
                    <small>实际回款、余额消费、减免必须分开</small>
                  </div>
                  <Tag :color="mainReceipts.length ? 'green' : 'blue'">
                    {{ mainReceipts.length ? '已登记' : '待登记' }}
                  </Tag>
                </button>
                <button type="button" @click="openView('shipment')">
                  <span class="action-index">3</span>
                  <div>
                    <strong>创建多来源首批发货草稿</strong>
                    <small>武汉仓、黄石工厂和外部供应商协同</small>
                  </div>
                  <Tag
                    :color="
                      data.journey.shipmentDraftCreated ? 'green' : 'blue'
                    "
                  >
                    {{
                      data.journey.shipmentDraftCreated ? '草稿已建' : '待创建'
                    }}
                  </Tag>
                </button>
              </div>
            </Card>
          </div>

          <Card title="AI 与人工动作审计" size="small">
            <Table
              :columns="auditColumns"
              :data-source="data.audits.slice(0, 6)"
              :pagination="false"
              row-key="id"
              size="small"
              :scroll="{ x: 980 }"
            >
              <template #bodyCell="{ column, record }">
                <Tag
                  v-if="column.key === 'type'"
                  :color="auditColor(record.type)"
                >
                  {{ record.type }}
                </Tag>
              </template>
            </Table>
          </Card>
        </section>

        <section v-else-if="activeView === 'customers'" class="view-section">
          <div class="section-heading">
            <div>
              <h2>外贸交易客户</h2>
              <p>
                这里只保留准备下单或已有订单的客户；成交前线索与日常跟进继续留在
                OKKI。
              </p>
            </div>
            <Button type="primary" @click="openOkkiImport">
              <template #icon><IconifyIcon icon="lucide:import" /></template>
              从 OKKI 选择客户
            </Button>
          </div>
          <Alert
            type="warning"
            show-icon
            message="同步只覆盖客户名称、国家、联系人、电话、邮箱等基础资料；中台交易额、回款、利润、信用和历史订单快照不会被 OKKI 覆盖。"
          />
          <Table
            class="data-table"
            :columns="customerColumns"
            :data-source="data.customers"
            row-key="id"
            :scroll="{ x: 1260 }"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'name'">
                <Button type="link" @click="openView('orders')">
                  {{ record.name }}
                </Button>
                <div class="cell-subtext">{{ record.email }}</div>
              </template>
              <Tag v-else-if="column.key === 'level'" color="gold">
                {{ record.level }}
              </Tag>
              <span v-else-if="column.key === 'transactionAmount'">
                {{ formatMoney(record.transactionAmount) }}
              </span>
              <span
                v-else-if="column.key === 'outstandingAmount'"
                :class="{ 'amount-danger': record.outstandingAmount > 0 }"
              >
                {{ formatMoney(record.outstandingAmount) }}
              </span>
              <template v-else-if="column.key === 'syncStatus'">
                <Tag
                  :color="record.syncStatus === '已同步' ? 'green' : 'orange'"
                >
                  {{ record.syncStatus }}
                </Tag>
                <div class="cell-subtext">{{ record.lastSyncAt }}</div>
              </template>
            </template>
          </Table>
        </section>

        <section v-else-if="activeView === 'orders'" class="view-section">
          <div class="section-heading">
            <div>
              <h2>外贸合同订单</h2>
              <p>
                一期保留一张核心单据，区分大货与样品；订单币种固定，并保存签单汇率快照。
              </p>
            </div>
            <Button type="primary" @click="openNewOrder">
              <template #icon><IconifyIcon icon="lucide:plus" /></template>
              新建合同订单
            </Button>
          </div>
          <Table
            :columns="orderColumns"
            :data-source="data.orders"
            row-key="id"
            :scroll="{ x: 1700 }"
          >
            <template #bodyCell="{ column, record }">
              <Button
                v-if="column.key === 'id'"
                type="link"
                @click="openOrder(record)"
              >
                {{ record.id }}
              </Button>
              <template v-else-if="column.key === 'customerName'">
                <strong>{{ record.customerName }}</strong>
                <div class="cell-subtext">负责人：{{ record.owner }}</div>
              </template>
              <Tag
                v-else-if="column.key === 'type'"
                :color="record.type === '大货订单' ? 'blue' : 'cyan'"
              >
                {{ record.type }}
              </Tag>
              <span
                v-else-if="
                  [
                    'totalAmount',
                    'actualReceipt',
                    'writeOffAmount',
                    'outstandingAmount',
                  ].includes(String(column.key))
                "
                :class="{
                  'amount-danger':
                    column.key === 'outstandingAmount' &&
                    record.outstandingAmount > 0,
                }"
              >
                {{
                  formatMoney(
                    readNumericField(record, column.key),
                    record.currency,
                  )
                }}
              </span>
              <Button
                v-else-if="column.key === 'supplyStatus'"
                type="link"
                @click="openView('demand')"
              >
                {{ record.supplyStatus }}
              </Button>
              <Button
                v-else-if="column.key === 'shipmentStatus'"
                type="link"
                @click="openView('shipment')"
              >
                {{ record.shipmentStatus }}
              </Button>
              <Tag
                v-else-if="column.key === 'risk'"
                :color="riskColor(record.risk)"
              >
                {{ record.risk }}
              </Tag>
            </template>
          </Table>
        </section>

        <section v-else-if="activeView === 'demand'" class="view-section">
          <div class="section-heading">
            <div>
              <h2>AI 需求分析</h2>
              <p>
                AI
                读取订单产品、库存快照和供应策略，只生成建议；数量拆分必须由外贸人员确认。
              </p>
            </div>
            <Space>
              <Tag
                :color="
                  data.journey.analysisStatus === '已人工确认'
                    ? 'green'
                    : data.journey.analysisStatus === 'AI草稿'
                      ? 'purple'
                      : 'default'
                "
              >
                {{ data.journey.analysisStatus }}
              </Tag>
              <Button :loading="analysisRunning" @click="runDemandAnalysis">
                <template #icon>
                  <IconifyIcon icon="lucide:sparkles" />
                </template>
                {{
                  data.journey.analysisStatus === '待分析'
                    ? '运行 AI 需求分析'
                    : '重新分析'
                }}
              </Button>
              <Button
                type="primary"
                :disabled="data.journey.analysisStatus === '待分析'"
                @click="openSplitConfirmation"
              >
                确认拆分并生成草稿
              </Button>
            </Space>
          </div>
          <Alert
            type="info"
            show-icon
            message="AI 不会自动提交采购申请，也不会把内部工厂数量塞进采购单。确认后只生成采购申请草稿和工厂供货任务草稿。"
          />

          <div
            v-if="data.journey.analysisStatus === '待分析'"
            class="analysis-empty"
          >
            <Spin
              v-if="analysisRunning"
              size="large"
              tip="正在读取库存快照、工厂产能与供应策略..."
            />
            <Empty v-else description="尚未运行需求分析">
              <Button type="primary" @click="runDemandAnalysis">
                运行主演示分析
              </Button>
            </Empty>
          </div>
          <template v-else>
            <Table
              class="data-table"
              :columns="demandColumns"
              :data-source="mainDemandLines"
              :pagination="false"
              row-key="id"
              :scroll="{ x: 1120 }"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'productName'">
                  <strong>{{ record.productName }}</strong>
                  <div class="cell-subtext">
                    {{ record.sku }} · 客户号 {{ record.customerSku }}
                  </div>
                </template>
                <span v-else-if="column.key === 'quantity'">{{ formatNumber(record.quantity) }} {{ record.unit }}</span>
                <InputNumber
                  v-else-if="column.key === 'stockQty'"
                  v-model:value="record.stockQty"
                  :min="0"
                  :max="record.quantity"
                  :precision="0"
                  style="width: 110px"
                />
                <InputNumber
                  v-else-if="column.key === 'factoryQty'"
                  v-model:value="record.factoryQty"
                  :min="0"
                  :max="record.quantity"
                  :precision="0"
                  style="width: 110px"
                />
                <InputNumber
                  v-else-if="column.key === 'purchaseQty'"
                  v-model:value="record.purchaseQty"
                  :min="0"
                  :max="record.quantity"
                  :precision="0"
                  style="width: 110px"
                />
                <template v-else-if="column.key === 'strategy'">
                  <span>{{ record.strategy }}</span>
                  <div class="cell-subtext">{{ record.specification }}</div>
                </template>
                <Progress
                  v-else-if="column.key === 'confidence'"
                  :percent="record.confidence"
                  size="small"
                />
              </template>
            </Table>
            <Alert
              class="validation-alert"
              :type="demandSplitValid ? 'success' : 'error'"
              show-icon
              :message="
                demandSplitValid
                  ? '硬规则校验通过：每个产品行的库存 + 内部工厂 + 外部采购 = 订单数量。'
                  : '校验失败：请修正红色提示前的供给数量，三种来源之和必须等于订单数量。'
              "
            />
            <div class="evidence-grid">
              <Card size="small" title="AI 判断依据">
                <ul>
                  <li>武汉仓可用库存快照：瑜伽垫 500 张、纸箱 100 只</li>
                  <li>黄石工厂 9 月计划产能可覆盖 4,500 张瑜伽垫</li>
                  <li>瑜伽砖为外采属性，历史平均采购周期 18 天</li>
                  <li>客户包装 V4 尚未完成末次确认，纸箱存在轻度风险</li>
                </ul>
              </Card>
              <Card size="small" title="预计生成的执行草稿">
                <Descriptions :column="1" size="small">
                  <DescriptionsItem label="采购申请">
                    PR-202608-006 · 瑜伽砖与纸箱
                  </DescriptionsItem>
                  <DescriptionsItem label="工厂任务">
                    FT-202608-004 · 黄石工厂瑜伽垫
                  </DescriptionsItem>
                  <DescriptionsItem label="权限边界">
                    生成后仍需采购/工厂人员正式接收
                  </DescriptionsItem>
                </Descriptions>
              </Card>
            </div>
          </template>
        </section>

        <section v-else-if="activeView === 'supply'" class="view-section">
          <div class="section-heading">
            <div>
              <h2>供给与采购执行草稿</h2>
              <p>
                外采进入采购申请，内部自产进入工厂供货任务；两类单据都追溯到合同订单产品行。
              </p>
            </div>
            <Button
              :disabled="mainPurchaseRequests.length === 0"
              @click="supplierDrawerOpen = true"
            >
              <template #icon>
                <IconifyIcon icon="lucide:wand-sparkles" />
              </template>
              AI 推荐供应商
            </Button>
          </div>
          <Alert
            v-if="data.journey.analysisStatus !== '已人工确认'"
            type="warning"
            show-icon
            message="尚未生成执行草稿。请回到 AI 需求分析，人工确认供给拆分。"
          />
          <template v-else>
            <Card title="采购申请草稿" size="small">
              <Table
                :columns="purchaseColumns"
                :data-source="mainPurchaseRequests"
                :pagination="false"
                row-key="id"
                :scroll="{ x: 1080 }"
              >
                <template #bodyCell="{ column, record }">
                  <Button
                    v-if="column.key === 'id'"
                    type="link"
                    @click="
                      openDocument(
                        record.id,
                        '采购申请草稿',
                        record.status,
                        mainOrderId,
                        [
                          record.productNames,
                          record.quantitySummary,
                          `建议金额 ${formatMoney(record.suggestedAmount)}`,
                          `风险：${record.risk}`,
                        ],
                      )
                    "
                  >
                    {{ record.id }}
                  </Button>
                  <Tag
                    v-else-if="column.key === 'status'"
                    :color="statusColor(record.status)"
                  >
                    {{ record.status }}
                  </Tag>
                </template>
              </Table>
            </Card>
            <Card title="工厂供货任务草稿" size="small">
              <Table
                :columns="factoryColumns"
                :data-source="mainFactoryTasks"
                :pagination="false"
                row-key="id"
                :scroll="{ x: 980 }"
              >
                <template #bodyCell="{ column, record }">
                  <Button
                    v-if="column.key === 'id'"
                    type="link"
                    @click="
                      openDocument(
                        record.id,
                        '工厂供货任务草稿',
                        record.status,
                        mainOrderId,
                        [
                          record.productName,
                          `${formatNumber(record.requiredQty)} 件`,
                          `工厂：${record.factory}`,
                          `预计齐套：${record.estimatedReadyAt}`,
                        ],
                      )
                    "
                  >
                    {{ record.id }}
                  </Button>
                  <span
                    v-else-if="
                      ['requiredQty', 'completedQty'].includes(
                        String(column.key),
                      )
                    "
                    >{{
                      formatNumber(readNumericField(record, column.key))
                    }}</span>
                  <Tag
                    v-else-if="column.key === 'status'"
                    :color="statusColor(record.status)"
                  >
                    {{ record.status }}
                  </Tag>
                </template>
              </Table>
            </Card>
            <Alert
              type="success"
              show-icon
              message="AI 只生成了执行草稿；采购申请未正式提交，供应商未被自动决定，工厂任务也未自动接收。"
            />
          </template>
        </section>

        <section v-else-if="activeView === 'shipment'" class="view-section">
          <div class="section-heading">
            <div>
              <h2>发货与报关协同</h2>
              <p>
                发货单表示客户发货批次；出库、提货、订舱和报关任务由发货批次向下关联。
              </p>
            </div>
            <Button type="primary" @click="shipmentDrawerOpen = true">
              <template #icon>
                <IconifyIcon icon="lucide:package-plus" />
              </template>
              创建首批发货草稿
            </Button>
          </div>
          <Table
            :columns="shipmentColumns"
            :data-source="data.shipments"
            row-key="id"
            :scroll="{ x: 1270 }"
          >
            <template #bodyCell="{ column, record }">
              <Button
                v-if="column.key === 'id'"
                type="link"
                @click="
                  openDocument(
                    record.id,
                    '发货单',
                    record.status,
                    record.orderId,
                    [
                      record.quantitySummary,
                      `来源：${record.pickupLocations.join('、')}`,
                      `ETD ${record.etd} / ETA ${record.eta}`,
                      record.customsStatus,
                    ],
                  )
                "
              >
                {{ record.id }}
              </Button>
              <span v-else-if="column.key === 'pickupLocations'">{{
                record.pickupLocations.join('、')
              }}</span>
              <Tag
                v-else-if="column.key === 'customsStatus'"
                :color="statusColor(record.customsStatus)"
              >
                {{ record.customsStatus }}
              </Tag>
              <Progress
                v-else-if="column.key === 'progress'"
                :percent="record.progress"
                size="small"
              />
            </template>
          </Table>

          <div class="shipment-grid">
            <Card title="报关资料齐套检查" size="small">
              <div class="checklist">
                <Checkbox
                  v-for="item in customsChecklist"
                  :key="item.key"
                  v-model:checked="item.checked"
                >
                  {{ item.label }}
                </Checkbox>
              </div>
              <Divider />
              <Space wrap>
                <Button @click="checkCustomsDocuments">
                  <template #icon>
                    <IconifyIcon icon="lucide:scan-search" />
                  </template>
                  AI 检查资料
                </Button>
                <Button type="dashed" @click="completeMockDocuments">
                  补齐示例资料
                </Button>
              </Space>
            </Card>
            <Card title="主演示订单单据关系" size="small">
              <div class="document-list">
                <button type="button" @click="openMainOrder()">
                  <IconifyIcon icon="lucide:file-signature" />
                  <span><strong>{{ mainOrderId }}</strong><small>合同订单 · 业务核心</small></span>
                </button>
                <button
                  v-for="item in mainPurchaseRequests"
                  :key="item.id"
                  type="button"
                  @click="
                    openDocument(
                      item.id,
                      '采购申请草稿',
                      item.status,
                      mainOrderId,
                      [item.productNames, item.quantitySummary],
                    )
                  "
                >
                  <IconifyIcon icon="lucide:shopping-cart" />
                  <span><strong>{{ item.id }}</strong><small>采购申请草稿</small></span>
                </button>
                <button
                  v-for="item in mainFactoryTasks"
                  :key="item.id"
                  type="button"
                  @click="
                    openDocument(
                      item.id,
                      '工厂供货任务草稿',
                      item.status,
                      mainOrderId,
                      [item.productName, item.factory],
                    )
                  "
                >
                  <IconifyIcon icon="lucide:factory" />
                  <span><strong>{{ item.id }}</strong><small>工厂供货任务草稿</small></span>
                </button>
                <button
                  v-for="item in mainShipments"
                  :key="item.id"
                  type="button"
                  @click="
                    openDocument(
                      item.id,
                      '发货单草稿',
                      item.status,
                      mainOrderId,
                      [item.quantitySummary, item.customsStatus],
                    )
                  "
                >
                  <IconifyIcon icon="lucide:ship" />
                  <span><strong>{{ item.id }}</strong><small>发货与报关草稿</small></span>
                </button>
              </div>
            </Card>
          </div>
        </section>

        <section v-else-if="activeView === 'finance'" class="view-section">
          <div class="section-heading">
            <div>
              <h2>回款与冲销</h2>
              <p>
                真实资金流入叫回款；客户余额消费和审核通过的减免只参与冲销，三者不能混成一个数字。
              </p>
            </div>
            <Button type="primary" @click="receiptDrawerOpen = true">
              <template #icon>
                <IconifyIcon icon="lucide:circle-dollar-sign" />
              </template>
              登记主演示回款
            </Button>
          </div>
          <Row :gutter="[12, 12]">
            <Col :xs="24" :md="6">
              <Card size="small">
                <Statistic
                  title="合同有效金额"
                  :value="mainOrder?.totalAmount || 0"
                  prefix="$"
                />
              </Card>
            </Col>
            <Col :xs="24" :md="6">
              <Card size="small">
                <Statistic
                  title="实际回款金额"
                  :value="mainOrder?.actualReceipt || 0"
                  prefix="$"
                />
              </Card>
            </Col>
            <Col :xs="24" :md="6">
              <Card size="small">
                <Statistic
                  title="回款冲销金额"
                  :value="mainOrder?.writeOffAmount || 0"
                  prefix="$"
                />
              </Card>
            </Col>
            <Col :xs="24" :md="6">
              <Card size="small" class="outstanding-card">
                <Statistic
                  title="未回款金额"
                  :value="mainOrder?.outstandingAmount || 0"
                  prefix="$"
                />
              </Card>
            </Col>
          </Row>
          <Alert
            class="formula-alert"
            type="info"
            show-icon
            :message="`口径：${formatMoney(mainOrder?.totalAmount || 0)} − ${formatMoney(mainOrder?.writeOffAmount || 0)} = ${formatMoney(mainOrder?.outstandingAmount || 0)} 未回款；实际回款只统计真实到账 ${formatMoney(mainOrder?.actualReceipt || 0)}。`"
          />

          <Card title="真实回款及订单分配" size="small">
            <Table
              :columns="receiptColumns"
              :data-source="mainReceipts"
              :pagination="false"
              row-key="id"
              :scroll="{ x: 1160 }"
            >
              <template #bodyCell="{ column, record }">
                <Button
                  v-if="column.key === 'id'"
                  type="link"
                  @click="
                    openDocument(
                      record.id,
                      '回款记录',
                      record.status,
                      mainOrderId,
                      [
                        `付款方：${record.payer}`,
                        `实际到账：${formatMoney(record.amount)}`,
                        `回款日汇率：${record.rate}`,
                        `分配到订单：${formatMoney(record.allocatedAmount)}`,
                      ],
                    )
                  "
                >
                  {{ record.id }}
                </Button>
                <span
                  v-else-if="
                    ['amount', 'allocatedAmount'].includes(String(column.key))
                  "
                  >{{ formatMoney(readNumericField(record, column.key)) }}</span>
                <span v-else-if="column.key === 'cnyAmount'">¥{{ formatNumber(record.cnyAmount) }}</span>
                <Tag v-else-if="column.key === 'status'" color="green">
                  {{ record.status }}
                </Tag>
              </template>
              <template #emptyText>
                <Empty description="主演示订单尚未登记真实回款" />
              </template>
            </Table>
          </Card>
          <Card title="客户余额消费与减免记录" size="small">
            <Table
              :columns="writeOffColumns"
              :data-source="mainWriteOffItems"
              :pagination="false"
              row-key="id"
              :scroll="{ x: 850 }"
            >
              <template #bodyCell="{ column, record }">
                <Tag
                  v-if="column.key === 'type'"
                  :color="record.type === '客户余额消费' ? 'cyan' : 'orange'"
                >
                  {{ record.type }}
                </Tag>
                <span v-else-if="column.key === 'amount'">{{
                  formatMoney(record.amount)
                }}</span>
                <Tag v-else-if="column.key === 'status'" color="green">
                  {{ record.status }}
                </Tag>
              </template>
              <template #emptyText>
                <Empty description="尚无余额消费或减免记录" />
              </template>
            </Table>
          </Card>
        </section>
      </Card>

      <Button
        aria-label="打开 AI 业务助手"
        class="ai-fab"
        shape="circle"
        title="打开 AI 业务助手"
        type="primary"
        size="large"
        @click="aiDrawerOpen = true"
      >
        <IconifyIcon icon="lucide:bot" />
      </Button>
    </div>

    <Drawer
      v-model:open="orderDrawerOpen"
      width="78%"
      title="合同订单执行工作台"
    >
      <template v-if="selectedOrder">
        <div class="drawer-order-header">
          <div>
            <h2>{{ selectedOrder.id }}</h2>
            <p>
              {{ selectedOrder.customerName }} · {{ selectedOrder.country }} ·
              负责人 {{ selectedOrder.owner }}
            </p>
          </div>
          <Space>
            <Tag color="blue">{{ selectedOrder.status }}</Tag>
            <Tag :color="riskColor(selectedOrder.risk)">
              {{ selectedOrder.risk }}风险
            </Tag>
          </Space>
        </div>
        <Row :gutter="[10, 10]">
          <Col :xs="24" :sm="12" :xl="6">
            <Card size="small">
              <Statistic
                title="合同金额"
                :value="selectedOrder.totalAmount"
                :prefix="selectedOrder.currency === 'USD' ? '$' : '€'"
              />
            </Card>
          </Col>
          <Col :xs="24" :sm="12" :xl="6">
            <Card size="small">
              <Statistic
                title="实际回款"
                :value="selectedOrder.actualReceipt"
                :prefix="selectedOrder.currency === 'USD' ? '$' : '€'"
              />
            </Card>
          </Col>
          <Col :xs="24" :sm="12" :xl="6">
            <Card size="small">
              <Statistic
                title="回款冲销"
                :value="selectedOrder.writeOffAmount"
                :prefix="selectedOrder.currency === 'USD' ? '$' : '€'"
              />
            </Card>
          </Col>
          <Col :xs="24" :sm="12" :xl="6">
            <Card size="small">
              <Statistic
                title="未回款"
                :value="selectedOrder.outstandingAmount"
                :prefix="selectedOrder.currency === 'USD' ? '$' : '€'"
              />
            </Card>
          </Col>
        </Row>
        <Tabs
          v-model:active-key="orderDrawerTab"
          class="drawer-tabs"
          :items="[
            { key: 'overview', label: '订单概览' },
            { key: 'products', label: '产品与供给' },
            { key: 'relations', label: '单据关系' },
          ]"
        />
        <template v-if="orderDrawerTab === 'overview'">
          <Descriptions bordered :column="3" size="small">
            <DescriptionsItem label="订单类型">
              {{ selectedOrder.type }}
            </DescriptionsItem>
            <DescriptionsItem label="所属公司">
              {{ selectedOrder.company }}
            </DescriptionsItem>
            <DescriptionsItem label="签单日期">
              {{ selectedOrder.signedAt }}
            </DescriptionsItem>
            <DescriptionsItem label="要求发货">
              {{ selectedOrder.requiredShipAt }}
            </DescriptionsItem>
            <DescriptionsItem label="贸易条款">
              {{ selectedOrder.incoterm }}
            </DescriptionsItem>
            <DescriptionsItem label="签单参考汇率">
              {{ selectedOrder.exchangeRate }}
            </DescriptionsItem>
            <DescriptionsItem label="付款条件" :span="2">
              {{ selectedOrder.paymentTerms }}
            </DescriptionsItem>
            <DescriptionsItem label="港口">
              {{ selectedOrder.originPort }} →
              {{ selectedOrder.destinationPort }}
            </DescriptionsItem>
          </Descriptions>
          <div class="drawer-chain-grid">
            <Button block @click="goFromOrderDrawer('demand')">
              AI 需求分析 · {{ selectedOrder.supplyStatus }}
            </Button>
            <Button block @click="goFromOrderDrawer('shipment')">
              发货与报关 · {{ selectedOrder.shipmentStatus }}
            </Button>
            <Button block @click="goFromOrderDrawer('finance')">
              回款与冲销 · 未回款
              {{
                formatMoney(
                  selectedOrder.outstandingAmount,
                  selectedOrder.currency,
                )
              }}
            </Button>
          </div>
        </template>
        <Table
          v-else-if="
            orderDrawerTab === 'products' && selectedOrder.id === mainOrderId
          "
          :columns="demandColumns.slice(0, 6)"
          :data-source="mainDemandLines"
          :pagination="false"
          row-key="id"
          :scroll="{ x: 900 }"
          size="small"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'productName'">
              <strong>{{ record.productName }}</strong>
              <div class="cell-subtext">{{ record.sku }}</div>
            </template>
            <span
              v-else-if="
                ['quantity', 'stockQty', 'factoryQty', 'purchaseQty'].includes(
                  String(column.key),
                )
              "
              >{{ formatNumber(readNumericField(record, column.key)) }}</span>
          </template>
        </Table>
        <template v-else-if="orderDrawerTab === 'relations'">
          <Timeline>
            <TimelineItem color="blue">
              合同订单 {{ selectedOrder.id }} ·
              {{ selectedOrder.status }}
            </TimelineItem>
            <TimelineItem color="purple">
              供给状态 · {{ selectedOrder.supplyStatus }}
            </TimelineItem>
            <TimelineItem color="orange">
              发货状态 · {{ selectedOrder.shipmentStatus }}
            </TimelineItem>
            <TimelineItem color="green">
              回款冲销 ·
              {{
                formatMoney(
                  selectedOrder.writeOffAmount,
                  selectedOrder.currency,
                )
              }}
            </TimelineItem>
          </Timeline>
        </template>
      </template>
    </Drawer>

    <Modal
      v-model:open="okkiModalOpen"
      width="980px"
      title="从 OKKI 选择准备下单的客户"
    >
      <Alert
        type="info"
        show-icon
        message="模拟 OKKI 客户列表与中台查重；未调用真实 OKKI 接口。"
      />
      <div class="okki-layout">
        <div>
          <Input
            v-model:value="okkiKeyword"
            allow-clear
            placeholder="搜索公司、国家、邮箱或 OKKI 负责人"
          >
            <template #prefix><IconifyIcon icon="lucide:search" /></template>
          </Input>
          <RadioGroup v-model:value="selectedOkkiId" class="okki-list">
            <Radio
              v-for="customer in filteredOkkiCustomers"
              :key="customer.id"
              :value="customer.id"
              @dblclick="chooseOkkiCustomer(customer)"
            >
              <span class="okki-option">
                <strong>{{ customer.name }}</strong>
                <small>{{ customer.country }} · {{ customer.contact }} ·
                  {{ customer.owner }}</small>
              </span>
              <Tag v-if="customer.mappedCustomerId" color="green">
                中台已存在
              </Tag>
              <Tag v-else color="blue">可导入</Tag>
            </Radio>
          </RadioGroup>
        </div>
        <Card v-if="selectedOkkiCustomer" size="small" title="客户与查重预览">
          <Descriptions :column="1" size="small">
            <DescriptionsItem label="OKKI 客户号">
              {{ selectedOkkiCustomer.serialId }}
            </DescriptionsItem>
            <DescriptionsItem label="公司">
              {{ selectedOkkiCustomer.name }}
            </DescriptionsItem>
            <DescriptionsItem label="联系人">
              {{ selectedOkkiCustomer.contact }}
            </DescriptionsItem>
            <DescriptionsItem label="邮箱">
              {{ selectedOkkiCustomer.email }}
            </DescriptionsItem>
            <DescriptionsItem label="销售阶段">
              {{ selectedOkkiCustomer.stage }}
            </DescriptionsItem>
            <DescriptionsItem label="查重结果">
              <Tag
                :color="
                  selectedOkkiCustomer.mappedCustomerId ? 'green' : 'blue'
                "
              >
                {{
                  selectedOkkiCustomer.mappedCustomerId
                    ? `已映射 ${selectedOkkiCustomer.mappedCustomerId}`
                    : '未发现中台交易客户'
                }}
              </Tag>
            </DescriptionsItem>
          </Descriptions>
        </Card>
      </div>
      <template #footer>
        <Space>
          <Button @click="okkiModalOpen = false">取消</Button>
          <Button type="primary" @click="importSelectedOkkiCustomer">
            {{
              selectedOkkiCustomer?.mappedCustomerId ? '直接选用' : '导入并使用'
            }}
          </Button>
        </Space>
      </template>
    </Modal>

    <Modal
      v-model:open="newOrderModalOpen"
      width="1080px"
      title="新建外贸合同订单"
    >
      <Steps
        :current="newOrderStep"
        :items="[
          { title: '选择交易客户' },
          { title: '订单与产品' },
          { title: '预览并创建' },
        ]"
      />
      <div class="order-form-body">
        <template v-if="newOrderStep === 0">
          <Form layout="vertical">
            <FormItem label="交易客户">
              <Select
                v-model:value="newOrderDraft.customerId"
                show-search
                option-filter-prop="label"
              >
                <SelectOption
                  v-for="customer in data.customers"
                  :key="customer.id"
                  :value="customer.id"
                  :label="customer.name"
                >
                  {{ customer.name }} · {{ customer.country }}
                </SelectOption>
              </Select>
            </FormItem>
          </Form>
          <Button type="dashed" block @click="openOkkiImport">
            <template #icon><IconifyIcon icon="lucide:import" /></template>
            没找到？从 OKKI 导入准备下单的客户
          </Button>
        </template>
        <template v-else-if="newOrderStep === 1">
          <Form layout="vertical">
            <Row :gutter="16">
              <Col :span="8">
                <FormItem label="订单类型">
                  <Select v-model:value="newOrderDraft.type">
                    <SelectOption value="大货订单">大货订单</SelectOption><SelectOption value="样品订单"> 样品订单 </SelectOption>
                  </Select>
                </FormItem>
              </Col>
              <Col :span="8">
                <FormItem label="订单所属公司">
                  <Input v-model:value="newOrderDraft.company" />
                </FormItem>
              </Col>
              <Col :span="8">
                <FormItem label="订单币种">
                  <Input
                    :value="newOrderDraft.currency"
                    disabled
                    suffix="一单一币种"
                  />
                </FormItem>
              </Col>
              <Col :span="8">
                <FormItem label="签单日期">
                  <Input v-model:value="newOrderDraft.signedAt" />
                </FormItem>
              </Col>
              <Col :span="8">
                <FormItem label="要求发货日期">
                  <Input v-model:value="newOrderDraft.requiredShipAt" />
                </FormItem>
              </Col>
              <Col :span="8">
                <FormItem label="贸易条款">
                  <Input v-model:value="newOrderDraft.incoterm" />
                </FormItem>
              </Col>
            </Row>
          </Form>
          <Table
            :data-source="newOrderProducts"
            :pagination="false"
            row-key="sku"
            size="small"
          >
            <Table.Column title="SKU" data-index="sku" key="sku" />
            <Table.Column title="产品" data-index="name" key="name" />
            <Table.Column title="数量" key="quantity">
              <template #default="{ record }">
                <InputNumber
                  v-model:value="record.quantity"
                  :min="1"
                  @change="updateProductAmount(record)"
                />
              </template>
            </Table.Column>
            <Table.Column title="单价 USD" key="price">
              <template #default="{ record }">
                <InputNumber
                  v-model:value="record.price"
                  :min="0"
                  :precision="2"
                  @change="updateProductAmount(record)"
                />
              </template>
            </Table.Column>
            <Table.Column title="金额" key="amount">
              <template #default="{ record }">
                {{ formatMoney(record.quantity * record.price) }}
              </template>
            </Table.Column>
          </Table>
          <div class="order-total">
            产品 {{ formatMoney(productTotal) }} + 附加费用
            {{ formatMoney(newOrderDraft.additionalFee) }} =
            <strong>{{ formatMoney(newOrderTotal) }}</strong>
          </div>
        </template>
        <template v-else>
          <Alert
            type="success"
            show-icon
            message="硬规则校验通过：客户已映射、所有产品有 SKU、币种一致、金额正确、发货日晚于签单日。"
          />
          <Descriptions bordered :column="2" class="preview-descriptions">
            <DescriptionsItem label="交易客户">
              {{
                data.customers.find(
                  (item) => item.id === newOrderDraft.customerId,
                )?.name
              }}
            </DescriptionsItem>
            <DescriptionsItem label="订单金额">
              {{ formatMoney(newOrderTotal) }}
            </DescriptionsItem>
            <DescriptionsItem label="订单类型">
              {{ newOrderDraft.type }}
            </DescriptionsItem>
            <DescriptionsItem label="签单参考汇率">
              7.18 CNY / USD
            </DescriptionsItem>
            <DescriptionsItem label="要求发货">
              {{ newOrderDraft.requiredShipAt }}
            </DescriptionsItem>
            <DescriptionsItem label="付款条件">
              {{ newOrderDraft.paymentTerms }}
            </DescriptionsItem>
          </Descriptions>
        </template>
      </div>
      <template #footer>
        <Space>
          <Button @click="newOrderModalOpen = false">取消</Button>
          <Button v-if="newOrderStep > 0" @click="newOrderStep -= 1">
            上一步
          </Button>
          <Button v-if="newOrderStep < 2" type="primary" @click="nextOrderStep">
            下一步
          </Button>
          <Button v-else type="primary" @click="createDraftOrder">
            保存草稿并查看订单
          </Button>
        </Space>
      </template>
    </Modal>

    <Modal
      v-model:open="confirmSplitModalOpen"
      title="确认供给拆分并生成执行草稿"
      width="620px"
    >
      <Alert
        type="warning"
        show-icon
        message="这是需要人工承担业务责任的动作。系统会生成草稿，但不会自动提交采购申请或决定正式供应商。"
      />
      <Descriptions :column="1" class="confirm-descriptions">
        <DescriptionsItem label="库存满足">600 件</DescriptionsItem>
        <DescriptionsItem label="内部工厂">
          4,500 件 → FT-202608-004 草稿
        </DescriptionsItem>
        <DescriptionsItem label="外部采购">
          7,000 件 → PR-202608-006 草稿
        </DescriptionsItem>
      </Descriptions>
      <Checkbox v-model:checked="responsibilityChecked">
        我已核对每个产品行的库存、自制与外采数量，并确认只生成执行草稿。
      </Checkbox>
      <template #footer>
        <Space>
          <Button @click="confirmSplitModalOpen = false">取消</Button><Button
            type="primary"
            :disabled="!responsibilityChecked"
            @click="confirmSupplySplit"
          >
            确认并生成草稿
          </Button>
        </Space>
      </template>
    </Modal>

    <Drawer
      v-model:open="supplierDrawerOpen"
      width="720"
      title="AI 供应商建议 · 人工采用"
    >
      <Alert
        type="info"
        show-icon
        message="评分基于已审核资质、历史价格、交期、准时率、合格率、付款条件和当前产能。"
      />
      <RadioGroup v-model:value="selectedSupplierId" class="supplier-list">
        <Radio
          v-for="supplier in supplierRecommendations"
          :key="supplier.id"
          :value="supplier.id"
        >
          <Card
            size="small"
            :class="{
              'supplier-card--selected': selectedSupplierId === supplier.id,
            }"
          >
            <div class="supplier-heading">
              <strong>{{ supplier.name }}</strong><Tag :color="riskColor(supplier.risk)">
                {{ supplier.score }} 分 · {{ supplier.risk }}风险
              </Tag>
            </div>
            <Descriptions :column="3" size="small">
              <DescriptionsItem label="建议单价">
                $ {{ supplier.price }}
              </DescriptionsItem>
              <DescriptionsItem label="采购周期">
                {{ supplier.leadTimeDays }} 天
              </DescriptionsItem>
              <DescriptionsItem label="准时率">
                {{ supplier.onTimeRate }}%
              </DescriptionsItem>
              <DescriptionsItem label="合格率">
                {{ supplier.qualityRate }}%
              </DescriptionsItem>
              <DescriptionsItem label="付款条件" :span="2">
                {{ supplier.paymentTerms }}
              </DescriptionsItem>
            </Descriptions>
            <p>{{ supplier.reason }}</p>
          </Card>
        </Radio>
      </RadioGroup>
      <template #footer>
        <Space>
          <Button @click="supplierDrawerOpen = false">取消</Button><Button type="primary" @click="adoptSupplierRecommendation">
            采用建议并回填草稿
          </Button>
        </Space>
      </template>
    </Drawer>

    <Drawer
      v-model:open="shipmentDrawerOpen"
      width="700"
      title="创建首批发货草稿"
    >
      <Alert
        type="warning"
        show-icon
        message="本动作只创建发货单、出库单和报关任务草稿，不会确认实际出库或海关放行。"
      />
      <Descriptions bordered :column="2" class="shipment-preview">
        <DescriptionsItem label="TPE 瑜伽垫">
          2,500 张 · 黄石工厂/武汉仓
        </DescriptionsItem>
        <DescriptionsItem label="软木瑜伽砖">
          1,000 只 · 外部供应商
        </DescriptionsItem>
        <DescriptionsItem label="出口纸箱">
          2,600 只 · 武汉仓/包装供应商
        </DescriptionsItem>
        <DescriptionsItem label="预计开航">2026-10-10</DescriptionsItem>
        <DescriptionsItem label="提货来源" :span="2">
          黄石飞德慕工厂、外部供应商、武汉仓
        </DescriptionsItem>
      </Descriptions>
      <Card size="small" title="将生成的关联草稿">
        <Timeline>
          <TimelineItem>SH-202609-009 · 发货单草稿</TimelineItem>
          <TimelineItem>OUT-202609-021 · 黄石工厂出库草稿</TimelineItem>
          <TimelineItem>OUT-202609-022 · 武汉仓出库草稿</TimelineItem>
          <TimelineItem>CT-202609-008 · 出运报关任务草稿</TimelineItem>
        </Timeline>
      </Card>
      <template #footer>
        <Space>
          <Button @click="shipmentDrawerOpen = false">取消</Button><Button type="primary" @click="createShipmentDraft">
            确认创建草稿
          </Button>
        </Space>
      </template>
    </Drawer>

    <Drawer
      v-model:open="receiptDrawerOpen"
      width="720"
      title="登记真实回款并确认冲销构成"
    >
      <Alert
        type="info"
        show-icon
        message="AI 可以根据银行附言推荐订单，但必须由财务人员确认分配；回款日汇率单独保存快照。"
      />
      <Form layout="vertical" class="receipt-form">
        <Row :gutter="16">
          <Col :span="12">
            <FormItem label="付款方">
              <Input v-model:value="receiptForm.payer" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="到账日期">
              <Input v-model:value="receiptForm.receivedAt" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="实际到账 USD">
              <InputNumber
                v-model:value="receiptForm.amount"
                :min="0"
                :precision="2"
                style="width: 100%"
              />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="回款日汇率">
              <InputNumber
                v-model:value="receiptForm.rate"
                :min="0"
                :precision="4"
                style="width: 100%"
              />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="客户余额消费 USD">
              <InputNumber
                v-model:value="receiptForm.balanceAmount"
                :min="0"
                :precision="2"
                style="width: 100%"
              />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="审核减免 USD">
              <InputNumber
                v-model:value="receiptForm.waiverAmount"
                :min="0"
                :precision="2"
                style="width: 100%"
              />
            </FormItem>
          </Col>
        </Row>
      </Form>
      <Card size="small" title="AI 推荐匹配">
        <Descriptions :column="1">
          <DescriptionsItem label="银行附言">
            Deposit for PI FDM-20260818
          </DescriptionsItem>
          <DescriptionsItem label="推荐订单">
            <Tag color="purple"> {{ mainOrderId }} · 置信度 96% </Tag>
          </DescriptionsItem>
          <DescriptionsItem label="实际回款">
            {{ formatMoney(receiptForm.amount) }}
          </DescriptionsItem>
          <DescriptionsItem label="本次冲销">
            {{
              formatMoney(
                receiptForm.amount +
                  receiptForm.balanceAmount +
                  receiptForm.waiverAmount,
              )
            }}
          </DescriptionsItem>
          <DescriptionsItem label="冲销后未回款">
            {{
              formatMoney(
                (mainOrder?.totalAmount || 0) -
                  receiptForm.amount -
                  receiptForm.balanceAmount -
                  receiptForm.waiverAmount,
              )
            }}
          </DescriptionsItem>
        </Descriptions>
      </Card>
      <template #footer>
        <Space>
          <Button @click="receiptDrawerOpen = false">取消</Button><Button type="primary" @click="recordReceiptAndWriteOff">
            人工确认分配与冲销
          </Button>
        </Space>
      </template>
    </Drawer>

    <Drawer
      v-model:open="aiDrawerOpen"
      width="440"
      title="AI 业务助手 · 受权限与硬规则约束"
    >
      <div class="assistant-prompts">
        <Button
          v-for="prompt in assistantPrompts"
          :key="prompt"
          size="small"
          @click="sendAssistantPrompt(prompt)"
        >
          {{ prompt }}
        </Button>
      </div>
      <div class="assistant-thread">
        <div
          v-for="item in assistantMessages"
          :key="item.id"
          class="assistant-message"
          :class="[
            `assistant-message--${item.role}`,
            { 'assistant-message--blocked': item.tone === 'blocked' },
          ]"
        >
          <span>{{ item.role === 'assistant' ? 'AI' : '你' }}</span>
          <p>{{ item.content }}</p>
        </div>
      </div>
      <div class="assistant-composer">
        <Input
          v-model:value="assistantInput"
          placeholder="询问订单状态、风险或金额口径"
          @press-enter="sendAssistantPrompt()"
        />
        <Button type="primary" @click="sendAssistantPrompt()">
          <IconifyIcon icon="lucide:send" />
        </Button>
      </div>
    </Drawer>

    <Modal
      v-model:open="documentModalOpen"
      :title="documentDetail?.title"
      width="560px"
      :footer="null"
    >
      <Descriptions v-if="documentDetail" :column="1" bordered>
        <DescriptionsItem label="单据编号">
          <strong>{{ documentDetail.id }}</strong>
        </DescriptionsItem>
        <DescriptionsItem label="来源单据">
          {{ documentDetail.source }}
        </DescriptionsItem>
        <DescriptionsItem label="状态">
          <Tag :color="statusColor(documentDetail.status)">
            {{ documentDetail.status }}
          </Tag>
        </DescriptionsItem>
        <DescriptionsItem label="业务内容">
          <ul class="detail-list">
            <li v-for="line in documentDetail.details" :key="line">
              {{ line }}
            </li>
          </ul>
        </DescriptionsItem>
        <DescriptionsItem label="下一步">
          由对应岗位人工检查并执行正式业务动作
        </DescriptionsItem>
      </Descriptions>
    </Modal>

    <Modal
      v-model:open="resetModalOpen"
      title="重置原型演示数据"
      ok-text="确认重置"
      cancel-text="取消"
      @ok="resetPrototype"
    >
      <p>
        这会清除当前浏览器会话中的模拟客户、草稿、回款和操作状态，不会影响任何真实系统数据。
      </p>
    </Modal>
  </Page>
</template>

<style scoped>
.prototype-shell {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  overflow: auto;
}

.hero-card {
  flex: none;
  background: linear-gradient(135deg, #fff 0%, #f6f9ff 62%, #f4f0ff 100%);
  border: 1px solid #e6ebf3;
  border-radius: 12px;
}

.hero-row,
.section-heading,
.drawer-order-header,
.supplier-heading,
.order-heading {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
}

.hero-eyebrow {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 12px;
  color: #667085;
}

.hero-card h1 {
  margin: 8px 0 2px;
  font-size: 24px;
  font-weight: 680;
  color: #172033;
  letter-spacing: -0.02em;
}

.hero-card p,
.section-heading p,
.drawer-order-header p {
  margin: 0;
  font-size: 13px;
  color: #768399;
}

.demo-alert {
  margin-top: 14px;
}

.flow-strip {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 8px;
  margin-top: 14px;
}

.flow-stage {
  display: flex;
  gap: 8px;
  align-items: center;
  min-width: 0;
  padding: 10px;
  color: #334155;
  text-align: left;
  cursor: pointer;
  background: rgb(255 255 255 / 72%);
  border: 1px solid #e7ebf2;
  border-radius: 9px;
  transition: 160ms ease;
}

.flow-stage:hover {
  color: #4754d6;
  background: #fff;
  border-color: #bac3ff;
  transform: translateY(-1px);
}

.flow-stage__icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 28px;
  height: 28px;
  color: #5b61d9;
  background: #eef0ff;
  border-radius: 8px;
}

.flow-stage__arrow {
  margin-left: auto;
  color: #a5adbd;
}

.module-card {
  flex: 1;
  min-height: 0;
  border-radius: 12px;
}

.module-card :deep(.ant-tabs-nav) {
  margin-bottom: 16px;
}

.view-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-heading h2,
.drawer-order-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 650;
  color: #1d2939;
}

.kpi-card {
  height: 100%;
  border-color: #e8edf4;
}

.kpi-note {
  display: block;
  margin-top: 6px;
  font-size: 12px;
  color: #7d899c;
}

.kpi-note--warning {
  color: #ad6800;
}

.kpi-note--danger,
.amount-danger {
  color: #cf1322;
}

.overview-grid,
.shipment-grid,
.evidence-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(300px, 0.8fr);
  gap: 12px;
}

.focus-order-card,
.action-card {
  height: 100%;
}

.order-heading {
  margin-bottom: 14px;
}

.order-link {
  height: auto;
  padding: 0 10px 0 0;
  font-size: 16px;
  font-weight: 650;
}

.parallel-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.chain-card {
  display: grid;
  grid-template-columns: 30px 1fr;
  gap: 4px 10px;
  align-items: start;
  padding: 12px;
  color: #344054;
  text-align: left;
  cursor: pointer;
  background: #fbfcfe;
  border: 1px solid #eaedf3;
  border-radius: 10px;
}

.chain-card > svg {
  width: 22px;
  height: 22px;
  margin-top: 2px;
  color: #5965dd;
}

.chain-card div {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.chain-card span {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  color: #7d899b;
  white-space: nowrap;
}

.chain-card :deep(.ant-progress) {
  grid-column: 2;
}

.chain-card:hover {
  border-color: #bec5ff;
  box-shadow: 0 6px 18px rgb(62 72 160 / 8%);
}

.chain-card--muted {
  cursor: default;
}

.action-list {
  display: grid;
  gap: 8px;
}

.action-list > button {
  display: grid;
  grid-template-columns: 28px 1fr auto;
  gap: 10px;
  align-items: center;
  padding: 10px 0;
  color: #344054;
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-bottom: 1px solid #eef1f5;
}

.action-list > button:last-child {
  border-bottom: 0;
}

.action-index {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  font-weight: 650;
  color: #5158c9;
  background: #eef0ff;
  border-radius: 50%;
}

.action-list div {
  display: flex;
  flex-direction: column;
}

.action-list small,
.cell-subtext {
  margin-top: 2px;
  font-size: 11px;
  color: #8b96a8;
}

.data-table,
.validation-alert,
.formula-alert {
  margin-top: 4px;
}

.analysis-empty {
  display: grid;
  place-items: center;
  min-height: 300px;
  border: 1px dashed #d9dfe9;
  border-radius: 10px;
}

.evidence-grid ul,
.detail-list {
  padding-left: 18px;
  margin: 0;
  line-height: 1.9;
  color: #596579;
}

.shipment-grid {
  grid-template-columns: minmax(280px, 0.8fr) minmax(0, 1.2fr);
}

.checklist {
  display: grid;
  gap: 10px;
}

.document-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.document-list button {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 10px;
  color: #344054;
  text-align: left;
  cursor: pointer;
  background: #fafbfe;
  border: 1px solid #eaedf3;
  border-radius: 8px;
}

.document-list button > svg {
  flex: none;
  font-size: 20px;
  color: #5b61d9;
}

.document-list span {
  display: flex;
  flex-direction: column;
}

.document-list small {
  color: #8994a7;
}

.outstanding-card :deep(.ant-statistic-content) {
  color: #cf1322;
}

.ai-fab {
  position: fixed;
  right: 26px;
  bottom: 28px;
  z-index: 20;
  width: 48px;
  height: 48px;
  box-shadow: 0 8px 24px rgb(69 77 196 / 35%);
}

.drawer-tabs {
  margin-top: 14px;
}

.drawer-chain-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 14px;
}

.okki-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(300px, 0.8fr);
  gap: 14px;
  margin-top: 14px;
}

.okki-list,
.supplier-list {
  display: grid;
  gap: 8px;
  width: 100%;
  margin-top: 12px;
}

.okki-list :deep(.ant-radio-wrapper) {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  width: 100%;
  padding: 10px;
  border: 1px solid #e8ecf2;
  border-radius: 8px;
}

.okki-option {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.okki-option small {
  color: #8a95a6;
}

.order-form-body {
  min-height: 310px;
  padding-top: 22px;
}

.order-total {
  margin-top: 12px;
  color: #667085;
  text-align: right;
}

.order-total strong {
  font-size: 16px;
  color: #172033;
}

.preview-descriptions,
.confirm-descriptions,
.shipment-preview,
.receipt-form {
  margin-top: 16px;
}

.supplier-list :deep(.ant-radio-wrapper) {
  align-items: flex-start;
  width: 100%;
}

.supplier-list :deep(.ant-card) {
  width: 100%;
}

.supplier-card--selected {
  border-color: #7d83e7;
  box-shadow: 0 0 0 2px rgb(91 97 217 / 8%);
}

.supplier-heading {
  margin-bottom: 10px;
}

.supplier-card--selected p {
  margin: 8px 0 0;
  font-size: 12px;
  color: #667085;
}

.assistant-prompts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.assistant-thread {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: calc(100vh - 250px);
  min-height: 360px;
  padding: 14px 0;
  overflow: auto;
}

.assistant-message {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  max-width: 92%;
}

.assistant-message > span {
  display: grid;
  flex: none;
  place-items: center;
  width: 28px;
  height: 28px;
  font-size: 11px;
  font-weight: 700;
  color: #5058c8;
  background: #eef0ff;
  border-radius: 8px;
}

.assistant-message p {
  padding: 10px 12px;
  margin: 0;
  line-height: 1.6;
  color: #425066;
  background: #f6f8fb;
  border-radius: 4px 12px 12px;
}

.assistant-message--user {
  flex-direction: row-reverse;
  align-self: flex-end;
}

.assistant-message--user p {
  color: #fff;
  background: #5a61d6;
  border-radius: 12px 4px 12px 12px;
}

.assistant-message--blocked p {
  color: #a8071a;
  background: #fff1f0;
  border: 1px solid #ffccc7;
}

.assistant-composer {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
}

@media (max-width: 1100px) {
  .flow-strip {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .overview-grid,
  .shipment-grid,
  .evidence-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .hero-row,
  .section-heading,
  .drawer-order-header,
  .order-heading {
    flex-direction: column;
    align-items: flex-start;
  }

  .flow-strip,
  .parallel-grid,
  .document-list,
  .drawer-chain-grid,
  .okki-layout {
    grid-template-columns: 1fr;
  }
}
</style>
