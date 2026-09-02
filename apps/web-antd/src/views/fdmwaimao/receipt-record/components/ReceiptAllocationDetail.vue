<script lang="ts" setup>
import type { ColumnsType } from 'ant-design-vue/es/table';

import type { FdmWaimaoReceiptAllocationApi } from '#/api/fdmwaimao/receipt-allocation';

import {
  Alert,
  Descriptions,
  Table,
  Tag,
  TypographyText,
} from 'ant-design-vue';
import BigNumber from 'bignumber.js';
import dayjs from 'dayjs';

defineOptions({ name: 'FdmWaimaoReceiptAllocationDetail' });

const props = defineProps<{
  allocation?: FdmWaimaoReceiptAllocationApi.Allocation;
}>();

const columns: ColumnsType<FdmWaimaoReceiptAllocationApi.AllocationLine> = [
  { key: 'order', title: '合同订单', width: 220 },
  { key: 'source', title: '到账原币占用', width: 145 },
  { key: 'cny', title: '人民币换算', width: 160 },
  { key: 'contract', title: '冲销合同币金额', width: 170 },
  { key: 'rate', title: '冻结汇率证据', width: 240 },
  { key: 'origin', title: '字段来源', width: 110 },
  { dataIndex: 'reason', key: 'reason', title: '说明', width: 210 },
];

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

function statusMeta(status: FdmWaimaoReceiptAllocationApi.AllocationStatus) {
  const map = {
    APPLIED: { color: 'green', label: '已应用' },
    CANCELLED: { color: 'default', label: '已取消' },
    DRAFT: { color: 'blue', label: '草稿' },
    VOIDED: { color: 'default', label: '已作废' },
  } as const;
  return map[status];
}

function shortHash(value: string) {
  return value.length > 18 ? `${value.slice(0, 10)}…${value.slice(-6)}` : value;
}
</script>

<template>
  <div v-if="allocation" class="allocation-detail">
    <Alert
      :description="
        allocation.status === 'DRAFT'
          ? '草稿金额仍未计入合同已收。应用时服务端会锁定银行到账与全部合同，再验证版本、余额、应收和每行汇率快照。'
          : '下列原币、人民币、合同币与舍入调整是服务端冻结证据；浏览器仅展示，不参与计算。'
      "
      :message="
        allocation.status === 'DRAFT'
          ? '等待应用的财务草稿'
          : '已冻结的财务分配证据'
      "
      show-icon
      type="info"
    />

    <section class="allocation-detail__hero">
      <div>
        <span>分配原币合计</span>
        <strong>{{
          money(allocation.totalSourceAmount, allocation.sourceCurrency)
        }}</strong>
      </div>
      <div>
        <span>合同数量</span>
        <strong>{{ allocation.lines.length }}</strong>
      </div>
      <div>
        <span>建立方式</span>
        <strong>{{
          allocation.creationMode === 'AI' ? 'AI 建议物化' : '人工建立'
        }}</strong>
      </div>
    </section>

    <Descriptions bordered :column="2" size="small" title="分配身份">
      <Descriptions.Item label="分配编号">
        {{ allocation.allocationNo }}
      </Descriptions.Item>
      <Descriptions.Item label="状态">
        <Tag :color="statusMeta(allocation.status).color">
          {{ statusMeta(allocation.status).label }}
        </Tag>
      </Descriptions.Item>
      <Descriptions.Item label="所属公司">
        {{ allocation.companyName }}
      </Descriptions.Item>
      <Descriptions.Item label="对应客户">
        {{ allocation.customerName }}
      </Descriptions.Item>
      <Descriptions.Item label="银行到账 ID">
        {{ allocation.bankReceiptId }}
      </Descriptions.Item>
      <Descriptions.Item label="到账冻结版本">
        V{{ allocation.bankReceiptVersionSnapshot }}
      </Descriptions.Item>
      <Descriptions.Item label="应用时间">
        {{ formatDateTime(allocation.appliedAt) }}
      </Descriptions.Item>
      <Descriptions.Item label="作废时间">
        {{ formatDateTime(allocation.voidedAt) }}
      </Descriptions.Item>
      <Descriptions.Item label="备注" :span="2">
        {{ allocation.remark || '—' }}
      </Descriptions.Item>
    </Descriptions>

    <Descriptions
      v-if="allocation.creationMode === 'AI'"
      bordered
      :column="2"
      size="small"
      title="AI 来源"
    >
      <Descriptions.Item label="生成任务">
        {{ allocation.generationRunId }}
      </Descriptions.Item>
      <Descriptions.Item label="生成任务版本">
        {{ allocation.generationRunVersion }}
      </Descriptions.Item>
      <Descriptions.Item label="提案版本">
        {{ allocation.generationProposalVersion }}
      </Descriptions.Item>
      <Descriptions.Item label="模型 ID">
        {{ allocation.generationModelId }}
      </Descriptions.Item>
    </Descriptions>

    <section>
      <h3>合同分配明细</h3>
      <Table
        :columns="columns"
        :data-source="allocation.lines"
        :pagination="false"
        row-key="id"
        :scroll="{ x: 1255 }"
        size="small"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'order'">
            <div class="allocation-detail__stack">
              <strong>{{ record.orderNo }}</strong>
              <TypographyText
                :ellipsis="{ tooltip: record.orderSubject }"
                type="secondary"
              >
                {{ record.orderSubject }}
              </TypographyText>
            </div>
          </template>
          <template v-else-if="column.key === 'source'">
            <strong>{{
              money(record.sourceAmount, allocation.sourceCurrency)
            }}</strong>
          </template>
          <template v-else-if="column.key === 'cny'">
            <div class="allocation-detail__stack">
              <strong>{{ money(record.amountCny, 'CNY') }}</strong>
              <span
                v-if="!new BigNumber(record.roundingAdjustmentCny).isZero()"
              >
                舍入调整 {{ record.roundingAdjustmentCny }}
              </span>
            </div>
          </template>
          <template v-else-if="column.key === 'contract'">
            <strong>
              {{
                money(record.allocatedContractAmount, record.contractCurrency)
              }}
            </strong>
          </template>
          <template v-else-if="column.key === 'rate'">
            <div class="allocation-detail__stack">
              <strong>
                {{ allocation.sourceCurrency }}→CNY
                {{ record.sourceCurrencyToCnyRate }}
              </strong>
              <span>
                {{ record.contractCurrency }}→CNY
                {{ record.contractCurrencyToCnyRate }}
              </span>
              <span>
                {{ record.rateDate }} · {{ record.rateSource }}
                <Tag v-if="record.rateFallbackUsed" color="orange">回退</Tag>
              </span>
              <TypographyText :title="record.rateSnapshotHash" type="secondary">
                证据 {{ shortHash(record.rateSnapshotHash) }}
              </TypographyText>
            </div>
          </template>
          <template v-else-if="column.key === 'origin'">
            <Tag :color="record.fieldOrigin.includes('AI') ? 'purple' : 'blue'">
              {{
                record.fieldOrigin.includes('AI') ? 'AI 建议采用' : '人工输入'
              }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'reason'">
            {{ record.reason || '—' }}
          </template>
        </template>
      </Table>
    </section>
  </div>
  <div v-else class="allocation-detail__empty">请选择到账分配单</div>
</template>

<style scoped>
.allocation-detail {
  display: grid;
  gap: 18px;
}

.allocation-detail__hero {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.allocation-detail__hero > div {
  padding: 16px;
  background: #f6f8fb;
  border: 1px solid #eef1f5;
  border-radius: 10px;
}

.allocation-detail__hero span,
.allocation-detail__stack span,
.allocation-detail__stack :deep(.ant-typography) {
  font-size: 12px;
  color: #64748b;
}

.allocation-detail__hero strong {
  display: block;
  margin-top: 6px;
  font-size: 19px;
  color: #0f4c81;
}

.allocation-detail h3 {
  margin: 0 0 10px;
  font-size: 15px;
}

.allocation-detail__stack {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.allocation-detail__empty {
  padding: 60px 16px;
  color: #94a3b8;
  text-align: center;
}

@media (max-width: 720px) {
  .allocation-detail__hero {
    grid-template-columns: 1fr;
  }
}
</style>
