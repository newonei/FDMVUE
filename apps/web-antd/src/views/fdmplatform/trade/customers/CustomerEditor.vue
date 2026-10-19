<script setup lang="ts">
import type { SalesChannel } from '../../sales-channel';

import type { CountryOption, Customer } from '#/api/fdmplatform/customers';

import { computed, reactive, ref, watch } from 'vue';

import {
  Alert,
  Button,
  Checkbox,
  Collapse,
  Drawer,
  Form,
  Input,
  message,
  Select,
  Space,
} from 'ant-design-vue';

import { newIdempotencyKey } from '#/api/fdmplatform';
import { getCustomerOptions, saveCustomer } from '#/api/fdmplatform/customers';

import { errorText } from '../../data';
import { salesChannelOf } from '../../sales-channel';
import CustomerSourceOptions from './CustomerSourceOptions.vue';
import {
  countryMatches,
  countrySelectOptions,
  customerFields,
  customerForm,
  customerMissingFields,
  customerSourceOptions,
  invoiceFields,
  invoiceForm,
  invoiceMissingFields,
  invoiceTypeOptions,
} from './model';

const props = defineProps<{
  customer?: Customer;
  initialName?: string;
  open: boolean;
  /** 新建客户的业务线；维护已有客户时以档案为准 */
  salesChannel?: SalesChannel;
  selectAfterSave?: boolean;
}>();
const emit = defineEmits<{ close: []; saved: [customer: Customer] }>();
const form = reactive<Record<string, string>>({});
const invoice = reactive<Record<string, string>>({});
const active = ref(true);
const remark = ref('');
const saving = ref(false);
const panelError = ref('');
const requestKey = ref('');
const countries = ref<CountryOption[]>([]);
const sources = ref<string[]>([]);
const sourcesOpen = ref(false);
const sourceDetail = ref('');
const sourceOptions = computed(() =>
  customerSourceOptions(sources.value, form.customerSource),
);
const channel = computed<SalesChannel>(() =>
  props.customer
    ? salesChannelOf(props.customer.salesChannel)
    : (props.salesChannel ?? 'FOREIGN'),
);
/** 内销客户国家固定为中国，不显示国家选择 */
const domestic = computed(() => channel.value === 'DOMESTIC');
const visibleFields = computed(() =>
  customerFields.filter(
    ([field]) =>
      field !== 'shortName' && !(domestic.value && field === 'country'),
  ),
);
const missingFields = computed(() => customerMissingFields(form));
const invoiceMissing = computed(() => invoiceMissingFields(invoice));
function fieldLabel(key: string, title: string) {
  return domestic.value && key === 'province' ? '省份' : title;
}
const optionsLoading = ref(false);
const optionsError = ref('');
const countryOptions = computed(() => countrySelectOptions(countries.value));
const currentCountryKnown = computed(() =>
  countries.value.some((item) => item.code === form.country),
);
let optionsSequence = 0;
async function loadOptions() {
  const run = ++optionsSequence;
  optionsLoading.value = true;
  optionsError.value = '';
  try {
    const result = await getCustomerOptions();
    if (run === optionsSequence && props.open) {
      countries.value = result.countries;
      sources.value = result.customerSources ?? [];
    }
  } catch (error) {
    if (run === optionsSequence && props.open)
      optionsError.value = errorText(error);
  } finally {
    if (run === optionsSequence) optionsLoading.value = false;
  }
}
function close() {
  if (!saving.value && !sourcesOpen.value) emit('close');
}
watch(
  () => props.open,
  (open) => {
    ++optionsSequence;
    sourcesOpen.value = false;
    if (!open) return;
    Object.assign(form, customerForm(props.customer));
    Object.assign(invoice, invoiceForm(props.customer));
    if (domestic.value) form.country = 'CN';
    if (!props.customer && props.initialName) form.name = props.initialName;
    sourceDetail.value = '';
    if (form.customerSource?.startsWith('其他：')) {
      sourceDetail.value = form.customerSource.slice(3);
      form.customerSource = '其他';
    }
    active.value = props.customer?.active ?? true;
    remark.value = props.customer?.remark ?? '';
    panelError.value = '';
    requestKey.value = newIdempotencyKey();
    void loadOptions();
  },
  { immediate: true },
);
async function save() {
  if (saving.value || sourcesOpen.value) return;
  if (!form.name?.trim()) {
    panelError.value = '请填写客户全称';
    return;
  }
  if (!domestic.value && !currentCountryKnown.value) {
    panelError.value = '请从国家 / 地区列表选择一个有效选项';
    return;
  }
  if (domestic.value && invoiceMissing.value.length > 0) {
    panelError.value = `增值税专用发票须填写${invoiceMissing.value.join('、')}`;
    return;
  }
  saving.value = true;
  panelError.value = '';
  try {
    const customer = await saveCustomer({
      ...Object.fromEntries(
        Object.entries(form).filter(([field]) => field !== 'code'),
      ),
      customerSource:
        form.customerSource === '其他' && sourceDetail.value.trim()
          ? `其他：${sourceDetail.value.trim()}`
          : form.customerSource,
      salesChannel: channel.value,
      // 外贸客户不填开票信息；不传表示保持原值
      invoice: domestic.value ? { ...invoice } : undefined,
      active: active.value,
      remark: remark.value,
      id: props.customer?.id,
      expectedVersion: props.customer?.version,
      idempotencyKey: requestKey.value,
    });
    emit('saved', customer);
    emit('close');
    message.success(
      props.selectAfterSave
        ? '客户已保存并选入当前订单'
        : '客户档案已保存，可在新合同中选择',
    );
  } catch (error) {
    panelError.value = errorText(error);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Drawer
    :open="open"
    :title="customer ? '维护客户档案' : domestic ? '新建内销客户' : '新建客户'"
    width="min(820px, 96vw)"
    :mask-closable="false"
    :closable="!saving && !sourcesOpen"
    :keyboard="!saving && !sourcesOpen"
    @close="close"
  >
    <div class="customer-editor" :inert="sourcesOpen">
      <Alert v-if="panelError" type="error" show-icon :message="panelError" />
      <Alert v-if="optionsError" type="error" show-icon :message="optionsError">
        <template #action>
          <Button size="small" :loading="optionsLoading" @click="loadOptions">
            重新加载国家
          </Button>
        </template>
      </Alert>
      <Alert
        v-if="customer?.sourceSystem === 'OKKI'"
        type="info"
        show-icon
        message="OKKI 公司名称随来源同步。刷新会更新客户名称、公司名称和联系资料；系统客户编号、客户来源、本地备注及启用状态保留，刷新前会展示预览。"
      />
      <Form layout="vertical" class="customer-fields">
        <Form.Item
          v-for="[key, title] in visibleFields"
          :key="key"
          :label="fieldLabel(key, title)"
          :required="['name', 'country'].includes(key)"
          :extra="
            key === 'code'
              ? '首次保存时由系统自动生成，已有编号保持不变。'
              : key === 'customerSource'
                ? '选择获客渠道，与 OKKI / 金智等资料同步来源分别记录。'
                : undefined
          "
          :class="{ wide: key === 'address' }"
        >
          <template v-if="key === 'customerSource'">
            <Select
              v-model:value="form.customerSource"
              :options="sourceOptions"
              show-search
              option-filter-prop="label"
              allow-clear
              :disabled="saving"
              placeholder="选择客户来源"
            />
            <Input
              v-if="form.customerSource === '其他'"
              v-model:value="sourceDetail"
              :maxlength="197"
              :disabled="saving"
              placeholder="补充具体来源（可选）"
              style="margin-top: 8px"
            />
            <Button
              type="link"
              size="small"
              :disabled="saving"
              @click="sourcesOpen = true"
            >
              维护来源选项
            </Button>
          </template>
          <template v-else-if="key === 'country'">
            <Select
              v-model:value="form.country"
              :options="countryOptions"
              :filter-option="countryMatches"
              show-search
              :loading="optionsLoading"
              :disabled="saving || optionsLoading"
              placeholder="搜索中文、英文或国家代码"
            />
            <p
              v-if="form.country && !currentCountryKnown && !optionsLoading"
              class="muted"
            >
              原记录国家：{{ form.country }}。请从固定国家 /
              地区列表重新选择后保存。
            </p>
          </template>
          <Input
            v-else-if="key === 'code'"
            :value="form.code"
            readonly
            placeholder="首次保存后自动生成"
          />
          <Input
            v-else
            v-model:value="form[key]"
            :maxlength="
              ['customerSource', 'companyName'].includes(key) ? 200 : undefined
            "
            :disabled="saving"
          />
        </Form.Item>
        <Form.Item label="本地备注" class="wide">
          <Input.TextArea v-model:value="remark" :rows="3" :disabled="saving" />
        </Form.Item>
      </Form>
      <section v-if="domestic" class="invoice" aria-labelledby="invoice-title">
        <h3 id="invoice-title">开票信息</h3>
        <Form layout="vertical" class="customer-fields">
          <Form.Item
            label="发票类型"
            extra="专用发票须填齐纳税人识别号、注册地址、电话、开户银行和账号。"
          >
            <Select
              v-model:value="invoice.type"
              :options="invoiceTypeOptions"
              allow-clear
              :disabled="saving"
              placeholder="选择发票类型"
            />
          </Form.Item>
          <Form.Item
            v-for="[key, title] in invoiceFields"
            :key="key"
            :label="title"
            :required="
              invoice.type === 'SPECIAL' && !['email', 'title'].includes(key)
            "
            :class="{ wide: key === 'address' }"
          >
            <Input
              v-model:value="invoice[key]"
              :maxlength="key === 'address' ? 1000 : 200"
              :disabled="saving"
              :placeholder="
                key === 'title'
                  ? '留空时使用客户全称'
                  : key === 'taxNo'
                    ? '统一社会信用代码'
                    : key === 'email'
                      ? '接收电子发票'
                      : undefined
              "
            />
          </Form.Item>
        </Form>
      </section>
      <Collapse>
        <Collapse.Panel key="additional" header="更多资料">
          <Form.Item
            label="简称"
            extra="可选，用于历史别名和搜索；不影响客户全称。"
          >
            <Input
              v-model:value="form.shortName"
              :maxlength="200"
              :disabled="saving"
            />
          </Form.Item>
        </Collapse.Panel>
      </Collapse>
      <Alert
        v-if="missingFields.length"
        type="info"
        show-icon
        :message="`待补资料：${missingFields.join('、')}`"
        description="可以先保存客户；联系业务前补齐一种联系方式，安排发货前核对完整地址。"
      />
      <Checkbox v-model:checked="active" :disabled="saving || selectAfterSave">
        启用客户，允许在新合同中选择
      </Checkbox>
      <p class="muted">停用只影响后续选取，已有合同保留原客户快照。</p>
    </div>
    <template #footer>
      <Space>
        <Button :disabled="saving || sourcesOpen" @click="close">取消</Button><Button
          type="primary"
          :loading="saving"
          :disabled="sourcesOpen || optionsLoading || Boolean(optionsError)"
          @click="save"
        >
          {{ selectAfterSave ? '保存并选用' : '保存客户' }}
        </Button>
      </Space>
    </template>
  </Drawer>
  <CustomerSourceOptions
    :open="sourcesOpen"
    @close="sourcesOpen = false"
    @saved="
      (options) => {
        sources = options.customerSources;
      }
    "
  />
</template>

<style scoped>
.customer-editor {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.customer-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 20px;
}

.wide {
  grid-column: 1 / -1;
}

.invoice h3 {
  margin: 0 0 12px;
  font-size: 15px;
  font-weight: 600;
}

.muted {
  color: var(--ant-color-text-secondary);
}

@media (max-width: 600px) {
  .customer-fields {
    grid-template-columns: 1fr;
  }
}
</style>
