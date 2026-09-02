<script lang="ts" setup>
import type { FdmProcurementSupplierSettlementPaymentApi } from '#/api/fdmprocurement/supplier-settlement/payment';

import { computed, onMounted, reactive, ref } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';

import {
  Alert,
  Button,
  Card,
  Descriptions,
  Input,
  message,
  Modal,
  Pagination,
  Select,
  Space,
  Table,
  Tag,
} from 'ant-design-vue';

import {
  createSupplierPayment,
  getSupplierPayment,
  getSupplierPaymentAccountList,
  getSupplierPaymentPage,
  postSupplierPayment,
  previewSupplierPayment,
  reverseSupplierPayment,
  updateSupplierPayment,
} from '#/api/fdmprocurement/supplier-settlement/payment';

import {
  canEditSupplierPayment,
  canPostSupplierPayment,
  canReverseSupplierPayment,
  validateSupplierPaymentReverseReason,
} from './policy';

defineOptions({ name: 'FdmProcurementSupplierSettlementPayment' });

type Payment = FdmProcurementSupplierSettlementPaymentApi.SupplierPayment;

const { hasAccessByCodes } = useAccess();
const hasPermission = (code: string) => hasAccessByCodes([code]);
const canQuery = computed(() =>
  hasPermission('fdmprocurement:supplier-settlement:query'),
);

const loading = ref(false);
const saving = ref(false);
const previewing = ref(false);
const rows = ref<Payment[]>([]);
const paymentAccounts = ref<
  FdmProcurementSupplierSettlementPaymentApi.PaymentAccount[]
>([]);
const total = ref(0);
const pageNo = ref(1);
const pageSize = ref(10);
const companyId = ref('');
const supplierId = ref('');
const status = ref<FdmProcurementSupplierSettlementPaymentApi.PostingStatus>();
const editorOpen = ref(false);
const reverseOpen = ref(false);
const editing = ref<Payment>();
const reversing = ref<Payment>();
const preview = ref<FdmProcurementSupplierSettlementPaymentApi.Preview>();
const reverseReason = ref('');

const form = reactive({
  accountId: '',
  currencyCode: 'CNY',
  financeUserId: '',
  obligationLineId: '',
  paymentTime: '',
  remark: '',
  settlementDirection:
    'PAYMENT' as FdmProcurementSupplierSettlementPaymentApi.SettlementDirection,
  supplierId: '',
  transactionAmount: '',
});

const paymentAccountOptions = computed(() => {
  const currency = form.currencyCode.trim().toUpperCase();
  return paymentAccounts.value
    .filter(
      (account) =>
        !account.currencyCode || !currency || account.currencyCode === currency,
    )
    .map((account) => ({
      label: `${account.accountName}（${account.accountCode}${
        account.currencyCode ? ` / ${account.currencyCode}` : ''
      }）`,
      value: account.id,
    }));
});

const columns = [
  { dataIndex: 'no', key: 'no', title: '付款单号' },
  { dataIndex: 'supplierId', key: 'supplierId', title: '供应商 ID' },
  {
    dataIndex: 'settlementDirection',
    key: 'settlementDirection',
    title: '方向',
  },
  { dataIndex: 'currencyCode', key: 'currencyCode', title: '币种' },
  { dataIndex: 'transactionAmount', key: 'amount', title: '原币金额' },
  { dataIndex: 'transactionAmountCny', key: 'amountCny', title: '折合 CNY' },
  { dataIndex: 'status', key: 'status', title: '状态' },
  { key: 'actions', title: '操作', width: 210 },
];

function statusLabel(
  status: FdmProcurementSupplierSettlementPaymentApi.PostingStatus,
) {
  if (status === 'DRAFT') return '草稿';
  if (status === 'POSTED') return '已过账';
  return String(status);
}

async function load() {
  if (!canQuery.value) return;
  loading.value = true;
  try {
    const result = await getSupplierPaymentPage({
      companyId: companyId.value.trim() || undefined,
      pageNo: pageNo.value,
      pageSize: pageSize.value,
      status: status.value,
      supplierId: supplierId.value.trim() || undefined,
    });
    rows.value = result.list || [];
    total.value = result.total || 0;
  } finally {
    loading.value = false;
  }
}

async function loadPaymentAccounts() {
  if (!canQuery.value) return;
  paymentAccounts.value = await getSupplierPaymentAccountList(true);
}

function resetEditor() {
  editing.value = undefined;
  preview.value = undefined;
  Object.assign(form, {
    accountId: '',
    currencyCode: 'CNY',
    financeUserId: '',
    obligationLineId: '',
    paymentTime: '',
    remark: '',
    settlementDirection: 'PAYMENT',
    supplierId: '',
    transactionAmount: '',
  });
}

function openCreate() {
  resetEditor();
  editorOpen.value = true;
}

async function openEdit(row: Payment | Record<string, any>) {
  row = row as Payment;
  const detail = await getSupplierPayment(row.id);
  editing.value = detail;
  preview.value = undefined;
  Object.assign(form, {
    accountId: detail.accountId,
    currencyCode: detail.currencyCode,
    financeUserId: detail.financeUserId || '',
    obligationLineId: detail.allocation.obligationLineId,
    paymentTime: detail.paymentTime,
    remark: detail.remark || '',
    settlementDirection: detail.settlementDirection,
    supplierId: detail.supplierId,
    transactionAmount: detail.transactionAmount,
  });
  editorOpen.value = true;
}

function validateInput() {
  const required = [
    form.accountId,
    form.currencyCode,
    form.obligationLineId,
    form.paymentTime,
    form.supplierId,
    form.transactionAmount,
  ];
  if (required.some((value) => !String(value).trim())) {
    message.warning('请完整填写付款账户、供应商、义务行、时间、币种和金额');
    return false;
  }
  return true;
}

async function runPreview() {
  if (!validateInput()) return;
  previewing.value = true;
  try {
    preview.value = await previewSupplierPayment({
      currencyCode: form.currencyCode.trim().toUpperCase(),
      obligationLineId: form.obligationLineId.trim(),
      paymentTime: form.paymentTime,
      settlementDirection: form.settlementDirection,
      supplierId: form.supplierId.trim(),
      transactionAmount: form.transactionAmount.trim(),
    });
  } finally {
    previewing.value = false;
  }
}

async function save() {
  if (!validateInput()) return;
  if (!preview.value?.previewHash) {
    message.warning('请先生成当前输入的确定性分配预览');
    return;
  }
  const payload: FdmProcurementSupplierSettlementPaymentApi.SaveRequest = {
    accountId: form.accountId.trim(),
    currencyCode: form.currencyCode.trim().toUpperCase(),
    expectedVersion: editing.value?.version,
    financeUserId: form.financeUserId.trim() || undefined,
    id: editing.value?.id,
    obligationLineId: form.obligationLineId.trim(),
    paymentTime: form.paymentTime,
    previewHash: preview.value.previewHash,
    remark: form.remark.trim() || undefined,
    settlementDirection: form.settlementDirection,
    supplierId: form.supplierId.trim(),
    transactionAmount: form.transactionAmount.trim(),
  };
  saving.value = true;
  try {
    await (editing.value
      ? updateSupplierPayment(payload)
      : createSupplierPayment(payload));
    message.success(editing.value ? '供应商付款已更新' : '供应商付款已创建');
    editorOpen.value = false;
    await load();
  } finally {
    saving.value = false;
  }
}

async function post(row: Payment | Record<string, any>) {
  row = row as Payment;
  const detail = await getSupplierPayment(row.id);
  if (!canPostSupplierPayment(detail)) {
    message.warning('服务端最新版本不允许过账');
    return;
  }
  await postSupplierPayment({
    expectedPostingVersion: detail.postingVersion,
    expectedVersion: detail.version,
    id: detail.id,
  });
  message.success('供应商付款已过账');
  await load();
}

function openReverse(row: Payment | Record<string, any>) {
  reversing.value = row as Payment;
  reverseReason.value = '';
  reverseOpen.value = true;
}

async function reverse() {
  if (!reversing.value) return;
  const validated = validateSupplierPaymentReverseReason(reverseReason.value);
  if (!validated.valid) {
    message.warning(validated.error);
    return;
  }
  const detail = await getSupplierPayment(reversing.value.id);
  if (!canReverseSupplierPayment(detail)) {
    message.warning('服务端最新版本不允许冲销');
    return;
  }
  saving.value = true;
  try {
    await reverseSupplierPayment({
      expectedPostingVersion: detail.postingVersion,
      expectedVersion: detail.version,
      id: detail.id,
      reason: validated.reason,
    });
    message.success('供应商付款已冲销');
    reverseOpen.value = false;
    await load();
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  await Promise.all([load(), loadPaymentAccounts()]);
});
</script>

<template>
  <Page auto-content-height>
    <Alert
      v-if="!canQuery"
      message="缺少 fdmprocurement:supplier-settlement:query 权限"
      show-icon
      type="warning"
    />
    <Card v-else title="FDM 供应商付款">
      <Space class="toolbar" wrap>
        <Input
          v-model:value="companyId"
          allow-clear
          placeholder="公司 ID"
          @press-enter="load"
        />
        <Input
          v-model:value="supplierId"
          allow-clear
          placeholder="供应商 ID"
          @press-enter="load"
        />
        <Select
          v-model:value="status"
          allow-clear
          :options="[
            { label: '草稿', value: 'DRAFT' },
            { label: '已过账', value: 'POSTED' },
          ]"
          placeholder="状态"
          style="width: 140px"
        />
        <Button @click="load">查询</Button>
        <Button
          v-if="hasPermission('fdmprocurement:supplier-settlement:create')"
          type="primary"
          @click="openCreate"
        >
          新建付款
        </Button>
      </Space>
      <Table
        :columns="columns"
        :data-source="rows"
        :loading="loading"
        :pagination="false"
        row-key="id"
      >
        <template #bodyCell="{ column, record }">
          <Tag
            v-if="column.key === 'status'"
            :color="record.status === 'POSTED' ? 'green' : 'blue'"
          >
            {{ statusLabel(record.status) }}
          </Tag>
          <Space v-else-if="column.key === 'actions'">
            <Button
              v-if="
                hasPermission('fdmprocurement:supplier-settlement:update') &&
                canEditSupplierPayment(record)
              "
              size="small"
              type="link"
              @click="openEdit(record)"
            >
              编辑
            </Button>
            <Button
              v-if="
                hasPermission('fdmprocurement:supplier-settlement:post') &&
                canPostSupplierPayment(record)
              "
              size="small"
              type="link"
              @click="post(record)"
            >
              过账
            </Button>
            <Button
              v-if="
                hasPermission('fdmprocurement:supplier-settlement:reverse') &&
                canReverseSupplierPayment(record)
              "
              danger
              size="small"
              type="link"
              @click="openReverse(record)"
            >
              冲销
            </Button>
          </Space>
        </template>
      </Table>
      <Pagination
        v-model:current="pageNo"
        v-model:page-size="pageSize"
        :total="total"
        @change="load"
      />
    </Card>

    <Modal
      v-model:open="editorOpen"
      :confirm-loading="saving"
      :title="editing ? '编辑供应商付款' : '新建供应商付款'"
      width="820px"
      @ok="save"
    >
      <div class="editor">
        <label>供应商 ID<Input v-model:value="form.supplierId" /></label>
        <label>
          FDM 付款账户
          <Select
            v-model:value="form.accountId"
            :options="paymentAccountOptions"
            placeholder="请选择已启用的采购付款账户"
            show-search
          />
        </label>
        <label>财务人员 ID<Input v-model:value="form.financeUserId" /></label>
        <label>义务行 ID<Input v-model:value="form.obligationLineId" /></label>
        <label>付款时间<Input
            v-model:value="form.paymentTime"
            type="datetime-local"
        /></label>
        <label>
          方向
          <Select
            v-model:value="form.settlementDirection"
            :options="[
              { label: '付款', value: 'PAYMENT' },
              { label: '退款', value: 'REFUND' },
            ]"
          />
        </label>
        <label>币种<Input v-model:value="form.currencyCode" :maxlength="3" /></label>
        <label>原币金额<Input v-model:value="form.transactionAmount" /></label>
        <label class="wide">备注<Input.TextArea v-model:value="form.remark" /></label>
      </div>
      <Button :loading="previewing" class="preview-button" @click="runPreview">
        生成分配预览
      </Button>
      <Descriptions v-if="preview" bordered size="small" :column="2">
        <Descriptions.Item label="折合 CNY">
          {{ preview.transactionAmountCny }}
        </Descriptions.Item>
        <Descriptions.Item label="汇率">
          {{ preview.rate.exchangeRateToCny }}（{{ preview.rate.provider }}）
        </Descriptions.Item>
        <Descriptions.Item label="分配类型">
          {{ preview.allocationKind }}
        </Descriptions.Item>
        <Descriptions.Item label="预览 Hash">
          {{ preview.previewHash }}
        </Descriptions.Item>
      </Descriptions>
    </Modal>

    <Modal
      v-model:open="reverseOpen"
      :confirm-loading="saving"
      title="供应商付款冲销"
      @ok="reverse"
    >
      <Alert
        message="冲销会恢复供应商待结算余额，必须填写原因。"
        show-icon
        type="warning"
      />
      <Input.TextArea v-model:value="reverseReason" :rows="4" />
    </Modal>
  </Page>
</template>

<style scoped>
.toolbar {
  margin-bottom: 16px;
}

.editor {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.editor label {
  display: grid;
  gap: 6px;
}

.editor .wide {
  grid-column: 1 / -1;
}

.preview-button {
  margin: 16px 0;
}
</style>
