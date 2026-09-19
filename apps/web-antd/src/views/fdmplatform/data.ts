import type { BusinessRecord, Contract, MasterRecord } from '#/api/fdmplatform';
import type { MasterType } from '#/api/fdmplatform/masters';

import { hasReceiptFx } from './finance/exchange-rates/model';
import { requestLineDefaults } from './products/feedback-model';

export interface Option {
  label: string;
  value: number | string;
  fill?: Record<string, boolean | number | string>;
  when?: Record<string, unknown>;
}
export interface Field {
  stockSource?: { skuKey: string; specKey: string; warehouseKey: string };
  masterType?: MasterType;
  key: string;
  label: string;
  disabled?: boolean;
  hidden?: boolean;
  visibleWhen?: { key: string; value: string };
  excludeValueOf?: string;
  type?:
    | 'boolean'
    | 'date'
    | 'decimal'
    | 'multiselect'
    | 'number'
    | 'reference'
    | 'references'
    | 'select'
    | 'textarea';
  options?: Option[];
  required?: boolean;
  hint?: string;
  default?: boolean | number | string;
  min?: number;
}
export interface ActionDefinition {
  action: string;
  title: string;
  description: string;
  fields: Field[];
  lineFields?: Field[];
  lineKey?: string;
  optionalLines?: boolean;
  submitLabel?: string;
  initialValues?: Record<string, unknown>;
}

export const masterTypes: Option[] = [
  ['CUSTOMER', '客户'],
  ['SKU', '产品 / SKU'],
  ['SUPPLIER', '供应商'],
  ['WAREHOUSE', '仓库'],
  ['STOCK_OWNER', '货权主体'],
].map(([value, label]) => ({ value: value!, label: label! }));
export const statusLabels: Record<string, string> = {
  BANK_TRANSFER: '银行转账',
  ALIBABA: '阿里信保',
  PAYPAL: 'PayPal',
  ALIPAY: '支付宝',
  WECHAT: '微信',
  CASH: '现金',
  OTHER: '其他',
  NEEDS_COMPLETION: '待补齐资料',
  READY: '可办理',
  LINKED: '已关联办理',
  ACTIVE: '有效',
  ALLOCATED: '已分配',
  APPROVED: '已生效',
  ARCHIVED: '已归档',
  ASSIGNED: '已分派',
  AVAILABLE: '可用',
  BUY: '外采',
  CANCELLED: '已取消',
  CANCELED: '已取消',
  CLOSED: '已关闭',
  COLLECTED: '已归集',
  COMMITTED: '已承诺',
  COMPLETED: '已完成',
  CONFIRMED: '已确认',
  CREATED: '已创建',
  DOMESTIC: '国内 B2B',
  DRAFT: '草稿',
  ESTIMATED: '预计',
  EXECUTING: '执行中',
  FOREIGN: '外贸 B2B',
  GOVERNMENT: '政府客户',
  IN_PROGRESS: '进行中',
  MAKE: '自产',
  PAID: '已收足',
  PARTIAL: '部分完成',
  PARTIALLY_APPROVED: '部分生效',
  PENDING: '待确认',
  PENDING_APPROVAL: '待生效',
  RECEIVED: '已到货',
  REJECTED: '已退回',
  RELEASED: '已释放',
  RESERVED: '已预留',
  REVERSED: '已冲销',
  SAMPLE: '样品',
  SHIPPED: '已发货',
  STALE: '已失效',
  STOCK: '库存',
  SUBMITTED: '待生效',
  UNASSIGNED: '待分派',
  VALID: '有效',
  VERIFIED: '已核定',
  VOID: '已作废',
  VOIDED: '已作废',
  WAITING: '待处理',
  NOT_COMPLETED: '预审未完成',
  PAYMENT: '回款',
  REFUND: '退款',
  REVERSAL: '冲销',
  TAX: '税务发票',
  COMMERCIAL: '商业发票',
  PROFORMA: '形式发票',
  CREDIT_NOTE: '红字 / 贷项',
  PURCHASE: '采购',
  PRODUCTION: '生产',
  PACKAGING: '包装',
  TRANSPORT: '运输',
  LABOR: '人工',
  CUSTOMIZATION: '定制',
  RETURN_LOSS: '退货损耗',
  PLATFORM: '本平台主账',
  EXTERNAL: '外部主账',
  RECEIVE: '入库',
  RESERVE: '预留',
  RELEASE: '释放',
  SHIP: '发货',
  RETURN: '退货',
  REVERSE: '冲销',
  AVAILABILITY: '可用量设置',
  OUTBOUND: '出库发货',
  PARTIALLY_ASSIGNED: '部分分派',
  RETURNED: '已退回',
  NO_MATCHING_RULE: '无匹配规则',
  OWNER_UNAVAILABLE: '责任人缺席',
  AMBIGUOUS_OWNER: '多人匹配待分派',
  UNAVAILABLE: '预审未完成',
  INVALID: '结果未通过校验',
  TIMEOUT: '预审超时',
  ORDERED: '已下单',
  PARTIALLY_RECEIVED: '部分到货',
  ACCEPTED: '已接单',
  ALL: '全部记录',
  DEPARTMENT: '指定部门',
  OWN: '本人负责',
  VALIDATED: '预检通过，待确认',
  IMPORTED: '已导入',
  APPLIED: '已应用',
  CUSTOMER: '客户',
  SKU: '产品 / SKU',
  SUPPLIER: '供应商',
  WAREHOUSE: '仓库',
  STOCK_OWNER: '货权主体',
  CONTRACT_CREATE: '创建合同',
  CONFIRM_CONTRACT: '合同生效',
  UPDATE_CONTRACT: '修订合同',
  CREATE_REQUEST: '创建采购申请',
  ASSIGN_FULFILLMENT: '分派履约任务',
  TRANSFER_ASSIGNMENT: '转派任务',
  CREATE_QUOTE: '登记报价',
  SAVE_PLAN: '保存采购方案',
  SUBMIT_PLAN: '方案生效',
  GENERATE_ORDERS: '生成采购执行单',
  RECORD_ARRIVAL: '确认到货入库',
  RETURN_ARRIVAL: '采购到货退货',
  CANCEL_ORDER: '取消采购余额',
  UPDATE_PRODUCTION: '更新自产进度',
  CREATE_RECEIPT: '登记回款',
  CONFIRM_RECEIPT: '财务确认到账',
  REVERSE_RECEIPT: '退款 / 回款冲销',
  REFRESH_RECEIPT_FX: '补齐回款汇率',
  CREATE_INVOICE: '登记发票',
  VOID_INVOICE: '作废发票',
  BIND_ALLOCATION: '回款发票金额绑定',
  UNBIND_ALLOCATION: '解除金额绑定',
  CREATE_COST: '登记成本',
  REVERSE_COST: '冲销成本',
  SET_PROFIT_POLICY: '确认财务口径',
  STOCK_RECEIVE: '自产入库',
  STOCK_RESERVE: '预留库存',
  STOCK_RELEASE: '释放预留',
  STOCK_SHIP: '确认发货',
  STOCK_RETURN: '客户退货入库',
};
export function label(value: unknown) {
  if (value === undefined || value === null || value === '') return '—';
  if (typeof value === 'boolean') return value ? '是' : '否';
  return statusLabels[String(value)] ?? String(value);
}
export function rows(value: unknown): BusinessRecord[] {
  return Array.isArray(value) ? (value as BusinessRecord[]) : [];
}
export function money(value: unknown, currency = '') {
  if (value === undefined || value === null || value === '') return '未提供';
  const number = Number(value);
  return Number.isFinite(number)
    ? `${currency ? `${currency} ` : ''}${number.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
    : '未提供';
}
export function options(
  items: BusinessRecord[],
  keys = ['name', 'code', 'id'],
): Option[] {
  return items.map((item) => ({
    value: item.id,
    label: keys
      .map((key) => item[key])
      .filter(Boolean)
      .map(String)
      .join(' · '),
  }));
}
export function masterOptions(master: MasterRecord[], type: string): Option[] {
  return options(
    master.filter((item) => item.type === type && item.active),
    ['code', 'name'],
  );
}
export function errorText(error: unknown) {
  if (typeof error === 'string' && error.trim()) {
    return error === 'Network Error'
      ? '连接服务失败，请在服务启动后重试'
      : error;
  }
  const candidate = error as {
    data?: { msg?: string };
    message?: string;
    msg?: string;
    response?: { data?: { msg?: string } };
  };
  return (
    candidate?.response?.data?.msg ||
    candidate?.data?.msg ||
    candidate?.msg ||
    candidate?.message ||
    '操作失败，请刷新后重试'
  );
}
export function field(
  key: string,
  name: string,
  type: Field['type'] = undefined,
  extra: Partial<Field> = {},
): Field {
  const hint =
    key === 'userId' || key.endsWith('UserId')
      ? '从当前系统的启用用户中选择。'
      : undefined;
  return { key, label: name, type, required: true, hint, ...extra };
}
export function selectField(
  key: string,
  name: string,
  values: Option[],
  extra: Partial<Field> = {},
) {
  return field(key, name, 'select', { options: values, ...extra });
}
export function contractDraftAction(
  master: MasterRecord[],
  userId?: number,
  departmentId?: number,
  contract?: Contract,
): ActionDefinition {
  return {
    action: contract ? 'UPDATE_CONTRACT' : 'CREATE_CONTRACT',
    title: contract ? '修订合同与规格' : '新建合同 / 样品',
    description: contract
      ? '修订保留已有明细 ID；已执行内容按后端规则限制。关键条件变更后原方案需重新生效。'
      : '以合同为唯一履约起点。产品采用统一 SKU，定制内容保存为本合同的规格快照。',
    fields: [
      field('code', '订单号', undefined, {
        disabled: true,
        required: false,
        hint: '首次保存后自动生成，已有编号不可修改。',
      }),
      field('name', '内部名称（可选）', undefined, { required: false }),
      field('alibabaTradeAssuranceNo', '阿里信保单号', undefined, {
        required: false,
        hint: '仅适用阿里信保的订单填写实际单号，最多 100 个字符。',
      }),
      selectField('customerId', '客户', masterOptions(master, 'CUSTOMER')),
      selectField(
        'businessType',
        '业务类型',
        [
          { value: 'FOREIGN', label: '外贸 B2B' },
          { value: 'DOMESTIC', label: '国内 B2B' },
          { value: 'GOVERNMENT', label: '政府客户' },
          { value: 'SAMPLE', label: '样品（允许零金额）' },
        ],
        { default: 'DOMESTIC' },
      ),
      field('departmentId', '业务部门 ID', 'number', {
        default: departmentId,
        min: 0,
        required: false,
      }),
      field('ownerUserId', '负责人用户 ID', 'number', {
        default: userId,
        min: 1,
      }),
      field('currency', '合同币种', undefined, { default: 'CNY' }),
      field('signedDate', '签订日期', 'date'),
      field('paymentTerms', '付款条件', 'textarea'),
      field('deliveryRequirement', '交付要求', 'textarea'),
      field('attachmentIds', '合同附件引用（逗号分隔）', undefined, {
        required: false,
      }),
    ],
    lineKey: 'items',
    lineFields: [
      selectField('skuId', '产品 / SKU', masterOptions(master, 'SKU')),
      field('specVersion', '定制规格版本', undefined, { default: '1' }),
      field('specification', '本合同冻结规格'),
      field('quantity', '合同数量', 'decimal', { min: 0.000001, default: '1' }),
      field('unitPrice', '销售单价', 'decimal', { min: 0, default: '0' }),
      field('unit', '单位', undefined, { default: '件' }),
      field('taxBasis', '税费口径'),
      field('requiredDate', '产品交期', 'date'),
      field('material', '材质', undefined, { required: false }),
      field('size', '尺寸', undefined, { required: false }),
      field('color', '颜色', undefined, { required: false }),
      field('printing', '印刷要求', undefined, { required: false }),
      field('packaging', '包装要求', undefined, { required: false }),
      field('attachmentIds', '规格图稿附件引用（逗号分隔）', undefined, {
        required: false,
      }),
    ],
    initialValues: contract
      ? {
          ...contract,
          attachmentIds: Array.isArray(contract.attachmentIds)
            ? contract.attachmentIds.join(',')
            : '',
          items: contract.items.map((item) => ({
            ...item,
            attachmentIds: Array.isArray(item.attachmentIds)
              ? item.attachmentIds.join(',')
              : '',
          })),
        }
      : undefined,
  };
}
export function contractActions(
  contract: Contract,
  master: MasterRecord[],
): Record<string, ActionDefinition> {
  const itemOptions = contract.items.map((item) => ({
    value: item.id,
    label: `${item.skuName} · ${item.specification}`,
    fill: requestLineDefaults(contract, item),
  }));
  const requestOptions = options(contract.requests ?? []);
  const requestItems = (contract.requests ?? []).flatMap((request) =>
    rows(request.items).map((item) => ({
      ...item,
      name: `${request.name || request.id} / ${item.contractItemId}`,
    })),
  );
  const assignmentOptions = options(contract.assignments ?? [], [
    'method',
    'id',
  ]);
  const planOptions = (contract.plans ?? []).map((plan) => ({
    label: `${plan.name} · 版本 ${plan.version} · ${plan.id}`,
    value: plan.id,
    fill: { planVersion: plan.version ?? 1 },
  }));
  const quoteOptions = options(contract.quotes ?? [], ['supplierName', 'id']);
  const planLines = (contract.plans ?? []).flatMap((plan) =>
    rows(plan.lines).map((line) => ({
      ...line,
      name: `${plan.name || plan.id} / ${line.assignmentId}`,
    })),
  );
  const quantity = () =>
    field('quantity', '数量', 'decimal', { default: '1', min: 0.000001 });
  const planFields = [
    selectField('planId', '采购方案', planOptions),
    field('planVersion', '方案版本', 'number', { default: 1, min: 1 }),
  ];
  return {
    UPDATE_CONTRACT: contractDraftAction(
      master,
      contract.ownerUserId,
      contract.departmentId,
      contract,
    ),
    CONFIRM_CONTRACT: {
      action: 'CONFIRM_CONTRACT',
      title: '合同生效',
      description: '确认当前合同与产品规格快照后，按合同明细开展履约。',
      fields: [],
    },
    CANCEL_REQUEST: {
      action: 'CANCEL_REQUEST',
      title: '取消采购申请',
      description:
        '取消未形成执行承诺的申请；已有生效或下单等约束由服务端检查，历史记录保留。',
      fields: [
        selectField(
          'requestId',
          '采购申请',
          options(contract.requests ?? [], ['name', 'id']),
        ),
      ],
    },
    CREATE_REQUEST: {
      action: 'CREATE_REQUEST',
      title: '新建采购申请',
      description:
        '可分批提交，同一明细允许超量申请。申请不会自动扩大合同数量。',
      fields: [
        field('name', '申请名称', undefined, {
          default: contract.code,
          hidden: true,
          hint: '自动带入当前合同编号，可按需修改；同一合同允许分批申请。',
        }),
        field('remark', '备注 / 超量原因', 'textarea', { required: false }),
      ],
      lineKey: 'items',
      lineFields: [
        selectField('contractItemId', '合同产品明细', itemOptions),
        field('quantity', '本次申请数量', 'decimal', {
          min: 0.000001,
          hint: '默认尚未申请的数量，可按本次需求调整；超量请在备注说明。',
        }),
        field('requiredDate', '期望到货日', 'date', {
          required: false,
          hint: '默认合同产品交期；尚未确定可留空。',
        }),
      ],
    },
    ASSIGN_FULFILLMENT: {
      action: 'ASSIGN_FULFILLMENT',
      title: '分派履约任务',
      description:
        '同一申请明细可以分配库存、自制与外采；累计分配不能超过申请数量。',
      fields: [
        selectField('requestId', '采购申请', requestOptions),
        selectField('requestItemId', '申请明细', options(requestItems)),
        selectField(
          'method',
          '履约方式',
          [
            { value: 'BUY', label: '外采' },
            { value: 'MAKE', label: '自产' },
            { value: 'STOCK', label: '库存' },
          ],
          { default: 'BUY' },
        ),
        quantity(),
        field('ownerUserId', '经办人用户 ID', 'number', { min: 1 }),
        field('factoryId', '承接工厂名称或业务编码（自产时填写）', undefined, {
          required: false,
        }),
        field('remark', '分派说明', 'textarea', { required: false }),
      ],
    },
    CREATE_QUOTE: {
      action: 'CREATE_QUOTE',
      title: '登记已核实报价',
      description: '报价证据与价格口径经人工核对后登记。修订报价保留原版本。',
      fields: [
        selectField('assignmentId', '外采任务', assignmentOptions),
        selectField('supplierId', '供应商', masterOptions(master, 'SUPPLIER')),
        field('currency', '币种', undefined, { default: contract.currency }),
        field('unitPrice', '采购单价', 'decimal', { min: 0 }),
        field('unit', '计价单位', undefined, { default: '件' }),
        field('minQuantity', '最低数量', 'decimal', {
          required: false,
          min: 0,
        }),
        field('maxQuantity', '最高适用数量', 'decimal', {
          required: false,
          min: 0,
        }),
        field('validUntil', '有效截止日期', 'date'),
        field('promisedDate', '承诺到货日期', 'date'),
        field('taxIncluded', '价格含税', 'boolean', { default: false }),
        field('packagingIncluded', '价格包含包装', 'boolean', {
          default: false,
        }),
        field('freightIncluded', '价格包含运费', 'boolean', { default: false }),
        field('evidenceIds', '报价证据文件 ID（逗号分隔）', 'textarea'),
        selectField('previousQuoteId', '被修订报价', quoteOptions, {
          required: false,
        }),
        field('remark', '人工核对说明', 'textarea', { required: false }),
      ],
    },
    SAVE_PLAN: {
      action: 'SAVE_PLAN',
      title: '编制采购方案',
      description:
        '分配数量需要平衡，外采行引用已确认报价；共享约束在同一个方案包决策。',
      fields: [
        selectField('id', '修订已有方案（新建留空）', planOptions, {
          required: false,
        }),
        selectField('requestId', '来源采购申请', requestOptions),
        field('name', '方案名称'),
        field('sharedConditions', '共同起订量 / 运费 / 交期约束', 'textarea', {
          required: false,
        }),
        field('rationale', '推荐理由'),
        field('riskNotes', '需经理判断的风险（每行一项）', 'textarea', {
          required: false,
        }),
      ],
      lineKey: 'lines',
      lineFields: [
        selectField('assignmentId', '履约任务', assignmentOptions),
        selectField('quoteId', '已确认报价（外采必选）', quoteOptions, {
          required: false,
        }),
        quantity(),
      ],
    },
    SUBMIT_PLAN: {
      action: 'SUBMIT_PLAN',
      title: '方案生效',
      description:
        '校验当前方案版本、报价和可用数量后生效；下单、预留和自产继续单独办理。',
      fields: [...planFields],
    },
    GENERATE_ORDERS: {
      action: 'GENERATE_ORDERS',
      title: '生成采购执行单',
      description:
        '仅生成当前生效版本的未执行数量。同供应商、币种、交期、税费与包装条件一致的产品可合并到一张采购单，各行保留原报价版本。',
      fields: [
        ...planFields,
        field(
          'groupCompatibleLines',
          '合并同供应商且商务条件一致的产品',
          'boolean',
          { default: true },
        ),
      ],
      lineKey: 'lines',
      optionalLines: true,
      lineFields: [
        selectField(
          'planLineId',
          '执行方案明细（留空执行全部）',
          options(planLines),
        ),
        quantity(),
      ],
    },
  };
}

export const costCategories: Option[] = [
  ['PURCHASE', '采购'],
  ['PRODUCTION', '生产'],
  ['PACKAGING', '包装'],
  ['TRANSPORT', '运输'],
  ['LABOR', '人工'],
  ['CUSTOMIZATION', '定制'],
  ['RETURN_LOSS', '退货损耗'],
].map(([value, name]) => ({ value: value!, label: name! }));

export function financeActions(
  contract: Contract,
): Record<string, ActionDefinition> {
  const ledger = contract.finance ?? {};
  const receiptOptions = options(ledger.receipts ?? [], [
    'receivedAt',
    'amount',
    'id',
  ]);
  const invoiceOptions = options(ledger.invoices ?? [], [
    'invoiceNumber',
    'amount',
    'id',
  ]);
  const source = field('sourceKey', '业务来源唯一编号', undefined, {
    hint: '使用实际凭证 / 业务事件编号；同一来源不能重复入账。',
  });
  const amount = field('amount', '金额', 'decimal', { min: 0.000001 });
  const reason = field('reason', '原因与依据', 'textarea');
  return {
    CREATE_RECEIPT: {
      action: 'CREATE_RECEIPT',
      title: '新建回款记录',
      description:
        '登记真实到账，按到账日期自动折算人民币；账户和凭证引用暂不要求填写，附件可选。财务确认后计入合同回款，可暂时没有发票。',
      fields: [
        source,
        { ...amount, label: '回款金额' },
        field('currency', '回款币种', undefined, {
          default: contract.currency,
        }),
        field('receivedAt', '到账日期', 'date'),
        selectField(
          'paymentMethod',
          '到款方式',
          [
            ['BANK_TRANSFER', '银行转账'],
            ['ALIBABA', '阿里信保'],
            ['PAYPAL', 'PayPal'],
            ['ALIPAY', '支付宝'],
            ['WECHAT', '微信'],
            ['CASH', '现金'],
            ['OTHER', '其他'],
          ].map(([value, label]) => ({ value: value!, label: label! })),
          { required: false },
        ),
      ],
    },
    REFRESH_RECEIPT_FX: {
      action: 'REFRESH_RECEIPT_FX',
      title: '补齐历史回款汇率',
      description:
        '按原到账日期补齐缺失的人民币折算快照。已有完整快照的已确认记录不会重新计算，退款及冲销沿原回款快照按比例处理。',
      fields: [
        selectField(
          'receiptId',
          '缺少汇率的回款',
          options(
            (ledger.receipts ?? []).filter((receipt) => !hasReceiptFx(receipt)),
            ['receivedAt', 'amount', 'id'],
          ),
        ),
      ],
    },
    CONFIRM_RECEIPT: {
      action: 'CONFIRM_RECEIPT',
      title: '财务确认到账',
      description:
        '核对真实到账金额、币种与到账日期，确认后不可直接删除，只能记录退款或冲销。',
      fields: [selectField('receiptId', '待确认回款', receiptOptions)],
    },
    REVERSE_RECEIPT: {
      action: 'REVERSE_RECEIPT',
      title: '回款退款 / 冲销',
      description:
        '以反向记录更正真实回款，保留原凭证和更正关系。已分配部分须先解除绑定。',
      fields: [
        source,
        selectField('receiptId', '原回款记录', receiptOptions),
        amount,
        selectField(
          'kind',
          '更正类型',
          [
            { value: 'REFUND', label: '退款' },
            { value: 'REVERSAL', label: '冲销' },
          ],
          { default: 'REFUND' },
        ),
        reason,
      ],
    },
    CREATE_INVOICE: {
      action: 'CREATE_INVOICE',
      title: '登记真实发票',
      description:
        '仅记录已开具的凭证，不直接开税务发票。形式发票与正式开票分开统计。',
      fields: [
        source,
        field('invoiceNumber', '真实发票号'),
        selectField('type', '发票类型', [
          { value: 'TAX', label: '国内税务发票' },
          { value: 'COMMERCIAL', label: '商业发票' },
          { value: 'PROFORMA', label: '形式发票' },
          { value: 'CREDIT_NOTE', label: '红字 / 贷项凭证' },
        ]),
        amount,
        field('currency', '币种', undefined, { default: contract.currency }),
        field('issuedAt', '开票日期', 'date'),
        field('evidenceRef', '发票附件引用'),
        selectField('originalInvoiceId', '原发票', invoiceOptions, {
          required: true,
          visibleWhen: { key: 'type', value: 'CREDIT_NOTE' },
        }),
      ],
    },
    VOID_INVOICE: {
      action: 'VOID_INVOICE',
      title: '登记发票作废',
      description:
        '依据真实作废结果更新台账，已有绑定时需先解除，保留原发票记录。',
      fields: [selectField('invoiceId', '原发票', invoiceOptions), reason],
    },
    BIND_ALLOCATION: {
      action: 'BIND_ALLOCATION',
      title: '回款与发票部分绑定',
      description:
        '同合同、同客户、同主体按金额绑定，不再次累计回款；后台校验双方可用余额。',
      fields: [
        source,
        selectField('receiptId', '已确认回款', receiptOptions),
        selectField('invoiceId', '有效发票', invoiceOptions),
        amount,
      ],
    },
    UNBIND_ALLOCATION: {
      action: 'UNBIND_ALLOCATION',
      title: '解除金额绑定',
      description: '按金额解除既有绑定，保留原分配和反向关系。',
      fields: [
        source,
        selectField(
          'allocationId',
          '原绑定记录',
          options(ledger.allocations ?? [], [
            'receiptId',
            'invoiceId',
            'amount',
          ]),
        ),
        amount,
        reason,
      ],
    },
    CREATE_COST: {
      action: 'CREATE_COST',
      title: '登记订单成本',
      description:
        '成本按来源、明细、阶段与口径归集。缺失不补零，含包费用需明确，避免重复计入。',
      fields: [
        source,
        selectField(
          'contractItemId',
          '合同产品明细',
          options(contract.items, ['skuName', 'id']),
        ),
        selectField('category', '成本要素', costCategories),
        selectField('stage', '成本阶段', [
          { value: 'ESTIMATED', label: '预计' },
          { value: 'COMMITTED', label: '已承诺' },
          { value: 'COLLECTED', label: '已归集' },
        ]),
        { ...amount, min: 0 },
        field('currency', '原币种', undefined, { default: contract.currency }),
        field('exchangeRate', '换算合同币种汇率', 'decimal', {
          default: '1',
          min: 0.000001,
        }),
        field('quantity', '对应数量', 'decimal', { min: 0.000001 }),
        field('taxTreatment', '税费口径'),
        field('evidenceRef', '费用凭证引用'),
        field('includesCategories', '本笔金额已包含的费用类别', 'multiselect', {
          required: false,
          excludeValueOf: 'category',
          options: costCategories,
          hint: '明确已含费用，避免后续重复计入。',
        }),
        field('policyVersion', '财务口径版本'),
      ],
    },
    REVERSE_COST: {
      action: 'REVERSE_COST',
      title: '成本冲销',
      description: '更正成本时生成反向记录，再登记新成本，原凭证完整保留。',
      fields: [
        source,
        selectField(
          'costId',
          '原成本记录',
          options(ledger.costs ?? [], ['category', 'stage', 'amount', 'id']),
        ),
        reason,
      ],
    },
    SET_PROFIT_POLICY: {
      action: 'SET_PROFIT_POLICY',
      title: '确认利润口径',
      description:
        '填写财务确认的预计及已确认业务收入，以及本合同必须具备的成本要素。缺项时显示未完整。',
      fields: [
        field('policyVersion', '口径版本'),
        field('expectedRevenue', '预计不含税业务收入', 'decimal', { min: 0 }),
        field('recognizedRevenue', '已确认不含税业务收入', 'decimal', {
          min: 0,
        }),
      ],
      lineKey: 'requiredCosts',
      lineFields: [
        selectField(
          'contractItemId',
          '合同明细',
          options(contract.items, ['skuName', 'id']),
        ),
        selectField('category', '必要成本要素', costCategories),
      ],
    },
  };
}

export function executionActions(
  contract: Contract,
  pools: BusinessRecord[],
  master: MasterRecord[],
): Record<string, ActionDefinition> {
  const orderOptions = options(contract.purchaseOrders ?? [], [
    'supplierName',
    'id',
  ]);
  const orderLines = (contract.purchaseOrders ?? []).flatMap((order) =>
    rows(order.lines).map((line) => ({
      ...line,
      name: `${order.supplierName || order.id} / ${line.skuId}`,
    })),
  );
  const poolOptions = options(pools, [
    'warehouseId',
    'skuId',
    'specVersion',
    'id',
  ]);
  const quantity = field('quantity', '本次数量', 'decimal', { min: 0.000001 });
  const reason = field('reason', '原因与依据', 'textarea');
  const pool = selectField('poolId', '库存池', poolOptions);
  const source = field('sourceKey', '本次业务事件唯一编号');
  const contractItem = selectField(
    'contractItemId',
    '合同产品明细',
    options(contract.items, ['skuName', 'id']),
  );
  const reservations = pools.flatMap((stock) =>
    rows(stock.reservations)
      .filter((reservation) => reservation.contractId === contract.id)
      .map((reservation) => ({
        ...reservation,
        name: `${stock.warehouseId} / ${reservation.contractItemId}`,
      })),
  );
  const reservation = selectField(
    'reservationId',
    '合同预留记录',
    options(reservations, ['name', 'remainingQuantity', 'id']),
  );
  return {
    TRANSFER_ASSIGNMENT: {
      action: 'TRANSFER_ASSIGNMENT',
      title: '转派履约任务',
      description: '记录新责任人及转派依据，历史责任和操作记录保持可追溯。',
      fields: [
        selectField(
          'assignmentId',
          '履约任务',
          options(contract.assignments ?? [], ['method', 'id']),
        ),
        field('ownerUserId', '新经办人用户 ID', 'number', { min: 1 }),
        reason,
      ],
    },
    RECORD_ARRIVAL: {
      action: 'RECORD_ARRIVAL',
      title: '登记分批到货',
      description:
        '提交时合格数量同步入库，异常数量单列，不可重复入库；到货不能超过订单未收余额。',
      fields: [
        selectField('orderId', '采购订单', orderOptions),
        selectField('orderLineId', '采购订单明细', options(orderLines)),
        field('batchNo', '到货批次'),
        selectField(
          'warehouseId',
          '收货仓库',
          masterOptions(master, 'WAREHOUSE'),
        ),
        selectField('stockPoolId', '收货库存池', poolOptions),
        quantity,
        field('acceptedQuantity', '合格数量', 'decimal', { min: 0 }),
        field('exceptionReason', '异常说明（有差异时必填）', 'textarea', {
          required: false,
        }),
        field('evidenceRef', '收货凭证引用'),
      ],
    },
    RETURN_ARRIVAL: {
      action: 'RETURN_ARRIVAL',
      title: '采购到货退货',
      description: '引用原到货，退回合格或异常部分，保留原到货及退货事实。',
      fields: [
        selectField(
          'arrivalId',
          '原到货记录',
          options(rows(contract.arrivals), ['batchNo', 'quantity', 'id']),
        ),
        selectField(
          'kind',
          '退货数量类型',
          [
            { value: 'ACCEPTED', label: '合格数量' },
            { value: 'EXCEPTION', label: '异常数量' },
          ],
          { default: 'ACCEPTED' },
        ),
        quantity,
        reason,
      ],
    },
    CANCEL_ORDER: {
      action: 'CANCEL_ORDER',
      title: '取消采购未执行余额',
      description: '仅允许取消尚未收货的订单数量，已发生的到货与库存不能删除。',
      fields: [
        selectField('orderId', '采购订单', orderOptions),
        selectField('orderLineId', '订单明细', options(orderLines)),
        quantity,
        reason,
      ],
    },
    UPDATE_PRODUCTION: {
      action: 'UPDATE_PRODUCTION',
      title: '更新自产人工进度',
      description:
        '记录工厂承接和完成进度。完成生产不自动增加可售库存，实际成品按来源入库。',
      fields: [
        selectField(
          'assignmentId',
          '自产任务',
          options(
            (contract.assignments ?? []).filter(
              (assignment) => assignment.method === 'MAKE',
            ),
          ),
        ),
        field('completedQuantity', '累计完成数量', 'decimal', { min: 0 }),
        selectField('status', '人工状态', [
          { value: 'ACCEPTED', label: '工厂已承接' },
          { value: 'IN_PROGRESS', label: '生产中' },
          { value: 'COMPLETED', label: '已完成' },
        ]),
        field('remark', '工厂进度说明', 'textarea'),
      ],
    },
    STOCK_RECEIVE: {
      action: 'STOCK_RECEIVE',
      title: '自产成品入库',
      description:
        '按自产实际完成数量入库，异常数量单独冻结。采购到货已同步入库，无需重复登记。',
      fields: [
        pool,
        source,
        selectField(
          'assignmentId',
          '自产来源任务',
          options(
            (contract.assignments ?? []).filter(
              (assignment) => assignment.method === 'MAKE',
            ),
          ),
        ),
        contractItem,
        quantity,
        field('unavailableQuantity', '本次不可售数量', 'decimal', {
          default: '0',
          min: 0,
        }),
        field('evidenceRef', '实际入库凭证引用'),
      ],
    },
    STOCK_RESERVE: {
      action: 'STOCK_RESERVE',
      title: '预留合同库存',
      description:
        '按已生效方案明细原子预留，后台校验生效版本、剩余额度与可用库存。',
      fields: [
        pool,
        source,
        contractItem,
        selectField(
          'planId',
          '已生效方案',
          (contract.plans ?? [])
            .filter((plan) =>
              ['APPROVED', 'PARTIALLY_APPROVED'].includes(String(plan.status)),
            )
            .map((plan) => ({
              label: `${plan.name || plan.id} · 版本 ${plan.version}`,
              value: plan.id,
              fill: { planVersion: plan.version ?? 1 },
            })),
        ),
        field('planVersion', '生效方案版本', 'number', { min: 1 }),
        selectField(
          'planLineId',
          '生效方案明细',
          options(
            (contract.plans ?? []).flatMap((plan) => rows(plan.lines)),
            ['method', 'contractItemId', 'id'],
          ),
        ),
        quantity,
      ],
    },
    STOCK_RELEASE: {
      action: 'STOCK_RELEASE',
      title: '释放未出库预留',
      description: '释放已有预留的剩余数量，保留事件与原预留的关系。',
      fields: [pool, source, reservation, quantity, reason],
    },
    STOCK_SHIP: {
      action: 'STOCK_SHIP',
      title: '确认分批发货',
      description:
        '实际发货扣减现存并释放对应预留，登记发货证据后更新合同交付事实。',
      fields: [
        pool,
        source,
        reservation,
        quantity,
        field('shippedDate', '实际发货日期', 'date', {
          default: new Date().toLocaleDateString('sv-SE', {
            timeZone: 'Asia/Shanghai',
          }),
        }),
        field('evidenceRef', '发货 / 物流凭证引用'),
      ],
    },
    STOCK_RETURN: {
      action: 'STOCK_RETURN',
      title: '登记客户退货入库',
      description: '引用原发货流水回收入库，异常或待检数量不得计入可售库存。',
      fields: [
        pool,
        source,
        selectField(
          'shipmentEventId',
          '原发货流水',
          (contract.shipments ?? [])
            .filter((shipment) => shipment.kind === 'OUTBOUND')
            .map((shipment) => ({
              value: String(shipment.eventId),
              label: `${shipment.quantity} / ${shipment.eventId}`,
            })),
        ),
        quantity,
        field('unavailableQuantity', '待检 / 不可售数量', 'decimal', {
          default: '0',
          min: 0,
        }),
        field('evidenceRef', '退货凭证引用'),
        reason,
      ],
    },
  };
}
