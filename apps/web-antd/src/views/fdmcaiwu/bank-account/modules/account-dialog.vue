<script setup lang="ts">
import type { FormInstance } from 'ant-design-vue';

import type { FdmcaiwuBankBalanceApi as Api } from '#/api/fdmcaiwu/journal';

import { computed, nextTick, reactive, ref } from 'vue';

import {
  Alert,
  AutoComplete,
  DatePicker,
  Form,
  FormItem,
  Input,
  InputNumber,
  message,
  Modal,
  Select,
  Switch,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import { saveBankAccount } from '#/api/fdmcaiwu/journal';

import { ACCOUNT_TYPE_LABELS, CURRENCY_OPTIONS } from '../../journal/model';

/**
 * 账户简称用于匹配日记账里的历史账户名称。
 */
const props = defineProps<{ companies: Api.CompanyOption[] }>();
const emit = defineEmits<{ saved: [] }>();

const NON_BANK_NATURES = ['现金', '微信', '支付宝'];
const NATURE_OPTIONS = ['基本户', '一般户', '外币户', ...NON_BANK_NATURES].map(
  (value) => ({ value }),
);
const ACCOUNT_TYPE_OPTIONS = Object.entries(ACCOUNT_TYPE_LABELS).map(
  ([value, label]) => ({ label, value }),
);

const open = ref(false);
const saving = ref(false);
const formRef = ref<FormInstance>();
const originalName = ref('');
const form = reactive<Api.AccountSaveReq>(empty());

function empty(): Api.AccountSaveReq {
  return {
    accountName: '',
    accountNo: '',
    accountType: 'BANK',
    active: true,
    bankName: '',
    companyId: null,
    currency: 'CNY',
    enabled: true,
    name: '',
    nature: undefined,
    openingBalance: '0',
    openingMonth: `${dayjs().year()}-01`,
    remark: undefined,
    sort: 0,
  };
}

const renaming = computed(
  () => Boolean(form.id) && originalName.value !== '' && originalName.value !== form.name.trim(),
);
const isPrivate = computed(() => form.accountType === 'PRIVATE');
const bankInfoRequired = computed(() =>
  !isPrivate.value && !NON_BANK_NATURES.includes(form.nature?.trim() ?? ''),
);
const companyOptions = computed(() => {
  const choices = props.companies.map(({ id, name }) => ({ label: name, value: id }));
  if (form.companyId != null && !choices.some(({ value }) => value === form.companyId)) {
    choices.push({ label: `公司 #${form.companyId}`, value: form.companyId });
  }
  return choices;
});

/** 从未设置的余额行新增时带入日记账原有名称 */
function show(data?: Api.Account | string, companyId?: null | number) {
  Object.keys(form).forEach((key) => delete (form as Record<string, unknown>)[key]);
  const account = typeof data === 'object' ? data : undefined;
  const { companyName: _companyName, ...fields } = account ?? {};
  Object.assign(form, empty(), fields, {
    accountName: account?.accountName ?? '',
    accountNo: account?.accountNo ?? '',
    accountType: account?.accountType ?? 'BANK',
    active: account?.active ?? true,
    bankName: account?.bankName ?? '',
    companyId: account ? account.companyId ?? null : companyId ?? null,
    name: account?.name ?? (typeof data === 'string' ? data : ''),
  });
  originalName.value = account?.name ?? '';
  open.value = true;
  nextTick(() => formRef.value?.clearValidate());
}
defineExpose({ show });

async function save() {
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }
  saving.value = true;
  try {
    await saveBankAccount({
      ...form,
      accountName: form.accountName.trim(),
      accountNo: form.accountNo.trim(),
      bankName: form.bankName.trim(),
      companyId: form.companyId ?? null,
      name: form.name.trim(),
    });
    message.success(renaming.value ? '已保存，日记账里的写法已同步改名' : '已保存');
    open.value = false;
    emit('saved');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Modal
    v-model:open="open"
    :title="form.id ? '修改账户' : '新增账户'"
    :confirm-loading="saving"
    ok-text="保存"
    width="640px"
    @ok="save"
  >
    <Form ref="formRef" :model="form" layout="vertical" class="account-form">
      <div class="account-grid">
        <FormItem label="所属公司" name="companyId">
          <Select
            :value="form.companyId ?? undefined"
            :options="companyOptions"
            allow-clear
            show-search
            option-filter-prop="label"
            placeholder="未归属主体"
            @update:value="form.companyId = typeof $event === 'number' ? $event : null"
          />
        </FormItem>
        <FormItem label="账户类型" name="accountType">
          <Select v-model:value="form.accountType" :options="ACCOUNT_TYPE_OPTIONS" />
        </FormItem>
        <FormItem
          label="账户简称"
          name="name"
          :rules="[{ required: true, whitespace: true, message: '请填写账户简称' }]"
          extra="填写原有名称可匹配历史日记账"
        >
          <Input
            v-model:value="form.name"
            :maxlength="128"
            :placeholder="isPrivate ? '如 张三代收' : '如 工行基本户'"
          />
        </FormItem>
        <FormItem label="开户行" name="bankName">
          <Input v-model:value="form.bankName" :maxlength="128" />
        </FormItem>
        <FormItem
          label="账户名称"
          name="accountName"
          :rules="[{ required: isPrivate || bankInfoRequired, whitespace: true, message: '请填写账户名称' }]"
        >
          <Input v-model:value="form.accountName" :maxlength="128" />
        </FormItem>
        <FormItem
          label="银行账号"
          name="accountNo"
          :rules="[{ required: bankInfoRequired, whitespace: true, message: '请填写银行账号' }]"
        >
          <Input v-model:value="form.accountNo" :maxlength="64" />
        </FormItem>
        <FormItem label="性质">
          <AutoComplete v-model:value="form.nature" :options="NATURE_OPTIONS" allow-clear />
        </FormItem>
        <FormItem label="币种">
          <Select v-model:value="form.currency" :options="CURRENCY_OPTIONS" show-search />
        </FormItem>
        <FormItem
          label="期初月份"
          name="openingMonth"
          :rules="[{ required: true, message: '请选择期初月份' }]"
        >
          <DatePicker
            v-model:value="form.openingMonth"
            picker="month"
            value-format="YYYY-MM"
            :style="{ width: '100%' }"
            :allow-clear="false"
          />
        </FormItem>
        <FormItem
          label="期初余额（月初）"
          name="openingBalance"
          :rules="[{ required: true, message: '请填写期初余额' }]"
        >
          <InputNumber
            v-model:value="form.openingBalance"
            string-mode
            :precision="2"
            :style="{ width: '100%' }"
            :addon-after="form.currency"
          />
        </FormItem>
        <FormItem label="排序">
          <InputNumber v-model:value="form.sort" :precision="0" :style="{ width: '100%' }" />
        </FormItem>
        <FormItem label="业务可选" extra="停用后，历史关联和余额仍可查询">
          <Switch v-model:checked="form.active" />
        </FormItem>
        <FormItem label="在余额表显示">
          <Switch v-model:checked="form.enabled" />
        </FormItem>
        <FormItem label="备注" class="account-span-2">
          <Input v-model:value="form.remark" :maxlength="512" />
        </FormItem>
      </div>
      <Alert
        type="info"
        show-icon
        :message="`期初余额是 ${form.openingMonth || '期初月份'} 月初账上的钱；这个月之前的日记账收支已经含在期初里，不再重复计算。`"
      />
      <Alert
        v-if="renaming"
        class="mt-2"
        type="warning"
        show-icon
        :message="`日记账里所有「${originalName}」会一起改成「${form.name.trim()}」`"
      />
    </Form>
  </Modal>
</template>

<style scoped>
.account-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
}

.account-span-2 {
  grid-column: span 2;
}

.account-form :deep(.ant-form-item) {
  margin-bottom: 12px;
}
</style>
