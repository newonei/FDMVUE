export type FdmWaimaoAiSurfaceKey =
  | 'bank-receipt'
  | 'contract-order'
  | 'customer'
  | 'demand-plan'
  | 'exchange-rate'
  | 'order-expense'
  | 'procurement-requisition'
  | 'procurement-sourcing'
  | 'procurement-supplier'
  | 'procurement-supplier-product'
  | 'procurement-supplier-quote'
  | 'receipt-allocation'
  | 'receipt-record'
  | 'shipment';

export type FdmWaimaoAiContextMode = 'detail' | 'form' | 'list';
export type FdmWaimaoAiVariant = 'consumption' | 'receipt';
export type FdmWaimaoAiSurfaceAvailability =
  | 'enabled'
  | 'serverContextUnavailable';

export interface FdmWaimaoAiQuestion {
  id: string;
  label: string;
  prompt: string;
}

export interface FdmWaimaoAiSurface {
  availability: FdmWaimaoAiSurfaceAvailability;
  description: string;
  disabledReason?: string;
  key: FdmWaimaoAiSurfaceKey;
  listDescription?: string;
  listQuestions?: FdmWaimaoAiQuestion[];
  questions: FdmWaimaoAiQuestion[];
  readOnlyNotice: string;
  title: string;
}

export interface ResolvedFdmWaimaoAiSurface {
  businessId?: string;
  contextMode: FdmWaimaoAiContextMode;
  pageKey: string;
  pageTitle: string;
  queryPermission: string;
  sessionSurfaceKey: string;
  surface: FdmWaimaoAiSurface;
  variant?: FdmWaimaoAiVariant;
}

interface SurfaceRoutePattern {
  contextMode: FdmWaimaoAiContextMode;
  pageTitle: string;
  pattern: RegExp;
  surfaceKey: FdmWaimaoAiSurfaceKey;
  variant?: FdmWaimaoAiVariant;
}

function question(
  id: string,
  label: string,
  prompt = label,
): FdmWaimaoAiQuestion {
  return { id, label, prompt };
}

const PAGE_QUERY_PERMISSIONS: Readonly<Record<string, string>> = {
  'bank-receipt': 'fdmwaimao:bank-receipt:query',
  'consumption-record': 'fdmwaimao:consumption-record:query',
  'contract-order': 'fdmwaimao:contract-order:query',
  customer: 'fdmwaimao:customer:query',
  'demand-plan': 'fdmwaimao:demand-plan:query',
  'exchange-rate': 'fdmwaimao:exchange-rate:query',
  'order-expense': 'fdmwaimao:order-expense:query',
  'procurement-requisition': 'fdmprocurement:requisition:query',
  'procurement-sourcing': 'fdmprocurement:sourcing:query',
  'procurement-supplier': 'fdmprocurement:supplier:query',
  'procurement-supplier-product': 'fdmprocurement:supplier-product:query',
  'procurement-supplier-quote': 'fdmprocurement:supplier-quote:view-sensitive',
  'receipt-record': 'fdmwaimao:receipt-record:query',
  'receipt-allocation': 'fdmwaimao:receipt-allocation:query',
  shipment: 'fdmwaimao:shipment:query',
};

export const FDM_WAIMAO_AI_SURFACES: Record<
  FdmWaimaoAiSurfaceKey,
  FdmWaimaoAiSurface
> = {
  'bank-receipt': {
    availability: 'enabled',
    description:
      '基于服务端按公司和数据范围聚合的银行到账状态，解释未分配、部分分配、已分配及作废口径。',
    key: 'bank-receipt',
    listDescription:
      '列表页只读取服务端聚合计数和固定结算规则；不会把浏览器表格行、外部流水标识、付款人或付款账号发送给模型。',
    listQuestions: [
      question('bank-summary', '当前公司可见银行到账的状态分布如何？'),
      question('bank-unallocated', '未分配与部分分配分别意味着什么？'),
      question('bank-settlement', '银行到账何时才会影响合同回款？'),
      question('bank-boundary', '银行到账页面 AI 的数据和操作边界是什么？'),
    ],
    questions: [
      question('bank-summary', '当前公司可见银行到账的状态分布如何？'),
      question('bank-unallocated', '未分配与部分分配分别意味着什么？'),
      question('bank-settlement', '银行到账何时才会影响合同回款？'),
      question('bank-boundary', '银行到账页面 AI 的数据和操作边界是什么？'),
    ],
    readOnlyNotice:
      '不会读取外部流水标识或付款账户，不会登记、修改、作废到账，也不会创建或应用分配。',
    title: '银行到账助手',
  },
  customer: {
    availability: 'enabled',
    description:
      '结合当前数据范围内的客户资料、联系人和 OKKI 同步状态提供只读分析。',
    key: 'customer',
    listDescription:
      '列表页只提供字段、状态与操作边界说明；打开具体客户后，服务端才会读取该对象进行风险分析。',
    listQuestions: [
      question('customer-list-fields', '客户资料完整性通常需要核对什么？'),
      question('customer-list-sync', '解释 OKKI 同步状态与失败状态'),
      question('customer-list-detail', '如何对具体客户做对象级分析？'),
      question('customer-list-boundary', '交易客户 AI 的只读边界是什么？'),
    ],
    questions: [
      question('customer-sync-failed', '哪些客户同步失败？'),
      question('customer-incomplete', '哪些客户资料或联系人不完整？'),
      question('customer-focus', '分析当前客户的资料与同步风险'),
      question('customer-follow-up', '当前列表最需要先跟进什么？'),
    ],
    readOnlyNotice: '不会刷新 OKKI、修改客户等级、编辑资料或转移负责人。',
    title: '交易客户助手',
  },
  'contract-order': {
    availability: 'enabled',
    description: '基于合同、产品明细及真实回款结算字段解释金额、状态和风险。',
    key: 'contract-order',
    listDescription:
      '列表页只解释合同字段与状态规则；打开具体合同后，服务端才会读取产品明细和结算事实。',
    listQuestions: [
      question('order-list-amounts', '解释合同金额与回款字段的含义'),
      question('order-list-status', '解释合同订单状态与风险口径'),
      question('order-list-detail', '如何对具体合同做对象级分析？'),
      question('order-list-boundary', '合同订单 AI 不会执行哪些操作？'),
    ],
    questions: [
      question('order-outstanding', '哪些合同未回款最高？'),
      question('order-formula', '解释当前合同的金额与结算公式'),
      question('order-item-risk', '哪些产品明细需要补充？'),
      question('order-focus', '分析当前合同订单的风险'),
    ],
    readOnlyNotice: '不会新建、编辑或删除合同，也不会创建回款记录。',
    title: '合同订单助手',
  },
  'demand-plan': {
    availability: 'enabled',
    description:
      '基于已保存的需求计划、三类供给分配和规则状态解释履约缺口与待核实项。',
    key: 'demand-plan',
    listDescription:
      '列表页只解释需求计划规则和状态；打开已保存计划后，服务端才会读取分配行与守恒证据。',
    listQuestions: [
      question('demand-list-status', '解释需求计划状态与下一步'),
      question('demand-list-allocation', '三类供给分配的规则是什么？'),
      question('demand-list-detail', '如何核对具体计划的数量守恒？'),
      question('demand-list-boundary', '需求计划 AI 的只读边界是什么？'),
    ],
    questions: [
      question('demand-unknown', '哪些分配数量仍是 UNKNOWN？'),
      question('demand-unbalanced', '哪些产品行的分配数量不守恒？'),
      question('demand-unmapped', '哪些产品行尚未完成产品映射？'),
      question('demand-focus', '分析当前需求计划的履约风险'),
    ],
    readOnlyNotice:
      '不会重新生成建议、修改分配数量、保存草稿、确认计划或创建下游任务。',
    title: '需求计划助手',
  },
  'receipt-record': {
    availability: 'enabled',
    description:
      '区分现金回款与消费冲销，并解释合同币金额、人民币金额和汇率快照。',
    key: 'receipt-record',
    listDescription:
      '列表页只解释回款、消费、汇率与冲销口径；打开具体记录后，服务端才会读取该对象的冻结事实。',
    listQuestions: [
      question('receipt-list-difference', '回款记录和消费记录有什么区别？'),
      question('receipt-list-fx', '解释汇率日、回退日与人民币金额'),
      question('receipt-list-detail', '如何分析一条具体回款或消费记录？'),
      question('receipt-list-boundary', '结算记录 AI 不会执行哪些操作？'),
    ],
    questions: [
      question('receipt-fallback', '哪些记录使用了回退汇率日？'),
      question('receipt-allocation', '解释当前记录如何冲销合同金额'),
      question('receipt-risk', '当前列表有哪些异常或风险？'),
      question('receipt-focus', '分析当前回款或消费记录'),
    ],
    readOnlyNotice: '不会新增、编辑、作废记录，也不会改变合同结算金额。',
    title: '回款记录助手',
  },
  'receipt-allocation': {
    availability: 'enabled',
    description:
      '基于服务端按公司和数据范围聚合的到账分配状态，解释草稿、已应用、已取消与已冲回口径。',
    key: 'receipt-allocation',
    listDescription:
      '列表页只读取服务端聚合计数和固定结算规则；不会把浏览器分配行、客户资料、合同明细或生成快照发送给模型。',
    listQuestions: [
      question('allocation-summary', '当前公司可见到账分配的状态分布如何？'),
      question('allocation-effect', '草稿和已应用分配对合同回款有何不同？'),
      question('allocation-void', '取消与冲回的结算影响分别是什么？'),
      question(
        'allocation-boundary',
        '到账分配页面 AI 的数据和操作边界是什么？',
      ),
    ],
    questions: [
      question('allocation-summary', '当前公司可见到账分配的状态分布如何？'),
      question('allocation-effect', '草稿和已应用分配对合同回款有何不同？'),
      question('allocation-void', '取消与冲回的结算影响分别是什么？'),
      question(
        'allocation-boundary',
        '到账分配页面 AI 的数据和操作边界是什么？',
      ),
    ],
    readOnlyNotice:
      '不会读取分配行或客户 PII，不会生成、应用、取消或冲回到账分配。',
    title: '到账分配助手',
  },
  'exchange-rate': {
    availability: 'enabled',
    description: '解释指定日期汇率、实际汇率日、日期回退、来源和数据新鲜度。',
    key: 'exchange-rate',
    listDescription:
      '当前只解释汇率字段、日期回退与来源规则，不声称读取浏览器表格中的币种行。',
    listQuestions: [
      question('rate-list-date', '解释请求日期与实际汇率日期'),
      question('rate-list-fallback', '什么情况下会使用回退汇率日？'),
      question('rate-list-source', '如何判断汇率来源和新鲜度？'),
      question('rate-list-boundary', '汇率中心 AI 的只读边界是什么？'),
    ],
    questions: [
      question('rate-fallback', '哪些币种使用了回退汇率？'),
      question('rate-missing', '当前日期是否缺少常用币种？'),
      question('rate-source', '汇率来源和更新时间是否正常？'),
      question('rate-explain', '解释请求日期与实际汇率日期的差异'),
    ],
    readOnlyNotice: '不会同步汇率或修改已经保存的历史汇率快照。',
    title: '汇率中心助手',
  },
  'order-expense': {
    availability: 'enabled',
    description:
      '基于服务端订单费用、前置证据、人工金额与冻结汇率解释费用状态和审核风险。',
    key: 'order-expense',
    listDescription:
      '列表页只解释费用字段、状态和审核口径；打开具体费用单后，服务端才会读取冻结证据。',
    listQuestions: [
      question('expense-list-status', '解释订单费用状态与审核流程'),
      question('expense-list-fx', '解释费用汇率与人民币金额口径'),
      question('expense-list-detail', '如何分析一张具体费用单？'),
      question('expense-list-boundary', '订单费用 AI 不会执行哪些操作？'),
    ],
    questions: [
      question('expense-missing', '哪些费用单仍缺少人工金额？'),
      question('expense-fx', '哪些费用使用了回退汇率？'),
      question('expense-approval', '当前费用单提交前还缺什么？'),
      question('expense-focus', '分析当前订单费用的证据与状态风险'),
    ],
    readOnlyNotice:
      '不会生成费用分类、补录金额、提交审批、审核、驳回、取消或作废费用单。',
    title: '订单费用助手',
  },
  'procurement-requisition': {
    availability: 'serverContextUnavailable',
    description: '基于当前采购申请的状态、版本与预检摘要提供只读解释。',
    disabledReason: '采购申请尚未接入服务端 typed AI context provider。',
    key: 'procurement-requisition',
    questions: [
      question('requisition-status', '解释当前采购申请状态'),
      question('requisition-validation', '当前预检有哪些阻断或警告？'),
      question('requisition-source', '解释采购申请与来源计划的关系'),
      question('requisition-next', '下一步需要人工核对什么？'),
    ],
    readOnlyNotice: '不会生成、编辑、预检、提交或撤回采购申请。',
    title: '采购申请助手',
  },
  'procurement-sourcing': {
    availability: 'serverContextUnavailable',
    description: '基于当前寻源评估的状态与统计摘要提供只读解释。',
    disabledReason: '供应寻源尚未接入服务端 typed AI context provider。',
    key: 'procurement-sourcing',
    questions: [
      question('sourcing-status', '解释当前寻源状态'),
      question('sourcing-candidates', '候选资格统计说明了什么？'),
      question('sourcing-cost', '当前成本是否具备可比条件？'),
      question('sourcing-next', '下一步需要人工核对什么？'),
    ],
    readOnlyNotice: '不会生成、重试、选择、分配或物化供应方案。',
    title: '供应寻源助手',
  },
  'procurement-supplier': {
    availability: 'serverContextUnavailable',
    description: '基于当前供应商列表的状态与准入统计提供只读解释。',
    disabledReason: '供应商资料尚未接入服务端 typed AI context provider。',
    key: 'procurement-supplier',
    questions: [
      question('supplier-status', '解释当前供应商状态分布'),
      question('supplier-approval', '有哪些准入或审批待处理？'),
      question('supplier-disabled', '停用供应商数量是否异常？'),
      question('supplier-next', '下一步需要核对什么？'),
    ],
    readOnlyNotice: '不会新增、编辑、停用供应商或改变公司准入。',
    title: '供应商资料助手',
  },
  'procurement-supplier-product': {
    availability: 'serverContextUnavailable',
    description: '基于当前产品供应商映射的审批与覆盖统计提供只读解释。',
    disabledReason: '产品供应商映射尚未接入服务端 typed AI context provider。',
    key: 'procurement-supplier-product',
    questions: [
      question('mapping-approval', '映射审批状态如何分布？'),
      question('mapping-coverage', '当前映射覆盖了多少供应商？'),
      question('mapping-risk', '有哪些映射风险需要核对？'),
      question('mapping-next', '下一步需要补充什么？'),
    ],
    readOnlyNotice: '不会新增映射、选择产品或改变产品版本绑定。',
    title: '产品供应商映射助手',
  },
  'procurement-supplier-quote': {
    availability: 'serverContextUnavailable',
    description: '仅基于当前已授权报价列表的版本与币种统计提供只读解释。',
    disabledReason: '供应商报价尚未接入服务端 typed AI context provider。',
    key: 'procurement-supplier-quote',
    questions: [
      question('quote-active', '当前有多少有效报价版本？'),
      question('quote-currency', '报价币种分布如何？'),
      question('quote-tiers', '阶梯数量是否需要核对？'),
      question('quote-next', '下一步需要人工核对什么？'),
    ],
    readOnlyNotice:
      '不会新增报价版本，也不会回传具体阶梯价格、税费或付款条款。',
    title: '供应商报价助手',
  },
  shipment: {
    availability: 'enabled',
    description:
      '基于真实发货草稿、已确认履约计划和服务端冻结的 WMS READY 证据解释发货准备度。',
    key: 'shipment',
    listDescription:
      '列表页只解释发货状态与操作边界；打开具体发货单后，服务端才会读取准备度和 WMS 冻结证据。',
    listQuestions: [
      question('shipment-list-status', '解释发货单状态与下一步'),
      question('shipment-list-readiness', '发货准备度需要哪些服务端证据？'),
      question('shipment-list-detail', '如何分析一张具体发货单？'),
      question('shipment-list-boundary', '页面助手和生成助手有什么区别？'),
    ],
    questions: [
      question('shipment-readiness', '当前发货草稿还缺哪些准备条件？'),
      question('shipment-evidence', '解释当前产品行的仓库与库存证据'),
      question('shipment-expiry', '哪些库存证据即将过期？'),
      question('shipment-next', '下一步需要人工核对什么？'),
    ],
    readOnlyNotice:
      '页面助手不会生成或物化发货行，也不会预留、扣减库存、确认发货或创建 WMS 出库单。',
    title: '发货计划助手',
  },
};

const ROUTE_PATTERNS: SurfaceRoutePattern[] = [
  {
    contextMode: 'list',
    pageTitle: '供应商资料',
    pattern: /^\/fdmprocurement\/supplier\/?$/,
    surfaceKey: 'procurement-supplier',
  },
  {
    contextMode: 'list',
    pageTitle: '产品供应商映射',
    pattern: /^\/fdmprocurement\/supplier-product\/?$/,
    surfaceKey: 'procurement-supplier-product',
  },
  {
    contextMode: 'list',
    pageTitle: '供应商报价',
    pattern: /^\/fdmprocurement\/supplier-quote\/?$/,
    surfaceKey: 'procurement-supplier-quote',
  },
  {
    contextMode: 'form',
    pageTitle: 'AI 生成采购申请',
    pattern: /^\/fdmprocurement\/requisition\/generate\/?$/,
    surfaceKey: 'procurement-requisition',
  },
  {
    contextMode: 'form',
    pageTitle: '审阅采购申请',
    pattern: /^\/fdmprocurement\/requisition\/edit\/([^/]+)\/?$/,
    surfaceKey: 'procurement-requisition',
  },
  {
    contextMode: 'detail',
    pageTitle: '采购申请详情',
    pattern: /^\/fdmprocurement\/requisition\/detail\/([^/]+)\/?$/,
    surfaceKey: 'procurement-requisition',
  },
  {
    contextMode: 'list',
    pageTitle: '采购申请',
    pattern: /^\/fdmprocurement\/requisition\/?$/,
    surfaceKey: 'procurement-requisition',
  },
  {
    contextMode: 'form',
    pageTitle: 'AI 供应商寻源',
    pattern: /^\/fdmprocurement\/sourcing\/generate\/?$/,
    surfaceKey: 'procurement-sourcing',
  },
  {
    contextMode: 'detail',
    pageTitle: '供应寻源工作台',
    pattern: /^\/fdmprocurement\/sourcing\/([^/]+)\/?$/,
    surfaceKey: 'procurement-sourcing',
  },
  {
    contextMode: 'detail',
    pageTitle: '交易客户详情',
    pattern: /^\/fdmwaimao\/customer\/detail\/([^/]+)\/?$/,
    surfaceKey: 'customer',
  },
  {
    contextMode: 'list',
    pageTitle: '交易客户',
    pattern: /^\/fdmwaimao\/customer\/?$/,
    surfaceKey: 'customer',
  },
  {
    contextMode: 'form',
    pageTitle: '编辑合同订单',
    pattern: /^\/fdmwaimao\/contract-order\/edit\/([^/]+)\/?$/,
    surfaceKey: 'contract-order',
  },
  {
    contextMode: 'detail',
    pageTitle: '合同订单详情',
    pattern: /^\/fdmwaimao\/contract-order\/detail\/([^/]+)\/?$/,
    surfaceKey: 'contract-order',
  },
  {
    contextMode: 'form',
    pageTitle: '新建合同订单',
    pattern: /^\/fdmwaimao\/contract-order\/create\/?$/,
    surfaceKey: 'contract-order',
  },
  {
    contextMode: 'list',
    pageTitle: '合同订单',
    pattern: /^\/fdmwaimao\/contract-order\/?$/,
    surfaceKey: 'contract-order',
  },
  {
    contextMode: 'form',
    pageTitle: '编辑需求计划',
    pattern: /^\/fdmwaimao\/demand-analysis\/edit\/([^/]+)\/?$/,
    surfaceKey: 'demand-plan',
  },
  {
    contextMode: 'form',
    pageTitle: '新建需求计划',
    pattern: /^\/fdmwaimao\/demand-analysis\/create\/?$/,
    surfaceKey: 'demand-plan',
  },
  {
    contextMode: 'detail',
    pageTitle: '需求计划详情',
    pattern: /^\/fdmwaimao\/demand-analysis\/detail\/([^/]+)\/?$/,
    surfaceKey: 'demand-plan',
  },
  {
    contextMode: 'list',
    pageTitle: '需求计划',
    pattern: /^\/fdmwaimao\/demand-analysis\/?$/,
    surfaceKey: 'demand-plan',
  },
  {
    contextMode: 'form',
    pageTitle: '编辑消费记录',
    pattern: /^\/fdmwaimao\/receipt-record\/consumption\/edit\/([^/]+)\/?$/,
    surfaceKey: 'receipt-record',
    variant: 'consumption',
  },
  {
    contextMode: 'detail',
    pageTitle: '消费记录详情',
    pattern: /^\/fdmwaimao\/receipt-record\/consumption\/detail\/([^/]+)\/?$/,
    surfaceKey: 'receipt-record',
    variant: 'consumption',
  },
  {
    contextMode: 'form',
    pageTitle: '新建消费记录',
    pattern: /^\/fdmwaimao\/receipt-record\/consumption\/create\/?$/,
    surfaceKey: 'receipt-record',
    variant: 'consumption',
  },
  {
    contextMode: 'form',
    pageTitle: '编辑回款记录',
    pattern: /^\/fdmwaimao\/receipt-record\/edit\/([^/]+)\/?$/,
    surfaceKey: 'receipt-record',
    variant: 'receipt',
  },
  {
    contextMode: 'detail',
    pageTitle: '回款记录详情',
    pattern: /^\/fdmwaimao\/receipt-record\/detail\/([^/]+)\/?$/,
    surfaceKey: 'receipt-record',
    variant: 'receipt',
  },
  {
    contextMode: 'form',
    pageTitle: '新建回款记录',
    pattern: /^\/fdmwaimao\/receipt-record\/create\/?$/,
    surfaceKey: 'receipt-record',
    variant: 'receipt',
  },
  {
    contextMode: 'list',
    pageTitle: '回款记录',
    pattern: /^\/fdmwaimao\/receipt-record\/?$/,
    surfaceKey: 'receipt-record',
  },
  {
    contextMode: 'list',
    pageTitle: '汇率中心',
    pattern: /^\/fdmwaimao\/exchange-rate\/?$/,
    surfaceKey: 'exchange-rate',
  },
  {
    contextMode: 'list',
    pageTitle: '订单费用',
    pattern: /^\/fdmwaimao\/order-expense\/?$/,
    surfaceKey: 'order-expense',
  },
  {
    contextMode: 'detail',
    pageTitle: '发货计划详情',
    pattern: /^\/fdmwaimao\/shipment\/detail\/([^/]+)\/?$/,
    surfaceKey: 'shipment',
  },
  {
    contextMode: 'list',
    pageTitle: '发货计划',
    pattern: /^\/fdmwaimao\/shipment\/?$/,
    surfaceKey: 'shipment',
  },
];

function queryValue(value: unknown): string | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === 'string' ? candidate : undefined;
}

function receiptListVariant(
  query: Record<string, unknown>,
): 'consumption' | 'receipt' {
  const workspace = queryValue(query.workspace);
  if (workspace === 'consumption') return 'consumption';
  if (
    workspace === 'receipt' ||
    workspace === 'bank' ||
    workspace === 'allocation'
  ) {
    return 'receipt';
  }
  return queryValue(query.type) === 'consumption' ? 'consumption' : 'receipt';
}

export function resolveFdmWaimaoAiSurface(
  path: string,
  query: Record<string, unknown> = {},
): ResolvedFdmWaimaoAiSurface | undefined {
  for (const route of ROUTE_PATTERNS) {
    const match = route.pattern.exec(path);
    if (!match) continue;

    const listVariant =
      route.surfaceKey === 'receipt-record' && route.contextMode === 'list'
        ? receiptListVariant(query)
        : undefined;
    const surface = FDM_WAIMAO_AI_SURFACES[route.surfaceKey];
    const variant = route.variant ?? listVariant;
    const pageKey =
      variant === 'consumption' ? 'consumption-record' : surface.key;
    const queryPermission = PAGE_QUERY_PERMISSIONS[pageKey];
    if (!queryPermission) return undefined;
    return {
      businessId: match[1] ? decodeURIComponent(match[1]) : undefined,
      contextMode: route.contextMode,
      pageKey,
      pageTitle:
        route.contextMode === 'list' && variant === 'consumption'
          ? '消费记录'
          : route.pageTitle,
      queryPermission,
      sessionSurfaceKey: variant ? `${surface.key}:${variant}` : surface.key,
      surface,
      variant,
    };
  }
  return undefined;
}

export function isFdmWaimaoAiPath(path: string): boolean {
  return path === '/fdmwaimao' || path.startsWith('/fdmwaimao/');
}

export function isFdmProcurementAiPath(path: string): boolean {
  return (
    path === '/fdmprocurement/supplier' ||
    path === '/fdmprocurement/supplier-product' ||
    path === '/fdmprocurement/supplier-quote' ||
    path === '/fdmprocurement/requisition' ||
    path.startsWith('/fdmprocurement/requisition/') ||
    path === '/fdmprocurement/sourcing' ||
    path.startsWith('/fdmprocurement/sourcing/')
  );
}

export function procurementAiQueryPermission(path: string) {
  return isFdmProcurementAiPath(path)
    ? resolveFdmWaimaoAiSurface(path)?.queryPermission
    : undefined;
}

export function resolvedFdmWaimaoAiQuestions(
  resolved: Pick<ResolvedFdmWaimaoAiSurface, 'contextMode'> & {
    surface: Pick<FdmWaimaoAiSurface, 'listQuestions' | 'questions'>;
  },
): FdmWaimaoAiQuestion[] {
  return resolved.contextMode === 'list' && resolved.surface.listQuestions
    ? resolved.surface.listQuestions
    : resolved.surface.questions;
}

export function resolvedFdmWaimaoAiDescription(
  resolved: Pick<ResolvedFdmWaimaoAiSurface, 'contextMode'> & {
    surface: Pick<FdmWaimaoAiSurface, 'description' | 'listDescription'>;
  },
): string {
  return resolved.contextMode === 'list' && resolved.surface.listDescription
    ? resolved.surface.listDescription
    : resolved.surface.description;
}
