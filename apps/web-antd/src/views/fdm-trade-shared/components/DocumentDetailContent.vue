<script setup lang="ts">
import type { TableColumnsType } from 'ant-design-vue';

import type {
  ContractOrder,
  DemandAnalysis,
  DocumentType,
  FactoryTask,
  FollowUpTask,
  InboundDocument,
  OrderExpense,
  OutboundDocument,
  Payment,
  PurchaseOrder,
  PurchaseRequisition,
  Receipt,
  ReceivableSummary,
  Shipment,
  SupplierInvoice,
  TradePrototypeState,
  WriteOffItem,
} from '../domain/types';
import type { TradePageKey, TradePageRow } from '../page-config';

import { computed, h } from 'vue';

import { IconifyIcon } from '@vben/icons';

import {
  Alert,
  Badge,
  Button,
  Card,
  Descriptions,
  Empty,
  Progress,
  Steps,
  Table,
  Tabs,
  Tag,
} from 'ant-design-vue';

import { add, asBigNumber, equals } from '../domain/money';
import { moneyText } from '../page-adapter';
import { statusLabel } from '../status';
import OrderExecutionCenter from './OrderExecutionCenter.vue';
import StatusTag from './StatusTag.vue';

defineOptions({ name: 'FdmTradeDocumentDetailContent' });

const props = defineProps<{
  pageKey: TradePageKey;
  receivableSummary?: ReceivableSummary;
  row: TradePageRow;
  state: TradePrototypeState;
}>();

const emit = defineEmits<{
  navigateDocument: [type: 'WRITE_OFF_ITEM' | DocumentType, id: string];
}>();

const order = computed(() => props.row.raw as unknown as ContractOrder);
const analysis = computed(() => props.row.raw as unknown as DemandAnalysis);
const requisition = computed(
  () => props.row.raw as unknown as PurchaseRequisition,
);
const purchaseOrder = computed(() => props.row.raw as unknown as PurchaseOrder);
const followUp = computed(() => props.row.raw as unknown as FollowUpTask);
const factoryTask = computed(() => props.row.raw as unknown as FactoryTask);
const inboundDocument = computed(
  () => props.row.raw as unknown as InboundDocument,
);
const outboundDocument = computed(
  () => props.row.raw as unknown as OutboundDocument,
);
const shipment = computed(() => props.row.raw as unknown as Shipment);
const receipt = computed(() => props.row.raw as unknown as Receipt);
const writeOff = computed(() => props.row.raw as unknown as WriteOffItem);
const payment = computed(() => props.row.raw as unknown as Payment);
const supplierInvoice = computed(
  () => props.row.raw as unknown as SupplierInvoice,
);
const expense = computed(() => props.row.raw as unknown as OrderExpense);

const analysisRows = computed(() => {
  const sourceOrder = props.state.orders.find(
    (item) => item.id === analysis.value.orderId,
  );
  return analysis.value.lines.map((line) => {
    const orderLine = sourceOrder?.lines.find(
      (item) => item.id === line.orderLineId,
    );
    const balanced = orderLine
      ? equals(
          add(line.stockQty, line.factoryQty, line.purchaseQty),
          orderLine.quantity,
        )
      : false;
    return {
      ...line,
      balanced,
      orderQty: orderLine?.quantity ?? '—',
      productName: orderLine?.productName ?? line.orderLineId,
      sku: orderLine?.sku ?? '—',
      unit: orderLine?.unit ?? '',
    };
  });
});

const analysisColumns: TableColumnsType = [
  { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 140 },
  {
    title: '产品',
    dataIndex: 'productName',
    key: 'productName',
    minWidth: 180,
  },
  {
    title: '订单数量',
    dataIndex: 'orderQty',
    key: 'orderQty',
    align: 'right',
    width: 110,
  },
  {
    title: '库存满足',
    dataIndex: 'stockQty',
    key: 'stockQty',
    align: 'right',
    width: 110,
  },
  {
    title: '内部工厂',
    dataIndex: 'factoryQty',
    key: 'factoryQty',
    align: 'right',
    width: 110,
  },
  {
    title: '外部采购',
    dataIndex: 'purchaseQty',
    key: 'purchaseQty',
    align: 'right',
    width: 110,
  },
  {
    title: '硬规则',
    dataIndex: 'balanced',
    key: 'balanced',
    width: 120,
    customRender: ({ text }: { text: boolean }) =>
      h(Tag, { color: text ? 'success' : 'error' }, () =>
        text ? '数量守恒' : '数量不守恒',
      ),
  },
  { title: '策略', dataIndex: 'strategy', key: 'strategy', minWidth: 200 },
];

const requisitionColumns: TableColumnsType = [
  { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 140 },
  {
    title: '产品',
    dataIndex: 'productName',
    key: 'productName',
    minWidth: 180,
  },
  {
    title: '数量',
    dataIndex: 'quantity',
    key: 'quantity',
    align: 'right',
    width: 110,
  },
  { title: '单位', dataIndex: 'unit', key: 'unit', width: 70 },
  {
    title: '供应商选择',
    dataIndex: 'selectedSupplierId',
    key: 'selectedSupplierId',
    minWidth: 220,
    customRender: ({
      record,
    }: {
      record: PurchaseRequisition['lines'][number];
    }) => {
      const supplierId =
        record.selectedSupplierId ?? record.suggestions[0]?.supplierId;
      return (
        props.state.suppliers.find((item) => item.id === supplierId)?.name ??
        '等待采购确认'
      );
    },
  },
];

const purchaseColumns: TableColumnsType = [
  { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 140 },
  {
    title: '产品',
    dataIndex: 'productName',
    key: 'productName',
    minWidth: 180,
  },
  {
    title: '数量',
    dataIndex: 'quantity',
    key: 'quantity',
    align: 'right',
    width: 110,
  },
  {
    title: '单价',
    dataIndex: 'unitPrice',
    key: 'unitPrice',
    align: 'right',
    width: 130,
    customRender: ({ text }: { text: string }) =>
      moneyText(purchaseOrder.value.currency, text),
  },
  {
    title: '金额',
    dataIndex: 'amount',
    key: 'amount',
    align: 'right',
    width: 140,
    customRender: ({ text }: { text: string }) =>
      moneyText(purchaseOrder.value.currency, text),
  },
  {
    title: '来源订单行',
    dataIndex: 'orderLineId',
    key: 'orderLineId',
    minWidth: 170,
  },
];

const allocationColumns: TableColumnsType = [
  {
    title: '采购订单',
    dataIndex: 'purchaseOrderId',
    key: 'purchaseOrderId',
    minWidth: 180,
    customRender: ({ text }: { text: string }) =>
      h(
        Button,
        {
          type: 'link',
          onClick: () => emit('navigateDocument', 'PURCHASE_ORDER', text),
        },
        () => text,
      ),
  },
  {
    title: '分配金额',
    dataIndex: 'amount',
    key: 'amount',
    align: 'right',
    width: 140,
  },
];

const relationRows = computed(() => {
  if (props.row.rawType === 'WRITE_OFF_ITEM') return [];
  const currentType = props.row.rawType as DocumentType;
  return props.state.documentRelations
    .filter(
      (relation) =>
        (relation.fromType === currentType &&
          relation.fromId === props.row.id) ||
        (relation.toType === currentType && relation.toId === props.row.id),
    )
    .map((relation) => {
      const isFrom =
        relation.fromType === currentType && relation.fromId === props.row.id;
      return {
        direction: isFrom ? '关联去向' : '关联来源',
        id: relation.id,
        relatedId: isFrom ? relation.toId : relation.fromId,
        relatedType: isFrom ? relation.toType : relation.fromType,
        relationType: relation.relationType,
      };
    });
});

const relationColumns: TableColumnsType = [
  { title: '关系', dataIndex: 'relationType', key: 'relationType', width: 150 },
  { title: '方向', dataIndex: 'direction', key: 'direction', width: 110 },
  {
    title: '单据类型',
    dataIndex: 'relatedType',
    key: 'relatedType',
    width: 150,
    customRender: ({ text }: { text: DocumentType }) => documentTypeLabel(text),
  },
  {
    title: '关联单号',
    dataIndex: 'relatedId',
    key: 'relatedId',
    minWidth: 220,
    customRender: ({
      record,
    }: {
      record: (typeof relationRows.value)[number];
    }) =>
      h(
        Button,
        {
          type: 'link',
          onClick: () =>
            emit('navigateDocument', record.relatedType, record.relatedId),
        },
        () => record.relatedId,
      ),
  },
];

const genericEntries = computed(() => {
  const excluded = new Set([
    'allocations',
    'customsDocuments',
    'items',
    'lines',
    'milestones',
    'quotes',
    'sources',
    'suggestions',
  ]);
  return Object.entries(props.row.raw)
    .filter(([key, value]) => !excluded.has(key) && typeof value !== 'object')
    .slice(0, 14)
    .map(([key, value]) => ({
      key,
      label: fieldLabel(key),
      value: fieldValue(key, value),
    }));
});

function fieldValue(key: string, value: unknown) {
  if (value === '' || value === undefined) return '—';
  if (key === 'supplierId' && typeof value === 'string') {
    return (
      props.state.suppliers.find((supplier) => supplier.id === value)?.name ??
      value
    );
  }
  if (typeof value === 'string' && value.includes('T')) {
    const [date, time] = value.split('T');
    return time ? `${date} ${time.slice(0, 5)}` : value;
  }
  return String(value);
}

function fieldLabel(key: string) {
  const labels: Record<string, string> = {
    account: '账户',
    aiReadiness: 'AI 齐套检查',
    aiReadinessMessage: '检查结论',
    amount: '金额',
    approvedAt: '审核时间',
    batch: '发货批次',
    code: '编号',
    company: '所属公司',
    completedQty: '已完成数量',
    confirmedAt: '确认时间',
    country: '国家 / 地区',
    createdAt: '创建时间',
    cnyAmount: '折算人民币金额',
    currency: '币种',
    currentLoad: '当前负荷',
    customerId: '客户编号',
    estimatedReadyAt: '预计齐套日',
    eta: 'ETA',
    etd: 'ETD',
    expectedAt: '预计到货日',
    expenseType: '费用类型',
    factory: '工厂',
    id: '单据编号',
    invoicedAmount: '已开票金额',
    invoiceNo: '发票号码',
    issuedAt: '开票日期',
    kind: '冲销类型',
    name: '名称',
    orderId: '合同订单',
    owner: '负责人',
    paidAmount: '已付款金额',
    paidAt: '付款日期',
    payer: '付款方',
    paymentMode: '支付方式',
    paymentTerms: '付款条件',
    phone: '联系电话',
    progress: '进度',
    purchaseOrderId: '采购订单',
    requisitionId: '采购申请',
    receivedAt: '回款 / 收货日期',
    rate: '业务汇率',
    relatedId: '关联单据',
    relatedType: '关联类型',
    remark: '备注',
    requiredAt: '要求日期',
    requiredQty: '要求数量',
    risk: '风险',
    stage: '当前节点',
    status: '状态',
    supplierId: '供应商',
    totalAmount: '采购总金额',
    warehouse: '仓库',
  };
  return labels[key] ?? key;
}

function documentTypeLabel(type: DocumentType) {
  const labels: Record<DocumentType, string> = {
    CUSTOMER: '交易客户',
    DEMAND_ANALYSIS: '需求分析',
    FACTORY_TASK: '工厂供货任务',
    FOLLOW_UP_TASK: '跟单与报关',
    INBOUND_DOCUMENT: '入库单',
    ORDER: '合同订单',
    ORDER_EXPENSE: '订单费用',
    OUTBOUND_DOCUMENT: '出库单',
    PAYMENT: '采购付款',
    PURCHASE_ORDER: '采购订单',
    PURCHASE_REQUISITION: '采购申请',
    RECEIPT: '回款记录',
    SHIPMENT: '发货批次',
    SUPPLIER_INVOICE: '供应商发票',
  };
  return labels[type];
}

function sourceTypeLabel(type: string) {
  if (type === 'FACTORY') return '内部工厂';
  if (type === 'WAREHOUSE') return '库存仓库';
  if (type === 'PURCHASE') return '外部采购';
  return type;
}

const milestoneItems = computed(() =>
  followUp.value.milestones?.map((milestone) => ({
    title: milestone.label,
    status: (milestone.status === 'COMPLETED' ? 'finish' : 'wait') as
      | 'finish'
      | 'wait',
    description: milestone.completedAt ?? '等待人工更新',
  })),
);

function inventoryItems() {
  if (props.row.rawType === 'INBOUND_DOCUMENT')
    return inboundDocument.value.items;
  return outboundDocument.value.items;
}

function factoryProgress() {
  const required = asBigNumber(factoryTask.value.requiredQty);
  if (required.isZero()) return 0;
  return asBigNumber(factoryTask.value.completedQty)
    .dividedBy(required)
    .multipliedBy(100)
    .decimalPlaces(0)
    .toNumber();
}

function forwardDocument(type: 'WRITE_OFF_ITEM' | DocumentType, id: string) {
  emit('navigateDocument', type, id);
}
</script>

<template>
  <OrderExecutionCenter
    v-if="row.rawType === 'ORDER' && receivableSummary"
    :order="order"
    :state="state"
    :summary="receivableSummary"
    @navigate-document="forwardDocument"
  />

  <div v-else class="fdm-document-detail-content">
    <Alert
      v-if="row.rawType === 'DEMAND_ANALYSIS'"
      :message="
        analysis.status === 'CONFIRMED'
          ? '需求拆分已由人员确认'
          : 'AI 结果仍是草稿，必须通过数量守恒校验并由人员确认。'
      "
      show-icon
      :type="analysis.status === 'CONFIRMED' ? 'success' : 'warning'"
    />

    <Card :bordered="false" size="small" title="基本信息">
      <Descriptions :column="{ xs: 1, sm: 2, lg: 3 }" size="small">
        <Descriptions.Item
          v-for="entry in genericEntries"
          :key="entry.key"
          :label="entry.label"
        >
          <StatusTag
            v-if="entry.key === 'status'"
            :text="statusLabel(entry.value)"
          />
          <span v-else>{{ entry.value }}</span>
        </Descriptions.Item>
      </Descriptions>
    </Card>

    <Card
      v-if="relationRows.length"
      :bordered="false"
      size="small"
      title="关联单据"
    >
      <Table
        :columns="relationColumns"
        :data-source="relationRows"
        :pagination="false"
        row-key="id"
        size="small"
      />
    </Card>

    <Card
      v-if="row.rawType === 'DEMAND_ANALYSIS'"
      :bordered="false"
      size="small"
      title="库存 / 工厂 / 外采拆分"
    >
      <Table
        :columns="analysisColumns"
        :data-source="analysisRows"
        :pagination="false"
        row-key="id"
        :scroll="{ x: 1040 }"
        size="small"
      />
    </Card>

    <Card
      v-else-if="row.rawType === 'PURCHASE_REQUISITION'"
      :bordered="false"
      size="small"
      title="外采需求与供应商建议"
    >
      <Table
        :columns="requisitionColumns"
        :data-source="requisition.lines"
        :pagination="false"
        row-key="id"
        :scroll="{ x: 840 }"
        size="small"
      />
    </Card>

    <Card
      v-else-if="row.rawType === 'PURCHASE_ORDER'"
      :bordered="false"
      size="small"
      title="采购明细与来源分配"
    >
      <Table
        :columns="purchaseColumns"
        :data-source="purchaseOrder.items"
        :pagination="false"
        row-key="id"
        :scroll="{ x: 940 }"
        size="small"
      />
    </Card>

    <template v-else-if="row.rawType === 'FOLLOW_UP_TASK'">
      <Card :bordered="false" size="small" title="执行节点">
        <Steps :items="milestoneItems" size="small" />
      </Card>
      <Card :bordered="false" size="small" title="报关资料齐套检查">
        <div class="fdm-document-detail-content__checklist">
          <div v-for="document in followUp.customsDocuments" :key="document.id">
            <Badge
              :status="document.status === 'READY' ? 'success' : 'error'"
            />
            <span>{{ document.label }}</span>
            <StatusTag
              :text="statusLabel(document.status)"
              :tone="document.status === 'READY' ? 'success' : 'danger'"
            />
          </div>
        </div>
      </Card>
    </template>

    <Card
      v-else-if="row.rawType === 'FACTORY_TASK'"
      :bordered="false"
      size="small"
      title="工厂供货进度"
    >
      <Progress :percent="factoryProgress()" status="active" />
      <p class="fdm-document-detail-content__hint">
        已完成 {{ factoryTask.completedQty }} / 要求
        {{ factoryTask.requiredQty }}；正式进度仍由工厂或供应链人员确认。
      </p>
    </Card>

    <Card
      v-else-if="row.rawType === 'SHIPMENT'"
      :bordered="false"
      size="small"
      title="本批发货产品与来源"
    >
      <Tabs>
        <Tabs.TabPane
          v-for="line in shipment.lines"
          :key="line.id"
          :tab="line.orderLineId"
        >
          <div class="fdm-document-detail-content__source-grid">
            <div
              v-for="source in line.sources"
              :key="`${source.sourceType}-${source.sourceLocation}`"
            >
              <IconifyIcon icon="lucide:warehouse" :width="18" />
              <strong>{{ source.sourceLocation }}</strong>
              <span>{{ source.quantity }}</span>
              <small>{{ sourceTypeLabel(source.sourceType) }}</small>
            </div>
          </div>
        </Tabs.TabPane>
      </Tabs>
    </Card>

    <Card
      v-else-if="
        row.rawType === 'INBOUND_DOCUMENT' ||
        row.rawType === 'OUTBOUND_DOCUMENT'
      "
      :bordered="false"
      size="small"
      title="库存单据明细"
    >
      <Table
        :columns="[
          { title: '订单产品行', dataIndex: 'orderLineId', key: 'orderLineId' },
          {
            title: '数量',
            dataIndex: 'quantity',
            key: 'quantity',
            align: 'right',
          },
        ]"
        :data-source="inventoryItems()"
        :pagination="false"
        row-key="id"
        size="small"
      />
    </Card>

    <Card
      v-else-if="row.rawType === 'RECEIPT'"
      :bordered="false"
      size="small"
      title="回款与合同冲销"
    >
      <Descriptions :column="3" size="small">
        <Descriptions.Item label="真实到款">
          {{ moneyText(receipt.currency, receipt.amount) }}
        </Descriptions.Item>
        <Descriptions.Item label="回款日汇率">
          {{ receipt.rate }}
        </Descriptions.Item>
        <Descriptions.Item label="折算人民币">
          {{ moneyText('CNY', receipt.cnyAmount) }}
        </Descriptions.Item>
      </Descriptions>
      <Alert
        class="fdm-document-detail-content__formula"
        message="现金回款按已生效的回款记录统计；客户余额消费和减免只参与非现金冲销。"
        show-icon
        type="info"
      />
    </Card>

    <Card
      v-else-if="row.rawType === 'WRITE_OFF_ITEM'"
      :bordered="false"
      size="small"
      title="冲销明细"
    >
      <Alert
        :message="`${writeOff.kind === 'CUSTOMER_BALANCE' ? '客户历史余额消费' : '审核减免 / 其他冲销'} ${writeOff.amount}`"
        :description="writeOff.remark"
        show-icon
        type="warning"
      />
    </Card>

    <Card
      v-else-if="row.rawType === 'PAYMENT'"
      :bordered="false"
      size="small"
      title="采购付款分配"
    >
      <Table
        :columns="allocationColumns"
        :data-source="payment.allocations"
        :pagination="false"
        row-key="purchaseOrderId"
        size="small"
      />
    </Card>

    <Card
      v-else-if="row.rawType === 'SUPPLIER_INVOICE'"
      :bordered="false"
      size="small"
      title="供应商发票分配"
    >
      <Table
        :columns="allocationColumns"
        :data-source="supplierInvoice.allocations"
        :pagination="false"
        row-key="purchaseOrderId"
        size="small"
      />
    </Card>

    <Card
      v-else-if="row.rawType === 'ORDER_EXPENSE'"
      :bordered="false"
      size="small"
      title="订单费用归属"
    >
      <Alert
        :message="`${expense.expenseType} · ${moneyText(expense.currency, expense.amount)}`"
        :description="`支付方式：${expense.paymentMode}；关联 ${expense.relatedType} ${expense.relatedId}`"
        show-icon
        type="info"
      />
    </Card>

    <Empty
      v-if="
        ![
          'DEMAND_ANALYSIS',
          'FACTORY_TASK',
          'FOLLOW_UP_TASK',
          'INBOUND_DOCUMENT',
          'ORDER_EXPENSE',
          'OUTBOUND_DOCUMENT',
          'PAYMENT',
          'PURCHASE_ORDER',
          'PURCHASE_REQUISITION',
          'RECEIPT',
          'SHIPMENT',
          'SUPPLIER_INVOICE',
          'WRITE_OFF_ITEM',
        ].includes(row.rawType)
      "
      description="该主档的扩展资料将在正式接口接入后显示。"
    />
  </div>
</template>

<style scoped>
.fdm-document-detail-content {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.fdm-document-detail-content :deep(.ant-card) {
  border: 1px solid var(--ant-color-border-secondary);
}

.fdm-document-detail-content__checklist {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.fdm-document-detail-content__checklist > div {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  min-height: 40px;
  padding: 8px 10px;
  border: 1px solid var(--ant-color-border-secondary);
  border-radius: var(--radius);
}

.fdm-document-detail-content__source-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 8px;
}

.fdm-document-detail-content__source-grid > div {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) auto;
  gap: 6px;
  align-items: center;
  padding: 10px;
  border: 1px solid var(--ant-color-border-secondary);
  border-radius: var(--radius);
}

.fdm-document-detail-content__source-grid small {
  grid-column: 2 / -1;
  font-size: 12px;
  color: var(--ant-color-text-secondary);
}

.fdm-document-detail-content__hint,
.fdm-document-detail-content__formula {
  margin-top: 10px;
}

.fdm-document-detail-content__hint {
  margin-bottom: 0;
  font-size: 12px;
  color: var(--ant-color-text-secondary);
}

@media (max-width: 900px) {
  .fdm-document-detail-content__checklist {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
