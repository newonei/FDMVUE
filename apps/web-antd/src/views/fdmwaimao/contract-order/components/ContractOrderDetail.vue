<script lang="ts" setup>
import type { ColumnsType } from 'ant-design-vue/es/table';

import type { FdmWaimaoContractOrderApi } from '#/api/fdmwaimao/contract-order';
import type {
  TradeRelationLink,
  TradeSummaryMetric,
} from '#/views/fdm-trade-shared/components';

import { computed } from 'vue';

import { useAccess } from '@vben/access';

import {
  Alert,
  Descriptions,
  Empty,
  Image,
  Table,
  Tag,
  TypographyParagraph,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import {
  TradeBusinessLink,
  TradeDetailLayout,
  TradeRelatedDocuments,
  TradeSummaryPanel,
} from '#/views/fdm-trade-shared/components';
import {
  fdmTradeDocumentRoute,
  fdmTradeReceiptListRoute,
  fdmTradeShipmentListRoute,
} from '#/views/fdm-trade-shared/document-links';
import FdmWaimaoAttachmentList from '#/views/fdmwaimao/components/FdmWaimaoAttachmentList.vue';

import { formatCurrencyAmount } from '../amount';
import { validateContractFulfillmentConstraints } from '../form-model';

defineOptions({ name: 'FdmWaimaoContractOrderDetailContent' });

const props = defineProps<{
  order?: FdmWaimaoContractOrderApi.ContractDetail;
  relatedDocuments?: readonly TradeRelationLink[];
}>();
const { hasAccessByCodes } = useAccess();

const canQueryCustomer = computed(() =>
  hasAccessByCodes(['fdmwaimao:customer:query']),
);
const canQueryReceipt = computed(() =>
  hasAccessByCodes(['fdmwaimao:receipt-record:query']),
);
const canQueryConsumption = computed(() =>
  hasAccessByCodes(['fdmwaimao:consumption-record:query']),
);
const canQueryShipment = computed(() =>
  hasAccessByCodes(['fdmwaimao:shipment:query']),
);

const fulfillmentIssues = computed(() =>
  props.order ? validateContractFulfillmentConstraints(props.order, true) : [],
);

const summaryMetrics = computed<TradeSummaryMetric[]>(() => {
  const order = props.order;
  if (!order) return [];
  return [
    {
      key: 'total',
      label: '合同总额',
      value: `${order.currency} ${formatCurrencyAmount(order.totalAmount)}`,
    },
    {
      key: 'outstanding',
      label: '未回款额',
      tone:
        Number(order.outstandingAmount ?? order.totalAmount) > 0
          ? 'warning'
          : 'success',
      value: `${order.currency} ${formatCurrencyAmount(order.outstandingAmount ?? order.totalAmount)}`,
    },
    {
      key: 'cash',
      label: '现金回款',
      tone: 'success',
      to: canQueryReceipt.value
        ? fdmTradeReceiptListRoute({ orderId: order.id, type: 'receipt' })
        : undefined,
      value: `${order.currency} ${formatCurrencyAmount(order.cashReceivedAmount)}`,
    },
    {
      key: 'consumption',
      label: '消费 / 冲销',
      to: canQueryConsumption.value
        ? fdmTradeReceiptListRoute({
            orderId: order.id,
            type: 'consumption',
          })
        : undefined,
      value: `${order.currency} ${formatCurrencyAmount(order.consumptionAmount)}`,
    },
    {
      key: 'products',
      label: '产品明细',
      value: `${order.items.length} 行`,
    },
    {
      key: 'quantity',
      label: '产品总数量',
      value: formatCurrencyAmount(order.totalQuantity ?? '0'),
    },
  ];
});

const relationDocuments = computed<TradeRelationLink[]>(() => {
  const order = props.order;
  if (!order) return [];
  return [
    {
      disabled: !canQueryCustomer.value,
      icon: 'lucide:building-2',
      key: `customer-${order.customerId}`,
      label: order.customerName,
      meta: order.contactName || undefined,
      to: canQueryCustomer.value
        ? fdmTradeDocumentRoute('customer', order.customerId)
        : undefined,
      type: '交易客户',
    },
    {
      disabled: !canQueryReceipt.value,
      icon: 'lucide:landmark',
      key: `receipt-${order.id}`,
      label: '查看回款记录',
      meta: `${order.receiptCount || 0} 笔现金回款`,
      status: order.paymentStatus === 'SETTLED' ? '已结清' : '结算中',
      statusTone: order.paymentStatus === 'SETTLED' ? 'success' : 'warning',
      to: canQueryReceipt.value
        ? fdmTradeReceiptListRoute({ orderId: order.id, type: 'receipt' })
        : undefined,
      type: '回款记录',
    },
    {
      disabled: !canQueryConsumption.value,
      icon: 'lucide:badge-minus',
      key: `consumption-${order.id}`,
      label: '查看消费 / 冲销',
      meta: `${order.consumptionCount || 0} 笔非现金冲销`,
      to: canQueryConsumption.value
        ? fdmTradeReceiptListRoute({
            orderId: order.id,
            type: 'consumption',
          })
        : undefined,
      type: '消费记录',
    },
    {
      disabled: !canQueryShipment.value,
      icon: 'lucide:package-check',
      key: `shipment-${order.id}`,
      label: '查看发货管理',
      meta: '按此合同筛选发货单',
      to: canQueryShipment.value
        ? fdmTradeShipmentListRoute({
            contractOrderId: order.id,
            contractOrderNo: order.orderNo,
          })
        : undefined,
      type: '发货单',
    },
    ...(props.relatedDocuments || []),
  ];
});

const columns: ColumnsType<FdmWaimaoContractOrderApi.ContractItem> = [
  { key: 'sequence', title: '#', width: 48 },
  { key: 'imageUrl', title: '图片', width: 72 },
  { dataIndex: 'name', key: 'name', title: '产品信息', width: 210 },
  { dataIndex: 'code', key: 'code', title: '产品编号', width: 130 },
  { dataIndex: 'category', key: 'category', title: '分类', width: 120 },
  { dataIndex: 'unit', key: 'unit', title: '单位', width: 80 },
  { key: 'retailPrice', title: '零售价', width: 110 },
  { key: 'unitPrice', title: '单价', width: 110 },
  { key: 'discountRate', title: '折扣 %', width: 90 },
  { key: 'quantity', title: '数量', width: 100 },
  { key: 'lineAmount', title: '总价', width: 120 },
  { key: 'gift', title: '赠品', width: 72 },
  {
    dataIndex: 'customizationText',
    key: 'customizationText',
    title: '定制要求',
    width: 180,
  },
  { dataIndex: 'remark', key: 'remark', title: '行备注', width: 180 },
];

function display(value: null | string | undefined) {
  return value || '—';
}

function formatDateTime(
  value: FdmWaimaoContractOrderApi.DateTimeValue | null | undefined,
) {
  if (value === null || value === undefined || value === '') return '—';
  const parsed = dayjs(value);
  return parsed.isValid()
    ? parsed.format('YYYY-MM-DD HH:mm:ss')
    : String(value);
}

function orderTypeLabel(value: FdmWaimaoContractOrderApi.OrderType) {
  return value === 'SAMPLE' ? '样品订单' : '大货订单';
}

function orderStatusLabel(value: FdmWaimaoContractOrderApi.OrderStatus) {
  if (value === 'CONFIRMED') return '已确认';
  if (value === 'CANCELLED') return '已取消';
  return '草稿';
}

function orderStatusColor(value: FdmWaimaoContractOrderApi.OrderStatus) {
  if (value === 'CONFIRMED') return 'success';
  if (value === 'CANCELLED') return 'default';
  return 'processing';
}

function paymentStatusLabel(
  value: FdmWaimaoContractOrderApi.PaymentStatus | null | undefined,
) {
  if (value === 'PARTIAL') return '部分回款';
  if (value === 'SETTLED') return '已结清';
  if (value === 'OVERPAID') return '超额回款';
  return '未回款';
}

function fulfillmentModeLabel(
  value: FdmWaimaoContractOrderApi.FulfillmentMode | null | undefined,
) {
  if (value === 'DIRECT_SHIP') return '直发履约';
  if (value === 'MIXED') return '混合履约';
  if (value === 'STANDARD') return '标准履约';
  return '—';
}

function directShipLabel(value: boolean | null | undefined) {
  if (value === true) return '是，必须直发';
  if (value === false) return '否，不强制直发';
  return '未明确';
}

function declaredRequirements(value: null | string[] | undefined) {
  return Array.isArray(value);
}

function requirementCodes(value: null | string[] | undefined) {
  return Array.isArray(value) ? value : [];
}

function itemText(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === 'string' ? display(value) : '—';
}
</script>

<template>
  <div v-if="order" class="contract-order-detail">
    <section class="contract-order-detail__hero">
      <div>
        <div class="contract-order-detail__eyebrow">
          <Tag :color="orderStatusColor(order.status)">
            {{ orderStatusLabel(order.status) }}
          </Tag>
          <Tag
            :color="order.paymentStatus === 'SETTLED' ? 'success' : 'warning'"
          >
            {{ paymentStatusLabel(order.paymentStatus) }}
          </Tag>
          <span>{{ order.orderNo }}</span>
        </div>
        <h2>{{ order.subject }}</h2>
        <p>
          <TradeBusinessLink
            :disabled="!canQueryCustomer"
            :to="
              canQueryCustomer
                ? fdmTradeDocumentRoute('customer', order.customerId)
                : undefined
            "
          >
            {{ order.customerName }}
          </TradeBusinessLink>
          <template v-if="order.contactName">
            · {{ order.contactName }}
          </template>
        </p>
      </div>
    </section>

    <TradeDetailLayout>
      <section class="contract-order-detail__section">
        <h3>基本信息</h3>
        <Descriptions
          bordered
          :column="{ lg: 3, md: 2, sm: 1, xs: 1 }"
          size="small"
        >
          <Descriptions.Item label="合同单号">
            {{ order.orderNo }}
          </Descriptions.Item>
          <Descriptions.Item label="阿里信保单号">
            {{ order.alibabaTradeAssuranceNo }}
          </Descriptions.Item>
          <Descriptions.Item label="订单类型">
            {{ orderTypeLabel(order.orderType) }}
          </Descriptions.Item>
          <Descriptions.Item label="对应客户">
            <TradeBusinessLink
              :disabled="!canQueryCustomer"
              :to="
                canQueryCustomer
                  ? fdmTradeDocumentRoute('customer', order.customerId)
                  : undefined
              "
            >
              {{ order.customerName }}
            </TradeBusinessLink>
          </Descriptions.Item>
          <Descriptions.Item label="对应联系人">
            {{ display(order.contactName) }}
          </Descriptions.Item>
          <Descriptions.Item label="所有者">
            {{ display(order.ownerUserName) }}
          </Descriptions.Item>
          <Descriptions.Item label="签单日期">
            {{ order.signDate }}
          </Descriptions.Item>
          <Descriptions.Item label="订单所属公司">
            {{ order.companyName }}
          </Descriptions.Item>
          <Descriptions.Item label="币种">
            {{ order.currency }}
          </Descriptions.Item>
          <Descriptions.Item label="付款条款">
            {{ display(order.paymentTerms) }}
          </Descriptions.Item>
          <Descriptions.Item v-if="order.confirmedTime" label="确认信息">
            {{ display(order.confirmedByUserName) }} ·
            {{ formatDateTime(order.confirmedTime) }}
          </Descriptions.Item>
          <Descriptions.Item v-if="order.cancelledTime" label="取消信息">
            {{ display(order.cancelledByUserName) }} ·
            {{ formatDateTime(order.cancelledTime) }}
          </Descriptions.Item>
          <Descriptions.Item v-if="order.cancelReason" label="取消原因">
            {{ order.cancelReason }}
          </Descriptions.Item>
        </Descriptions>
      </section>

      <section class="contract-order-detail__section">
        <div class="contract-order-detail__section-title">
          <h3>履约与合规约束</h3>
          <Tag :color="fulfillmentIssues.length ? 'warning' : 'success'">
            {{
              fulfillmentIssues.length
                ? `待完善 ${fulfillmentIssues.length} 项`
                : '约束完整'
            }}
          </Tag>
        </div>

        <Alert
          v-if="fulfillmentIssues.length"
          class="contract-order-detail__constraint-alert"
          :description="
            fulfillmentIssues.map((item) => item.message).join('；')
          "
          message="当前草稿尚不能确认合同"
          show-icon
          type="warning"
        />

        <Descriptions
          bordered
          :column="{ lg: 3, md: 2, sm: 1, xs: 1 }"
          size="small"
        >
          <Descriptions.Item label="贸易术语">
            {{ display(order.incoterm) }}
          </Descriptions.Item>
          <Descriptions.Item label="交付地点代码">
            {{ display(order.deliveryLocation) }}
          </Descriptions.Item>
          <Descriptions.Item label="要求交付日期">
            {{ display(order.requiredDeliveryDate) }}
          </Descriptions.Item>
          <Descriptions.Item label="履约方式">
            {{ fulfillmentModeLabel(order.fulfillmentMode) }}
          </Descriptions.Item>
          <Descriptions.Item label="是否必须直发">
            <Tag
              :color="
                order.directShipRequired === true
                  ? 'blue'
                  : order.directShipRequired === false
                    ? 'default'
                    : 'warning'
              "
            >
              {{ directShipLabel(order.directShipRequired) }}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="约束来源">
            合同订单权威快照
          </Descriptions.Item>
          <Descriptions.Item label="包装要求" :span="3">
            <div class="contract-order-detail__requirement-list">
              <Tag
                v-for="code in requirementCodes(order.packagingRequirements)"
                :key="code"
                color="blue"
              >
                {{ code }}
              </Tag>
              <Tag
                v-if="
                  declaredRequirements(order.packagingRequirements) &&
                  requirementCodes(order.packagingRequirements).length === 0
                "
              >
                无额外要求
              </Tag>
              <Tag
                v-else-if="!declaredRequirements(order.packagingRequirements)"
                color="warning"
              >
                未填写
              </Tag>
            </div>
          </Descriptions.Item>
          <Descriptions.Item label="认证要求" :span="3">
            <div class="contract-order-detail__requirement-list">
              <Tag
                v-for="code in requirementCodes(
                  order.certificationRequirements,
                )"
                :key="code"
                color="purple"
              >
                {{ code }}
              </Tag>
              <Tag
                v-if="
                  declaredRequirements(order.certificationRequirements) &&
                  requirementCodes(order.certificationRequirements).length === 0
                "
              >
                无额外要求
              </Tag>
              <Tag
                v-else-if="
                  !declaredRequirements(order.certificationRequirements)
                "
                color="warning"
              >
                未填写
              </Tag>
            </div>
          </Descriptions.Item>
          <Descriptions.Item label="国家合规要求" :span="3">
            <div class="contract-order-detail__requirement-list">
              <Tag
                v-for="code in requirementCodes(
                  order.countryComplianceRequirements,
                )"
                :key="code"
                color="cyan"
              >
                {{ code }}
              </Tag>
              <Tag
                v-if="
                  declaredRequirements(order.countryComplianceRequirements) &&
                  requirementCodes(order.countryComplianceRequirements)
                    .length === 0
                "
              >
                无额外要求
              </Tag>
              <Tag
                v-else-if="
                  !declaredRequirements(order.countryComplianceRequirements)
                "
                color="warning"
              >
                未填写
              </Tag>
            </div>
          </Descriptions.Item>
          <Descriptions.Item label="客户合规要求" :span="3">
            <div class="contract-order-detail__requirement-list">
              <Tag
                v-for="code in requirementCodes(
                  order.customerComplianceRequirements,
                )"
                :key="code"
                color="geekblue"
              >
                {{ code }}
              </Tag>
              <Tag
                v-if="
                  declaredRequirements(order.customerComplianceRequirements) &&
                  requirementCodes(order.customerComplianceRequirements)
                    .length === 0
                "
              >
                无额外要求
              </Tag>
              <Tag
                v-else-if="
                  !declaredRequirements(order.customerComplianceRequirements)
                "
                color="warning"
              >
                未填写
              </Tag>
            </div>
          </Descriptions.Item>
        </Descriptions>
      </section>

      <section class="contract-order-detail__section">
        <div class="contract-order-detail__section-title">
          <h3>产品快照</h3>
          <span>共 {{ order.items.length }} 行；历史内容不随未来产品中心变化</span>
        </div>
        <Table
          bordered
          :columns="columns"
          :data-source="order.items"
          :pagination="false"
          row-key="id"
          :scroll="{ x: 1660 }"
          size="small"
        >
          <template #bodyCell="{ column, index, record }">
            <template v-if="column.key === 'sequence'">
              {{ index + 1 }}
            </template>
            <template v-else-if="column.key === 'imageUrl'">
              <Image
                v-if="record.imageUrl"
                :height="42"
                :src="record.imageUrl"
                :width="42"
              />
              <span v-else>—</span>
            </template>
            <template v-else-if="column.key === 'name'">
              <div class="contract-order-detail__product-name">
                <strong>{{ record.name }}</strong>
                <Tag
                  :color="
                    record.entrySource === 'PRODUCT_CENTER'
                      ? 'purple'
                      : 'default'
                  "
                >
                  {{
                    record.entrySource === 'PRODUCT_CENTER'
                      ? '产品中心快照'
                      : '手工录入'
                  }}
                </Tag>
              </div>
            </template>
            <template v-else-if="column.key === 'retailPrice'">
              {{
                record.retailPrice
                  ? formatCurrencyAmount(record.retailPrice)
                  : '—'
              }}
            </template>
            <template v-else-if="column.key === 'unitPrice'">
              {{ formatCurrencyAmount(record.unitPrice) }}
            </template>
            <template v-else-if="column.key === 'discountRate'">
              {{ record.discountRate }}%
            </template>
            <template v-else-if="column.key === 'quantity'">
              {{ record.quantity }}
            </template>
            <template v-else-if="column.key === 'lineAmount'">
              <strong>{{ order.currency }}
                {{ formatCurrencyAmount(record.lineAmount) }}</strong>
            </template>
            <template v-else-if="column.key === 'gift'">
              <Tag :color="record.gift ? 'gold' : 'default'">
                {{ record.gift ? '是' : '否' }}
              </Tag>
            </template>
            <template
              v-else-if="
                [
                  'code',
                  'category',
                  'unit',
                  'customizationText',
                  'remark',
                ].includes(String(column.key))
              "
            >
              {{ itemText(record, String(column.key)) }}
            </template>
          </template>
        </Table>
      </section>

      <section class="contract-order-detail__section">
        <h3>金额公式</h3>
        <div class="contract-order-detail__amounts">
          <div>
            <span>产品合计</span>
            <strong>{{ order.currency }}
              {{ formatCurrencyAmount(order.productAmount) }}</strong>
          </div>
          <div>
            <span>整单折扣率</span>
            <strong>{{ order.orderDiscountRate }}%</strong>
          </div>
          <div>
            <span>折后产品金额</span>
            <strong>
              {{ order.currency }}
              {{ formatCurrencyAmount(order.discountedProductAmount) }}
            </strong>
          </div>
          <div>
            <span>优惠抹零</span>
            <strong>
              - {{ order.currency }}
              {{ formatCurrencyAmount(order.roundingDiscountAmount) }}
            </strong>
          </div>
          <div>
            <span>{{ order.additionalFeeCategory || '附加费用' }}</span>
            <strong>
              + {{ order.currency }}
              {{ formatCurrencyAmount(order.additionalFeeAmount) }}
            </strong>
          </div>
          <div class="contract-order-detail__amount-total">
            <span>总金额</span>
            <strong>{{ order.currency }}
              {{ formatCurrencyAmount(order.totalAmount) }}</strong>
          </div>
        </div>
        <p class="contract-order-detail__formula">
          {{ formatCurrencyAmount(order.productAmount) }} ×
          {{ order.orderDiscountRate }}% −
          {{ formatCurrencyAmount(order.roundingDiscountAmount) }} +
          {{ formatCurrencyAmount(order.additionalFeeAmount) }} =
          {{ formatCurrencyAmount(order.totalAmount) }}
        </p>
      </section>

      <section class="contract-order-detail__section">
        <h3>单据附件</h3>
        <FdmWaimaoAttachmentList
          :business-id="order.id"
          business-type="CONTRACT_ORDER"
        />
      </section>

      <section class="contract-order-detail__section">
        <h3>备注</h3>
        <TypographyParagraph class="contract-order-detail__remark">
          {{ order.remark || '暂无备注' }}
        </TypographyParagraph>
      </section>

      <section class="contract-order-detail__audit">
        <span>创建时间：{{ formatDateTime(order.createTime) }}</span>
        <span>更新时间：{{ formatDateTime(order.updateTime) }}</span>
        <span>版本：{{ order.version }}</span>
      </section>

      <template #aside>
        <TradeSummaryPanel :metrics="summaryMetrics" />
        <TradeRelatedDocuments :items="relationDocuments" />
        <slot name="aside"></slot>
      </template>
    </TradeDetailLayout>
  </div>
  <Empty v-else description="合同详情暂不可用" />
</template>

<style scoped>
.contract-order-detail {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.contract-order-detail__hero,
.contract-order-detail__section {
  background: #fff;
  border: 1px solid #e5eaf1;
  border-radius: 5px;
}

.contract-order-detail__hero {
  padding: 15px 18px;
}

.contract-order-detail__eyebrow {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 12px;
  color: #64748b;
}

.contract-order-detail__hero h2 {
  margin: 8px 0 4px;
  font-size: 20px;
  color: #172033;
}

.contract-order-detail__hero p {
  margin: 0;
  color: #64748b;
}

.contract-order-detail__section {
  padding: 16px 18px 18px;
}

.contract-order-detail__section h3 {
  display: flex;
  gap: 8px;
  align-items: center;
  margin: 0 0 14px;
  font-size: 14px;
  color: #172033;
}

.contract-order-detail__section h3::before {
  width: 3px;
  height: 15px;
  content: '';
  background: #1677ff;
  border-radius: 2px;
}

.contract-order-detail__section-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.contract-order-detail__section-title > span:not(.ant-tag) {
  font-size: 12px;
  color: #94a3b8;
}

.contract-order-detail__constraint-alert {
  margin-bottom: 12px;
}

.contract-order-detail__requirement-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.contract-order-detail__product-name {
  display: flex;
  flex-direction: column;
  gap: 5px;
  align-items: flex-start;
}

.contract-order-detail__amounts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.contract-order-detail__amounts > div {
  display: flex;
  flex-direction: column;
  gap: 7px;
  justify-content: center;
  min-height: 70px;
  padding: 12px 14px;
  background: #f8fafc;
  border: 1px solid #e5eaf1;
  border-radius: 4px;
}

.contract-order-detail__amounts span {
  font-size: 12px;
  color: #64748b;
}

.contract-order-detail__amounts strong {
  font-size: 15px;
  color: #172033;
}

.contract-order-detail__amounts .contract-order-detail__amount-total {
  color: #fff;
  background: #0f4c81;
  border-color: #0f4c81;
}

.contract-order-detail__amount-total span,
.contract-order-detail__amount-total strong {
  color: #fff;
}

.contract-order-detail__amount-total strong {
  font-size: 19px;
}

.contract-order-detail__formula {
  padding: 9px 12px;
  margin: 12px 0 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  color: #64748b;
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
  border-radius: 4px;
}

.contract-order-detail__remark {
  margin-bottom: 0;
  white-space: pre-wrap;
}

.contract-order-detail__audit {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
  padding: 0 4px 12px;
  font-size: 12px;
  color: #94a3b8;
}

@media (max-width: 850px) {
  .contract-order-detail__amounts {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .contract-order-detail__hero,
  .contract-order-detail__section-title {
    flex-direction: column;
    align-items: flex-start;
  }

  .contract-order-detail__amounts {
    grid-template-columns: 1fr;
  }
}
</style>
