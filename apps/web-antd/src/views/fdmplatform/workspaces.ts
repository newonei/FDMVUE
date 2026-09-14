import type { BusinessRecord, Contract, PageResource } from '#/api/fdmplatform';

export type WorkspaceKey =
  | 'admin-access'
  | 'admin-master'
  | 'finance-costs'
  | 'finance-invoices'
  | 'finance-receipts'
  | 'inventory-stock'
  | 'purchase-orders'
  | 'purchase-quotes'
  | 'purchase-routing'
  | 'purchase-tasks'
  | 'trade-contracts'
  | 'trade-requests';
export type DetailTab =
  | 'ai'
  | 'attachments'
  | 'audit'
  | 'cost'
  | 'customs'
  | 'delivery'
  | 'finance'
  | 'overview'
  | 'products'
  | 'progress'
  | 'purchase';
export interface RecordGroup {
  resource: Exclude<PageResource, 'contracts'>;
  title: string;
  tab: DetailTab;
  fields: string[];
  statuses: string[];
}
export interface WorkspaceDefinition {
  title: string;
  department: string;
  description: string;
  section: 'access' | 'contracts' | 'master' | 'records' | 'routing' | 'stock';
  defaultTab: DetailTab;
  groups?: RecordGroup[];
}

const requests: RecordGroup = {
  resource: 'purchase-requests',
  title: '采购申请',
  tab: 'overview',
  fields: [
    'name|申请名称',
    'status|申请状态',
    'assignmentStatus|分派状态',
    'ownerUserId|负责人',
    'items|申请明细',
    'remark|说明',
  ],
  statuses: ['UNASSIGNED', 'PARTIALLY_ASSIGNED', 'ASSIGNED'],
};
export const workspaces: Record<WorkspaceKey, WorkspaceDefinition> = {
  'trade-contracts': {
    title: '合同订单',
    department: '外贸部门',
    section: 'contracts',
    description: '登记合同与样品，确认产品规格，跟进采购申请、履约交付与回款。',
    defaultTab: 'overview',
  },
  'trade-requests': {
    title: '采购申请',
    department: '外贸部门',
    section: 'records',
    description:
      '跨合同查看分批申请及分派进度；在关联合同中填写产品明细、数量与需求日期。',
    defaultTab: 'overview',
    groups: [requests],
  },
  'purchase-tasks': {
    title: '采购待办与分派',
    department: '采购部门',
    section: 'records',
    description:
      '按负责人和状态处理履约任务；未分派申请保留原因，可人工分派或转派。',
    defaultTab: 'purchase',
    groups: [
      {
        resource: 'assignments',
        title: '履约任务',
        tab: 'purchase',
        fields: [
          'method|履约方式',
          'quantity|分派数量',
          'ownerUserId|经办人',
          'status|状态',
          'requestId|来源申请',
        ],
        statuses: [
          'ASSIGNED',
          'ACCEPTED',
          'IN_PROGRESS',
          'COMPLETED',
          'CANCELLED',
        ],
      },
      { ...requests, tab: 'purchase' },
    ],
  },
  'purchase-quotes': {
    title: '报价与方案审批',
    department: '采购部门',
    section: 'records',
    description:
      '保存真实询价证据与报价版本，比较采购方案，按版本和数量范围审批。',
    defaultTab: 'purchase',
    groups: [
      {
        resource: 'purchase-plans',
        title: '采购方案 / 审批',
        tab: 'purchase',
        fields: [
          'name|方案名称',
          'status|审批状态',
          'version|方案版本',
          'ownerUserId|编制人',
          'facts|采购事实',
          'risks|风险',
        ],
        statuses: [
          'DRAFT',
          'SUBMITTED',
          'APPROVED',
          'PARTIALLY_APPROVED',
          'RETURNED',
        ],
      },
      {
        resource: 'quotes',
        title: '供应商报价',
        tab: 'purchase',
        fields: [
          'supplierName|供应商',
          'unitPrice|报价单价',
          'currency|币种',
          'unit|单位',
          'version|版本',
          'validUntil|有效期',
          'promisedDate|承诺日期',
        ],
        statuses: [],
      },
    ],
  },
  'purchase-orders': {
    title: '采购订单与执行',
    department: '采购部门',
    section: 'records',
    description:
      '按有效批准版本下单，登记分批到货、异常和退货，跟进自产任务进度。',
    defaultTab: 'delivery',
    groups: [
      {
        resource: 'purchase-orders',
        title: '采购订单',
        tab: 'delivery',
        fields: [
          'supplierName|供应商',
          'status|执行状态',
          'approvedPlanVersion|批准版本',
          'amount|采购金额',
          'currency|币种',
          'lines|执行明细',
        ],
        statuses: ['ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'],
      },
    ],
  },
  'finance-receipts': {
    title: '回款确认',
    department: '财务部门',
    section: 'records',
    description:
      '跨合同核实待确认到账，保留统一回款、退款和冲销依据，避免绑定重复计入已回款。',
    defaultTab: 'finance',
    groups: [
      {
        resource: 'receipts',
        title: '统一回款',
        tab: 'finance',
        fields: [
          'receivedAt|到账日期',
          'amount|原币金额',
          'currency|币种',
          'exchangeRateToCny|人民币参考汇率',
          'exchangeRateDate|实际汇率日期',
          'rmbAmount|折算人民币',
          'exchangeRateSource|汇率来源',
          'exchangeRateFallback|日期匹配',
          'status|确认状态',
          'kind|类型',
          'evidenceRef|凭证',
        ],
        statuses: ['PENDING', 'CONFIRMED'],
      },
    ],
  },
  'finance-invoices': {
    title: '发票与金额绑定',
    department: '财务部门',
    section: 'records',
    description:
      '登记税务、商业和形式发票，按实际金额建立回款与发票的部分绑定及反向更正。',
    defaultTab: 'finance',
    groups: [
      {
        resource: 'invoices',
        title: '发票台账',
        tab: 'finance',
        fields: [
          'invoiceNumber|发票号',
          'type|类型',
          'issuedAt|开票日期',
          'amount|金额',
          'currency|币种',
          'status|有效状态',
        ],
        statuses: ['VALID', 'VOID'],
      },
    ],
  },
  'finance-costs': {
    title: '成本与订单贡献',
    department: '财务部门',
    section: 'records',
    description:
      '归集预计、已承诺及实际成本，核对订单贡献口径与缺项，不把缺失成本当作零。',
    defaultTab: 'cost',
    groups: [
      {
        resource: 'costs',
        title: '成本台账',
        tab: 'cost',
        fields: [
          'category|成本要素',
          'stage|归集阶段',
          'amount|原币金额',
          'currency|币种',
          'contractCurrencyAmount|合同币种金额',
          'policyVersion|口径版本',
        ],
        statuses: ['ESTIMATED', 'COMMITTED', 'COLLECTED'],
      },
    ],
  },
  'purchase-routing': {
    title: '采购分派规则',
    department: '采购部门',
    section: 'routing',
    description:
      '按真实经办人和 SKU 配置共用的自动分派规则，在岗与明确责任决定任务流转。',
    defaultTab: 'purchase',
  },
  'inventory-stock': {
    title: '库存与合同收发',
    department: '工厂部门',
    section: 'stock',
    description:
      '按货权、仓库、SKU 和规格管理库存池，在批准的合同范围内预留、收货和发货。',
    defaultTab: 'delivery',
  },
  'admin-master': {
    title: '业务主数据与迁移',
    department: '基础资料',
    section: 'master',
    description:
      '维护供应商、仓库与货权映射，预检 CSV 后确认导入；客户及产品从专用中心维护。',
    defaultTab: 'overview',
  },
  'admin-access': {
    title: '业务协同说明',
    department: '系统管理',
    section: 'access',
    description: '启用登录用户可协同处理全部业务，订单所属公司仅作为合同属性。',
    defaultTab: 'overview',
  },
};

export const contractDetailTabs: DetailTab[] = [
  'overview',
  'products',
  'progress',
  'audit',
  'attachments',
];

export function workspaceAllowsAction(
  _workspace: WorkspaceKey,
  contract: Contract | undefined,
  action: string,
) {
  return Boolean(contract?.allowedActions?.includes(action));
}

export function detailTabFor(
  workspace: WorkspaceKey,
  requested: unknown,
): DetailTab {
  return contractDetailTabs.includes(requested as DetailTab)
    ? (requested as DetailTab)
    : workspace === 'trade-contracts'
      ? 'overview'
      : 'progress';
}

export function contextualValues(
  resource: PageResource | undefined,
  record: BusinessRecord | undefined,
): Record<string, unknown> {
  if (!record) return {};
  const mapping: Partial<Record<PageResource, string>> = {
    'purchase-requests': 'requestId',
    assignments: 'assignmentId',
    quotes: 'previousQuoteId',
    'purchase-plans': 'planId',
    'purchase-orders': 'orderId',
    receipts: 'receiptId',
    invoices: 'invoiceId',
    costs: 'costId',
    contracts: 'id',
  };
  const key = mapping[resource ?? 'contracts'] ?? 'id';
  return {
    [key]: record.id,
    ...(resource === 'purchase-plans' ? { planVersion: record.version } : {}),
  };
}
