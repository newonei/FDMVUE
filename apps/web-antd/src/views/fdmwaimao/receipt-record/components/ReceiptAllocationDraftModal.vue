<script lang="ts" setup>
import type { ColumnsType } from 'ant-design-vue/es/table';

import type { FdmWaimaoBankReceiptApi } from '#/api/fdmwaimao/bank-receipt';

import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';

import {
  Alert,
  Checkbox,
  Form,
  Input,
  message,
  Modal,
  Select,
  Table,
  Tag,
} from 'ant-design-vue';
import BigNumber from 'bignumber.js';

import {
  getBankReceipt,
  getBankReceiptPage,
} from '#/api/fdmwaimao/bank-receipt';
import { getContractOrderPage } from '#/api/fdmwaimao/contract-order';
import { createReceiptAllocationDraft } from '#/api/fdmwaimao/receipt-allocation';

import {
  clearAllocationCommand,
  getOrCreateAllocationCommand,
} from '../allocation-command-store';

defineOptions({ name: 'FdmWaimaoReceiptAllocationDraftModal' });

const props = defineProps<{
  bankReceiptId?: string;
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
  created: [id: string];
}>();

interface EditableOrder {
  currency: string;
  orderId: string;
  orderNo: string;
  outstandingAmount: string;
  reason: string;
  selected: boolean;
  sourceAmount: string;
  subject: string;
}

const columns: ColumnsType<EditableOrder> = [
  { key: 'selected', title: '选择', width: 68 },
  { key: 'order', title: '合同订单', width: 250 },
  { key: 'outstanding', title: '当前应收余额', width: 150 },
  { key: 'sourceAmount', title: '本次分配（到账币种）', width: 210 },
  { key: 'reason', title: '分配说明', width: 250 },
];

const selectedBankReceiptId = ref<string>();
const bankReceiptOptions = ref<Array<{ label: string; value: string }>>([]);
const bank = ref<FdmWaimaoBankReceiptApi.BankReceipt>();
const orders = ref<EditableOrder[]>([]);
const form = reactive({ remark: '' });
const loadingBanks = ref(false);
const loadingContext = ref(false);
const saving = ref(false);
const errorMessage = ref('');
let bankSearchTimer: ReturnType<typeof setTimeout> | undefined;
let bankRequestId = 0;
let contextRequestId = 0;

const selectedLines = computed(() =>
  orders.value.filter((order) => order.selected),
);
const selectedTotal = computed(() => {
  let total = new BigNumber(0);
  for (const line of selectedLines.value) {
    if (/^\d{1,18}(?:\.\d{1,6})?$/.test(line.sourceAmount.trim())) {
      total = total.plus(line.sourceAmount);
    }
  }
  return total;
});

function money(value?: null | string, currency = '') {
  if (value === null || value === undefined || value === '') return '—';
  return `${currency ? `${currency} ` : ''}${new BigNumber(value).toFormat(2)}`;
}

async function searchBanksNow(keyword = '') {
  const requestId = ++bankRequestId;
  loadingBanks.value = true;
  try {
    const result = await getBankReceiptPage({
      keyword: keyword.trim() || undefined,
      pageNo: 1,
      pageSize: 50,
      status: 'ACTIVE',
    });
    if (requestId !== bankRequestId) return;
    const available = (result.list ?? []).filter(
      (receipt) =>
        receipt.customerId && new BigNumber(receipt.remainingAmount).gt(0),
    );
    const options = available.map((receipt) => ({
      label: `${receipt.receiptNo} · ${receipt.customerName} · ${money(receipt.remainingAmount, receipt.currency)} 可用`,
      value: receipt.id,
    }));
    if (
      bank.value &&
      !options.some((option) => option.value === bank.value?.id)
    ) {
      options.unshift({
        label: `${bank.value.receiptNo} · ${bank.value.customerName || '未关联客户'}`,
        value: bank.value.id,
      });
    }
    bankReceiptOptions.value = options;
  } finally {
    if (requestId === bankRequestId) loadingBanks.value = false;
  }
}

function searchBanks(keyword: string) {
  if (bankSearchTimer) clearTimeout(bankSearchTimer);
  bankSearchTimer = setTimeout(() => void searchBanksNow(keyword), 300);
}

async function loadContext(id?: string) {
  const requestId = ++contextRequestId;
  bank.value = undefined;
  orders.value = [];
  errorMessage.value = '';
  if (!id) {
    loadingContext.value = false;
    return;
  }
  loadingContext.value = true;
  try {
    const receipt = await getBankReceipt(id);
    if (requestId !== contextRequestId) return;
    bank.value = receipt;
    if (!receipt.customerId) {
      errorMessage.value = '该银行到账未关联交易客户，不能创建合同分配';
      return;
    }
    const result = await getContractOrderPage({
      companyId: receipt.companyId,
      customerId: receipt.customerId,
      pageNo: 1,
      pageSize: 50,
      status: 'CONFIRMED',
    });
    if (requestId !== contextRequestId) return;
    orders.value = (result.list ?? [])
      .filter((order) => new BigNumber(order.outstandingAmount ?? 0).gt(0))
      .map((order) => ({
        currency: order.currency,
        orderId: order.id,
        orderNo: order.orderNo,
        outstandingAmount: order.outstandingAmount ?? '0',
        reason: '',
        selected: false,
        sourceAmount: '',
        subject: order.subject,
      }));
  } finally {
    if (requestId === contextRequestId) loadingContext.value = false;
  }
}

function validate() {
  const receipt = bank.value;
  if (!receipt || !receipt.customerId) return '请选择已关联客户的有效银行到账';
  if (receipt.status !== 'ACTIVE') return '银行到账已失效';
  if (selectedLines.value.length === 0) return '请至少选择一张合同';
  for (const line of selectedLines.value) {
    if (!/^\d{1,18}(?:\.\d{1,6})?$/.test(line.sourceAmount.trim())) {
      return `${line.orderNo} 的到账币种分配金额格式无效`;
    }
    if (new BigNumber(line.sourceAmount).lte(0)) {
      return `${line.orderNo} 的分配金额必须大于零`;
    }
  }
  if (selectedTotal.value.gt(receipt.remainingAmount)) {
    return `分配合计不能超过银行到账可用余额 ${money(receipt.remainingAmount, receipt.currency)}`;
  }
  return undefined;
}

async function save() {
  const receipt = bank.value;
  if (
    !receipt?.customerId ||
    receipt.id !== selectedBankReceiptId.value ||
    saving.value
  )
    return;
  const problem = validate();
  if (problem) {
    errorMessage.value = problem;
    return;
  }
  const facts = {
    bankReceiptId: receipt.id,
    customerId: receipt.customerId,
    expectedBankReceiptVersion: receipt.version,
    lines: selectedLines.value
      .map((line) => ({
        orderId: line.orderId,
        reason: line.reason.trim() || undefined,
        sourceAmount: line.sourceAmount.trim(),
      }))
      .toSorted((left, right) => left.orderId.localeCompare(right.orderId)),
    remark: form.remark.trim() || undefined,
  };
  const identity = `draft:${receipt.id}:${receipt.version}`;
  saving.value = true;
  errorMessage.value = '';
  try {
    const result = await createReceiptAllocationDraft({
      ...facts,
      idempotencyKey: await getOrCreateAllocationCommand(
        identity,
        JSON.stringify(facts),
        'allocation-draft',
      ),
    });
    clearAllocationCommand(identity);
    message.success(
      result.newlyCreated
        ? '到账分配草稿已建立'
        : '相同命令已处理，已打开原分配草稿',
    );
    emit('created', result.id);
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '分配草稿创建失败';
  } finally {
    saving.value = false;
  }
}

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    form.remark = '';
    selectedBankReceiptId.value = props.bankReceiptId;
    void Promise.all([
      searchBanksNow(),
      loadContext(selectedBankReceiptId.value),
    ]);
  },
);

watch(selectedBankReceiptId, (id) => {
  if (!props.open) return;
  void loadContext(id);
});

onBeforeUnmount(() => {
  if (bankSearchTimer) clearTimeout(bankSearchTimer);
  bankRequestId += 1;
  contextRequestId += 1;
});
</script>

<template>
  <Modal
    :confirm-loading="saving"
    :mask-closable="false"
    :open="open"
    ok-text="建立分配草稿"
    title="手工创建到账分配"
    width="min(1120px, calc(100vw - 32px))"
    @cancel="emit('close')"
    @ok="save"
  >
    <Alert
      description="这里只输入每张合同占用的到账原币金额。汇率日、汇率、人民币金额、合同币冲销金额及舍入调整全部由服务端计算并按行冻结，浏览器不能提交。"
      message="多合同分配，财务换算由服务端守恒"
      show-icon
      type="info"
    />
    <Alert
      v-if="errorMessage"
      class="allocation-draft__alert"
      :message="errorMessage"
      closable
      show-icon
      type="error"
      @close="errorMessage = ''"
    />

    <Form class="allocation-draft__form" layout="vertical">
      <Form.Item label="银行到账" required>
        <Select
          v-model:value="selectedBankReceiptId"
          :filter-option="false"
          :loading="loadingBanks"
          :options="bankReceiptOptions"
          placeholder="搜索到账编号、银行流水或客户"
          show-search
          @dropdown-visible-change="(open: boolean) => open && searchBanksNow()"
          @search="searchBanks"
        />
      </Form.Item>

      <div v-if="bank" class="allocation-draft__bank">
        <div>
          <span>到账客户</span>
          <strong>{{ bank.customerName || '未关联客户' }}</strong>
        </div>
        <div>
          <span>原币到账</span>
          <strong>{{ money(bank.arrivalAmount, bank.currency) }}</strong>
        </div>
        <div>
          <span>当前可用余额</span>
          <strong>{{ money(bank.remainingAmount, bank.currency) }}</strong>
        </div>
        <div>
          <span>当前版本</span>
          <strong>V{{ bank.version }}</strong>
        </div>
      </div>

      <Form.Item label="选择合同并填写到账币种分配金额" required>
        <Table
          :columns="columns"
          :data-source="orders"
          :loading="loadingContext"
          :pagination="false"
          row-key="orderId"
          :scroll="{ x: 920, y: 360 }"
          size="small"
        >
          <template #emptyText>
            <div class="allocation-draft__empty">
              {{
                bank ? '该客户暂无可分配的已确认应收合同' : '请先选择银行到账'
              }}
            </div>
          </template>
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'selected'">
              <Checkbox v-model:checked="record.selected" />
            </template>
            <template v-else-if="column.key === 'order'">
              <div class="allocation-draft__stack">
                <strong>{{ record.orderNo }}</strong>
                <span>{{ record.subject }}</span>
              </div>
            </template>
            <template v-else-if="column.key === 'outstanding'">
              <strong>{{
                money(record.outstandingAmount, record.currency)
              }}</strong>
            </template>
            <template v-else-if="column.key === 'sourceAmount'">
              <Input
                v-model:value="record.sourceAmount"
                :disabled="!record.selected"
                inputmode="decimal"
                :placeholder="bank ? `${bank.currency} 金额` : '原币金额'"
              />
            </template>
            <template v-else-if="column.key === 'reason'">
              <Input
                v-model:value="record.reason"
                :disabled="!record.selected"
                :maxlength="1000"
                placeholder="例如首期款（可选）"
              />
            </template>
          </template>
        </Table>
      </Form.Item>

      <div class="allocation-draft__total">
        <span>已选 {{ selectedLines.length }} 张合同</span>
        <strong>
          分配合计 {{ bank?.currency || '' }} {{ selectedTotal.toFormat(2) }}
        </strong>
        <Tag
          v-if="bank"
          :color="selectedTotal.gt(bank.remainingAmount) ? 'red' : 'green'"
        >
          {{
            selectedTotal.gt(bank.remainingAmount)
              ? '超过可用余额'
              : '余额校验通过'
          }}
        </Tag>
      </div>

      <Form.Item label="草稿备注">
        <Input.TextArea
          v-model:value="form.remark"
          :auto-size="{ minRows: 2, maxRows: 5 }"
          :maxlength="2000"
          show-count
        />
      </Form.Item>
    </Form>
  </Modal>
</template>

<style scoped>
.allocation-draft__alert,
.allocation-draft__form {
  margin-top: 16px;
}

.allocation-draft__bank {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 18px;
}

.allocation-draft__bank > div {
  display: grid;
  gap: 4px;
  padding: 12px;
  background: #f6f8fb;
  border-radius: 9px;
}

.allocation-draft__bank span,
.allocation-draft__stack span {
  font-size: 12px;
  color: #64748b;
}

.allocation-draft__stack {
  display: grid;
  gap: 3px;
}

.allocation-draft__empty {
  padding: 48px 16px;
  color: #94a3b8;
}

.allocation-draft__total {
  display: flex;
  gap: 14px;
  align-items: center;
  justify-content: flex-end;
  padding: 12px 0 18px;
}

.allocation-draft__total strong {
  font-size: 16px;
  color: #0f4c81;
}

@media (max-width: 760px) {
  .allocation-draft__bank {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .allocation-draft__total {
    flex-direction: column;
    align-items: flex-end;
  }
}
</style>
