<script lang="ts" setup>
import type { FdmWaimaoBankReceiptApi } from '#/api/fdmwaimao/bank-receipt';

import { Alert, Descriptions, Progress, Tag } from 'ant-design-vue';
import BigNumber from 'bignumber.js';
import dayjs from 'dayjs';

defineOptions({ name: 'FdmWaimaoBankReceiptDetail' });

const props = defineProps<{
  receipt?: FdmWaimaoBankReceiptApi.BankReceipt;
}>();

function money(value?: null | string, currency = '') {
  if (value === null || value === undefined || value === '') return '—';
  return `${currency ? `${currency} ` : ''}${new BigNumber(value).toFormat(2)}`;
}

function formatDateTime(value?: null | number | string) {
  if (value === null || value === undefined || value === '') return '—';
  const parsed = dayjs(value);
  return parsed.isValid()
    ? parsed.format('YYYY-MM-DD HH:mm:ss')
    : String(value);
}

function allocationPercent() {
  const receipt = props.receipt;
  if (!receipt || new BigNumber(receipt.arrivalAmount).lte(0)) return 0;
  return BigNumber.minimum(
    100,
    new BigNumber(receipt.allocatedAmount)
      .div(receipt.arrivalAmount)
      .times(100),
  ).toNumber();
}

function stateMeta(state: FdmWaimaoBankReceiptApi.AllocationState) {
  if (state === 'FULL') return { color: 'green', label: '已全额分配' };
  if (state === 'PARTIAL') return { color: 'blue', label: '部分分配' };
  return { color: 'default', label: '未分配' };
}
</script>

<template>
  <div v-if="receipt" class="bank-receipt-detail">
    <Alert
      description="该汇率快照、人民币金额和分配余额均来自服务端。已有分配后，到账金额、币种、日期与汇率证据不可修改。"
      message="服务端冻结的银行到账事实"
      show-icon
      type="info"
    />

    <section class="bank-receipt-detail__hero">
      <div>
        <span>原币到账</span>
        <strong>{{ money(receipt.arrivalAmount, receipt.currency) }}</strong>
      </div>
      <div>
        <span>折人民币</span>
        <strong>{{ money(receipt.arrivalAmountCny, 'CNY') }}</strong>
      </div>
      <div>
        <span>可分配余额</span>
        <strong>{{ money(receipt.remainingAmount, receipt.currency) }}</strong>
      </div>
    </section>

    <section class="bank-receipt-detail__progress">
      <div>
        <strong>合同分配进度</strong>
        <Tag :color="stateMeta(receipt.allocationState).color">
          {{ stateMeta(receipt.allocationState).label }}
        </Tag>
      </div>
      <Progress :percent="allocationPercent()" :show-info="false" />
      <small>
        已分配 {{ money(receipt.allocatedAmount, receipt.currency) }}，剩余
        {{ money(receipt.remainingAmount, receipt.currency) }}
      </small>
    </section>

    <Descriptions bordered :column="2" size="small" title="到账身份">
      <Descriptions.Item label="到账编号">
        {{ receipt.receiptNo }}
      </Descriptions.Item>
      <Descriptions.Item label="状态">
        <Tag :color="receipt.status === 'ACTIVE' ? 'green' : 'default'">
          {{ receipt.status === 'ACTIVE' ? '有效' : '已作废' }}
        </Tag>
      </Descriptions.Item>
      <Descriptions.Item label="所属公司">
        {{ receipt.companyName }}
      </Descriptions.Item>
      <Descriptions.Item label="对应客户">
        {{ receipt.customerName || '未关联客户' }}
      </Descriptions.Item>
      <Descriptions.Item label="来源系统">
        {{ receipt.sourceSystem }}
      </Descriptions.Item>
      <Descriptions.Item label="外部唯一编号">
        {{ receipt.externalReceiptKey }}
      </Descriptions.Item>
      <Descriptions.Item label="付款方">
        {{ receipt.payerNameMasked || '—' }}
      </Descriptions.Item>
      <Descriptions.Item label="付款账号">
        {{ receipt.payerAccountMasked || '—' }}
      </Descriptions.Item>
    </Descriptions>

    <Descriptions bordered :column="2" size="small" title="冻结汇率快照">
      <Descriptions.Item label="到账日期">
        {{ receipt.receiptDate }}
      </Descriptions.Item>
      <Descriptions.Item label="实际汇率日">
        {{ receipt.rateDate }}
      </Descriptions.Item>
      <Descriptions.Item label="原币兑 CNY">
        1 {{ receipt.currency }} = {{ receipt.currencyToCnyRate }} CNY
      </Descriptions.Item>
      <Descriptions.Item label="汇率来源">
        {{ receipt.rateSource }}
      </Descriptions.Item>
      <Descriptions.Item label="取数时间">
        {{ formatDateTime(receipt.rateRetrievedAt) }}
      </Descriptions.Item>
      <Descriptions.Item label="是否回退">
        <Tag :color="receipt.rateFallbackUsed ? 'orange' : 'green'">
          {{ receipt.rateFallbackUsed ? '使用最近可用汇率' : '当日汇率' }}
        </Tag>
      </Descriptions.Item>
    </Descriptions>

    <Descriptions bordered :column="1" size="small" title="其他信息">
      <Descriptions.Item label="备注">
        {{ receipt.remark || '—' }}
      </Descriptions.Item>
      <Descriptions.Item label="创建时间">
        {{ formatDateTime(receipt.createTime) }}
      </Descriptions.Item>
      <Descriptions.Item label="数据版本">
        {{ receipt.version }}
      </Descriptions.Item>
    </Descriptions>
  </div>
  <div v-else class="bank-receipt-detail__empty">请选择银行到账</div>
</template>

<style scoped>
.bank-receipt-detail {
  display: grid;
  gap: 18px;
}

.bank-receipt-detail__hero {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.bank-receipt-detail__hero > div,
.bank-receipt-detail__progress {
  padding: 16px;
  background: #f6f8fb;
  border: 1px solid #eef1f5;
  border-radius: 10px;
}

.bank-receipt-detail__hero span,
.bank-receipt-detail__progress small {
  font-size: 12px;
  color: #64748b;
}

.bank-receipt-detail__hero strong {
  display: block;
  margin-top: 6px;
  font-size: 20px;
  color: #0f4c81;
}

.bank-receipt-detail__progress > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.bank-receipt-detail :deep(.ant-descriptions-title) {
  margin-bottom: 10px;
}

.bank-receipt-detail__empty {
  padding: 60px 16px;
  color: #94a3b8;
  text-align: center;
}

@media (max-width: 720px) {
  .bank-receipt-detail__hero {
    grid-template-columns: 1fr;
  }

  .bank-receipt-detail :deep(.ant-descriptions-view table) {
    table-layout: auto;
  }
}
</style>
