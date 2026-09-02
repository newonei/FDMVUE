<script setup lang="ts">
import type { TableColumnsType } from 'ant-design-vue';

import type {
  ContractOrder,
  DocumentRelation,
  DocumentType,
  ReceivableSummary,
  TradePrototypeState,
} from '../domain/types';
import type { RelationChainDocument, RelationChainMetric } from './types';

import { computed, h, ref } from 'vue';

import { IconifyIcon } from '@vben/icons';

import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  Table,
  Tabs,
  Timeline,
} from 'ant-design-vue';

import { money, sum } from '../domain/money';
import { moneyText } from '../page-adapter';
import { statusLabel, statusTone } from '../status';
import RelationChainCard from './RelationChainCard.vue';

import '../styles.css';

defineOptions({ name: 'FdmTradeOrderExecutionCenter' });

const props = defineProps<{
  order: ContractOrder;
  state: TradePrototypeState;
  summary: ReceivableSummary;
}>();

const emit = defineEmits<{
  navigateDocument: [type: 'WRITE_OFF_ITEM' | DocumentType, id: string];
}>();

const activeTab = ref('overview');

const customer = computed(() =>
  props.state.customers.find((item) => item.id === props.order.customerId),
);

const relations = computed(() =>
  props.state.documentRelations.filter(
    (relation) =>
      (relation.fromType === 'ORDER' && relation.fromId === props.order.id) ||
      (relation.toType === 'ORDER' && relation.toId === props.order.id),
  ),
);

function relatedDocument(relation: DocumentRelation) {
  if (relation.fromType === 'ORDER' && relation.fromId === props.order.id) {
    return { id: relation.toId, type: relation.toType };
  }
  return { id: relation.fromId, type: relation.fromType };
}

const relatedRows = computed(() =>
  relations.value.map((relation) => ({
    ...relatedDocument(relation),
    relationType: relation.relationType,
    relationId: relation.id,
    status: documentStatus(
      relatedDocument(relation).type,
      relatedDocument(relation).id,
    ),
    department: departmentForType(relatedDocument(relation).type),
  })),
);

function departmentForType(type: DocumentType) {
  if (
    type === 'PURCHASE_ORDER' ||
    type === 'PURCHASE_REQUISITION' ||
    type === 'FOLLOW_UP_TASK'
  ) {
    return '采购部门';
  }
  if (
    type === 'FACTORY_TASK' ||
    type === 'INBOUND_DOCUMENT' ||
    type === 'OUTBOUND_DOCUMENT' ||
    type === 'SHIPMENT'
  ) {
    return '供应链部门';
  }
  if (
    type === 'ORDER_EXPENSE' ||
    type === 'PAYMENT' ||
    type === 'RECEIPT' ||
    type === 'SUPPLIER_INVOICE'
  ) {
    return '财务部门';
  }
  return '外贸部门';
}

function documentStatus(type: DocumentType, id: string) {
  const collections: Partial<
    Record<DocumentType, Array<{ id: string; status?: string }>>
  > = {
    DEMAND_ANALYSIS: props.state.demandAnalyses,
    FACTORY_TASK: props.state.factoryTasks,
    FOLLOW_UP_TASK: props.state.followUpTasks,
    INBOUND_DOCUMENT: props.state.inboundDocuments,
    ORDER_EXPENSE: props.state.orderExpenses,
    OUTBOUND_DOCUMENT: props.state.outboundDocuments,
    PAYMENT: props.state.payments,
    PURCHASE_ORDER: props.state.purchaseOrders,
    PURCHASE_REQUISITION: props.state.purchaseRequisitions,
    RECEIPT: props.state.receipts,
    SHIPMENT: props.state.shipments,
    SUPPLIER_INVOICE: props.state.supplierInvoices,
  };
  return collections[type]?.find((item) => item.id === id)?.status ?? 'DRAFT';
}

function relationDocuments(types: DocumentType[]): RelationChainDocument[] {
  return relatedRows.value
    .filter((row) => types.includes(row.type))
    .slice(0, 3)
    .map((row) => ({
      key: row.id,
      title: row.id,
      subtitle: `${row.department} · ${row.relationType}`,
      status: statusLabel(row.status),
      statusTone: statusTone(row.status),
    }));
}

const supplyAnalysis = computed(() =>
  props.state.demandAnalyses.find((item) => item.orderId === props.order.id),
);

const supplyMetrics = computed<RelationChainMetric[]>(() => {
  const lines = supplyAnalysis.value?.lines ?? [];
  return [
    {
      key: 'stock',
      label: '库存满足',
      value: sum(lines, (line) => line.stockQty),
    },
    {
      key: 'factory',
      label: '内部工厂',
      value: sum(lines, (line) => line.factoryQty),
    },
    {
      key: 'purchase',
      label: '外部采购',
      value: sum(lines, (line) => line.purchaseQty),
    },
    {
      key: 'documents',
      label: '执行单据',
      value: `${props.state.purchaseRequisitions.filter((item) => item.orderId === props.order.id).length + props.state.factoryTasks.filter((item) => item.orderId === props.order.id).length} 张`,
    },
  ];
});

const receiptMetrics = computed<RelationChainMetric[]>(() => [
  {
    key: 'actual',
    label: '实际回款',
    value: moneyText(props.order.currency, props.summary.actualReceiptAmount),
    tone: 'success',
  },
  {
    key: 'writeoff',
    label: '回款冲销',
    value: moneyText(props.order.currency, props.summary.writeOffAmount),
  },
  {
    key: 'balance',
    label: '余额消费',
    value: moneyText(props.order.currency, props.summary.consumedBalanceAmount),
  },
  {
    key: 'outstanding',
    label: '未回款',
    value: moneyText(props.order.currency, props.summary.outstandingAmount),
    tone: props.summary.outstandingAmount === '0.00' ? 'success' : 'warning',
  },
]);

const shipmentMetrics = computed<RelationChainMetric[]>(() => {
  const shipments = props.state.shipments.filter(
    (item) => item.orderId === props.order.id,
  );
  const shipmentIds = new Set(shipments.map((item) => item.id));
  const outboundCount = props.state.outboundDocuments.filter((item) =>
    shipmentIds.has(item.shipmentId),
  ).length;
  return [
    { key: 'batches', label: '发货批次', value: `${shipments.length} 批` },
    {
      key: 'lines',
      label: '发货产品行',
      value: `${shipments.reduce((count, item) => count + item.lines.length, 0)} 行`,
    },
    { key: 'outbound', label: '出库单', value: `${outboundCount} 张` },
    {
      key: 'customs',
      label: '报关任务',
      value: `${props.state.followUpTasks.filter((item) => item.orderId === props.order.id).length} 项`,
    },
  ];
});

const expenseMetrics = computed<RelationChainMetric[]>(() => {
  const expenses = props.state.orderExpenses.filter(
    (item) => item.orderId === props.order.id,
  );
  const currency = expenses[0]?.currency ?? 'CNY';
  return [
    {
      key: 'applied',
      label: '费用申请',
      value: moneyText(currency, money(sum(expenses, (item) => item.amount))),
    },
    {
      key: 'count',
      label: '费用单',
      value: `${expenses.length} 张`,
    },
    {
      key: 'pending',
      label: '待支付',
      value: `${expenses.filter((item) => item.status !== 'PAID').length} 张`,
      tone: 'warning',
    },
    {
      key: 'paid',
      label: '已支付',
      value: `${expenses.filter((item) => item.status === 'PAID').length} 张`,
      tone: 'success',
    },
  ];
});

const productColumns: TableColumnsType = [
  { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 148 },
  {
    title: '客户产品编号',
    dataIndex: 'customerSku',
    key: 'customerSku',
    width: 150,
  },
  {
    title: '产品名称',
    dataIndex: 'productName',
    key: 'productName',
    width: 190,
  },
  {
    title: '规格',
    dataIndex: 'specification',
    key: 'specification',
    width: 180,
  },
  {
    title: '产品版本',
    dataIndex: 'productVersion',
    key: 'productVersion',
    width: 116,
  },
  {
    title: '包装版本',
    dataIndex: 'packagingVersion',
    key: 'packagingVersion',
    width: 116,
  },
  {
    title: '数量',
    dataIndex: 'quantity',
    key: 'quantity',
    align: 'right',
    width: 100,
  },
  { title: '单位', dataIndex: 'unit', key: 'unit', width: 72 },
  {
    title: '单价',
    dataIndex: 'unitPrice',
    key: 'unitPrice',
    align: 'right',
    width: 120,
    customRender: ({ text }: { text: string }) =>
      moneyText(props.order.currency, text),
  },
  {
    title: '金额',
    dataIndex: 'amount',
    key: 'amount',
    align: 'right',
    width: 132,
    customRender: ({ text }: { text: string }) =>
      moneyText(props.order.currency, text),
  },
];

const relationColumns: TableColumnsType = [
  {
    title: '单据编号',
    dataIndex: 'id',
    key: 'id',
    width: 190,
    customRender: ({
      record,
    }: {
      record: (typeof relatedRows.value)[number];
    }) =>
      h(
        Button,
        {
          type: 'link',
          onClick: () => emit('navigateDocument', record.type, record.id),
        },
        () => record.id,
      ),
  },
  { title: '单据类型', dataIndex: 'type', key: 'type', width: 170 },
  {
    title: '关系',
    dataIndex: 'relationType',
    key: 'relationType',
    minWidth: 170,
  },
  { title: '责任部门', dataIndex: 'department', key: 'department', width: 112 },
  {
    title: '状态',
    dataIndex: 'status',
    key: 'status',
    width: 116,
    customRender: ({ text }: { text: string }) => statusLabel(text),
  },
];

const auditItems = computed(() =>
  props.state.auditEvents
    .filter((event) => !event.entityId || event.entityId === props.order.id)
    .slice(0, 8)
    .map((event) => ({
      color: auditColor(event.type),
      children: `${event.createdAt} · ${event.actor} · ${event.action}：${event.result}`,
    })),
);

function auditColor(type: string) {
  if (type === 'RULE_BLOCK') return 'red';
  if (type === 'HUMAN_CONFIRMATION') return 'green';
  return 'blue';
}

function openChain(path: string) {
  window.dispatchEvent(
    new CustomEvent('fdm-trade:navigate', { detail: { path } }),
  );
}
</script>

<template>
  <div class="fdm-order-execution-center">
    <Alert
      banner
      message="订单执行按四条并行业务链组织；时间线只用于每条链内部节点。"
      show-icon
      type="info"
    />

    <Tabs
      v-model:active-key="activeTab"
      class="fdm-order-execution-center__tabs"
    >
      <Tabs.TabPane key="overview" tab="执行概览">
        <Card :bordered="false" size="small" title="合同与商务信息">
          <Descriptions :column="3" size="small">
            <Descriptions.Item label="客户">
              {{ customer?.name ?? order.customerId }}
            </Descriptions.Item>
            <Descriptions.Item label="订单类型">
              {{ order.type === 'BULK' ? '大货订单' : '样品订单' }}
            </Descriptions.Item>
            <Descriptions.Item label="负责人">
              {{ order.owner }}
            </Descriptions.Item>
            <Descriptions.Item label="签单日期">
              {{ order.signedAt }}
            </Descriptions.Item>
            <Descriptions.Item label="要求发货日期">
              {{ order.requiredShipAt }}
            </Descriptions.Item>
            <Descriptions.Item label="订单所属公司">
              {{ order.company }}
            </Descriptions.Item>
            <Descriptions.Item label="贸易条款">
              {{ order.incoterm }}
            </Descriptions.Item>
            <Descriptions.Item label="付款条件">
              {{ order.paymentTerms }}
            </Descriptions.Item>
            <Descriptions.Item label="起运港 / 目的港">
              {{ order.originPort }} → {{ order.destinationPort }}
            </Descriptions.Item>
            <Descriptions.Item label="签单日汇率">
              1 {{ order.currency }} = {{ order.exchangeRate }} CNY
            </Descriptions.Item>
            <Descriptions.Item label="合同有效金额">
              {{ moneyText(order.currency, order.totalAmount) }}
            </Descriptions.Item>
          </Descriptions>
        </Card>

        <div class="fdm-order-execution-center__chain-grid">
          <RelationChainCard
            description="真实资金与合法冲销分别统计"
            :documents="relationDocuments(['RECEIPT'])"
            icon="lucide:circle-dollar-sign"
            :metrics="receiptMetrics"
            open-label="进入财务"
            status="执行中"
            status-tone="processing"
            title="回款与冲销"
            @document="emit('navigateDocument', 'RECEIPT', $event.key)"
            @open="openChain('/fdmtradefinance/receipt-writeoff')"
          />
          <RelationChainCard
            description="库存、自制和外采并行执行"
            :documents="
              relationDocuments([
                'DEMAND_ANALYSIS',
                'PURCHASE_REQUISITION',
                'PURCHASE_ORDER',
                'FACTORY_TASK',
              ])
            "
            icon="lucide:network"
            :metrics="supplyMetrics"
            open-label="查看供给"
            :status="statusLabel(supplyAnalysis?.status)"
            :status-tone="statusTone(supplyAnalysis?.status)"
            title="供给与采购"
            @document="
              emit('navigateDocument', 'PURCHASE_REQUISITION', $event.key)
            "
            @open="openChain('/fdmpurchase/requisition')"
          />
          <RelationChainCard
            description="发货批次、出库和报关节点"
            :documents="
              relationDocuments([
                'SHIPMENT',
                'OUTBOUND_DOCUMENT',
                'FOLLOW_UP_TASK',
              ])
            "
            icon="lucide:ship-wheel"
            :metrics="shipmentMetrics"
            open-label="进入发货"
            status="执行中"
            status-tone="processing"
            title="发货与报关"
            @document="emit('navigateDocument', 'SHIPMENT', $event.key)"
            @open="openChain('/fdmsupplychain/shipment-outbound')"
          />
          <RelationChainCard
            description="订单、发货、采购和异常费用"
            :documents="relationDocuments(['ORDER_EXPENSE'])"
            icon="lucide:receipt-text"
            :metrics="expenseMetrics"
            open-label="进入费用"
            status="执行中"
            status-tone="processing"
            title="订单费用"
            @document="emit('navigateDocument', 'ORDER_EXPENSE', $event.key)"
            @open="openChain('/fdmtradefinance/payable-expense?tab=expense')"
          />
        </div>
      </Tabs.TabPane>

      <Tabs.TabPane key="products" tab="产品成交快照">
        <Card :bordered="false" size="small" title="产品明细">
          <Table
            :columns="productColumns"
            :data-source="order.lines"
            :pagination="false"
            row-key="id"
            :scroll="{ x: 1320 }"
            size="small"
          />
        </Card>
      </Tabs.TabPane>

      <Tabs.TabPane key="relations" tab="关联单据">
        <Card :bordered="false" size="small" title="跨部门关联单据">
          <Table
            :columns="relationColumns"
            :data-source="relatedRows"
            :locale="{ emptyText: '尚未生成关联单据' }"
            :pagination="false"
            row-key="relationId"
            :scroll="{ x: 900 }"
            size="small"
          />
        </Card>
      </Tabs.TabPane>

      <Tabs.TabPane key="attachments" tab="附件">
        <Card :bordered="false" size="small" title="合同与执行附件">
          <Empty description="原型不保存真实附件；正式接入时复用附件中心。">
            <template #image>
              <IconifyIcon icon="lucide:paperclip" :width="44" />
            </template>
          </Empty>
        </Card>
      </Tabs.TabPane>

      <Tabs.TabPane key="logs" tab="操作记录">
        <Card :bordered="false" size="small" title="业务操作与审计记录">
          <Timeline v-if="auditItems.length" :items="auditItems" />
          <Empty v-else description="暂无操作记录" />
        </Card>
      </Tabs.TabPane>
    </Tabs>
  </div>
</template>

<style scoped>
.fdm-order-execution-center {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.fdm-order-execution-center__tabs :deep(.ant-tabs-content-holder) {
  min-width: 0;
}

.fdm-order-execution-center__chain-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(280px, 1fr));
  gap: 12px;
  margin-top: 12px;
}

.fdm-order-execution-center :deep(.ant-card) {
  border: 1px solid var(--ant-color-border-secondary);
}

@media (max-width: 900px) {
  .fdm-order-execution-center__chain-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
