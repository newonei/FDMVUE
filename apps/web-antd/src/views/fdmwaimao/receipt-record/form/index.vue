<script lang="ts" setup>
import type { Dayjs } from 'dayjs';

import type { FdmWaimaoContractOrderApi } from '#/api/fdmwaimao/contract-order';
import type { FdmWaimaoExchangeRateApi } from '#/api/fdmwaimao/exchange-rate';
import type { FdmWaimaoReceiptRecordApi } from '#/api/fdmwaimao/receipt-record';

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
  Modal,
  Select,
  Spin,
  Tag,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import {
  getContractOrder,
  getContractOrderPage,
} from '#/api/fdmwaimao/contract-order';
import {
  getExchangeRateCurrencies,
  getExchangeRateQuote,
} from '#/api/fdmwaimao/exchange-rate';
import {
  createConsumptionRecord,
  createReceiptRecord,
  getConsumptionRecord,
  getReceiptRecord,
  isReceiptRecordDuplicateConfirmationError,
  previewConsumptionAmount,
  previewReceiptAmount,
  updateConsumptionRecord,
  updateReceiptRecord,
} from '#/api/fdmwaimao/receipt-record';
import { useFdmWaimaoAiContext } from '#/views/fdm-trade-shared/ai-assistant/context';

import {
  createLatestRequestGuard,
  formatAmount,
  isPositiveDecimal,
} from '../calculation';
import {
  buildConsumptionPreviewPayload,
  buildConsumptionSavePayload,
  buildConsumptionUpdatePayload,
  buildReceiptPreviewPayload,
  buildReceiptSavePayload,
  buildReceiptUpdatePayload,
  createEmptyConsumptionForm,
  createEmptyReceiptForm,
  hydrateConsumptionForm,
  hydrateReceiptForm,
  normalizeRecordDate,
  normalizeRecordType,
  queryOrderId,
  validateConsumptionForm,
  validateReceiptForm,
} from '../form-model';

defineOptions({ name: 'FdmWaimaoReceiptRecordForm' });

interface OrderSelectOption {
  label: string;
  value: string;
}

const route = useRoute();
const router = useRouter();
const { hasAccessByCodes } = useAccess();

const receiptForm = reactive(createEmptyReceiptForm());
const consumptionForm = reactive(createEmptyConsumptionForm());
const currencies = ref<FdmWaimaoExchangeRateApi.CurrencyOption[]>([]);
const orderOptions = ref<OrderSelectOption[]>([]);
const selectedOrder = ref<FdmWaimaoContractOrderApi.ContractDetail>();
const preview = ref<FdmWaimaoReceiptRecordApi.AmountPreview>();
const quote = ref<FdmWaimaoExchangeRateApi.Quote>();
const validationMessages = ref<string[]>([]);
const loading = ref(false);
const saving = ref(false);
const previewing = ref(false);
const quoteLoading = ref(false);
const orderSearching = ref(false);
const previewWarning = ref('');

const initializeGuard = createLatestRequestGuard();
const previewGuard = createLatestRequestGuard();
const quoteGuard = createLatestRequestGuard();
const orderSearchGuard = createLatestRequestGuard();
let previewTimer: ReturnType<typeof setTimeout> | undefined;
let orderSearchTimer: ReturnType<typeof setTimeout> | undefined;

const recordType = computed(() => normalizeRecordType(route.query.type));
const isConsumption = computed(() => recordType.value === 'consumption');
const recordId = computed(() => String(route.params.id || ''));
const isEdit = computed(() => Boolean(recordId.value));
const isVoided = computed(() =>
  isConsumption.value
    ? consumptionForm.status === 'VOIDED'
    : receiptForm.status === 'VOIDED',
);
const permissionPrefix = computed(() =>
  isConsumption.value ? 'consumption-record' : 'receipt-record',
);
const canSave = computed(() => {
  const action = isEdit.value ? 'update' : 'create';
  return hasAccessByCodes([`fdmwaimao:${permissionPrefix.value}:${action}`]);
});

const currencyOptions = computed(() =>
  currencies.value.map((item) => ({
    label: item.name ? `${item.code} · ${item.name}` : item.code,
    value: item.code,
  })),
);

const currentCurrency = computed(() =>
  isConsumption.value ? consumptionForm.currency : receiptForm.currency,
);
const currentDate = computed(() =>
  isConsumption.value
    ? consumptionForm.consumptionDate
    : receiptForm.receiptDate,
);
const currentAmount = computed(() =>
  isConsumption.value ? consumptionForm.amount : receiptForm.arrivalAmount,
);

useFdmWaimaoAiContext(() => ({
  businessId: recordId.value || undefined,
  context: {
    amountPreview: preview.value,
    draft: isConsumption.value ? { ...consumptionForm } : { ...receiptForm },
    exchangeRateQuote: quote.value,
    selectedOrder: selectedOrder.value,
    validationMessages: validationMessages.value,
  },
  contextMode: 'form',
  entityLabel: isEdit.value
    ? `${isConsumption.value ? '消费' : '回款'}记录 ${recordId.value}`
    : `未保存${isConsumption.value ? '消费' : '回款'}草稿`,
  surfaceKey: 'receipt-record',
  variant: recordType.value,
  volatile: true,
}));

const exchangeSnapshot = computed(() => {
  if (preview.value) {
    return {
      fallback: preview.value.fallback,
      rate: preview.value.rate,
      rateDate: preview.value.rateDate,
      requestedDate: preview.value.requestedDate,
      source: preview.value.source,
    };
  }
  if (quote.value) {
    return {
      fallback: quote.value.fallbackUsed,
      rate: quote.value.rate,
      rateDate:
        normalizeRecordDate(quote.value.rateDate) ??
        String(quote.value.rateDate),
      requestedDate:
        normalizeRecordDate(quote.value.requestedDate) ??
        String(quote.value.requestedDate),
      source: quote.value.provider,
    };
  }
  return undefined;
});

function replaceReactive<T extends object>(target: T, source: T) {
  for (const key of Object.keys(target)) {
    Reflect.deleteProperty(target as Record<string, unknown>, key);
  }
  Object.assign(target, source);
}

function resetForms() {
  replaceReactive(receiptForm, createEmptyReceiptForm());
  replaceReactive(consumptionForm, createEmptyConsumptionForm());
  selectedOrder.value = undefined;
  preview.value = undefined;
  quote.value = undefined;
  previewWarning.value = '';
  validationMessages.value = [];
}

function orderLabel(order: FdmWaimaoContractOrderApi.PageItem) {
  return `${order.orderNo} · ${order.customerName} · ${order.currency} ${formatAmount(order.totalAmount)}`;
}

function ensureOrderOption(order: FdmWaimaoContractOrderApi.PageItem) {
  if (!orderOptions.value.some((item) => item.value === order.id)) {
    orderOptions.value.unshift({ label: orderLabel(order), value: order.id });
  }
}

async function searchOrdersNow(keyword = '') {
  const requestId = orderSearchGuard.begin();
  orderSearching.value = true;
  try {
    const result = await getContractOrderPage({
      keyword: keyword.trim() || undefined,
      pageNo: 1,
      pageSize: 30,
      status: 'CONFIRMED',
    });
    if (!orderSearchGuard.isLatest(requestId)) return;
    orderOptions.value = (result.list ?? []).map((order) => ({
      label: orderLabel(order),
      value: order.id,
    }));
    if (selectedOrder.value) ensureOrderOption(selectedOrder.value);
  } finally {
    if (orderSearchGuard.isLatest(requestId)) orderSearching.value = false;
  }
}

function searchOrders(keyword: string) {
  if (orderSearchTimer) clearTimeout(orderSearchTimer);
  orderSearchTimer = setTimeout(() => void searchOrdersNow(keyword), 300);
}

async function loadOrder(orderId: string, resetCurrency: boolean) {
  const order = await getContractOrder(orderId);
  selectedOrder.value = order;
  ensureOrderOption(order);
  if (resetCurrency || !currentCurrency.value) {
    receiptForm.currency = order.currency;
    consumptionForm.currency = order.currency;
  }
}

async function changeOrder(value: unknown) {
  const orderId = value === null || value === undefined ? '' : String(value);
  receiptForm.orderId = orderId || undefined;
  consumptionForm.orderId = orderId || undefined;
  selectedOrder.value = undefined;
  preview.value = undefined;
  quote.value = undefined;
  if (orderId) {
    try {
      await loadOrder(orderId, true);
    } catch {
      selectedOrder.value = undefined;
    }
  }
}

function setRecordDate(value: Dayjs | null | string) {
  const normalized = normalizeRecordDate(value);
  if (isConsumption.value) consumptionForm.consumptionDate = normalized;
  else receiptForm.receiptDate = normalized;
}

function disableFutureDate(value: Dayjs) {
  return value.isAfter(dayjs(), 'day');
}

async function loadQuote() {
  quoteGuard.invalidate();
  quote.value = undefined;
  if (!currentDate.value || !currentCurrency.value) return;
  const requestId = quoteGuard.begin();
  quoteLoading.value = true;
  try {
    const result = await getExchangeRateQuote({
      date: currentDate.value,
      fromCurrency: currentCurrency.value,
      toCurrency: 'CNY',
    });
    if (quoteGuard.isLatest(requestId)) quote.value = result;
  } catch {
    if (quoteGuard.isLatest(requestId)) quote.value = undefined;
  } finally {
    if (quoteGuard.isLatest(requestId)) quoteLoading.value = false;
  }
}

function previewInputsReady() {
  const orderId = isConsumption.value
    ? consumptionForm.orderId
    : receiptForm.orderId;
  return Boolean(
    orderId &&
    currentDate.value &&
    currentCurrency.value &&
    isPositiveDecimal(currentAmount.value),
  );
}

function schedulePreview() {
  previewGuard.invalidate();
  preview.value = undefined;
  previewWarning.value = '';
  if (previewTimer) clearTimeout(previewTimer);
  if (!previewInputsReady()) return;
  previewTimer = setTimeout(async () => {
    const requestId = previewGuard.begin();
    previewing.value = true;
    try {
      const result = isConsumption.value
        ? await previewConsumptionAmount(
            buildConsumptionPreviewPayload(consumptionForm),
          )
        : await previewReceiptAmount(buildReceiptPreviewPayload(receiptForm));
      if (previewGuard.isLatest(requestId)) preview.value = result;
    } catch {
      if (previewGuard.isLatest(requestId)) {
        previewWarning.value =
          '暂时无法取得服务端汇率与结算预览，请检查汇率中心数据。';
      }
    } finally {
      if (previewGuard.isLatest(requestId)) previewing.value = false;
    }
  }, 350);
}

async function initialize() {
  const requestId = initializeGuard.begin();
  loading.value = true;
  resetForms();
  try {
    const [currencyResult] = await Promise.all([
      getExchangeRateCurrencies(),
      searchOrdersNow(),
    ]);
    if (!initializeGuard.isLatest(requestId)) return;
    currencies.value = currencyResult ?? [];

    if (isEdit.value) {
      if (isConsumption.value) {
        replaceReactive(
          consumptionForm,
          hydrateConsumptionForm(await getConsumptionRecord(recordId.value)),
        );
        receiptForm.orderId = consumptionForm.orderId;
      } else {
        replaceReactive(
          receiptForm,
          hydrateReceiptForm(await getReceiptRecord(recordId.value)),
        );
        consumptionForm.orderId = receiptForm.orderId;
      }
      const orderId = isConsumption.value
        ? consumptionForm.orderId
        : receiptForm.orderId;
      if (orderId) await loadOrder(orderId, false);
    } else {
      const orderId = queryOrderId(route.query.orderId);
      if (orderId) {
        receiptForm.orderId = orderId;
        consumptionForm.orderId = orderId;
        await loadOrder(orderId, true);
      }
    }
    if (initializeGuard.isLatest(requestId)) {
      void loadQuote();
      schedulePreview();
    }
  } finally {
    if (initializeGuard.isLatest(requestId)) loading.value = false;
  }
}

async function save(confirmPotentialDuplicate = false) {
  const issues = isConsumption.value
    ? validateConsumptionForm(consumptionForm)
    : validateReceiptForm(receiptForm);
  validationMessages.value = issues;
  if (issues.length > 0) {
    message.warning('请先完成必填信息');
    return;
  }
  if (!preview.value) {
    message.warning('服务端汇率与结算预览尚未完成');
    return;
  }
  if (isVoided.value) {
    message.warning('已作废记录不可编辑');
    return;
  }

  saving.value = true;
  try {
    let id = recordId.value;
    if (isConsumption.value) {
      if (isEdit.value) {
        await updateConsumptionRecord(
          buildConsumptionUpdatePayload(consumptionForm),
        );
      } else {
        id = await createConsumptionRecord(
          buildConsumptionSavePayload(consumptionForm),
        );
      }
    } else if (isEdit.value) {
      await updateReceiptRecord(
        buildReceiptUpdatePayload(receiptForm, confirmPotentialDuplicate),
      );
    } else {
      id = await createReceiptRecord(
        buildReceiptSavePayload(receiptForm, confirmPotentialDuplicate),
      );
    }
    message.success(isEdit.value ? '记录已更新' : '记录已创建');
    await router.replace({
      path: isConsumption.value
        ? `/fdmwaimao/receipt-record/consumption/detail/${id}`
        : `/fdmwaimao/receipt-record/detail/${id}`,
      query: { type: recordType.value },
    });
  } catch (error) {
    if (
      !isConsumption.value &&
      !confirmPotentialDuplicate &&
      isReceiptRecordDuplicateConfirmationError(error)
    ) {
      saving.value = false;
      Modal.confirm({
        cancelText: '返回核对',
        content:
          '服务端发现这笔回款与已有现金入账在公司、客户、日期、币种和金额上完全一致。继续只代表你已核对确为两笔独立业务；系统会保留重复确认审计。',
        okText: '我已核对，仍要保存',
        onOk: () => save(true),
        title: '发现疑似重复回款',
      });
      return;
    }
    message.error(error instanceof Error ? error.message : '记录保存失败');
  } finally {
    saving.value = false;
  }
}

function backToList() {
  void router.push({
    path: '/fdmwaimao/receipt-record',
    query: { type: recordType.value },
  });
}

watch(
  () => [route.params.id, route.query.type, route.query.orderId],
  () => void initialize(),
  { immediate: true },
);
watch(
  () => [currentDate.value, currentCurrency.value],
  () => void loadQuote(),
);
watch(
  () => [
    recordType.value,
    receiptForm.id,
    receiptForm.orderId,
    receiptForm.receiptDate,
    receiptForm.currency,
    receiptForm.arrivalAmount,
    consumptionForm.id,
    consumptionForm.orderId,
    consumptionForm.consumptionDate,
    consumptionForm.currency,
    consumptionForm.amount,
  ],
  schedulePreview,
);

onBeforeUnmount(() => {
  if (previewTimer) clearTimeout(previewTimer);
  if (orderSearchTimer) clearTimeout(orderSearchTimer);
  initializeGuard.invalidate();
  previewGuard.invalidate();
  quoteGuard.invalidate();
  orderSearchGuard.invalidate();
});
</script>

<template>
  <Page
    :auto-content-height="false"
    :description="
      isConsumption
        ? '消费记录参与合同结算，但不会计入真实现金到账。'
        : '按回款日期锁定 ECB 统计折算汇率，并由服务端计算人民币与合同币种金额。'
    "
    :title="`${isEdit ? '编辑' : '新建'}${isConsumption ? '消费记录' : '回款记录'}`"
  >
    <template #extra>
      <Button @click="backToList">
        <template #icon>
          <IconifyIcon icon="lucide:arrow-left" aria-hidden="true" />
        </template>
        返回列表
      </Button>
      <Tag :color="isConsumption ? 'purple' : 'green'">
        {{ isConsumption ? '消费结算' : '真实到账' }}
      </Tag>
      <Tag v-if="isVoided" color="error">已作废</Tag>
    </template>

    <Spin :spinning="loading">
      <div class="receipt-form__canvas">
        <Alert
          v-if="isVoided"
          class="receipt-form__alert"
          message="该记录已作废，只能查看，不能再次修改。"
          show-icon
          type="error"
        />
        <Alert
          v-if="validationMessages.length"
          class="receipt-form__alert"
          closable
          type="error"
          @close="validationMessages = []"
        >
          <template #message>请完成以下信息</template>
          <template #description>
            <ul>
              <li v-for="item in validationMessages" :key="item">{{ item }}</li>
            </ul>
          </template>
        </Alert>

        <section class="receipt-form__section">
          <h2><span>关联订单</span></h2>
          <div class="receipt-form__grid">
            <label class="receipt-form__field receipt-form__field--wide">
              <span>合同/订单 <b>*</b></span>
              <Select
                :filter-option="false"
                :loading="orderSearching"
                :options="orderOptions"
                placeholder="搜索合同单号、主题或客户"
                show-search
                :value="
                  isConsumption ? consumptionForm.orderId : receiptForm.orderId
                "
                @change="changeOrder"
                @dropdown-visible-change="
                  (open: boolean) => open && searchOrdersNow()
                "
                @search="searchOrders"
              />
            </label>
            <template v-if="selectedOrder">
              <div
                class="receipt-form__order-summary receipt-form__field--wide"
              >
                <div>
                  <span>对应客户</span>
                  <strong>{{ selectedOrder.customerName }}</strong>
                </div>
                <div>
                  <span>当前负责人</span>
                  <strong>{{ selectedOrder.ownerUserName || '—' }}</strong>
                </div>
                <div>
                  <span>合同总额</span>
                  <strong>
                    {{ selectedOrder.currency }}
                    {{ formatAmount(selectedOrder.totalAmount) }}
                  </strong>
                </div>
                <div>
                  <span>现金 / 消费 / 未回款</span>
                  <strong>
                    {{ formatAmount(selectedOrder.cashReceivedAmount) }} /
                    {{ formatAmount(selectedOrder.consumptionAmount) }} /
                    {{
                      formatAmount(
                        selectedOrder.outstandingAmount ??
                          selectedOrder.totalAmount,
                      )
                    }}
                  </strong>
                </div>
              </div>
            </template>
            <template v-if="!isConsumption">
              <label class="receipt-form__field receipt-form__field--wide">
                <span>对应项目</span>
                <Input
                  v-model:value="receiptForm.projectText"
                  :maxlength="200"
                  placeholder="项目中心尚未上线，可自行输入项目名称或备注"
                  show-count
                />
              </label>
            </template>
          </div>
        </section>

        <section class="receipt-form__section">
          <h2>
            <span>{{ isConsumption ? '消费与汇率' : '到款与汇率' }}</span>
          </h2>
          <div class="receipt-form__grid">
            <label class="receipt-form__field">
              <span>{{ isConsumption ? '消费日期' : '回款日期' }} <b>*</b></span>
              <DatePicker
                class="w-full"
                :disabled-date="disableFutureDate"
                :value="currentDate ? dayjs(currentDate) : undefined"
                @change="setRecordDate"
              />
            </label>
            <label v-if="!isConsumption" class="receipt-form__field">
              <span>期次</span>
              <Input
                v-model:value="receiptForm.installmentLabel"
                :maxlength="64"
                placeholder="如 第一期、尾款"
              />
            </label>
            <label v-else class="receipt-form__field">
              <span>消费类型 <b>*</b></span>
              <Select
                v-model:value="consumptionForm.consumptionType"
                :options="[
                  { label: '客户余额消费', value: 'CUSTOMER_BALANCE' },
                  { label: '审核减免 / 坏账', value: 'WAIVER' },
                  { label: '其他合法冲销', value: 'OTHER' },
                ]"
              />
            </label>

            <template v-if="!isConsumption">
              <label class="receipt-form__field">
                <span>到款方式 <b>*</b></span>
                <Input
                  v-model:value="receiptForm.receiptMethod"
                  :maxlength="128"
                  placeholder="如 公司银行账户、PayPal、微信"
                />
              </label>
              <label class="receipt-form__field">
                <span>付款方式</span>
                <Input
                  v-model:value="receiptForm.paymentMethod"
                  :maxlength="128"
                  placeholder="如 T/T、现金"
                />
              </label>
              <label class="receipt-form__field">
                <span>付款方</span>
                <Input
                  v-model:value="receiptForm.payerName"
                  :maxlength="200"
                  placeholder="付款人或付款公司"
                />
              </label>
            </template>

            <label class="receipt-form__field">
              <span>币种 <b>*</b></span>
              <Select
                v-if="isConsumption"
                v-model:value="consumptionForm.currency"
                :options="currencyOptions"
                placeholder="请选择汇率中心币种"
                show-search
              />
              <Select
                v-else
                v-model:value="receiptForm.currency"
                :options="currencyOptions"
                placeholder="请选择汇率中心币种"
                show-search
              />
            </label>
            <label class="receipt-form__field">
              <span>{{ isConsumption ? '消费金额' : '到款金额' }} <b>*</b></span>
              <InputNumber
                v-if="isConsumption"
                v-model:value="consumptionForm.amount"
                class="w-full"
                :min="0"
                :precision="6"
                string-mode
              />
              <InputNumber
                v-else
                v-model:value="receiptForm.arrivalAmount"
                class="w-full"
                :min="0"
                :precision="6"
                string-mode
              />
            </label>
          </div>

          <Alert
            class="receipt-form__rate-alert"
            :message="
              exchangeSnapshot
                ? `1 ${currentCurrency} = ${exchangeSnapshot.rate} CNY · 请求 ${exchangeSnapshot.requestedDate} · 汇率日 ${exchangeSnapshot.rateDate}`
                : '选择日期和币种后，从汇率中心读取兑人民币汇率。'
            "
            :description="
              exchangeSnapshot
                ? `${exchangeSnapshot.source} · ${exchangeSnapshot.fallback ? '当日无汇率，沿用最近可用交易日' : '使用当日汇率'} · ECB 统计折算，仅用于内部统计`
                : '统一口径：1 单位外币 = X CNY。'
            "
            show-icon
            :type="exchangeSnapshot?.fallback ? 'warning' : 'info'"
          />
          <Alert
            v-if="previewWarning"
            class="receipt-form__rate-alert"
            :message="previewWarning"
            show-icon
            type="error"
          />

          <div class="receipt-form__amount-cards">
            <div>
              <span>兑 RMB 汇率</span>
              <strong>{{
                exchangeSnapshot?.rate || (quoteLoading ? '读取中…' : '—')
              }}</strong>
            </div>
            <div>
              <span>折人民币金额</span>
              <strong>CNY {{ formatAmount(preview?.amountCny) }}</strong>
            </div>
            <div>
              <span>冲销到合同金额</span>
              <strong>
                {{
                  preview?.contractCurrency || selectedOrder?.currency || '—'
                }}
                {{ formatAmount(preview?.allocatedContractAmount) }}
              </strong>
            </div>
            <div :data-settled="preview?.willSettle">
              <span>本次保存后</span>
              <strong>
                {{
                  preview?.willSettle
                    ? '预计已结清'
                    : `未回款 ${formatAmount(
                        preview?.afterOutstandingAmount ??
                          selectedOrder?.outstandingAmount ??
                          selectedOrder?.totalAmount,
                      )}`
                }}
              </strong>
            </div>
          </div>
          <div class="receipt-form__preview-state">
            <Tag v-if="previewing" color="processing">服务端计算中</Tag>
            <Tag v-else-if="preview" color="success">服务端已校验</Tag>
            <Tag v-else>等待完整金额</Tag>
          </div>
        </section>

        <section v-if="!isConsumption" class="receipt-form__section">
          <h2><span>财务归类与结算</span></h2>
          <div class="receipt-form__grid">
            <label class="receipt-form__field">
              <span>开具发票 <b>*</b></span>
              <Select
                v-model:value="receiptForm.invoiceStatus"
                :options="[
                  { label: '未开票', value: 'NOT_INVOICED' },
                  { label: '已开票', value: 'INVOICED' },
                  { label: '无需开票', value: 'NOT_REQUIRED' },
                ]"
              />
            </label>
            <label class="receipt-form__field">
              <span>分类</span>
              <Input
                v-model:value="receiptForm.category"
                :maxlength="64"
                placeholder="如 定金、尾款、样品费"
              />
            </label>
            <label class="receipt-form__field">
              <span>计业绩金额（未税，CNY）</span>
              <InputNumber
                v-model:value="receiptForm.performanceAmountCny"
                class="w-full"
                :min="0"
                :placeholder="preview?.amountCny || '可按实际口径调整'"
                :precision="2"
                string-mode
              />
            </label>
            <label class="receipt-form__field">
              <span>所有者</span>
              <Input disabled value="保存时由服务端登记当前操作人" />
            </label>
            <label class="receipt-form__field">
              <span>外币备注</span>
              <Input
                v-model:value="receiptForm.foreignCurrencyRemark"
                :maxlength="200"
                show-count
              />
            </label>
            <label class="receipt-form__field">
              <span>计业绩备注</span>
              <Input
                v-model:value="receiptForm.performanceRemark"
                :maxlength="300"
                show-count
              />
            </label>
          </div>
        </section>

        <section class="receipt-form__section">
          <h2><span>备注</span></h2>
          <label
            v-if="isConsumption"
            class="receipt-form__field receipt-form__reason"
          >
            <span>消费原因 <b>*</b></span>
            <Input.TextArea
              v-model:value="consumptionForm.reason"
              :auto-size="{ minRows: 2, maxRows: 5 }"
              :maxlength="500"
              placeholder="说明余额消费、减免或其他冲销依据"
              show-count
            />
          </label>
          <Input.TextArea
            v-if="isConsumption"
            v-model:value="consumptionForm.remark"
            :auto-size="{ minRows: 5, maxRows: 10 }"
            :maxlength="2000"
            placeholder="填写财务、付款或核对说明"
            show-count
          />
          <Input.TextArea
            v-else
            v-model:value="receiptForm.remark"
            :auto-size="{ minRows: 5, maxRows: 10 }"
            :maxlength="2000"
            placeholder="填写财务、付款或核对说明"
            show-count
          />
        </section>

        <div class="receipt-form__sticky-footer">
          <div>
            <strong>{{ isConsumption ? '消费记录' : '回款记录' }}</strong>
            <span>订单是否结清由服务端聚合计算，不可手工修改；本期不展示假审核流程。</span>
          </div>
          <div class="receipt-form__footer-actions">
            <Button @click="backToList">取消</Button>
            <Button
              :disabled="!canSave || isVoided"
              :loading="saving"
              type="primary"
              @click="() => save()"
            >
              <template #icon>
                <IconifyIcon icon="lucide:save" aria-hidden="true" />
              </template>
              保存记录
            </Button>
          </div>
        </div>
      </div>
    </Spin>
  </Page>
</template>

<style scoped>
.receipt-form__canvas {
  max-width: 1540px;
  margin: 0 auto;
  color: #172033;
}

.receipt-form__alert,
.receipt-form__section {
  margin-bottom: 14px;
}

.receipt-form__section {
  position: relative;
  padding: 18px 20px 20px;
  overflow: hidden;
  background: #fff;
  border: 1px solid #e5eaf1;
  border-radius: 5px;
  box-shadow: 0 1px 2px rgb(15 23 42 / 4%);
}

.receipt-form__section h2 {
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

.receipt-form__section h2::before {
  width: 3px;
  height: 14px;
  margin-right: 8px;
  content: '';
  background: #1677ff;
  border-radius: 2px;
}

.receipt-form__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 15px 28px;
}

.receipt-form__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.receipt-form__field > span:first-child,
.receipt-form__amount-cards span,
.receipt-form__order-summary span {
  font-size: 12px;
  color: #64748b;
}

.receipt-form__field > span:first-child {
  font-size: 13px;
  font-weight: 500;
  color: #374151;
}

.receipt-form__field b {
  font-weight: 500;
  color: #ef4444;
}

.receipt-form__field--wide {
  grid-column: 1 / -1;
}

.receipt-form__order-summary,
.receipt-form__amount-cards {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.receipt-form__order-summary > div,
.receipt-form__amount-cards > div {
  display: flex;
  flex-direction: column;
  gap: 7px;
  justify-content: center;
  min-height: 70px;
  padding: 11px 13px;
  background: #f8fafc;
  border: 1px solid #e5eaf1;
  border-radius: 4px;
}

.receipt-form__order-summary strong,
.receipt-form__amount-cards strong {
  font-size: 14px;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

.receipt-form__rate-alert {
  margin-top: 15px;
}

.receipt-form__amount-cards {
  margin-top: 12px;
}

.receipt-form__amount-cards > div[data-settled='true'] {
  color: #fff;
  background: #0f4c81;
  border-color: #0f4c81;
}

.receipt-form__amount-cards > div[data-settled='true'] span {
  color: #dbeafe;
}

.receipt-form__preview-state {
  display: flex;
  justify-content: flex-end;
  margin-top: 10px;
}

.receipt-form__reason {
  margin-bottom: 16px;
}

.receipt-form__sticky-footer {
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

.receipt-form__sticky-footer > div:first-child {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.receipt-form__sticky-footer span {
  font-size: 12px;
  color: #94a3b8;
}

.receipt-form__footer-actions {
  display: flex;
  gap: 8px;
}

@media (max-width: 1000px) {
  .receipt-form__order-summary,
  .receipt-form__amount-cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .receipt-form__grid {
    grid-template-columns: 1fr;
  }

  .receipt-form__field--wide {
    grid-column: auto;
  }
}

@media (max-width: 640px) {
  .receipt-form__section {
    padding: 16px 12px;
  }

  .receipt-form__section h2 {
    padding: 0 12px;
    margin: -16px -12px 16px;
  }

  .receipt-form__order-summary,
  .receipt-form__amount-cards {
    grid-template-columns: 1fr;
  }

  .receipt-form__sticky-footer {
    flex-direction: column;
    align-items: stretch;
  }

  .receipt-form__footer-actions > * {
    flex: 1;
  }
}
</style>
