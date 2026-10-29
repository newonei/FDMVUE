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

import { CURRENCY_OPTIONS } from '../model';

/**
 * 新增或修改一个银行账户和它的期初余额。开户行名称要和日记账里的收款行/付款行写法一致，
 * 改名时日记账里的旧写法会一起改掉。
 */
const props = defineProps<{ bankNames: string[] }>();
const emit = defineEmits<{ saved: [] }>();

const NATURE_OPTIONS = ['基本户', '一般户', '外币户', '现金', '微信', '支付宝'].map(
  (value) => ({ value }),
);

const open = ref(false);
const saving = ref(false);
const formRef = ref<FormInstance>();
const originalName = ref('');
const form = reactive<Api.Account>(empty());

function empty(): Api.Account {
  return {
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
const nameOptions = computed(() => props.bankNames.map((value) => ({ value })));

/** 新增传开户行名称（余额表里未设置的那行），修改传已有账户 */
function show(data?: Api.Account | string) {
  Object.keys(form).forEach((key) => delete (form as Record<string, unknown>)[key]);
  Object.assign(form, empty(), typeof data === 'object' ? data : { name: data ?? '' });
  originalName.value = typeof data === 'object' ? data.name : '';
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
    await saveBankAccount({ ...form, name: form.name.trim() });
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
    :title="form.id ? '修改银行账户' : '新增银行账户'"
    :confirm-loading="saving"
    ok-text="保存"
    width="640px"
    @ok="save"
  >
    <Form ref="formRef" :model="form" layout="vertical" class="account-form">
      <div class="account-grid">
        <FormItem
          label="开户行"
          name="name"
          class="account-span-2"
          :rules="[{ required: true, whitespace: true, message: '请填写开户行' }]"
          extra="和日记账里的收款行/付款行写法一致，才会算进这个账户"
        >
          <AutoComplete
            v-model:value="form.name"
            :options="nameOptions"
            :filter-option="(input: string, option: { value?: unknown }) => String(option.value ?? '').includes(input.trim())"
            placeholder="如 工行基本户"
          />
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
