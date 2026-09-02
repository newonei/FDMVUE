import type { VxeTableGridOptions } from '#/adapter/vxe-table';

export type TradePageKey =
  | 'contract-order'
  | 'customer'
  | 'demand-analysis'
  | 'follow-up-customs'
  | 'payable-expense'
  | 'purchase-order'
  | 'receipt-writeoff'
  | 'requisition'
  | 'shipment-outbound'
  | 'supplier'
  | 'supply-execution';

export interface TradePageRow {
  amount?: string;
  currency?: string;
  date?: string;
  department?: string;
  id: string;
  nextStep?: string;
  owner?: string;
  partner?: string;
  primary: string;
  progress?: string;
  quantity?: string;
  raw: Record<string, unknown>;
  rawType: string;
  risk?: string;
  secondary?: string;
  source?: string;
  status: string;
  statusLabel: string;
  updatedAt?: string;
}

export interface TradePageTab {
  key: string;
  label: string;
}

export interface TradePageConfig {
  columns: VxeTableGridOptions<TradePageRow>['columns'];
  department: string;
  description: string;
  detailTitle: string;
  primaryAction?: string;
  tabs?: TradePageTab[];
  title: string;
}

const basePrimaryColumn = (
  title: string,
  minWidth = 180,
): NonNullable<TradePageConfig['columns']>[number] => ({
  field: 'primary',
  fixed: 'left',
  minWidth,
  slots: { default: 'primary' },
  title,
});

const statusColumn: NonNullable<TradePageConfig['columns']>[number] = {
  field: 'statusLabel',
  minWidth: 116,
  slots: { default: 'status' },
  title: '状态',
};

const actionColumn: NonNullable<TradePageConfig['columns']>[number] = {
  fixed: 'right',
  slots: { default: 'actions' },
  title: '操作',
  width: 190,
};

const selectionColumn: NonNullable<TradePageConfig['columns']>[number] = {
  fixed: 'left',
  type: 'checkbox',
  width: 46,
};

const amountColumn: NonNullable<TradePageConfig['columns']>[number] = {
  align: 'right',
  field: 'amount',
  minWidth: 142,
  slots: { default: 'amount' },
  title: '金额',
};

const ownerColumn: NonNullable<TradePageConfig['columns']>[number] = {
  field: 'owner',
  minWidth: 104,
  title: '负责人',
};

const dateColumn: NonNullable<TradePageConfig['columns']>[number] = {
  field: 'date',
  minWidth: 126,
  title: '关键日期',
};

export const TRADE_PAGE_CONFIGS: Record<TradePageKey, TradePageConfig> = {
  customer: {
    title: '交易客户',
    department: '外贸部门',
    description:
      '只保留已经成交或准备创建首单的交易客户；OKKI 仍负责成交前开发。',
    detailTitle: '交易客户详情',
    primaryAction: '从 OKKI 导入',
    columns: [
      selectionColumn,
      basePrimaryColumn('客户名称', 220),
      { field: 'secondary', minWidth: 138, title: '国家 / 地区' },
      { field: 'source', minWidth: 150, title: 'OKKI 映射' },
      amountColumn,
      { field: 'progress', minWidth: 150, title: '回款 / 未回款' },
      { field: 'risk', minWidth: 116, title: '订单风险' },
      ownerColumn,
      statusColumn,
      actionColumn,
    ],
  },
  'contract-order': {
    title: '合同订单',
    department: '外贸部门',
    description:
      '合同订单是成交后业务总枢纽；回款、采购、发货和费用分别跳转到权威页面。',
    detailTitle: '合同订单执行中心',
    primaryAction: '新建合同草稿',
    columns: [
      selectionColumn,
      basePrimaryColumn('合同订单号', 188),
      { field: 'partner', minWidth: 190, title: '客户' },
      { field: 'secondary', minWidth: 108, title: '订单类型' },
      amountColumn,
      dateColumn,
      { field: 'progress', minWidth: 180, title: '回款 / 供给 / 发货' },
      { field: 'risk', minWidth: 112, title: '风险' },
      ownerColumn,
      statusColumn,
      actionColumn,
    ],
  },
  'demand-analysis': {
    title: 'AI 需求分析',
    department: '外贸部门',
    description:
      'AI 只生成草稿；外贸人员调整并确认订单行的库存、内部工厂和外部采购数量。',
    detailTitle: '需求拆分详情',
    primaryAction: '运行 AI 草稿',
    columns: [
      selectionColumn,
      basePrimaryColumn('分析单号', 180),
      { field: 'source', minWidth: 180, title: '来源合同' },
      { field: 'quantity', minWidth: 124, title: '产品行 / 数量' },
      { field: 'progress', minWidth: 250, title: '库存 / 工厂 / 外采' },
      { field: 'risk', minWidth: 128, title: '规则校验' },
      ownerColumn,
      dateColumn,
      statusColumn,
      actionColumn,
    ],
  },
  supplier: {
    title: '供应商',
    department: '采购部门',
    description:
      '供应商建议基于资质、产品关系、报价、交期、准时率、质量与当前负荷。',
    detailTitle: '供应商详情',
    columns: [
      selectionColumn,
      basePrimaryColumn('供应商名称', 228),
      { field: 'secondary', minWidth: 170, title: '可供产品' },
      { field: 'amount', minWidth: 126, title: '最近报价' },
      { field: 'date', minWidth: 116, title: '交期' },
      { field: 'progress', minWidth: 180, title: '准时率 / 合格率' },
      { field: 'quantity', minWidth: 110, title: '未结订单' },
      { field: 'risk', minWidth: 108, title: '风险' },
      statusColumn,
      actionColumn,
    ],
  },
  requisition: {
    title: '采购申请',
    department: '采购部门',
    description:
      '接收已确认的外部采购需求，采购人员采用建议后生成采购订单草稿。',
    detailTitle: '采购申请详情',
    primaryAction: '查看待接收需求',
    columns: [
      selectionColumn,
      basePrimaryColumn('采购申请号', 184),
      { field: 'source', minWidth: 184, title: '来源合同' },
      { field: 'secondary', minWidth: 186, title: '产品' },
      { field: 'quantity', minWidth: 112, title: '需求数量' },
      { field: 'partner', minWidth: 190, title: '建议供应商' },
      { field: 'risk', minWidth: 116, title: '风险' },
      ownerColumn,
      statusColumn,
      actionColumn,
    ],
  },
  'purchase-order': {
    title: '采购订单',
    department: '采购部门',
    description:
      '采购订单保留订单行来源分配，并聚合交期、入库、付款和供应商发票。',
    detailTitle: '采购订单详情',
    columns: [
      selectionColumn,
      basePrimaryColumn('采购订单号', 184),
      { field: 'partner', minWidth: 210, title: '供应商' },
      { field: 'source', minWidth: 184, title: '来源合同' },
      amountColumn,
      dateColumn,
      { field: 'progress', minWidth: 190, title: '入库 / 付款 / 发票' },
      { field: 'risk', minWidth: 108, title: '风险' },
      statusColumn,
      actionColumn,
    ],
  },
  'follow-up-customs': {
    title: '采购跟单与报关',
    department: '采购部门',
    description:
      '按发货批次跟踪供应商、工厂、验货、订舱、资料、进港、申报和放行。',
    detailTitle: '跟单与报关详情',
    primaryAction: 'AI 检查资料',
    columns: [
      selectionColumn,
      basePrimaryColumn('跟单任务号', 184),
      { field: 'source', minWidth: 190, title: '采购 / 发货来源' },
      { field: 'secondary', minWidth: 150, title: '当前节点' },
      { field: 'progress', minWidth: 180, title: '资料齐套' },
      { field: 'risk', minWidth: 138, title: '异常 / 风险' },
      ownerColumn,
      dateColumn,
      statusColumn,
      actionColumn,
    ],
  },
  'supply-execution': {
    title: '供给执行',
    department: '供应链部门',
    description:
      '统一查看工厂供货任务、采购入库和供应商直发验收，不复制采购单。',
    detailTitle: '供给执行详情',
    tabs: [
      { key: 'factory', label: '工厂供货任务' },
      { key: 'inbound', label: '采购入库' },
      { key: 'direct', label: '直发验收' },
    ],
    columns: [
      selectionColumn,
      basePrimaryColumn('执行单号', 184),
      { field: 'source', minWidth: 184, title: '来源订单' },
      { field: 'partner', minWidth: 180, title: '工厂 / 仓库' },
      { field: 'secondary', minWidth: 178, title: '产品' },
      { field: 'quantity', minWidth: 134, title: '要求 / 已完成' },
      { field: 'progress', minWidth: 150, title: '执行进度' },
      dateColumn,
      ownerColumn,
      statusColumn,
      actionColumn,
    ],
  },
  'shipment-outbound': {
    title: '发货与出库',
    department: '供应链部门',
    description:
      '客户发货批次与按仓库、工厂拆分的出库单分别记录，并跳转查看报关进度。',
    detailTitle: '发货与出库详情',
    primaryAction: '创建发货草稿',
    tabs: [
      { key: 'shipment', label: '客户发货批次' },
      { key: 'outbound', label: '出库单' },
    ],
    columns: [
      selectionColumn,
      basePrimaryColumn('发货 / 出库单号', 192),
      { field: 'source', minWidth: 184, title: '来源合同 / 发货' },
      { field: 'partner', minWidth: 180, title: '客户 / 出库地点' },
      { field: 'quantity', minWidth: 116, title: '数量' },
      { field: 'secondary', minWidth: 144, title: '运输 / 来源' },
      { field: 'progress', minWidth: 156, title: '出库 / 报关' },
      dateColumn,
      statusColumn,
      actionColumn,
    ],
  },
  'receipt-writeoff': {
    title: '回款与冲销',
    department: '财务部门',
    description:
      '真实到账、订单分配、客户余额消费和减免分别记录；实际回款与冲销口径严格分开。',
    detailTitle: '回款与冲销详情',
    primaryAction: '登记模拟到账',
    tabs: [
      { key: 'receipt', label: '回款流水' },
      { key: 'writeoff', label: '余额消费 / 减免' },
    ],
    columns: [
      selectionColumn,
      basePrimaryColumn('回款 / 冲销编号', 190),
      { field: 'partner', minWidth: 196, title: '客户' },
      { field: 'source', minWidth: 184, title: '分配合同' },
      amountColumn,
      { field: 'secondary', minWidth: 140, title: '业务类型' },
      { field: 'progress', minWidth: 196, title: '实际回款 / 冲销 / 未回款' },
      dateColumn,
      statusColumn,
      actionColumn,
    ],
  },
  'payable-expense': {
    title: '应付与费用',
    department: '财务部门',
    description:
      '采购付款、供应商发票和订单费用各有唯一正式记录，可跳回采购单或合同订单。',
    detailTitle: '应付与费用详情',
    tabs: [
      { key: 'payment', label: '采购付款' },
      { key: 'invoice', label: '供应商发票' },
      { key: 'expense', label: '订单费用' },
    ],
    columns: [
      selectionColumn,
      basePrimaryColumn('业务单号', 184),
      { field: 'secondary', minWidth: 134, title: '业务类型' },
      { field: 'partner', minWidth: 210, title: '供应商 / 收款方' },
      { field: 'source', minWidth: 184, title: '采购 / 合同来源' },
      amountColumn,
      { field: 'progress', minWidth: 170, title: '分配 / 收票 / 支付' },
      dateColumn,
      statusColumn,
      actionColumn,
    ],
  },
};
