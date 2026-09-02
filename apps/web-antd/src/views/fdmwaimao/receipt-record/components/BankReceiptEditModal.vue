<script lang="ts" setup>
import type { Dayjs } from 'dayjs';

import type { FdmWaimaoBankReceiptApi } from '#/api/fdmwaimao/bank-receipt';
import type { FdmWaimaoContractOrderApi } from '#/api/fdmwaimao/contract-order';

import { computed, reactive, ref, watch } from 'vue';

import {
  Alert,
  DatePicker,
  Form,
  Input,
  message,
  Modal,
  Select,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import {
  createBankReceipt,
  isBankReceiptDuplicateConfirmationError,
  updateBankReceipt,
} from '#/api/fdmwaimao/bank-receipt';
import { getContractOrderFormOptions } from '#/api/fdmwaimao/contract-order';
import { getCustomerPage } from '#/api/fdmwaimao/customer';
import { getExchangeRateCurrencies } from '#/api/fdmwaimao/exchange-rate';

defineOptions({ name: 'FdmWaimaoBankReceiptEditModal' });

const props = defineProps<{
  open: boolean;
  receipt?: FdmWaimaoBankReceiptApi.BankReceipt;
}>();

const emit = defineEmits<{
  close: [];
  saved: [id: string];
}>();

interface SelectOption {
  label: string;
  value: string;
}

const form = reactive({
  arrivalAmount: '',
  companyId: '',
  currency: 'USD',
  customerId: undefined as string | undefined,
  externalReceiptKey: '',
  payerAccountMasked: '',
  payerNameMasked: '',
  receiptDate: dayjs() as Dayjs,
  remark: '',
  sourceSystem: 'BANK_STATEMENT',
});

const formOptions = ref<FdmWaimaoContractOrderApi.FormOptions>({
  companies: [],
  owners: [],
});
const currencyOptions = ref<SelectOption[]>([]);
const customerOptions = ref<SelectOption[]>([]);
const loadingOptions = ref(false);
const customerSearching = ref(false);
const saving = ref(false);
const errorMessage = ref('');
let customerRequestId = 0;
let customerSearchTimer: ReturnType<typeof setTimeout> | undefined;

const editing = computed(() => Boolean(props.receipt));
const title = computed(() =>
  editing.value ? `修改银行到账 · ${props.receipt?.receiptNo}` : '登记银行到账',
);
const companyOptions = computed(() =>
  (formOptions.value.companies ?? []).map((company) => ({
    label: company.name,
    value: company.id,
  })),
);

function reset() {
  const receipt = props.receipt;
  form.arrivalAmount = receipt?.arrivalAmount ?? '';
  form.companyId = receipt?.companyId ?? '';
  form.currency = receipt?.currency ?? 'USD';
  form.customerId = receipt?.customerId ?? undefined;
  form.externalReceiptKey = receipt?.externalReceiptKey ?? '';
  form.payerAccountMasked = receipt?.payerAccountMasked ?? '';
  form.payerNameMasked = receipt?.payerNameMasked ?? '';
  form.receiptDate = dayjs(receipt?.receiptDate ?? undefined);
  form.remark = receipt?.remark ?? '';
  form.sourceSystem = receipt?.sourceSystem ?? 'BANK_STATEMENT';
  errorMessage.value = '';
  customerOptions.value = receipt?.customerId
    ? [
        {
          label: receipt.customerName || receipt.customerId,
          value: receipt.customerId,
        },
      ]
    : [];
}

async function loadOptions() {
  loadingOptions.value = true;
  try {
    const [contractOptions, currencies] = await Promise.all([
      getContractOrderFormOptions(),
      getExchangeRateCurrencies(),
    ]);
    formOptions.value = contractOptions;
    currencyOptions.value = (currencies ?? []).map((currency) => ({
      label: currency.name
        ? `${currency.code} · ${currency.name}`
        : currency.code,
      value: currency.code,
    }));
    if (!form.companyId && contractOptions.companies.length === 1) {
      form.companyId = contractOptions.companies[0]?.id ?? '';
    }
  } finally {
    loadingOptions.value = false;
  }
}

async function searchCustomersNow(keyword = '') {
  const requestId = ++customerRequestId;
  customerSearching.value = true;
  try {
    const result = await getCustomerPage({
      keyword: keyword.trim() || undefined,
      pageNo: 1,
      pageSize: 30,
    });
    if (requestId !== customerRequestId) return;
    const options = (result.list ?? []).map((customer) => ({
      label: `${customer.name} · ${customer.customerCode}`,
      value: customer.id,
    }));
    const receipt = props.receipt;
    if (
      receipt?.customerId &&
      !options.some((option) => option.value === receipt.customerId)
    ) {
      options.unshift({
        label: receipt.customerName || receipt.customerId,
        value: receipt.customerId,
      });
    }
    customerOptions.value = options;
  } finally {
    if (requestId === customerRequestId) customerSearching.value = false;
  }
}

function searchCustomers(keyword: string) {
  if (customerSearchTimer) clearTimeout(customerSearchTimer);
  customerSearchTimer = setTimeout(() => void searchCustomersNow(keyword), 300);
}

function disabledFutureDate(current: Dayjs) {
  return current.startOf('day').isAfter(dayjs().startOf('day'));
}

function validate() {
  if (!form.companyId) return '请选择到账所属公司';
  if (!form.receiptDate?.isValid()) return '请选择有效到账日期';
  if (!/^[A-Z]{3}$/.test(form.currency)) return '请选择三位大写币种';
  if (!/^\d{1,18}(?:\.\d{1,6})?$/.test(form.arrivalAmount.trim())) {
    return '到账金额必须大于零，且最多保留 6 位小数';
  }
  if (Number(form.arrivalAmount) <= 0) return '到账金额必须大于零';
  if (!editing.value && !form.sourceSystem.trim()) return '请输入来源系统';
  if (!editing.value && !form.externalReceiptKey.trim()) {
    return '请输入银行流水号或外部到账唯一编号';
  }
  return undefined;
}

function commonFacts(confirmPotentialDuplicate: boolean) {
  return {
    arrivalAmount: form.arrivalAmount.trim(),
    companyId: form.companyId,
    confirmPotentialDuplicate,
    currency: form.currency,
    customerId: form.customerId || undefined,
    payerAccountMasked: form.payerAccountMasked.trim() || undefined,
    payerNameMasked: form.payerNameMasked.trim() || undefined,
    receiptDate: form.receiptDate.format('YYYY-MM-DD'),
    remark: form.remark.trim() || undefined,
  };
}

async function persist(confirmPotentialDuplicate = false) {
  const problem = validate();
  if (problem) {
    errorMessage.value = problem;
    return;
  }
  const receipt = props.receipt;
  saving.value = true;
  errorMessage.value = '';
  try {
    if (receipt) {
      await updateBankReceipt({
        ...commonFacts(confirmPotentialDuplicate),
        expectedVersion: receipt.version,
        id: receipt.id,
      });
      message.success('银行到账已更新，汇率快照已由服务端重新冻结');
      emit('saved', receipt.id);
      return;
    }

    const result = await createBankReceipt({
      ...commonFacts(confirmPotentialDuplicate),
      externalReceiptKey: form.externalReceiptKey.trim(),
      sourceSystem: form.sourceSystem.trim().toUpperCase(),
    });
    if (result.created) {
      message.success(
        result.potentialDuplicateIds.length > 0
          ? `银行到账已登记；已审计确认 ${result.potentialDuplicateIds.length} 条疑似重复`
          : '银行到账已登记，汇率快照由服务端完成',
      );
    } else {
      message.info('相同外部身份与相同事实已登记，已打开原银行到账');
    }
    emit('saved', result.id);
  } catch (error) {
    if (
      !confirmPotentialDuplicate &&
      isBankReceiptDuplicateConfirmationError(error)
    ) {
      saving.value = false;
      Modal.confirm({
        cancelText: '返回核对',
        content:
          '服务端按付款方指纹、到账日期、币种和金额发现疑似重复。继续只代表你已核对银行流水；系统仍会保留重复确认审计。',
        okText: '我已核对，仍要保存',
        onOk: () => persist(true),
        title: '发现疑似重复到账',
      });
      return;
    }
    errorMessage.value =
      error instanceof Error ? error.message : '银行到账保存失败';
  } finally {
    saving.value = false;
  }
}

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    reset();
    void Promise.all([loadOptions(), searchCustomersNow()]);
  },
);
</script>

<template>
  <Modal
    :confirm-loading="saving"
    :mask-closable="false"
    :open="open"
    :ok-text="editing ? '保存修改' : '确认登记'"
    :title="title"
    width="min(860px, calc(100vw - 32px))"
    @cancel="emit('close')"
    @ok="persist(false)"
  >
    <Alert
      description="这里只填写到账业务事实。服务端会按到账日期从汇率中心计算并冻结汇率、人民币金额、来源和取数时间；浏览器不能提交或覆盖这些证据。"
      message="汇率和人民币金额由服务端权威计算"
      show-icon
      type="info"
    />
    <Alert
      v-if="errorMessage"
      class="bank-receipt-form__error"
      :message="errorMessage"
      closable
      show-icon
      type="error"
      @close="errorMessage = ''"
    />

    <Form class="bank-receipt-form" layout="vertical">
      <div class="bank-receipt-form__grid">
        <Form.Item label="到账所属公司" required>
          <Select
            v-model:value="form.companyId"
            :disabled="editing"
            :loading="loadingOptions"
            :options="companyOptions"
            placeholder="请选择公司"
          />
        </Form.Item>
        <Form.Item label="对应交易客户">
          <Select
            v-model:value="form.customerId"
            allow-clear
            :filter-option="false"
            :loading="customerSearching"
            :options="customerOptions"
            placeholder="建议选择，后续才能分配合同"
            show-search
            @dropdown-visible-change="
              (open: boolean) => open && searchCustomersNow()
            "
            @search="searchCustomers"
          />
        </Form.Item>
        <Form.Item label="到账日期" required>
          <DatePicker
            v-model:value="form.receiptDate"
            :disabled-date="disabledFutureDate"
            style="width: 100%"
          />
        </Form.Item>
        <Form.Item label="币种" required>
          <Select
            v-model:value="form.currency"
            :loading="loadingOptions"
            :options="currencyOptions"
            show-search
          />
        </Form.Item>
        <Form.Item label="原币到账金额" required>
          <Input
            v-model:value="form.arrivalAmount"
            inputmode="decimal"
            placeholder="例如 1250.50"
          />
        </Form.Item>
        <Form.Item label="付款方名称（请脱敏）">
          <Input
            v-model:value="form.payerNameMasked"
            :maxlength="255"
            placeholder="例如 O*** Ltd."
          />
        </Form.Item>
        <Form.Item label="付款账号（请脱敏）">
          <Input
            v-model:value="form.payerAccountMasked"
            :maxlength="128"
            placeholder="例如 ****1234"
          />
        </Form.Item>
        <Form.Item v-if="!editing" label="来源系统" required>
          <Input
            v-model:value="form.sourceSystem"
            :maxlength="32"
            placeholder="例如 BANK_STATEMENT"
          />
        </Form.Item>
        <Form.Item
          v-if="!editing"
          class="bank-receipt-form__wide"
          label="银行流水号 / 外部唯一编号"
          required
        >
          <Input
            v-model:value="form.externalReceiptKey"
            :maxlength="128"
            placeholder="同一公司和来源系统内必须稳定唯一；超时重试请复用该编号"
          />
        </Form.Item>
        <Form.Item class="bank-receipt-form__wide" label="备注">
          <Input.TextArea
            v-model:value="form.remark"
            :auto-size="{ minRows: 3, maxRows: 6 }"
            :maxlength="2000"
            show-count
          />
        </Form.Item>
      </div>
    </Form>
  </Modal>
</template>

<style scoped>
.bank-receipt-form {
  margin-top: 20px;
}

.bank-receipt-form__error {
  margin-top: 12px;
}

.bank-receipt-form__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
}

.bank-receipt-form__wide {
  grid-column: 1 / -1;
}

@media (max-width: 680px) {
  .bank-receipt-form__grid {
    grid-template-columns: 1fr;
  }

  .bank-receipt-form__wide {
    grid-column: auto;
  }
}
</style>
