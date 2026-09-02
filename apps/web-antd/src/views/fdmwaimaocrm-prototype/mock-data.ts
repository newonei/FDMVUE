export type PrototypeView =
  | 'customers'
  | 'demand'
  | 'finance'
  | 'orders'
  | 'overview'
  | 'shipment'
  | 'supply';

export interface Customer {
  id: string;
  code: string;
  name: string;
  country: string;
  contact: string;
  email: string;
  owner: string;
  okkiOwner: string;
  okkiSerialId: string;
  level: 'A' | 'B' | 'C';
  firstOrderDate: string;
  orderCount: number;
  transactionAmount: number;
  outstandingAmount: number;
  syncStatus: '已同步' | '待同步';
  lastSyncAt: string;
}

export interface OkkiCustomer {
  id: string;
  companyId: string;
  serialId: string;
  name: string;
  country: string;
  contact: string;
  email: string;
  owner: string;
  stage: string;
  mappedCustomerId?: string;
}

export interface ContractOrder {
  id: string;
  customerId: string;
  customerName: string;
  country: string;
  type: '大货订单' | '样品订单';
  company: string;
  owner: string;
  currency: 'EUR' | 'USD';
  totalAmount: number;
  signedAt: string;
  requiredShipAt: string;
  status: string;
  supplyStatus: string;
  shipmentStatus: string;
  actualReceipt: number;
  writeOffAmount: number;
  outstandingAmount: number;
  risk: '中' | '低' | '高';
  incoterm: string;
  paymentTerms: string;
  originPort: string;
  destinationPort: string;
  exchangeRate: number;
}

export interface DemandLine {
  id: string;
  orderId: string;
  sku: string;
  customerSku: string;
  productName: string;
  specification: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;
  stockQty: number;
  factoryQty: number;
  purchaseQty: number;
  strategy: string;
  confidence: number;
}

export interface PurchaseRequest {
  id: string;
  orderId: string;
  productNames: string;
  quantitySummary: string;
  supplier: string;
  suggestedAmount: number;
  requiredAt: string;
  status: string;
  risk: string;
}

export interface FactoryTask {
  id: string;
  orderId: string;
  productName: string;
  factory: string;
  requiredQty: number;
  completedQty: number;
  requiredAt: string;
  estimatedReadyAt: string;
  owner: string;
  status: string;
}

export interface Shipment {
  id: string;
  orderId: string;
  batch: string;
  quantitySummary: string;
  pickupLocations: string[];
  warehouse: string;
  etd: string;
  eta: string;
  status: string;
  customsStatus: string;
  progress: number;
}

export interface Receipt {
  id: string;
  orderId: string;
  receivedAt: string;
  payer: string;
  account: string;
  currency: string;
  amount: number;
  rate: number;
  cnyAmount: number;
  allocatedAmount: number;
  status: string;
}

export interface WriteOffItem {
  id: string;
  orderId: string;
  type: '坏账或减免' | '客户余额消费';
  amount: number;
  approvedAt: string;
  remark: string;
  status: string;
}

export interface AuditEntry {
  id: string;
  time: string;
  actor: string;
  action: string;
  result: string;
  type: 'AI建议' | '人工确认' | '系统记录' | '规则拦截';
}

export interface JourneyState {
  analysisStatus: 'AI草稿' | '已人工确认' | '待分析';
  supplierAdopted: boolean;
  shipmentDraftCreated: boolean;
}

export interface PrototypeData {
  customers: Customer[];
  okkiCustomers: OkkiCustomer[];
  orders: ContractOrder[];
  demandLines: DemandLine[];
  purchaseRequests: PurchaseRequest[];
  factoryTasks: FactoryTask[];
  shipments: Shipment[];
  receipts: Receipt[];
  writeOffItems: WriteOffItem[];
  audits: AuditEntry[];
  journey: JourneyState;
}

export const mainOrderId = 'SO-FTM-202608-018';

export const supplierRecommendations = [
  {
    id: 'SUP-0028',
    name: '宁波绿动运动用品有限公司',
    score: 93,
    price: 2.84,
    leadTimeDays: 18,
    onTimeRate: 97,
    qualityRate: 99.2,
    paymentTerms: '30% 定金，验货后付尾款',
    risk: '低',
    reason: '近 12 个月同类产品交付稳定，报价合理，当前产能充足。',
  },
  {
    id: 'SUP-0016',
    name: '义乌跃能文体有限公司',
    score: 86,
    price: 2.76,
    leadTimeDays: 24,
    onTimeRate: 89,
    qualityRate: 98.5,
    paymentTerms: '50% 定金，出货前付尾款',
    risk: '中',
    reason: '价格更低，但近期有两次延期，旺季排产需要再次确认。',
  },
  {
    id: 'SUP-0041',
    name: '东莞衡健实业有限公司',
    score: 81,
    price: 2.98,
    leadTimeDays: 16,
    onTimeRate: 95,
    qualityRate: 97.6,
    paymentTerms: '月结 30 天',
    risk: '中',
    reason: '交期较快且账期友好，但首次供应此包装版本，需要首件确认。',
  },
] as const;

export function createPrototypeData(): PrototypeData {
  return {
    customers: [
      {
        id: 'CUS-1001',
        code: 'FT-CUS-00018',
        name: 'NOVA FITNESS GMBH',
        country: '德国',
        contact: 'Anna Keller',
        email: 'anna@nova-fitness.example',
        owner: '林晓月',
        okkiOwner: 'Linda Zhou',
        okkiSerialId: 'OKKI-00818',
        level: 'A',
        firstOrderDate: '2025-03-18',
        orderCount: 8,
        transactionAmount: 512_900,
        outstandingAmount: 86_500,
        syncStatus: '已同步',
        lastSyncAt: '2026-08-27 09:18',
      },
      {
        id: 'CUS-1002',
        code: 'FT-CUS-00026',
        name: 'Northstar Fitness LLC',
        country: '美国',
        contact: 'Emma Wilson',
        email: 'emma@northstar-fitness.example',
        owner: '周雨晴',
        okkiOwner: 'Linda Zhou',
        okkiSerialId: 'OKKI-00863',
        level: 'A',
        firstOrderDate: '2024-11-09',
        orderCount: 12,
        transactionAmount: 628_400,
        outstandingAmount: 28_000,
        syncStatus: '已同步',
        lastSyncAt: '2026-08-26 16:42',
      },
      {
        id: 'CUS-1003',
        code: 'FT-CUS-00031',
        name: 'ZenMotion Pty Ltd',
        country: '澳大利亚',
        contact: 'Sophie Martin',
        email: 'sophie@zenmotion.example',
        owner: '林晓月',
        okkiOwner: 'Linda Zhou',
        okkiSerialId: 'OKKI-00912',
        level: 'B',
        firstOrderDate: '2025-08-20',
        orderCount: 3,
        transactionAmount: 146_800,
        outstandingAmount: 0,
        syncStatus: '待同步',
        lastSyncAt: '2026-08-23 11:05',
      },
    ],
    okkiCustomers: [
      {
        id: 'OKKI-C-0818',
        companyId: 'company_908181',
        serialId: 'OKKI-00818',
        name: 'NOVA FITNESS GMBH',
        country: '德国',
        contact: 'Anna Keller',
        email: 'anna@nova-fitness.example',
        owner: 'Linda Zhou',
        stage: '已成交',
        mappedCustomerId: 'CUS-1001',
      },
      {
        id: 'OKKI-C-0981',
        companyId: 'company_919811',
        serialId: 'OKKI-00981',
        name: 'Alpine Studio SAS',
        country: '法国',
        contact: 'Camille Laurent',
        email: 'camille@alpine-studio.example',
        owner: 'Linda Zhou',
        stage: '准备下单',
      },
      {
        id: 'OKKI-C-0993',
        companyId: 'company_921204',
        serialId: 'OKKI-00993',
        name: 'Nordic Balance AB',
        country: '瑞典',
        contact: 'Erik Lindström',
        email: 'erik@nordic-balance.example',
        owner: 'Steven Liu',
        stage: '准备下单',
      },
    ],
    orders: [
      {
        id: mainOrderId,
        customerId: 'CUS-1001',
        customerName: 'NOVA FITNESS GMBH',
        country: '德国',
        type: '大货订单',
        company: '飞德慕国际贸易有限公司',
        owner: '林晓月',
        currency: 'USD',
        totalAmount: 86_500,
        signedAt: '2026-08-27',
        requiredShipAt: '2026-10-20',
        status: '执行中',
        supplyStatus: '待运行 AI 分析',
        shipmentStatus: '待创建发货单',
        actualReceipt: 0,
        writeOffAmount: 0,
        outstandingAmount: 86_500,
        risk: '中',
        incoterm: 'FOB Shanghai',
        paymentTerms: '30% 定金，70% 出货前',
        originPort: '上海港',
        destinationPort: 'Hamburg, Germany',
        exchangeRate: 7.18,
      },
      {
        id: 'SO-FTM-202607-011',
        customerId: 'CUS-1002',
        customerName: 'Northstar Fitness LLC',
        country: '美国',
        type: '大货订单',
        company: '飞德慕国际贸易有限公司',
        owner: '周雨晴',
        currency: 'USD',
        totalAmount: 100_000,
        signedAt: '2026-07-18',
        requiredShipAt: '2026-09-24',
        status: '部分发货',
        supplyStatus: '生产中',
        shipmentStatus: '订舱准备中',
        actualReceipt: 60_000,
        writeOffAmount: 72_000,
        outstandingAmount: 28_000,
        risk: '高',
        incoterm: 'FOB Wuhan',
        paymentTerms: '30% 定金，提单副本后付清尾款',
        originPort: '上海港',
        destinationPort: 'Los Angeles, USA',
        exchangeRate: 7.16,
      },
      {
        id: 'SO-FTM-202605-006',
        customerId: 'CUS-1003',
        customerName: 'ZenMotion Pty Ltd',
        country: '澳大利亚',
        type: '样品订单',
        company: '飞德慕国际贸易有限公司',
        owner: '林晓月',
        currency: 'USD',
        totalAmount: 0,
        signedAt: '2026-05-12',
        requiredShipAt: '2026-05-30',
        status: '已完成',
        supplyStatus: '已齐套',
        shipmentStatus: '已签收',
        actualReceipt: 0,
        writeOffAmount: 0,
        outstandingAmount: 0,
        risk: '低',
        incoterm: 'DAP Sydney',
        paymentTerms: '免费样品，运费由公司承担',
        originPort: '武汉',
        destinationPort: 'Sydney, Australia',
        exchangeRate: 7.21,
      },
    ],
    demandLines: [
      {
        id: 'LINE-001',
        orderId: mainOrderId,
        sku: 'MAT-TPE-06',
        customerSku: 'NOVA-YM-6001',
        productName: '6mm TPE 瑜伽垫',
        specification: '1830 × 610 × 6 mm / 深海蓝 / 定制激光纹',
        quantity: 5000,
        unit: '张',
        unitPrice: 13,
        amount: 65_000,
        stockQty: 500,
        factoryQty: 4500,
        purchaseQty: 0,
        strategy: '武汉仓现货 + 黄石工厂自产',
        confidence: 96,
      },
      {
        id: 'LINE-002',
        orderId: mainOrderId,
        sku: 'BRICK-CORK-01',
        customerSku: 'NOVA-YB-2202',
        productName: '软木瑜伽砖',
        specification: '230 × 150 × 76 mm / 2 只装 / 原木色',
        quantity: 2000,
        unit: '只',
        unitPrice: 6,
        amount: 12_000,
        stockQty: 0,
        factoryQty: 0,
        purchaseQty: 2000,
        strategy: '外部供应商采购',
        confidence: 92,
      },
      {
        id: 'LINE-003',
        orderId: mainOrderId,
        sku: 'CTN-EXPORT-05',
        customerSku: 'NOVA-PKG-4004',
        productName: '五层出口纸箱',
        specification: '五层瓦楞 / 客户包装 V4 / 含 2% 备品',
        quantity: 5100,
        unit: '只',
        unitPrice: 1.5,
        amount: 7650,
        stockQty: 100,
        factoryQty: 0,
        purchaseQty: 5000,
        strategy: '库存尾数 + 定制包装外采',
        confidence: 89,
      },
    ],
    purchaseRequests: [],
    factoryTasks: [],
    shipments: [
      {
        id: 'SH-2026-0827',
        orderId: 'SO-FTM-202607-011',
        batch: '第一批',
        quantitySummary: 'TPE 瑜伽垫 2,400 张',
        pickupLocations: ['洛阳飞德慕工厂'],
        warehouse: '工厂直发港口',
        etd: '2026-09-14',
        eta: '2026-10-03',
        status: '报关准备中',
        customsStatus: '缺少装箱最终版',
        progress: 72,
      },
    ],
    receipts: [
      {
        id: 'RC-2026-0119',
        orderId: 'SO-FTM-202607-011',
        receivedAt: '2026-08-18',
        payer: 'Northstar Fitness LLC',
        account: '中国银行武汉分行 · USD 账户',
        currency: 'USD',
        amount: 60_000,
        rate: 7.16,
        cnyAmount: 429_600,
        allocatedAmount: 60_000,
        status: '已审核并分配',
      },
    ],
    writeOffItems: [
      {
        id: 'WO-2026-0091',
        orderId: 'SO-FTM-202607-011',
        type: '客户余额消费',
        amount: 10_000,
        approvedAt: '2026-08-20',
        remark: '使用客户历史预收余额',
        status: '已审核',
      },
      {
        id: 'WO-2026-0092',
        orderId: 'SO-FTM-202607-011',
        type: '坏账或减免',
        amount: 2000,
        approvedAt: '2026-08-20',
        remark: '银行手续费差额与商务减免',
        status: '已审核',
      },
    ],
    audits: [
      {
        id: 'AUD-1001',
        time: '2026-08-27 09:42',
        actor: 'AI 需求助手',
        action: `预读取 ${mainOrderId} 的产品、库存与供应策略`,
        result: '等待业务员点击运行分析，不自动创建正式单据',
        type: 'AI建议',
      },
      {
        id: 'AUD-1002',
        time: '2026-08-27 09:18',
        actor: '林晓月',
        action: '同步 NOVA FITNESS GMBH 的 OKKI 基础资料',
        result: '中台经营字段未被覆盖',
        type: '人工确认',
      },
      {
        id: 'AUD-1003',
        time: '2026-08-27 08:56',
        actor: 'AI 业务助手',
        action: '尝试直接修改包装箱库存数量',
        result: '已拒绝：库存只能通过入库、出库或调整单改变',
        type: '规则拦截',
      },
    ],
    journey: {
      analysisStatus: '待分析',
      supplierAdopted: false,
      shipmentDraftCreated: false,
    },
  };
}
