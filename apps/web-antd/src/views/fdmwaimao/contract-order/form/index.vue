<script lang="ts" setup>
import type { Dayjs } from 'dayjs';

import type { FdmWaimaoContractOrderApi } from '#/api/fdmwaimao/contract-order';

import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import {
  Alert,
  Button,
  DatePicker,
  Input,
  InputNumber,
  message,
  Select,
  Spin,
  Tag,
} from 'ant-design-vue';
import BigNumber from 'bignumber.js';
import dayjs from 'dayjs';

import {
  createContractOrder,
  getContractOrder,
  getContractOrderContactOptions,
  getContractOrderFormOptions,
  previewContractOrderAmount,
  updateContractOrder,
} from '#/api/fdmwaimao/contract-order';
import { getCustomerPage } from '#/api/fdmwaimao/customer';
import { useFdmWaimaoAiContext } from '#/views/fdm-trade-shared/ai-assistant/context';

import {
  calculateContractAmount,
  formatCurrencyAmount,
  isDecimalInRange,
} from '../amount';
import ContractOrderLineEditor from '../components/ContractOrderLineEditor.vue';
import {
  buildAmountPreviewPayload,
  buildContactOptionsParams,
  buildContractFulfillmentContext,
  buildContractSavePayload,
  buildContractUpdatePayload,
  contactSelectPlaceholder,
  createEmptyContractForm,
  hydrateContractForm,
  normalizeContractDate,
  normalizeContractRequirementCodes,
  validateContractForm,
} from '../form-model';

defineOptions({ name: 'FdmWaimaoContractOrderForm' });

interface CustomerSelectOption {
  label: string;
  value: string;
}

const route = useRoute();
const router = useRouter();
const { hasAccessByCodes } = useAccess();

const CURRENCY_OPTIONS = ['USD', 'EUR', 'CNY', 'GBP', 'AUD', 'CAD', 'JPY'].map(
  (value) => ({ label: value, value }),
);
const ORDER_TYPE_OPTIONS = [
  { label: '大货订单', value: 'BULK' },
  { label: '样品订单', value: 'SAMPLE' },
];
const FULFILLMENT_MODE_OPTIONS = [
  { label: '标准履约', value: 'STANDARD' },
  { label: '直发履约', value: 'DIRECT_SHIP' },
  { label: '混合履约', value: 'MIXED' },
];
const DIRECT_SHIP_OPTIONS = [
  { label: '否，不强制直发', value: 'NO' },
  { label: '是，必须直发', value: 'YES' },
];
const REQUIREMENT_TOKEN_SEPARATORS = [',', ';', ' ', '\n'];

type RequirementField =
  | 'certificationRequirements'
  | 'countryComplianceRequirements'
  | 'customerComplianceRequirements'
  | 'packagingRequirements';

const form = reactive(createEmptyContractForm());
const formOptions = ref<FdmWaimaoContractOrderApi.FormOptions>({
  companies: [],
  owners: [],
});
const customerOptions = ref<CustomerSelectOption[]>([]);
const contacts = ref<FdmWaimaoContractOrderApi.ContactOption[]>([]);
const loading = ref(false);
const saving = ref(false);
const customerSearching = ref(false);
const contactLoading = ref(false);
const previewing = ref(false);
const serverPreview = ref<FdmWaimaoContractOrderApi.AmountPreview>();
const previewWarning = ref('');
const validationMessages = ref<string[]>([]);

let loadRequestId = 0;
let customerSearchRequestId = 0;
let contactRequestId = 0;
let previewRequestId = 0;
let previewTimer: ReturnType<typeof setTimeout> | undefined;
let customerSearchTimer: ReturnType<typeof setTimeout> | undefined;

const orderId = computed(() => String(route.params.id || ''));
const isEdit = computed(() => Boolean(orderId.value));
const canCreate = computed(() =>
  hasAccessByCodes(['fdmwaimao:contract-order:create']),
);
const canUpdate = computed(() =>
  hasAccessByCodes(['fdmwaimao:contract-order:update']),
);
const canSave = computed(() =>
  isEdit.value ? canUpdate.value : canCreate.value,
);
const ownerLocked = computed(() => formOptions.value.ownerEditable === false);
const companyLockedByProductSelection = computed(() =>
  form.items.some((item) => item.entrySource === 'PRODUCT_CENTER'),
);
const fulfillmentContext = computed(() =>
  buildContractFulfillmentContext(form),
);
const directShipSelection = computed<'NO' | 'YES' | undefined>({
  get: () => {
    if (form.directShipRequired === true) return 'YES';
    if (form.directShipRequired === false) return 'NO';
    return undefined;
  },
  set: (value) => {
    if (value === 'YES') {
      form.directShipRequired = true;
      return;
    }
    form.directShipRequired = value === 'NO' ? false : undefined;
  },
});

useFdmWaimaoAiContext(() => ({
  businessId: orderId.value || undefined,
  context: {
    amountPreview: serverPreview.value,
    draft: { ...form },
    fulfillmentConstraints: fulfillmentContext.value,
    validationMessages: validationMessages.value,
  },
  contextMode: 'form',
  entityLabel:
    form.subject || (isEdit.value ? `合同 ${orderId.value}` : '未保存合同草稿'),
  surfaceKey: 'contract-order',
  volatile: true,
}));

const ownerOptions = computed(() => {
  const options = [...(formOptions.value.owners ?? [])];
  const currentUserId = formOptions.value.currentUserId;
  if (currentUserId && !options.some((item) => item.id === currentUserId)) {
    options.unshift({
      id: currentUserId,
      name: formOptions.value.currentUser || '当前用户',
    });
  }
  return options.map((item) => ({
    disabled: item.disabled || item.selectable === false,
    label: item.deptName ? `${item.name} · ${item.deptName}` : item.name,
    value: item.id,
  }));
});

const companyOptions = computed(() =>
  (formOptions.value.companies ?? []).map((item) => ({
    label: item.name,
    value: item.id,
  })),
);

const contactOptions = computed(() =>
  contacts.value.map((item) => ({
    label: [item.name || '未命名联系人', item.title, item.email || item.phone]
      .filter(Boolean)
      .join(' · '),
    value: item.id,
  })),
);

const localAmount = computed(() =>
  calculateContractAmount({
    additionalFeeAmount: form.additionalFeeAmount,
    items: form.items,
    orderDiscountRate: form.orderDiscountRate,
    roundingDiscountAmount: form.roundingDiscountAmount,
  }),
);

const effectiveAmount = computed(() => {
  const preview = serverPreview.value;
  if (!preview) return localAmount.value;
  return {
    ...localAmount.value,
    additionalFeeAmount: preview.additionalFeeAmount,
    discountedProductAmount: preview.discountedProductAmount,
    orderDiscountRate: preview.orderDiscountRate,
    productAmount: preview.productAmount,
    roundingDiscountAmount: preview.roundingDiscountAmount,
    totalAmount: preview.totalAmount,
  };
});

const lineAmounts = computed(() => {
  const serverLineAmounts = serverPreview.value?.lineAmounts;
  if (serverLineAmounts?.length === form.items.length) {
    return serverLineAmounts;
  }
  return localAmount.value.itemAmounts;
});

function resetForm() {
  const empty = createEmptyContractForm();
  Object.keys(form).forEach((key) =>
    Reflect.deleteProperty(form as Record<string, unknown>, key),
  );
  Object.assign(form, empty);
  contacts.value = [];
  customerOptions.value = [];
  validationMessages.value = [];
  serverPreview.value = undefined;
}

async function searchCustomersNow(keyword = '') {
  const requestId = ++customerSearchRequestId;
  customerSearching.value = true;
  try {
    const result = await getCustomerPage({
      keyword: keyword.trim() || undefined,
      pageNo: 1,
      pageSize: 30,
    });
    if (requestId !== customerSearchRequestId) return;
    const options = (result.list ?? []).map((item) => ({
      label: `${item.name} · ${item.customerCode}`,
      value: item.id,
    }));
    if (
      form.customerId &&
      form.customerName &&
      !options.some((item) => item.value === form.customerId)
    ) {
      options.unshift({ label: form.customerName, value: form.customerId });
    }
    customerOptions.value = options;
  } finally {
    if (requestId === customerSearchRequestId) customerSearching.value = false;
  }
}

function searchCustomers(keyword: string) {
  if (customerSearchTimer) clearTimeout(customerSearchTimer);
  customerSearchTimer = setTimeout(() => void searchCustomersNow(keyword), 300);
}

async function loadCustomerContacts(customerId: string, keepContact = false) {
  const requestId = ++contactRequestId;
  contactLoading.value = true;
  contacts.value = [];
  if (!keepContact) form.contactId = undefined;
  try {
    const result = await getContractOrderContactOptions(
      buildContactOptionsParams(form, customerId),
    );
    if (requestId !== contactRequestId || form.customerId !== customerId)
      return;
    contacts.value = result ?? [];
    if (
      form.contactId &&
      !contacts.value.some((item) => item.id === form.contactId)
    ) {
      form.contactId = undefined;
    }
  } finally {
    if (requestId === contactRequestId) contactLoading.value = false;
  }
}

function handleCustomerChange(value: unknown) {
  const customerId =
    value === null || value === undefined ? undefined : String(value);
  form.customerId = customerId;
  form.customerName = customerOptions.value.find(
    (item) => item.value === customerId,
  )?.label;
  form.contactId = undefined;
  contacts.value = [];
  if (customerId) void loadCustomerContacts(customerId);
}

function setSignDate(value: Dayjs | null | string) {
  form.signDate = normalizeContractDate(value);
}

function setDeliveryDate(value: Dayjs | null | string) {
  form.requiredDeliveryDate = normalizeContractDate(value);
}

function normalizeConstraintText(field: 'deliveryLocation' | 'incoterm') {
  form[field] = form[field].trim().toUpperCase();
}

function normalizeRequirements(field: RequirementField) {
  form[field] = normalizeContractRequirementCodes(form[field]);
}

function amountInputsReady() {
  if (!isDecimalInRange(form.orderDiscountRate, 0, 100)) return false;
  if (!isDecimalInRange(form.roundingDiscountAmount, 0)) return false;
  if (!isDecimalInRange(form.additionalFeeAmount, 0)) return false;
  if (
    new BigNumber(form.additionalFeeAmount).gt(0) &&
    !form.additionalFeeCategory.trim()
  ) {
    return false;
  }
  return (
    form.items.length > 0 &&
    form.items.every(
      (item) =>
        item.name.trim() &&
        isDecimalInRange(item.unitPrice, 0) &&
        isDecimalInRange(item.quantity, 0) &&
        new BigNumber(item.quantity).gt(0) &&
        isDecimalInRange(item.discountRate, 0, 100),
    )
  );
}

function scheduleAmountPreview() {
  previewRequestId += 1;
  const requestId = previewRequestId;
  serverPreview.value = undefined;
  previewWarning.value = '';
  if (previewTimer) clearTimeout(previewTimer);
  if (!amountInputsReady()) {
    previewing.value = false;
    return;
  }
  previewTimer = setTimeout(async () => {
    previewing.value = true;
    try {
      const result = await previewContractOrderAmount(
        buildAmountPreviewPayload(form),
      );
      if (requestId === previewRequestId) serverPreview.value = result;
    } catch {
      if (requestId === previewRequestId) {
        previewWarning.value =
          '服务端金额校验暂不可用，当前显示本地预览；保存时仍以后端为准。';
      }
    } finally {
      if (requestId === previewRequestId) previewing.value = false;
    }
  }, 450);
}

async function initialize() {
  const requestId = ++loadRequestId;
  resetForm();
  loading.value = true;
  try {
    const [options, detail] = await Promise.all([
      getContractOrderFormOptions(),
      orderId.value
        ? getContractOrder(orderId.value)
        : Promise.resolve(undefined),
    ]);
    if (requestId !== loadRequestId) return;
    formOptions.value = options;
    if (detail) {
      if (detail.status !== 'DRAFT') {
        message.warning('只有草稿合同可以编辑，已为你打开合同详情');
        await router.replace(`/fdmwaimao/contract-order/detail/${detail.id}`);
        return;
      }
      Object.assign(form, hydrateContractForm(detail));
      customerOptions.value = [
        { label: detail.customerName, value: detail.customerId },
      ];
      await loadCustomerContacts(detail.customerId, true);
    } else {
      form.ownerUserId = options.currentUserId ?? undefined;
      form.currency = options.defaultCurrency || form.currency;
      form.orderType = options.defaultOrderType || form.orderType;
      form.signDate =
        normalizeContractDate(options.defaultSignDate) || form.signDate;
      await searchCustomersNow();
    }
  } finally {
    if (requestId === loadRequestId) loading.value = false;
  }
}

async function save() {
  if (!canSave.value || saving.value) return;
  const issues = validateContractForm(form);
  validationMessages.value = issues.map((item) => item.message);
  if (issues.length > 0) {
    message.error(issues[0]?.message || '请检查必填信息');
    return;
  }

  saving.value = true;
  try {
    let id: string;
    if (isEdit.value) {
      await updateContractOrder(buildContractUpdatePayload(form));
      id = form.id!;
    } else {
      id = await createContractOrder(buildContractSavePayload(form));
    }
    message.success(isEdit.value ? '合同草稿已更新' : '合同草稿已创建');
    await router.replace(`/fdmwaimao/contract-order/detail/${id}`);
  } finally {
    saving.value = false;
  }
}

function backToList() {
  void router.push('/fdmwaimao/contract-order');
}

watch(orderId, initialize, { immediate: true });
watch(form, scheduleAmountPreview, { deep: true });

onBeforeUnmount(() => {
  if (previewTimer) clearTimeout(previewTimer);
  if (customerSearchTimer) clearTimeout(customerSearchTimer);
  previewRequestId += 1;
  customerSearchRequestId += 1;
  contactRequestId += 1;
});
</script>

<template>
  <Page
    :auto-content-height="false"
    :description="
      isEdit
        ? `仅可编辑 DRAFT；当前版本 ${form.version ?? '-'}`
        : '创建合同草稿；产品可从产品中心选取或继续手工录入，回填后仍可编辑。'
    "
    :title="isEdit ? `编辑合同 ${form.orderNo || ''}` : '新建合同订单'"
  >
    <template #extra>
      <Button @click="backToList">
        <template #icon>
          <IconifyIcon icon="lucide:arrow-left" aria-hidden="true" />
        </template>
        返回列表
      </Button>
      <Tag color="blue">DRAFT</Tag>
    </template>

    <Spin :spinning="loading">
      <div class="contract-order-form__canvas">
        <Alert
          v-if="validationMessages.length"
          class="contract-order-form__alert"
          closable
          type="error"
          @close="validationMessages = []"
        >
          <template #message>请完成以下信息</template>
          <template #description>
            <ul>
              <li v-for="item in validationMessages.slice(0, 6)" :key="item">
                {{ item }}
              </li>
            </ul>
          </template>
        </Alert>

        <section class="contract-order-form__section">
          <h2><span>基本信息</span></h2>
          <div class="contract-order-form__grid">
            <label
              class="contract-order-form__field contract-order-form__field--wide"
            >
              <span>主题 <b>*</b></span>
              <Input
                v-model:value="form.subject"
                :maxlength="150"
                placeholder="请输入订单主题"
                show-count
              />
            </label>

            <label
              class="contract-order-form__field contract-order-form__field--wide"
            >
              <span>阿里信保单号 <b>*</b></span>
              <Input
                v-model:value="form.alibabaTradeAssuranceNo"
                :maxlength="200"
                placeholder="请输入阿里信保单号；非报关订单请填写“不报关”"
              />
            </label>

            <label class="contract-order-form__field">
              <span>合同单号</span>
              <Input :value="form.orderNo || '保存后由系统生成'" disabled />
            </label>
            <label class="contract-order-form__field">
              <span>订单类型 <b>*</b></span>
              <Select
                v-model:value="form.orderType"
                :options="ORDER_TYPE_OPTIONS"
              />
            </label>

            <label
              class="contract-order-form__field contract-order-form__field--wide"
            >
              <span>对应客户 <b>*</b></span>
              <Select
                allow-clear
                :filter-option="false"
                :loading="customerSearching"
                :options="customerOptions"
                placeholder="搜索真实交易客户名称或编号"
                show-search
                :value="form.customerId"
                @change="handleCustomerChange"
                @dropdown-visible-change="
                  (open: boolean) => open && searchCustomersNow()
                "
                @search="searchCustomers"
              />
            </label>

            <label class="contract-order-form__field">
              <span>对应联系人</span>
              <Select
                v-model:value="form.contactId"
                allow-clear
                :disabled="!form.customerId"
                :loading="contactLoading"
                :options="contactOptions"
                :placeholder="contactSelectPlaceholder(form.customerId)"
                show-search
              />
            </label>
            <label class="contract-order-form__field">
              <span>所有者</span>
              <Select
                v-model:value="form.ownerUserId"
                allow-clear
                :disabled="ownerLocked"
                :options="ownerOptions"
                placeholder="默认当前用户"
                show-search
              />
              <small v-if="ownerLocked">当前账号只能为自己创建订单</small>
            </label>

            <label class="contract-order-form__field">
              <span>签单日期 <b>*</b></span>
              <DatePicker
                class="w-full"
                :value="form.signDate ? dayjs(form.signDate) : undefined"
                @change="setSignDate"
              />
            </label>
            <label class="contract-order-form__field">
              <span>订单所属公司 <b>*</b></span>
              <Select
                v-model:value="form.companyId"
                :disabled="companyLockedByProductSelection"
                :options="companyOptions"
                placeholder="请选择真实公司主体"
                show-search
              />
              <small v-if="companyLockedByProductSelection">
                产品中心 SKU
                按公司校验；请先将相关明细转为手工行或删除，再切换公司
              </small>
            </label>

            <label class="contract-order-form__field">
              <span>要求交付日期</span>
              <DatePicker
                class="w-full"
                :value="
                  form.requiredDeliveryDate
                    ? dayjs(form.requiredDeliveryDate)
                    : undefined
                "
                @change="setDeliveryDate"
              />
            </label>
            <label class="contract-order-form__field">
              <span>币种 <b>*</b></span>
              <Select
                v-model:value="form.currency"
                :disabled="companyLockedByProductSelection"
                :options="CURRENCY_OPTIONS"
                show-search
              />
              <small v-if="companyLockedByProductSelection">
                已选产品中心 SKU
                的参考价按当前币种形成交易快照；请先转为手工行或删除，再切换币种
              </small>
            </label>

            <label class="contract-order-form__field">
              <span>付款条款</span>
              <Input
                v-model:value="form.paymentTerms"
                :maxlength="500"
                placeholder="如 30% 定金，70% 发货前付清"
              />
            </label>
          </div>
        </section>

        <section class="contract-order-form__section">
          <div class="contract-order-form__section-heading">
            <h2><span>履约与合规约束</span></h2>
            <div class="contract-order-form__preview-state">
              <Tag
                :color="
                  fulfillmentContext.confirmationReady ? 'success' : 'warning'
                "
              >
                {{
                  fulfillmentContext.confirmationReady
                    ? '可确认合同'
                    : `确认前还需完善 ${fulfillmentContext.confirmationIssues.length} 项`
                }}
              </Tag>
            </div>
          </div>

          <Alert
            class="contract-order-form__constraint-note"
            message="草稿可暂存未完成约束；确认合同时这些字段必须完整，并将进入后续履约需求的权威快照。四类清单为空表示明确无额外要求。"
            show-icon
            type="info"
          />

          <div class="contract-order-form__grid">
            <label class="contract-order-form__field">
              <span>贸易术语 <b>*</b></span>
              <Input
                v-model:value="form.incoterm"
                :maxlength="64"
                placeholder="如 FOB / CIF / DDP"
                @blur="normalizeConstraintText('incoterm')"
              />
              <small>确认必填；保存时统一转为大写代码</small>
            </label>

            <label class="contract-order-form__field">
              <span>交付地点代码 <b>*</b></span>
              <Input
                v-model:value="form.deliveryLocation"
                :maxlength="128"
                placeholder="如 SHANGHAI / US:LAX / DE-HAM"
                @blur="normalizeConstraintText('deliveryLocation')"
              />
              <small>结构化代码，可包含 . _ : / -，不填写自由文本地址</small>
            </label>

            <label class="contract-order-form__field">
              <span>履约方式 <b>*</b></span>
              <Select
                v-model:value="form.fulfillmentMode"
                allow-clear
                :options="FULFILLMENT_MODE_OPTIONS"
                placeholder="确认前请选择履约方式"
              />
            </label>

            <label class="contract-order-form__field">
              <span>是否必须直发 <b>*</b></span>
              <Select
                v-model:value="directShipSelection"
                allow-clear
                :options="DIRECT_SHIP_OPTIONS"
                placeholder="确认前请明确选择"
              />
              <small
                v-if="
                  form.directShipRequired === true &&
                  !['DIRECT_SHIP', 'MIXED'].includes(form.fulfillmentMode || '')
                "
                class="contract-order-form__field-warning"
              >
                必须直发时，履约方式只能选择“直发履约”或“混合履约”
              </small>
            </label>

            <label class="contract-order-form__field">
              <span>包装要求代码</span>
              <Select
                v-model:value="form.packagingRequirements"
                mode="tags"
                placeholder="输入代码后回车；空清单表示无额外要求"
                :token-separators="REQUIREMENT_TOKEN_SEPARATORS"
                @blur="normalizeRequirements('packagingRequirements')"
              />
              <small>最多 50 项；每项最长 64 位</small>
            </label>

            <label class="contract-order-form__field">
              <span>认证要求代码</span>
              <Select
                v-model:value="form.certificationRequirements"
                mode="tags"
                placeholder="如 CE / FDA / REACH"
                :token-separators="REQUIREMENT_TOKEN_SEPARATORS"
                @blur="normalizeRequirements('certificationRequirements')"
              />
              <small>使用可审计的认证代码，不填写说明性长文本</small>
            </label>

            <label class="contract-order-form__field">
              <span>国家合规要求代码</span>
              <Select
                v-model:value="form.countryComplianceRequirements"
                mode="tags"
                placeholder="输入目的国法规或合规代码"
                :token-separators="REQUIREMENT_TOKEN_SEPARATORS"
                @blur="normalizeRequirements('countryComplianceRequirements')"
              />
              <small>代码将进入履约、采购与生产约束快照</small>
            </label>

            <label class="contract-order-form__field">
              <span>客户合规要求代码</span>
              <Select
                v-model:value="form.customerComplianceRequirements"
                mode="tags"
                placeholder="输入客户专属合规代码"
                :token-separators="REQUIREMENT_TOKEN_SEPARATORS"
                @blur="normalizeRequirements('customerComplianceRequirements')"
              />
              <small>客户个性化要求请使用稳定代码管理</small>
            </label>
          </div>
        </section>

        <section class="contract-order-form__section">
          <h2><span>产品明细</span></h2>
          <ContractOrderLineEditor
            v-model="form.items"
            :company-id="form.companyId"
            :currency="form.currency"
            :line-amounts="lineAmounts"
            :product-amount="effectiveAmount.productAmount"
          />
        </section>

        <section class="contract-order-form__section">
          <div class="contract-order-form__section-heading">
            <h2><span>金额与费用</span></h2>
            <div class="contract-order-form__preview-state">
              <Tag v-if="previewing" color="processing">服务端校验中</Tag>
              <Tag v-else-if="serverPreview" color="success">服务端已校验</Tag>
              <Tag v-else>本地预览</Tag>
            </div>
          </div>

          <Alert
            v-if="previewWarning"
            class="contract-order-form__preview-warning"
            :message="previewWarning"
            show-icon
            type="warning"
          />

          <div class="contract-order-form__formula">
            总金额 = 产品合计 × 整单折扣率 ÷ 100 − 优惠抹零 + 附加费用
          </div>

          <div class="contract-order-form__amount-grid">
            <label class="contract-order-form__field">
              <span>产品合计</span>
              <Input
                :addon-before="form.currency"
                :value="formatCurrencyAmount(effectiveAmount.productAmount)"
                disabled
              />
            </label>
            <label class="contract-order-form__field">
              <span>整单折扣率 % <b>*</b></span>
              <InputNumber
                v-model:value="form.orderDiscountRate"
                class="w-full"
                :max="100"
                :min="0"
                :precision="4"
                string-mode
              />
            </label>
            <label class="contract-order-form__field">
              <span>折后产品金额</span>
              <Input
                :addon-before="form.currency"
                :value="
                  formatCurrencyAmount(effectiveAmount.discountedProductAmount)
                "
                disabled
              />
            </label>
            <label class="contract-order-form__field">
              <span>优惠抹零</span>
              <InputNumber
                v-model:value="form.roundingDiscountAmount"
                class="w-full"
                :min="0"
                :precision="2"
                string-mode
              />
            </label>
            <label class="contract-order-form__field">
              <span>附加费用分类</span>
              <Input
                v-model:value="form.additionalFeeCategory"
                :maxlength="64"
                placeholder="如运费、打样费、保险费"
              />
            </label>
            <label class="contract-order-form__field">
              <span>附加费用金额</span>
              <InputNumber
                v-model:value="form.additionalFeeAmount"
                class="w-full"
                :min="0"
                :precision="2"
                string-mode
              />
            </label>
          </div>

          <div class="contract-order-form__grand-total">
            <span>总金额</span>
            <strong>
              {{ form.currency }}
              {{ formatCurrencyAmount(effectiveAmount.totalAmount) }}
            </strong>
          </div>
        </section>

        <section class="contract-order-form__section">
          <h2><span>备注</span></h2>
          <Input.TextArea
            v-model:value="form.remark"
            :auto-size="{ minRows: 5, maxRows: 10 }"
            :maxlength="2000"
            placeholder="填写包装、交付、商务约定等补充说明"
            show-count
          />
        </section>

        <div class="contract-order-form__sticky-footer">
          <div>
            <strong>{{ isEdit ? '编辑合同草稿' : '新建合同草稿' }}</strong>
            <span>保存后可在合同列表核对并确认；确认后成交快照冻结。</span>
          </div>
          <div class="contract-order-form__footer-actions">
            <Button @click="backToList">取消</Button>
            <Button
              :disabled="!canSave"
              :loading="saving"
              type="primary"
              @click="save"
            >
              <template #icon>
                <IconifyIcon icon="lucide:save" aria-hidden="true" />
              </template>
              保存草稿
            </Button>
          </div>
        </div>
      </div>
    </Spin>
  </Page>
</template>

<style scoped>
.contract-order-form__canvas {
  max-width: 1540px;
  margin: 0 auto;
  color: #172033;
}

.contract-order-form__alert,
.contract-order-form__section {
  margin-bottom: 14px;
}

.contract-order-form__section {
  padding: 18px 20px 20px;
  overflow: hidden;
  background: #fff;
  border: 1px solid #e5eaf1;
  border-radius: 5px;
  box-shadow: 0 1px 2px rgb(15 23 42 / 4%);
}

.contract-order-form__section h2 {
  position: relative;
  display: flex;
  align-items: center;
  height: 30px;
  padding: 0 20px;
  margin: -18px -20px 18px;
  font-size: 14px;
  font-weight: 600;
  color: #0f4c81;
  background: #f3f8fd;
  border-bottom: 1px solid #dbeaf7;
}

.contract-order-form__section h2::before {
  width: 3px;
  height: 14px;
  margin-right: 8px;
  content: '';
  background: #1677ff;
  border-radius: 2px;
}

.contract-order-form__section-heading {
  position: relative;
}

.contract-order-form__preview-state {
  position: absolute;
  top: -14px;
  right: 0;
}

.contract-order-form__grid,
.contract-order-form__amount-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 15px 28px;
}

.contract-order-form__amount-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.contract-order-form__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.contract-order-form__field > span:first-child {
  font-size: 13px;
  font-weight: 500;
  color: #374151;
}

.contract-order-form__field b {
  font-weight: 500;
  color: #ef4444;
}

.contract-order-form__field small {
  color: #94a3b8;
}

.contract-order-form__field .contract-order-form__field-warning {
  color: #d46b08;
}

.contract-order-form__field--wide {
  grid-column: 1 / -1;
}

.contract-order-form__formula {
  padding: 10px 12px;
  margin-bottom: 15px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  color: #475569;
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
  border-radius: 4px;
}

.contract-order-form__preview-warning {
  margin-bottom: 12px;
}

.contract-order-form__constraint-note {
  margin-bottom: 14px;
}

.contract-order-form__grand-total {
  display: flex;
  gap: 24px;
  align-items: baseline;
  justify-content: flex-end;
  padding-top: 18px;
  margin-top: 18px;
  border-top: 1px solid #e5e7eb;
}

.contract-order-form__grand-total span {
  font-size: 14px;
  color: #64748b;
}

.contract-order-form__grand-total strong {
  font-size: 25px;
  font-variant-numeric: tabular-nums;
  color: #cf1322;
}

.contract-order-form__sticky-footer {
  position: sticky;
  bottom: 0;
  z-index: 20;
  display: flex;
  gap: 20px;
  align-items: center;
  justify-content: space-between;
  padding: 12px 18px;
  background: rgb(255 255 255 / 96%);
  border: 1px solid #dbe3ed;
  border-radius: 5px 5px 0 0;
  box-shadow: 0 -5px 18px rgb(15 23 42 / 8%);
  backdrop-filter: blur(8px);
}

.contract-order-form__sticky-footer > div:first-child {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.contract-order-form__sticky-footer span {
  font-size: 12px;
  color: #94a3b8;
}

.contract-order-form__footer-actions {
  display: flex;
  gap: 8px;
}

@media (max-width: 900px) {
  .contract-order-form__grid,
  .contract-order-form__amount-grid {
    grid-template-columns: 1fr;
  }

  .contract-order-form__field--wide {
    grid-column: auto;
  }
}

@media (max-width: 640px) {
  .contract-order-form__section {
    padding: 16px 12px;
  }

  .contract-order-form__section h2 {
    padding: 0 12px;
    margin: -16px -12px 16px;
  }

  .contract-order-form__sticky-footer {
    flex-direction: column;
    align-items: stretch;
  }

  .contract-order-form__footer-actions > * {
    flex: 1;
  }
}
</style>
