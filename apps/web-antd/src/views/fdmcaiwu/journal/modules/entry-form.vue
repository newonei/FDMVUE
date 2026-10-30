<script setup lang="ts">
import type { FormInstance } from 'ant-design-vue';

import type { FdmcaiwuJournalApi as Api } from '#/api/fdmcaiwu/journal';

import { computed, nextTick, reactive, ref, watch } from 'vue';

import {
  AutoComplete,
  Button,
  DatePicker,
  Form,
  FormItem,
  Input,
  InputNumber,
  message,
  Modal,
  Select,
  Tooltip,
} from 'ant-design-vue';

import { createJournal, updateJournal } from '#/api/fdmcaiwu/journal';
import { convertReceiptToRmb } from '#/api/fdmplatform/exchange-rates';

import {
  CURRENCY_OPTIONS,
  DIRECTION_LABELS,
  emptyForm,
  formatMoney,
  INVOICE_STATUS_OPTIONS,
  labels,
  nextForm,
  toRmb,
} from '../model';

/**
 * 一笔收入或支出的录入弹窗。新增时可「保存并继续」：日期、账户、公司、经手人等沿用上一笔，
 * 光标回到金额，适合一口气录一批账。外币按汇率中心当天汇率自动折人民币，可手改。
 */
const props = defineProps<{
  companyNames: string[];
  options?: Api.Options;
}>();
const emit = defineEmits<{ saved: [] }>();

const open = ref(false);
const saving = ref(false);
const formRef = ref<FormInstance>();
const amountRef = ref<{ focus: () => void }>();
const form = reactive<Api.SaveReq>(emptyForm('INCOME'));
const savedCount = ref(0);
/** 手工改过折人民币后，不再被汇率自动覆盖 */
const rmbTouched = ref(false);
const rateLoading = ref(false);
const rateHint = ref('');

const isExpense = computed(() => form.direction === 'EXPENSE');
const isForeign = computed(() => (form.currency || 'CNY') !== 'CNY');
const text = computed(() => labels(form.direction));
const title = computed(
  () => `${form.id ? '编辑' : '新增'}${DIRECTION_LABELS[form.direction]}`,
);
const monthHint = computed(() =>
  form.entryDate ? form.entryDate.slice(0, 7) : '',
);

function toOptions(values?: string[]) {
  return (values ?? []).map((value) => ({ value }));
}
function filterOption(input: string, option: { value?: unknown }) {
  return String(option.value ?? '')
    .toLowerCase()
    .includes(input.trim().toLowerCase());
}
const companyOptions = computed(() =>
  toOptions([
    ...new Set([...props.companyNames, ...(props.options?.companyNames ?? [])]),
  ]),
);

/** 整体换表单内容时不触发取汇率和自动折算，编辑时保留原来的汇率 */
let resetting = false;
function reset(data: Api.SaveReq) {
  resetting = true;
  Object.keys(form).forEach((key) => delete (form as Record<string, unknown>)[key]);
  Object.assign(form, data);
  rmbTouched.value = Boolean(data.id && data.currency !== 'CNY');
  rateHint.value = '';
  nextTick(() => {
    resetting = false;
    formRef.value?.clearValidate();
  });
}

/** 新增：传方向；编辑或复制：传已有数据 */
function show(data: Api.Direction | Api.SaveReq) {
  savedCount.value = 0;
  reset(typeof data === 'string' ? emptyForm(data) : { ...data });
  open.value = true;
  nextTick(() => setTimeout(() => amountRef.value?.focus(), 200));
}
defineExpose({ show });

let rateRequest = 0;
async function loadRate() {
  if (!isForeign.value || !form.entryDate || !form.currency) return;
  const request = ++rateRequest;
  rateLoading.value = true;
  rateHint.value = '';
  try {
    const result = await convertReceiptToRmb({
      amount: 1,
      currency: form.currency,
      date: form.entryDate,
    });
    if (request !== rateRequest) return;
    form.exchangeRate = String(result.rateToCny);
    rateHint.value =
      result.rateDate === form.entryDate
        ? `汇率中心 ${result.rateDate}`
        : `汇率中心 ${result.rateDate}（当天无公布，取最近一天）`;
  } catch {
    if (request === rateRequest) rateHint.value = '汇率获取失败，请手填汇率或折人民币';
  } finally {
    if (request === rateRequest) rateLoading.value = false;
  }
}

watch(
  () => [form.currency, form.entryDate],
  (value, old) => {
    if (resetting || !open.value || !old) return;
    if (!isForeign.value) {
      form.exchangeRate = undefined;
      form.rmbAmount = undefined;
      rmbTouched.value = false;
      rateHint.value = '';
      return;
    }
    if (value[0] !== old[0]) rmbTouched.value = false;
    loadRate();
  },
);
watch(
  () => [form.amount, form.exchangeRate],
  () => {
    if (resetting || !isForeign.value || rmbTouched.value) return;
    form.rmbAmount = toRmb(form.amount, form.exchangeRate);
  },
);

const rmbPreview = computed(() =>
  isForeign.value ? form.rmbAmount : form.amount,
);

function payload(): Api.SaveReq {
  const data: Record<string, unknown> = { ...form };
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') data[key] = value.trim() || undefined;
  }
  data.companyId = undefined;
  if (!isForeign.value) {
    data.exchangeRate = undefined;
    data.rmbAmount = undefined;
  }
  return data as Api.SaveReq;
}

async function save(continueNext: boolean) {
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }
  if (isForeign.value && !form.rmbAmount && !form.exchangeRate) {
    message.warning('外币请填写汇率或折人民币');
    return;
  }
  saving.value = true;
  try {
    const data = payload();
    if (form.id) {
      await updateJournal(data);
      message.success('已保存');
    } else {
      await createJournal(data);
      savedCount.value++;
      message.success(
        continueNext ? `已保存第 ${savedCount.value} 笔，继续录入` : '已保存',
      );
    }
    emit('saved');
    if (continueNext && !form.id) {
      reset(nextForm(form));
      nextTick(() => amountRef.value?.focus());
    } else {
      open.value = false;
    }
  } finally {
    saving.value = false;
  }
}

/** Ctrl/⌘ + Enter：新增时保存并继续，编辑时保存 */
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    if (!saving.value) save(!form.id);
  }
}
</script>

<template>
  <Modal
    v-model:open="open"
    :title="title"
    :mask-closable="!saving"
    width="960px"
    destroy-on-close
    :body-style="{ paddingTop: '8px' }"
  >
    <div @keydown="onKeydown">
      <Form ref="formRef" :model="form" layout="vertical" class="journal-form">
        <section class="journal-section">
          <h3>金额</h3>
          <div class="journal-grid">
            <FormItem
              label="日期"
              name="entryDate"
              :rules="[{ required: true, message: '请选择日期' }]"
            >
              <DatePicker
                v-model:value="form.entryDate"
                value-format="YYYY-MM-DD"
                class="w-full"
                :allow-clear="false"
              />
            </FormItem>
            <FormItem
              :label="text.amount"
              name="amount"
              :rules="[{ required: true, message: `请填写${text.amount}` }]"
            >
              <InputNumber
                ref="amountRef"
                v-model:value="form.amount"
                :style="{ width: '100%' }"
                string-mode
                :precision="2"
                placeholder="0.00"
              />
            </FormItem>
            <FormItem label="币种">
              <Select
                v-model:value="form.currency"
                :options="CURRENCY_OPTIONS"
                show-search
              />
            </FormItem>
            <template v-if="isForeign">
              <FormItem label="汇率（1 外币 = ? 人民币）">
                <InputNumber
                  v-model:value="form.exchangeRate"
                  :style="{ width: '100%' }"
                  string-mode
                  :precision="6"
                  :min="0"
                  :disabled="rateLoading"
                  @change="rmbTouched = false"
                />
                <div class="journal-hint">{{ rateLoading ? '正在取汇率…' : rateHint }}</div>
              </FormItem>
              <FormItem label="折人民币">
                <InputNumber
                  v-model:value="form.rmbAmount"
                  :style="{ width: '100%' }"
                  string-mode
                  :precision="2"
                  @change="rmbTouched = true"
                />
                <div class="journal-hint">
                  {{ rmbTouched ? '已手工填写' : '按汇率自动计算，可手改' }}
                </div>
              </FormItem>
            </template>
            <FormItem v-else label="折人民币">
              <div class="journal-readonly">¥ {{ formatMoney(rmbPreview) }}</div>
            </FormItem>
            <FormItem>
              <template #label>
                <Tooltip title="默认取日期所在月；跨月入账（如 12 月的账 1 月才记）时改这里">
                  <span>月份</span>
                </Tooltip>
              </template>
              <DatePicker
                v-model:value="form.entryMonth"
                picker="month"
                value-format="YYYY-MM"
                class="w-full"
                :placeholder="monthHint ? `${monthHint}（跟随日期）` : '跟随日期'"
              />
            </FormItem>
            <FormItem label="摘要" class="journal-span-3">
              <Input
                v-model:value="form.summary"
                :maxlength="512"
                placeholder="例如：收 ACME 10 月货款"
              />
            </FormItem>
          </div>
        </section>

        <section class="journal-section">
          <h3>归属</h3>
          <div class="journal-grid">
            <FormItem label="所属公司">
              <AutoComplete
                v-model:value="form.companyName"
                :options="companyOptions"
                :filter-option="filterOption"
                allow-clear
                placeholder="可输入简称"
              />
            </FormItem>
            <FormItem :label="text.bank">
              <AutoComplete
                v-model:value="form.bankAccount"
                :options="toOptions(options?.bankAccounts)"
                :filter-option="filterOption"
                allow-clear
              />
            </FormItem>
            <FormItem label="类别">
              <AutoComplete
                v-model:value="form.category"
                :options="toOptions(options?.categories)"
                :filter-option="filterOption"
                allow-clear
              />
            </FormItem>
            <FormItem label="部门">
              <AutoComplete
                v-model:value="form.deptName"
                :options="toOptions(options?.deptNames)"
                :filter-option="filterOption"
                allow-clear
              />
            </FormItem>
            <FormItem label="经手人">
              <AutoComplete
                v-model:value="form.handlerName"
                :options="toOptions(options?.handlerNames)"
                :filter-option="filterOption"
                allow-clear
              />
            </FormItem>
            <FormItem :label="text.counterparty">
              <AutoComplete
                v-model:value="form.counterparty"
                :options="toOptions(options?.counterparties)"
                :filter-option="filterOption"
                allow-clear
              />
            </FormItem>
            <FormItem :label="text.remark" class="journal-span-3">
              <Input v-model:value="form.remark" :maxlength="512" />
            </FormItem>
          </div>
        </section>

        <section v-if="isExpense" class="journal-section">
          <h3>票据与送达</h3>
          <div class="journal-grid">
            <FormItem label="票据类型">
              <AutoComplete
                v-model:value="form.billType"
                :options="toOptions(options?.billTypes)"
                :filter-option="filterOption"
                allow-clear
                placeholder="如 专票 / 普票 / 收据"
              />
            </FormItem>
            <FormItem label="是否收到发票">
              <Select
                v-model:value="form.invoiceStatus"
                :options="INVOICE_STATUS_OPTIONS"
                allow-clear
              />
            </FormItem>
            <FormItem label="付款方式">
              <AutoComplete
                v-model:value="form.paymentMethod"
                :options="toOptions(options?.paymentMethods)"
                :filter-option="filterOption"
                allow-clear
                placeholder="如 转账 / 现金 / 承兑"
              />
            </FormItem>
            <FormItem label="发票号">
              <Input v-model:value="form.invoiceNo" :maxlength="255" />
            </FormItem>
            <FormItem label="发票金额">
              <InputNumber
                v-model:value="form.invoiceAmount"
                :style="{ width: '100%' }"
                string-mode
                :precision="2"
              />
            </FormItem>
            <div></div>
            <FormItem label="送达人">
              <AutoComplete
                v-model:value="form.deliverer"
                :options="toOptions(options?.deliverers)"
                :filter-option="filterOption"
                allow-clear
              />
            </FormItem>
            <FormItem label="送达日期">
              <DatePicker
                v-model:value="form.deliveredDate"
                value-format="YYYY-MM-DD"
                class="w-full"
              />
            </FormItem>
          </div>
        </section>
      </Form>
    </div>

    <template #footer>
      <div class="flex items-center justify-between gap-2">
        <span class="text-xs text-muted-foreground">
          <template v-if="!form.id">Ctrl/⌘ + Enter 保存并继续</template>
        </span>
        <div class="flex gap-2">
          <Button :disabled="saving" @click="open = false">取消</Button>
          <Button v-if="!form.id" :loading="saving" @click="save(true)">
            保存并继续
          </Button>
          <Button type="primary" :loading="saving" @click="save(false)">
            保存
          </Button>
        </div>
      </div>
    </template>
  </Modal>
</template>

<style scoped>
.journal-section {
  padding: 12px 16px 0;
  margin-bottom: 12px;
  background: var(--ant-color-fill-quaternary, #fafafa);
  border: 1px solid var(--ant-color-border-secondary, #f0f0f0);
  border-radius: 8px;
}

.journal-section h3 {
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
}

.journal-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0 16px;
}

.journal-span-3 {
  grid-column: span 3;
}

.journal-form :deep(.ant-form-item) {
  margin-bottom: 12px;
}

.journal-hint {
  margin-top: 2px;
  font-size: 12px;
  color: var(--ant-color-text-tertiary, #999);
}

.journal-readonly {
  height: 32px;
  font-variant-numeric: tabular-nums;
  line-height: 32px;
  color: var(--ant-color-text-secondary, #666);
}

@media (max-width: 900px) {
  .journal-grid {
    grid-template-columns: 1fr;
  }

  .journal-span-3 {
    grid-column: auto;
  }
}
</style>
