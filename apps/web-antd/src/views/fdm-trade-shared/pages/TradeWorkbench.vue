<script setup lang="ts">
import type { TableColumnsType } from 'ant-design-vue';

import type { TradeAiSelectedDocument } from '../ai-assistant';
import type { RelationChainDocument, RelationChainMetric } from '../components';
import type { ReceivableSummary } from '../domain/types';

import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import {
  Alert,
  Button,
  Card,
  message,
  Space,
  Table,
  Tag,
} from 'ant-design-vue';

import { MetricCard, RelationChainCard, StatusTag } from '../components';
import TradeAiAssistant from '../components/TradeAiAssistant.vue';
import { documentDrawerLocation } from '../document-routing';
import { MAIN_ORDER_ID } from '../domain/mock-data';
import { money, sum } from '../domain/money';
import { useTradePrototypeStore } from '../domain/store';
import { moneyText } from '../page-adapter';
import { statusLabel, statusTone } from '../status';

import '../page-styles.css';

defineOptions({ name: 'FdmTradeWorkbench' });

const router = useRouter();
const store = useTradePrototypeStore();
const summary = ref<ReceivableSummary>();
const aiOpen = ref(false);

const mainOrder = computed(() =>
  store.state.orders.find((item) => item.id === MAIN_ORDER_ID),
);
const aiSelectedDocument = computed<TradeAiSelectedDocument | undefined>(() =>
  mainOrder.value
    ? {
        id: mainOrder.value.id,
        label: mainOrder.value.id,
        type: 'ORDER',
      }
    : undefined,
);
const customer = computed(() =>
  store.state.customers.find((item) => item.id === mainOrder.value?.customerId),
);
const analysis = computed(() =>
  store.state.demandAnalyses.find((item) => item.orderId === MAIN_ORDER_ID),
);
const requisitions = computed(() =>
  store.state.purchaseRequisitions.filter(
    (item) => item.orderId === MAIN_ORDER_ID,
  ),
);
const purchaseOrders = computed(() =>
  store.state.purchaseOrders.filter((item) => item.orderId === MAIN_ORDER_ID),
);
const factoryTasks = computed(() =>
  store.state.factoryTasks.filter((item) => item.orderId === MAIN_ORDER_ID),
);
const shipments = computed(() =>
  store.state.shipments.filter((item) => item.orderId === MAIN_ORDER_ID),
);
const followUps = computed(() =>
  store.state.followUpTasks.filter((item) => item.orderId === MAIN_ORDER_ID),
);
const expenses = computed(() =>
  store.state.orderExpenses.filter((item) => item.orderId === MAIN_ORDER_ID),
);

const departmentLinks = [
  {
    description: '客户、合同订单与需求确认',
    icon: 'lucide:globe-2',
    path: '/fdmwaimao/customer',
    title: '外贸部门',
  },
  {
    description: '供应商、采购申请、采购订单与报关',
    icon: 'lucide:shopping-cart',
    path: '/fdmpurchase/requisition',
    title: '采购部门',
  },
  {
    description: '工厂、入库、发货与出库执行',
    icon: 'lucide:warehouse',
    path: '/fdmsupplychain/supply-execution',
    title: '供应链部门',
  },
  {
    description: '回款冲销、采购付款、发票与费用',
    icon: 'lucide:landmark',
    path: '/fdmtradefinance/receipt-writeoff',
    title: '财务部门',
  },
];

const priorityRows = computed(() => [
  {
    id: analysis.value?.id ?? `DA-${MAIN_ORDER_ID}`,
    item: '确认 AI 需求拆分',
    department: '外贸部门',
    status: analysis.value?.status ?? 'PENDING',
    next: analysis.value ? '核对数量守恒并确认' : '运行 AI 需求草稿',
    path: '/fdmwaimao/demand-analysis',
  },
  {
    id: requisitions.value[0]?.id ?? '待生成',
    item: '确认外采供应商',
    department: '采购部门',
    status: requisitions.value[0]?.status ?? 'PENDING',
    next:
      requisitions.value.length > 0
        ? '采用建议并生成采购单草稿'
        : '等待需求确认',
    path: '/fdmpurchase/requisition',
  },
  {
    id: factoryTasks.value[0]?.id ?? '待生成',
    item: '工厂供货进度',
    department: '供应链部门',
    status: factoryTasks.value[0]?.status ?? 'PENDING',
    next: factoryTasks.value.length > 0 ? '更新完成数量' : '等待需求确认',
    path: '/fdmsupplychain/supply-execution',
  },
  {
    id: MAIN_ORDER_ID,
    item: '尾款与冲销跟踪',
    department: '财务部门',
    status:
      summary.value?.outstandingAmount === '0.00' ? 'COMPLETED' : 'IN_PROGRESS',
    next: summary.value
      ? `未回款 ${moneyText(mainOrder.value?.currency, summary.value.outstandingAmount)}`
      : '读取中',
    path: '/fdmtradefinance/receipt-writeoff',
  },
]);

const priorityColumns: TableColumnsType = [
  { title: '待处理事项', dataIndex: 'item', key: 'item', minWidth: 180 },
  { title: '关联单据', dataIndex: 'id', key: 'id', width: 190 },
  { title: '责任部门', dataIndex: 'department', key: 'department', width: 116 },
  { title: '下一步', dataIndex: 'next', key: 'next', minWidth: 240 },
  { title: '状态', dataIndex: 'status', key: 'status', width: 116 },
  { title: '操作', key: 'action', fixed: 'right', width: 96 },
];

function documents(
  values: Array<{ id: string; status: string }>,
): RelationChainDocument[] {
  return values.slice(0, 3).map((item) => ({
    key: item.id,
    status: statusLabel(item.status),
    statusTone: statusTone(item.status),
    title: item.id,
  }));
}

const receiptDocuments = computed(() =>
  documents(
    store.state.receiptAllocations
      .filter((item) => item.orderId === MAIN_ORDER_ID)
      .map((allocation) => ({
        id: allocation.receiptId,
        status: allocation.status,
      })),
  ),
);
const supplyDocuments = computed(() =>
  documents([
    ...requisitions.value.map((item) => ({ id: item.id, status: item.status })),
    ...purchaseOrders.value.map((item) => ({
      id: item.id,
      status: item.status,
    })),
    ...factoryTasks.value.map((item) => ({ id: item.id, status: item.status })),
  ]),
);
const shipmentDocuments = computed(() =>
  documents([
    ...shipments.value.map((item) => ({ id: item.id, status: item.status })),
    ...followUps.value.map((item) => ({ id: item.id, status: item.status })),
  ]),
);
const expenseDocuments = computed(() =>
  documents(
    expenses.value.map((item) => ({ id: item.id, status: item.status })),
  ),
);

const receiptMetrics = computed<RelationChainMetric[]>(() => [
  {
    key: 'actual',
    label: '实际回款',
    value: moneyText(
      mainOrder.value?.currency,
      summary.value?.actualReceiptAmount,
    ),
    tone: 'success',
  },
  {
    key: 'writeoff',
    label: '回款冲销',
    value: moneyText(mainOrder.value?.currency, summary.value?.writeOffAmount),
  },
  {
    key: 'outstanding',
    label: '未回款',
    value: moneyText(
      mainOrder.value?.currency,
      summary.value?.outstandingAmount,
    ),
    tone: 'warning',
  },
  {
    key: 'documents',
    label: '回款单',
    value: `${receiptDocuments.value.length} 张`,
  },
]);

const supplyMetrics = computed<RelationChainMetric[]>(() => [
  {
    key: 'analysis',
    label: '需求分析',
    value: statusLabel(analysis.value?.status),
  },
  {
    key: 'requisition',
    label: '采购申请',
    value: `${requisitions.value.length} 张`,
  },
  {
    key: 'orders',
    label: '采购订单',
    value: `${purchaseOrders.value.length} 张`,
  },
  {
    key: 'factory',
    label: '工厂任务',
    value: `${factoryTasks.value.length} 张`,
  },
]);

const shipmentMetrics = computed<RelationChainMetric[]>(() => [
  { key: 'shipment', label: '发货批次', value: `${shipments.value.length} 批` },
  {
    key: 'outbound',
    label: '出库草稿',
    value: `${store.state.outboundDocuments.filter((item) => item.orderId === MAIN_ORDER_ID).length} 张`,
  },
  { key: 'followup', label: '跟单任务', value: `${followUps.value.length} 项` },
  {
    key: 'customs',
    label: '资料风险',
    value: followUps.value.some((item) => item.aiReadiness === 'BLOCKED')
      ? '存在缺项'
      : '等待检查',
    tone: 'warning',
  },
]);

const expenseMetrics = computed<RelationChainMetric[]>(() => [
  {
    key: 'amount',
    label: '费用申请',
    value: moneyText(
      expenses.value[0]?.currency ?? 'CNY',
      money(sum(expenses.value, (item) => item.amount)),
    ),
  },
  { key: 'count', label: '费用单', value: `${expenses.value.length} 张` },
  {
    key: 'pending',
    label: '待支付',
    value: `${expenses.value.filter((item) => item.status !== 'PAID').length} 张`,
    tone: 'warning',
  },
  {
    key: 'paid',
    label: '已支付',
    value: `${expenses.value.filter((item) => item.status === 'PAID').length} 张`,
    tone: 'success',
  },
]);

async function openMainOrder() {
  await router.push(documentDrawerLocation('ORDER', MAIN_ORDER_ID));
}

async function resetPrototype() {
  await store.reset();
  summary.value = await store.getReceivableSummary(MAIN_ORDER_ID);
  message.success('已恢复固定演示数据');
}

async function openChain(path: string) {
  await router.push(path);
}

function documentTypeFromId(id: string) {
  if (id.startsWith('RC-')) return 'RECEIPT' as const;
  if (id.startsWith('PR-')) return 'PURCHASE_REQUISITION' as const;
  if (id.startsWith('PO-')) return 'PURCHASE_ORDER' as const;
  if (id.startsWith('FT-')) return 'FACTORY_TASK' as const;
  if (id.startsWith('SH-')) return 'SHIPMENT' as const;
  if (id.startsWith('FU-')) return 'FOLLOW_UP_TASK' as const;
  if (id.startsWith('EXP-')) return 'ORDER_EXPENSE' as const;
  return undefined;
}

async function openRelatedDocument(document: RelationChainDocument) {
  const type = documentTypeFromId(document.key);
  if (!type) return;
  await router.push(documentDrawerLocation(type, document.key));
}

onMounted(async () => {
  try {
    if (!store.initialized) await store.initialize();
    summary.value = await store.getReceivableSummary(MAIN_ORDER_ID);
  } catch (error) {
    message.warning(
      `原型会话读取失败，已显示固定数据：${error instanceof Error ? error.message : String(error)}`,
    );
  }
});
</script>

<template>
  <Page
    auto-content-height
    description="以合同订单为核心，聚合查看四条并行业务链；各单据仍回到所属部门的权威页面处理。"
    title="外贸工作台"
  >
    <template #extra>
      <Space>
        <Button type="primary" @click="aiOpen = true">
          <template #icon><IconifyIcon icon="lucide:bot" /></template>
          询问 AI 助手
        </Button>
        <Button @click="openMainOrder">
          <template #icon><IconifyIcon icon="lucide:file-search" /></template>
          打开主演示订单
        </Button>
        <Button @click="resetPrototype">
          <template #icon><IconifyIcon icon="lucide:rotate-ccw" /></template>
          重置演示数据
        </Button>
      </Space>
    </template>

    <div class="fdm-trade-workbench">
      <Alert
        banner
        message="原型数据仅保存在当前浏览器会话；未连接 OKKI、数据库、ERP/WMS、银行、海关或审批接口。"
        show-icon
        type="info"
      />

      <section class="fdm-trade-workbench__order-strip">
        <div>
          <Tag color="blue">主演示订单</Tag>
          <h2>{{ mainOrder?.id }}</h2>
          <p>
            {{ customer?.name }} · {{ mainOrder?.owner }} · 要求发货
            {{ mainOrder?.requiredShipAt }}
          </p>
        </div>
        <StatusTag
          :text="statusLabel(mainOrder?.status)"
          :tone="statusTone(mainOrder?.status)"
        />
        <Button type="link" @click="openMainOrder">
          进入订单执行中心
          <IconifyIcon icon="lucide:arrow-right" />
        </Button>
      </section>

      <section class="fdm-trade-workbench__metrics">
        <MetricCard
          help="签单金额快照；历史汇率不会随汇率中心变化"
          icon="lucide:file-signature"
          label="合同金额"
          :value="moneyText(mainOrder?.currency, mainOrder?.totalAmount)"
        />
        <MetricCard
          help="只统计确认分配的真实资金"
          icon="lucide:landmark"
          label="实际回款"
          tone="success"
          :value="moneyText(mainOrder?.currency, summary?.actualReceiptAmount)"
        />
        <MetricCard
          help="真实回款 + 余额消费 + 审核减免"
          icon="lucide:badge-check"
          label="回款冲销"
          :value="moneyText(mainOrder?.currency, summary?.writeOffAmount)"
        />
        <MetricCard
          help="合同有效金额减回款冲销"
          icon="lucide:triangle-alert"
          label="未回款"
          tone="warning"
          :value="moneyText(mainOrder?.currency, summary?.outstandingAmount)"
        />
      </section>

      <section aria-label="四条并行业务链" class="fdm-trade-workbench__chains">
        <RelationChainCard
          description="到账、分配、余额消费与减免"
          :documents="receiptDocuments"
          icon="lucide:circle-dollar-sign"
          :metrics="receiptMetrics"
          open-label="进入财务"
          status="执行中"
          status-tone="processing"
          title="回款与冲销"
          @document="openRelatedDocument"
          @open="openChain('/fdmtradefinance/receipt-writeoff')"
        />
        <RelationChainCard
          description="需求拆分、外采与工厂供货"
          :documents="supplyDocuments"
          icon="lucide:network"
          :metrics="supplyMetrics"
          open-label="进入采购"
          :status="statusLabel(analysis?.status)"
          :status-tone="statusTone(analysis?.status)"
          title="供给与采购"
          @document="openRelatedDocument"
          @open="openChain('/fdmpurchase/requisition')"
        />
        <RelationChainCard
          description="发货批次、出库草稿和报关任务"
          :documents="shipmentDocuments"
          icon="lucide:ship-wheel"
          :metrics="shipmentMetrics"
          open-label="进入供应链"
          status="执行中"
          status-tone="processing"
          title="发货与报关"
          @document="openRelatedDocument"
          @open="openChain('/fdmsupplychain/shipment-outbound')"
        />
        <RelationChainCard
          description="订单、发货、采购与异常费用"
          :documents="expenseDocuments"
          icon="lucide:receipt-text"
          :metrics="expenseMetrics"
          open-label="进入费用"
          status="执行中"
          status-tone="processing"
          title="订单费用"
          @document="openRelatedDocument"
          @open="openChain('/fdmtradefinance/payable-expense?tab=expense')"
        />
      </section>

      <section class="fdm-trade-workbench__lower-grid">
        <Card :bordered="false" size="small" title="今日优先事项">
          <Table
            :columns="priorityColumns"
            :data-source="priorityRows"
            :pagination="false"
            row-key="item"
            :scroll="{ x: 900 }"
            size="small"
          >
            <template #bodyCell="{ column, record }">
              <StatusTag
                v-if="column.key === 'status'"
                :text="statusLabel(record.status)"
                :tone="statusTone(record.status)"
              />
              <Button
                v-else-if="column.key === 'action'"
                type="link"
                @click="openChain(record.path)"
              >
                处理
              </Button>
            </template>
          </Table>
        </Card>

        <Card :bordered="false" size="small" title="部门入口">
          <div class="fdm-trade-workbench__department-links">
            <button
              v-for="item in departmentLinks"
              :key="item.path"
              type="button"
              @click="openChain(item.path)"
            >
              <IconifyIcon :icon="item.icon" :width="22" />
              <span>
                <strong>{{ item.title }}</strong>
                <small>{{ item.description }}</small>
              </span>
              <IconifyIcon icon="lucide:chevron-right" />
            </button>
          </div>
        </Card>
      </section>
    </div>
  </Page>

  <TradeAiAssistant
    v-model:open="aiOpen"
    page-key="workbench"
    :selected-document="aiSelectedDocument"
  />
</template>

<style scoped>
.fdm-trade-workbench {
  display: grid;
  gap: 12px;
  min-width: 0;
  container-type: inline-size;
}

.fdm-trade-workbench__order-strip {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 16px;
  align-items: center;
  min-height: 82px;
  padding: 14px 16px;
  background: var(--ant-color-bg-container);
  border: 1px solid var(--ant-color-border-secondary);
  border-left: 4px solid var(--ant-color-primary);
  border-radius: var(--radius);
}

.fdm-trade-workbench__order-strip h2,
.fdm-trade-workbench__order-strip p {
  margin: 0;
}

.fdm-trade-workbench__order-strip h2 {
  display: inline;
  margin-left: 8px;
  font-size: 18px;
  font-weight: 600;
}

.fdm-trade-workbench__order-strip p {
  margin-top: 6px;
  font-size: 12px;
  color: var(--ant-color-text-secondary);
}

.fdm-trade-workbench__metrics,
.fdm-trade-workbench__chains {
  display: grid;
  gap: 12px;
}

.fdm-trade-workbench__metrics {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.fdm-trade-workbench__chains {
  grid-template-columns: repeat(2, minmax(300px, 1fr));
}

.fdm-trade-workbench__lower-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(300px, 0.8fr);
  gap: 12px;
}

.fdm-trade-workbench__lower-grid :deep(.ant-card) {
  height: 100%;
  border: 1px solid var(--ant-color-border-secondary);
}

.fdm-trade-workbench__department-links {
  display: grid;
  gap: 8px;
}

.fdm-trade-workbench__department-links button {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) 18px;
  gap: 8px;
  align-items: center;
  min-height: 56px;
  padding: 8px 10px;
  color: var(--ant-color-text);
  text-align: left;
  cursor: pointer;
  background: var(--ant-color-fill-quaternary);
  border: 1px solid var(--ant-color-border-secondary);
  border-radius: var(--radius);
}

.fdm-trade-workbench__department-links button:hover,
.fdm-trade-workbench__department-links button:focus-visible {
  outline: none;
  background: var(--ant-color-primary-bg);
  border-color: var(--ant-color-primary);
}

.fdm-trade-workbench__department-links span {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.fdm-trade-workbench__department-links strong {
  font-size: 14px;
  font-weight: 600;
}

.fdm-trade-workbench__department-links small {
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  color: var(--ant-color-text-secondary);
  white-space: nowrap;
}

@container (max-width: 980px) {
  .fdm-trade-workbench__metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .fdm-trade-workbench__chains,
  .fdm-trade-workbench__lower-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@container (max-width: 620px) {
  .fdm-trade-workbench__order-strip,
  .fdm-trade-workbench__metrics {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
