<script setup lang="ts">
import type {
  ProcurementFinanceFile,
  ProcurementFinanceRecord,
} from '#/api/fdmplatform/procurement-finance';

import { computed } from 'vue';

import { formatDate } from '@vben/utils';

import { Alert, Button, Descriptions, Space, Tag } from 'ant-design-vue';
import BigNumber from 'bignumber.js';

import { costCategories, rows } from '../../../data';
import { contractReferenceText } from '../../../documents/migration-display';
import { contractTarget, documentTarget } from '../../../documents/navigation';
import RelatedLink from '../../../documents/RelatedLink.vue';
import {
  actionNames,
  currencyScale,
  financeStatus,
  hasPayableBalance,
} from '../model';

const props = defineProps<{
  busy?: boolean;
  files: ProcurementFinanceFile[];
  record: ProcurementFinanceRecord;
  userNames?: Record<string, string>;
}>();
const emit = defineEmits<{
  action: [action: string];
  allocate: [];
  download: [file: ProcurementFinanceFile];
  pay: [];
}>();
const expenseRows = computed(() => rows(props.record.expenses));
const actions = computed(() =>
  props.record.allowedActions.filter(
    (action) => !['APPROVE', 'REJECT', 'UPDATE'].includes(action),
  ),
);
const canPay = computed(
  () =>
    props.record.status === 'APPROVED' &&
    props.record.summary?.complete !== false &&
    props.record.summary?.paidAmount !== null &&
    props.record.summary?.paidAmount !== undefined &&
    hasPayableBalance(props.record.summary?.availablePaymentAmount),
);
const paymentLabel = computed(() => {
  if (
    props.record.summary?.complete === false ||
    props.record.summary?.paidAmount === null ||
    props.record.summary?.paidAmount === undefined ||
    props.record.summary?.availablePaymentAmount === null ||
    props.record.summary?.availablePaymentAmount === undefined
  )
    return '付款资料待核实';
  if (!hasPayableBalance(props.record.summary.paidAmount)) return '未付款';
  return hasPayableBalance(props.record.summary.availablePaymentAmount)
    ? '部分付款'
    : '已付清';
});
const flowMessage = computed(() => {
  if (props.record.status === 'SUBMITTED')
    return '当前单据尚未生效，点击提交生效后即可继续办理付款与成本归集。';
  if (props.record.status === 'APPROVED') {
    if (paymentLabel.value === '付款资料待核实')
      return '单据已生效，付款资料仍需核实。核实完成后再办理付款。';
    return canPay.value
      ? '单据已生效，可直接登记付款。付款经确认后更新实际已付金额。'
      : '单据已生效，当前报销已付清。';
  }
  if (props.record.status === 'REJECTED')
    return '当前单据可继续修改，补齐资料后提交生效。';
  return '当前单据按实际付款及成本归集记录展示。';
});
function money(value: unknown) {
  if (value === null || value === undefined || value === '') return '待核实';
  const amount = new BigNumber(String(value));
  if (!amount.isFinite()) return '待核实';
  return `${props.record.currency || '币种未注明'} ${amount.toFormat(currencyScale(props.record.currency))}`;
}
function voucher(value: unknown) {
  return props.files.find((file) => file.id === value);
}
function expenseLabel(value: unknown) {
  return (
    costCategories.find((option) => option.value === value)?.label ??
    String(value || '未填写')
  );
}
function factName(value: unknown) {
  return value && typeof value === 'object' && 'name' in value
    ? String(value.name || '未填写')
    : '未填写';
}
</script>

<template>
  <section class="reimbursement-detail">
    <header class="reimbursement-heading">
      <div>
        <span class="eyebrow">费用报销</span>
        <h2>{{ record.name }}</h2>
        <span class="muted">{{ record.code }}</span>
      </div>
      <Space wrap>
        <Tag color="blue">{{ financeStatus(record.status) }}</Tag><Tag>{{ paymentLabel }}</Tag>
      </Space>
    </header>
    <div class="reimbursement-metrics">
      <div>
        <span>报销金额</span><strong>{{ money(record.amount) }}</strong>
      </div>
      <div>
        <span>实际已付</span><strong>{{ money(record.summary?.paidAmount) }}</strong>
      </div>
      <div>
        <span>尚未支付</span><strong>{{ money(record.summary?.availablePaymentAmount) }}</strong>
      </div>
      <div>
        <span>成本归集</span><strong>{{
          record.summary?.hasConfirmedCost === true
            ? '已有确认归集'
            : record.summary?.hasConfirmedCost === false
              ? '待归集'
              : '待核实'
        }}</strong>
      </div>
    </div>
    <section class="reimbursement-section">
      <div class="section-heading">
        <h3>当前办理</h3>
        <span class="muted">单据生效后继续办理付款</span>
      </div>
      <Alert
        :message="flowMessage"
        :type="record.status === 'REJECTED' ? 'warning' : 'info'"
        show-icon
      />
      <div class="processing-actions">
        <Space wrap>
          <Button
            v-if="canPay"
            type="primary"
            :disabled="busy"
            @click="emit('pay')"
          >
            登记本次付款
          </Button>
          <Button
            v-for="action in actions"
            :key="action"
            :disabled="busy"
            :danger="action === 'CANCEL'"
            @click="emit('action', action)"
          >
            {{ actionNames[action] ?? action }}
          </Button>
          <Button
            v-if="record.status === 'APPROVED'"
            :disabled="busy"
            @click="emit('allocate')"
          >
            新建报销成本分配
          </Button>
        </Space>
      </div>
    </section>
    <section class="reimbursement-section">
      <div class="section-heading"><h3>基本信息与收款资料</h3></div>
      <Descriptions :column="2" size="small">
        <Descriptions.Item label="费用所属公司">
          {{ factName(record.expenseEntitySnapshot) }}
        </Descriptions.Item>
        <Descriptions.Item label="付款公司">
          {{ record.payerSnapshot?.name || '未填写' }}
        </Descriptions.Item>
        <Descriptions.Item label="申请人">
          {{
            record.createdByName ||
            userNames?.[String(record.createdBy)] ||
            (record.createdBy ? `用户 #${record.createdBy}` : '未提供')
          }}
        </Descriptions.Item>
        <Descriptions.Item label="申请日期">
          {{
            formatDate(
              record.createdAt ? String(record.createdAt) : undefined,
              'YYYY-MM-DD',
            ) || '未提供'
          }}
        </Descriptions.Item>
        <Descriptions.Item label="垫付人">
          {{ record.advanceUserName || '未填写' }}
        </Descriptions.Item>
        <Descriptions.Item label="收款人">
          {{ record.payeeName || '未填写' }}
        </Descriptions.Item>
        <Descriptions.Item label="收款账户" :span="2">
          {{ record.payeeAccount || '未填写' }}
        </Descriptions.Item>
        <Descriptions.Item v-if="record.remark" label="备注" :span="2">
          {{ record.remark }}
        </Descriptions.Item>
      </Descriptions>
    </section>
    <section class="reimbursement-section">
      <div class="section-heading">
        <h3>费用明细</h3>
        <span class="muted">共 {{ expenseRows.length }} 项 · 凭证随明细查阅</span>
      </div>
      <article
        v-for="(expense, index) in expenseRows"
        :key="String(expense.id || index)"
        class="expense-line"
      >
        <div class="expense-number">{{ index + 1 }}</div>
        <div class="expense-content">
          <div class="expense-line-header">
            <strong>{{ expenseLabel(expense.category) }}</strong><span class="muted">{{ expense.expenseDate || '日期未填写' }}</span><strong class="expense-amount">{{ money(expense.amount) }}</strong>
          </div>
          <p class="expense-purpose">
            {{ expense.remark || '未填写用途说明' }}
          </p>
          <Space wrap>
            <RelatedLink
              v-if="expense.contractId"
              :target="contractTarget(String(expense.contractId))"
            >
              {{
                contractReferenceText(
                  expense.contractCode,
                  expense.contractName,
                  expense.contractId,
                )
              }}
            </RelatedLink>
            <RelatedLink
              v-if="expense.orderId"
              :target="
                documentTarget(
                  'orders',
                  String(expense.contractId || ''),
                  String(expense.orderId),
                )
              "
            >
              {{ expense.orderCode || '查看关联采购单' }}
            </RelatedLink>
            <span v-if="!expense.contractId && !expense.orderId" class="muted">独立费用</span>
            <Button
              v-if="voucher(expense.evidenceRef)"
              type="link"
              :disabled="busy"
              @click="emit('download', voucher(expense.evidenceRef)!)"
            >
              {{ voucher(expense.evidenceRef)!.name }}
            </Button>
            <span v-else class="muted">{{
              expense.evidenceRef ? '凭证信息尚未加载或无权读取' : '未关联凭证'
            }}</span>
          </Space>
        </div>
      </article>
      <p v-if="expenseRows.length === 0" class="muted">
        当前单据尚无费用明细。
      </p>
    </section>
  </section>
</template>

<style scoped>
.reimbursement-detail {
  display: grid;
  gap: 20px;
  color: hsl(var(--foreground));
}

.reimbursement-heading,
.section-heading,
.expense-line-header {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
}

.reimbursement-heading h2 {
  margin: 6px 0;
  font-size: 23px;
  font-weight: 650;
}

.eyebrow {
  font-size: 12px;
  color: hsl(var(--primary));
}

.muted,
.reimbursement-metrics span {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.reimbursement-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.reimbursement-metrics > div {
  display: grid;
  gap: 10px;
  padding: 18px;
  background: hsl(var(--accent) / 45%);
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
}

.reimbursement-metrics strong {
  font-size: 18px;
}

.reimbursement-section {
  padding: 20px;
  border: 1px solid hsl(var(--border));
  border-radius: 12px;
}

.section-heading {
  margin-bottom: 18px;
}

.section-heading h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.processing-actions {
  margin-top: 16px;
}

.processing-actions p {
  margin: 12px 0 0;
}

.expense-line {
  display: flex;
  gap: 14px;
  padding: 18px 0;
  border-top: 1px solid hsl(var(--border));
}

.expense-number {
  display: grid;
  flex: 0 0 28px;
  place-items: center;
  height: 28px;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--accent));
  border-radius: 8px;
}

.expense-content {
  flex: 1;
  min-width: 0;
}

.expense-line-header {
  justify-content: flex-start;
}

.expense-amount {
  margin-left: auto;
}

.expense-purpose {
  margin: 10px 0;
  overflow-wrap: anywhere;
}

@media (max-width: 760px) {
  .reimbursement-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .reimbursement-heading,
  .expense-line-header {
    flex-wrap: wrap;
  }

  .expense-amount {
    margin-left: 0;
  }
}
</style>
