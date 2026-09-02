<script lang="ts" setup>
import type { FdmWaimaoReceiptRecordApi } from '#/api/fdmwaimao/receipt-record';
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
} from '#/views/fdm-trade-shared/document-links';

import { formatAmount } from '../calculation';

defineOptions({ name: 'FdmWaimaoReceiptRecordDetailContent' });

const props = defineProps<{
  record?:
    | FdmWaimaoReceiptRecordApi.ConsumptionRecord
    | FdmWaimaoReceiptRecordApi.ReceiptRecord;
  type: FdmWaimaoReceiptRecordApi.RecordType;
}>();
const { hasAccessByCodes } = useAccess();

const isConsumption = computed(() => props.type === 'consumption');
const receipt = computed(() =>
  isConsumption.value
    ? undefined
    : (props.record as FdmWaimaoReceiptRecordApi.ReceiptRecord | undefined),
);
const consumption = computed(() =>
  isConsumption.value
    ? (props.record as FdmWaimaoReceiptRecordApi.ConsumptionRecord | undefined)
    : undefined,
);
const number = computed(
  () => consumption.value?.consumptionNo ?? receipt.value?.receiptNo ?? '—',
);
const businessDate = computed(
  () => consumption.value?.consumptionDate ?? receipt.value?.receiptDate ?? '—',
);
const originalAmount = computed(
  () => consumption.value?.amount ?? receipt.value?.arrivalAmount ?? '0',
);
const amountCny = computed(
  () => consumption.value?.amountCny ?? receipt.value?.receiptAmountCny ?? '0',
);
const canQueryContract = computed(() =>
  hasAccessByCodes(['fdmwaimao:contract-order:query']),
);
const canQueryCustomer = computed(() =>
  hasAccessByCodes(['fdmwaimao:customer:query']),
);

const summaryMetrics = computed<TradeSummaryMetric[]>(() => {
  const record = props.record;
  if (!record) return [];
  return [
    {
      key: 'original',
      label: isConsumption.value ? '消费金额' : '到款金额',
      value: `${record.currency} ${formatAmount(originalAmount.value)}`,
    },
    {
      key: 'cny',
      label: '折合人民币',
      value: `CNY ${formatAmount(amountCny.value)}`,
    },
    {
      key: 'allocated',
      label: '冲销合同金额',
      value: `${record.contractCurrency} ${formatAmount(record.allocatedContractAmount)}`,
    },
    {
      key: 'rate',
      label: '兑人民币汇率',
      value: String(record.currencyToCnyRate),
    },
    { key: 'date', label: '业务日期', value: businessDate.value },
    {
      key: 'status',
      label: '记录状态',
      tone: record.status === 'VOIDED' ? 'danger' : 'success',
      value: record.status === 'VOIDED' ? '已作废' : '有效',
    },
  ];
});

const relationDocuments = computed<TradeRelationLink[]>(() => {
  const record = props.record;
  if (!record) return [];
  const canQueryCurrentList = hasAccessByCodes([
    isConsumption.value
      ? 'fdmwaimao:consumption-record:query'
      : 'fdmwaimao:receipt-record:query',
  ]);
  return [
    {
      disabled: !canQueryContract.value,
      icon: 'lucide:file-signature',
      key: `contract-${record.orderId}`,
      label: record.orderNo,
      meta: record.orderSubject,
      to: canQueryContract.value
        ? fdmTradeDocumentRoute('contract-order', record.orderId)
        : undefined,
      type: '合同订单',
    },
    {
      disabled: !canQueryCustomer.value,
      icon: 'lucide:building-2',
      key: `customer-${record.customerId}`,
      label: record.customerName,
      meta: record.companyName,
      to: canQueryCustomer.value
        ? fdmTradeDocumentRoute('customer', record.customerId)
        : undefined,
      type: '交易客户',
    },
    {
      disabled: !canQueryCurrentList,
      icon: isConsumption.value ? 'lucide:badge-minus' : 'lucide:landmark',
      key: `settlements-${record.orderId}`,
      label: isConsumption.value ? '查看合同消费 / 冲销' : '查看合同回款',
      meta: '按来源合同筛选全部同类记录',
      to: canQueryCurrentList
        ? fdmTradeReceiptListRoute({
            orderId: record.orderId,
            type: props.type,
          })
        : undefined,
      type: isConsumption.value ? '消费记录' : '回款记录',
    },
  ];
});

function display(value: null | string | undefined) {
  return value || '—';
}

function formatDateTime(value: null | number | string | undefined) {
  if (value === null || value === undefined || value === '') return '—';
  const parsed = dayjs(value);
  return parsed.isValid()
    ? parsed.format('YYYY-MM-DD HH:mm:ss')
    : String(value);
}

function invoiceLabel(value: FdmWaimaoReceiptRecordApi.InvoiceStatus) {
  if (value === 'INVOICED') return '已开票';
  if (value === 'NOT_REQUIRED') return '无需开票';
  return '未开票';
}

function consumptionLabel(value: FdmWaimaoReceiptRecordApi.ConsumptionType) {
  if (value === 'CUSTOMER_BALANCE') return '客户余额消费';
  if (value === 'WAIVER') return '审核减免 / 坏账';
  return '其他合法冲销';
}
</script>

<template>
  <div v-if="record" class="receipt-detail">
    <Alert
      v-if="record.status === 'VOIDED'"
      :description="record.voidReason || '未填写作废原因'"
      message="该记录已作废，不再参与合同金额聚合"
      show-icon
      type="error"
    />

    <section class="receipt-detail__hero">
      <div>
        <div class="receipt-detail__eyebrow">
          <Tag :color="isConsumption ? 'purple' : 'green'">
            {{ isConsumption ? '消费结算' : '真实到账' }}
          </Tag>
          <Tag :color="record.status === 'VOIDED' ? 'error' : 'success'">
            {{ record.status === 'VOIDED' ? '已作废' : '有效' }}
          </Tag>
          <span>{{ number }}</span>
        </div>
        <h2>
          <TradeBusinessLink
            :disabled="!canQueryContract"
            :to="
              canQueryContract
                ? fdmTradeDocumentRoute('contract-order', record.orderId)
                : undefined
            "
          >
            {{ record.orderNo }}
          </TradeBusinessLink>
        </h2>
        <p>
          <TradeBusinessLink
            :disabled="!canQueryCustomer"
            :to="
              canQueryCustomer
                ? fdmTradeDocumentRoute('customer', record.customerId)
                : undefined
            "
          >
            {{ record.customerName }}
          </TradeBusinessLink>
          · {{ record.orderSubject }}
        </p>
      </div>
      <div class="receipt-detail__hero-amount">
        <span>{{ isConsumption ? '消费金额' : '到款金额' }}</span>
        <strong>{{ record.currency }} {{ formatAmount(originalAmount) }}</strong>
        <small>CNY {{ formatAmount(amountCny) }}</small>
      </div>
    </section>

    <TradeDetailLayout>
      <section class="receipt-detail__section">
        <h3>关联订单</h3>
        <Descriptions
          bordered
          :column="{ lg: 3, md: 2, sm: 1, xs: 1 }"
          size="small"
        >
          <Descriptions.Item label="合同单号">
            <TradeBusinessLink
              :disabled="!canQueryContract"
              :to="
                canQueryContract
                  ? fdmTradeDocumentRoute('contract-order', record.orderId)
                  : undefined
              "
            >
              {{ record.orderNo }}
            </TradeBusinessLink>
          </Descriptions.Item>
          <Descriptions.Item label="合同主题">
            {{ record.orderSubject }}
          </Descriptions.Item>
          <Descriptions.Item label="对应客户">
            <TradeBusinessLink
              :disabled="!canQueryCustomer"
              :to="
                canQueryCustomer
                  ? fdmTradeDocumentRoute('customer', record.customerId)
                  : undefined
              "
            >
              {{ record.customerName }}
            </TradeBusinessLink>
          </Descriptions.Item>
          <Descriptions.Item label="订单所属公司">
            {{ record.companyName }}
          </Descriptions.Item>
          <Descriptions.Item label="负责人">
            {{ display(record.ownerUserName) }}
          </Descriptions.Item>
          <Descriptions.Item label="负责部门">
            {{ display(record.ownerDeptName) }}
          </Descriptions.Item>
          <Descriptions.Item v-if="receipt" label="对应项目">
            {{ display(receipt.projectText) }}
          </Descriptions.Item>
          <Descriptions.Item label="合同币种">
            {{ record.contractCurrency }}
          </Descriptions.Item>
          <Descriptions.Item label="冲销到合同金额">
            {{ record.contractCurrency }}
            {{ formatAmount(record.allocatedContractAmount) }}
          </Descriptions.Item>
        </Descriptions>
      </section>

      <section class="receipt-detail__section">
        <h3>{{ isConsumption ? '消费资料' : '回款资料' }}</h3>
        <Descriptions
          bordered
          :column="{ lg: 3, md: 2, sm: 1, xs: 1 }"
          size="small"
        >
          <Descriptions.Item :label="isConsumption ? '消费日期' : '回款日期'">
            {{ businessDate }}
          </Descriptions.Item>
          <Descriptions.Item v-if="receipt" label="期次">
            {{ display(receipt.installmentLabel) }}
          </Descriptions.Item>
          <Descriptions.Item v-if="receipt" label="到款方式">
            {{ receipt.receiptMethod }}
          </Descriptions.Item>
          <Descriptions.Item v-if="receipt" label="付款方式">
            {{ display(receipt.paymentMethod) }}
          </Descriptions.Item>
          <Descriptions.Item v-if="receipt" label="付款方">
            {{ display(receipt.payerName) }}
          </Descriptions.Item>
          <Descriptions.Item v-if="receipt" label="开票状态">
            {{ invoiceLabel(receipt.invoiceStatus) }}
          </Descriptions.Item>
          <Descriptions.Item v-if="receipt" label="分类">
            {{ display(receipt.category) }}
          </Descriptions.Item>
          <Descriptions.Item v-if="consumption" label="消费类型">
            {{ consumptionLabel(consumption.consumptionType) }}
          </Descriptions.Item>
          <Descriptions.Item v-if="consumption" label="消费原因" :span="2">
            {{ consumption.reason }}
          </Descriptions.Item>
        </Descriptions>
      </section>

      <section class="receipt-detail__section">
        <div class="receipt-detail__section-title">
          <h3>汇率快照</h3>
          <Tag :color="record.rateFallbackUsed ? 'warning' : 'blue'">
            {{ record.rateFallbackUsed ? '沿用最近交易日' : '当日汇率' }}
          </Tag>
        </div>
        <Alert
          description="统一口径为 1 单位外币 = X CNY；ECB 统计折算仅用于内部统计，不代表银行实际结售汇价格。"
          message="汇率证据已随记录冻结，后续汇率中心更新不会改写本记录"
          show-icon
          type="info"
        />
        <div class="receipt-detail__rate-grid">
          <div>
            <span>业务日期</span>
            <strong>{{ businessDate }}</strong>
          </div>
          <div>
            <span>实际汇率日期</span>
            <strong>{{ record.rateDate }}</strong>
          </div>
          <div>
            <span>{{ record.currency }} 兑 CNY</span>
            <strong>1 {{ record.currency }} =
              {{ record.currencyToCnyRate }} CNY</strong>
          </div>
          <div>
            <span>{{ record.contractCurrency }} 兑 CNY</span>
            <strong>1 {{ record.contractCurrency }} =
              {{ record.contractCurrencyToCnyRate }} CNY</strong>
          </div>
          <div>
            <span>汇率来源</span>
            <strong>{{ record.rateSource }}</strong>
          </div>
          <div>
            <span>获取时间</span>
            <strong>{{ formatDateTime(record.rateRetrievedAt) }}</strong>
          </div>
        </div>
      </section>

      <section v-if="receipt" class="receipt-detail__section">
        <h3>财务归类</h3>
        <Descriptions
          bordered
          :column="{ lg: 2, md: 2, sm: 1, xs: 1 }"
          size="small"
        >
          <Descriptions.Item label="计业绩金额（未税）">
            {{
              receipt.performanceAmountCny
                ? `CNY ${formatAmount(receipt.performanceAmountCny)}`
                : '—'
            }}
          </Descriptions.Item>
          <Descriptions.Item label="外币备注">
            {{ display(receipt.foreignCurrencyRemark) }}
          </Descriptions.Item>
          <Descriptions.Item label="计业绩备注" :span="2">
            {{ display(receipt.performanceRemark) }}
          </Descriptions.Item>
        </Descriptions>
      </section>

      <section class="receipt-detail__section">
        <h3>备注</h3>
        <TypographyParagraph class="receipt-detail__remark">
          {{ record.remark || '暂无备注' }}
        </TypographyParagraph>
      </section>

      <section class="receipt-detail__audit">
        <span>创建时间：{{ formatDateTime(record.createTime) }}</span>
        <span>更新时间：{{ formatDateTime(record.updateTime) }}</span>
        <span v-if="record.voidedAt">
          作废时间：{{ formatDateTime(record.voidedAt) }}
        </span>
        <span>版本：{{ record.version }}</span>
      </section>

      <template #aside>
        <TradeSummaryPanel :metrics="summaryMetrics" />
        <TradeRelatedDocuments :items="relationDocuments" />
      </template>
    </TradeDetailLayout>
  </div>
  <Empty v-else description="记录详情暂不可用" />
</template>

<style scoped>
.receipt-detail {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.receipt-detail__hero,
.receipt-detail__section {
  background: #fff;
  border: 1px solid #e5eaf1;
  border-radius: 5px;
}

.receipt-detail__hero {
  display: flex;
  gap: 24px;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px;
  background: #fff;
}

.receipt-detail__eyebrow {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  font-size: 12px;
  color: #64748b;
}

.receipt-detail__hero h2 {
  margin: 8px 0 4px;
  font-size: 20px;
  color: #172033;
}

.receipt-detail__hero p {
  margin: 0;
  color: #64748b;
}

.receipt-detail__hero-amount {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-end;
  white-space: nowrap;
}

.receipt-detail__hero-amount span,
.receipt-detail__hero-amount small,
.receipt-detail__rate-grid span {
  font-size: 12px;
  color: #64748b;
}

.receipt-detail__hero-amount strong {
  font-size: 23px;
  color: #172033;
}

.receipt-detail__section {
  padding: 16px 18px 18px;
}

.receipt-detail__section h3 {
  display: flex;
  gap: 8px;
  align-items: center;
  margin: 0 0 14px;
  font-size: 14px;
  color: #172033;
}

.receipt-detail__section h3::before {
  width: 3px;
  height: 15px;
  content: '';
  background: #1677ff;
  border-radius: 2px;
}

.receipt-detail__section-title {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.receipt-detail__rate-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 12px;
}

.receipt-detail__rate-grid > div {
  display: flex;
  flex-direction: column;
  gap: 6px;
  justify-content: center;
  min-height: 68px;
  padding: 10px 12px;
  background: #f8fafc;
  border: 1px solid #e5eaf1;
  border-radius: 4px;
}

.receipt-detail__rate-grid strong {
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

.receipt-detail__remark {
  margin-bottom: 0;
  white-space: pre-wrap;
}

.receipt-detail__audit {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
  padding: 0 4px 12px;
  font-size: 12px;
  color: #94a3b8;
}

@media (max-width: 850px) {
  .receipt-detail__rate-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .receipt-detail__hero {
    flex-direction: column;
    align-items: flex-start;
  }

  .receipt-detail__hero-amount {
    align-items: flex-start;
  }

  .receipt-detail__rate-grid {
    grid-template-columns: 1fr;
  }
}
</style>
