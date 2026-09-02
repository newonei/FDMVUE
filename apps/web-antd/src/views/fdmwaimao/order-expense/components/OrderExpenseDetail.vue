<script lang="ts" setup>
import type { ColumnsType } from 'ant-design-vue/es/table';

import type { FdmWaimaoOrderExpenseApi } from '#/api/fdmwaimao/order-expense';

import { computed } from 'vue';

import {
  Alert,
  Card,
  Descriptions,
  DescriptionsItem,
  Empty,
  Space,
  Table,
  Tag,
  Timeline,
  TimelineItem,
  TypographyText,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import FdmWaimaoAttachmentList from '#/views/fdmwaimao/components/FdmWaimaoAttachmentList.vue';

defineOptions({ name: 'FdmWaimaoOrderExpenseDetail' });

const props = defineProps<{
  expense?: FdmWaimaoOrderExpenseApi.Expense;
}>();

const lineColumns: ColumnsType<FdmWaimaoOrderExpenseApi.ExpenseLine> = [
  { dataIndex: 'lineNo', key: 'lineNo', title: '#', width: 54 },
  { dataIndex: 'categoryName', key: 'category', title: '费用分类', width: 180 },
  {
    dataIndex: 'description',
    key: 'description',
    title: '费用说明',
    width: 260,
  },
  { dataIndex: 'evidenceRef', key: 'evidence', title: '前置证据', width: 220 },
  { dataIndex: 'amount', key: 'amount', title: '原币金额', width: 130 },
  { dataIndex: 'amountCny', key: 'amountCny', title: '折人民币', width: 130 },
];

const missingAmount = computed(() =>
  props.expense?.lines.some(
    (item) => item.amountOrigin === 'MISSING' || item.amount === null,
  ),
);

function statusMeta(status?: FdmWaimaoOrderExpenseApi.ExpenseStatus) {
  const map: Record<string, { color: string; label: string }> = {
    APPROVED: { color: 'green', label: '已审核' },
    CANCELLED: { color: 'default', label: '已取消' },
    DRAFT: { color: 'blue', label: '草稿' },
    REJECTED: { color: 'red', label: '已驳回' },
    SUBMITTED: { color: 'gold', label: '待审核' },
    VOIDED: { color: 'default', label: '已作废' },
  };
  return map[status ?? ''] ?? { color: 'default', label: status ?? '—' };
}

function sourceLabel(type?: FdmWaimaoOrderExpenseApi.SourceType) {
  return type === 'FDM_WAIMAO_SHIPMENT' ? '发货计划' : '合同订单';
}

function money(value?: null | string, currency = '') {
  if (value === null || value === undefined || value === '') return '待填写';
  return `${currency ? `${currency} ` : ''}${value}`;
}

function dateTime(value?: null | number | string) {
  if (value === null || value === undefined || value === '') return '—';
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : String(value);
}

function operationLabel(value: string) {
  const labels: Record<string, string> = {
    APPROVE: '审核通过',
    CANCEL: '取消',
    MATERIALIZE: 'AI 建立草稿',
    REJECT: '驳回',
    REOPEN: '重新打开',
    SUBMIT: '提交审核',
    UPDATE: '补录费用金额',
    VOID: '作废',
  };
  return labels[value] ?? value;
}
</script>

<template>
  <Empty v-if="!expense" description="未读取到费用详情" />
  <div v-else class="expense-detail">
    <section class="expense-detail-hero">
      <div>
        <Space>
          <h2>{{ expense.expenseNo }}</h2>
          <Tag :color="statusMeta(expense.status).color">
            {{ statusMeta(expense.status).label }}
          </Tag>
          <Tag color="purple">
            {{ expense.creationMode === 'AI' ? 'AI 分类' : '人工建立' }}
          </Tag>
        </Space>
        <p>
          {{ sourceLabel(expense.sourceType) }} {{ expense.sourceNo }} ·
          {{
            expense.sourceSubject || expense.customerName || '未命名业务单据'
          }}
        </p>
      </div>
      <div class="expense-total">
        <small>费用合计</small>
        <strong>{{
          money(expense.totalAmount, expense.currency || '')
        }}</strong>
        <span>折人民币 {{ money(expense.totalAmountCny, 'CNY') }}</span>
      </div>
    </section>

    <Alert
      v-if="missingAmount"
      description="AI 只识别了费用分类与前置证据，尚未形成财务事实。请补录费用日期、币种和每行原币金额。"
      message="费用金额仍待人工确认"
      show-icon
      type="warning"
    />

    <div class="expense-detail-grid">
      <Card size="small" title="基础与来源">
        <Descriptions :column="2" size="small">
          <DescriptionsItem label="订单费用编号">
            {{ expense.expenseNo }}
          </DescriptionsItem>
          <DescriptionsItem label="状态">
            <Tag :color="statusMeta(expense.status).color">
              {{ statusMeta(expense.status).label }}
            </Tag>
          </DescriptionsItem>
          <DescriptionsItem label="所属公司">
            {{ expense.companyName || expense.companyId }}
          </DescriptionsItem>
          <DescriptionsItem label="对应客户">
            {{ expense.customerName || expense.customerId || '—' }}
          </DescriptionsItem>
          <DescriptionsItem label="来源类型">
            {{ sourceLabel(expense.sourceType) }}
          </DescriptionsItem>
          <DescriptionsItem label="来源单号">
            {{ expense.sourceNo }}
          </DescriptionsItem>
          <DescriptionsItem label="合同订单">
            {{ expense.contractOrderNo || '—' }}
          </DescriptionsItem>
          <DescriptionsItem label="来源版本">
            {{ expense.sourceVersion }}
          </DescriptionsItem>
        </Descriptions>
      </Card>

      <Card size="small" title="金额与汇率快照">
        <Descriptions :column="2" size="small">
          <DescriptionsItem label="费用日期">
            {{ expense.expenseDate || '待填写' }}
          </DescriptionsItem>
          <DescriptionsItem label="币种">
            {{ expense.currency || '待填写' }}
          </DescriptionsItem>
          <DescriptionsItem label="实际汇率日">
            {{ expense.rateDate || '待计算' }}
          </DescriptionsItem>
          <DescriptionsItem label="兑人民币汇率">
            {{ expense.currencyToCnyRate || '待计算' }}
          </DescriptionsItem>
          <DescriptionsItem label="汇率来源">
            {{ expense.rateSource || '待计算' }}
          </DescriptionsItem>
          <DescriptionsItem label="日期回退">
            <Tag v-if="expense.rateFallbackUsed === true" color="orange">
              已回退
            </Tag>
            <Tag v-else-if="expense.rateFallbackUsed === false" color="green">
              当日汇率
            </Tag>
            <span v-else>待计算</span>
          </DescriptionsItem>
        </Descriptions>
      </Card>
    </div>

    <Card size="small" title="费用明细">
      <Table
        :columns="lineColumns"
        :data-source="expense.lines"
        :pagination="false"
        row-key="id"
        size="small"
        :scroll="{ x: 980 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'category'">
            <strong>{{ record.categoryName }}</strong>
            <br />
            <TypographyText type="secondary">
              {{ record.categoryRef }}
            </TypographyText>
          </template>
          <template v-else-if="column.key === 'evidence'">
            <span v-if="record.evidenceRef">{{ record.evidenceType }} · {{ record.evidenceRef }}</span>
            <span v-else>—</span>
          </template>
          <template v-else-if="column.key === 'amount'">
            <Tag v-if="record.amountOrigin === 'MISSING'" color="gold">
              待人工填写
            </Tag>
            <span v-else>{{
              money(record.amount, expense.currency || '')
            }}</span>
          </template>
          <template v-else-if="column.key === 'amountCny'">
            {{ money(record.amountCny, 'CNY') }}
          </template>
        </template>
      </Table>
    </Card>

    <Card size="small" title="单据附件">
      <FdmWaimaoAttachmentList
        :business-id="expense.id"
        business-type="ORDER_EXPENSE"
      />
    </Card>

    <Card size="small" title="业务状态记录">
      <Timeline v-if="expense.events.length">
        <TimelineItem v-for="event in expense.events" :key="event.id">
          <strong>{{ operationLabel(event.operation) }}</strong>
          <p>
            {{ event.fromStatus || '新建' }} → {{ event.toStatus }} · 版本
            {{ event.resultVersion }}
          </p>
          <small>
            操作人 {{ event.operatedBy }} · {{ dateTime(event.operatedAt) }}
            <template v-if="event.reason"> · {{ event.reason }}</template>
          </small>
        </TimelineItem>
      </Timeline>
      <Empty v-else description="暂无状态记录" />
    </Card>
  </div>
</template>

<style scoped>
.expense-detail {
  display: grid;
  gap: 16px;
}

.expense-detail-hero {
  display: flex;
  gap: 24px;
  align-items: flex-start;
  justify-content: space-between;
  padding: 20px;
  color: #fff;
  background: linear-gradient(135deg, #102a43, #1677ff);
  border-radius: 14px;
}

.expense-detail-hero h2,
.expense-detail-hero p {
  margin: 0;
  color: inherit;
}

.expense-detail-hero p {
  margin-top: 8px;
  opacity: 0.82;
}

.expense-total {
  display: grid;
  flex: 0 0 auto;
  gap: 2px;
  text-align: right;
}

.expense-total strong {
  font-size: 22px;
}

.expense-total small,
.expense-total span {
  opacity: 0.8;
}

.expense-detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

:deep(.ant-timeline-item-content p) {
  margin: 4px 0;
}

:deep(.ant-timeline-item-content small) {
  color: #8c8c8c;
}

@media (max-width: 760px) {
  .expense-detail-hero {
    display: grid;
  }

  .expense-total {
    text-align: left;
  }

  .expense-detail-grid {
    grid-template-columns: 1fr;
  }
}
</style>
