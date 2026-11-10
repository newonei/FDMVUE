<script setup lang="ts">
import type { PaymentForm } from '../model';

import type { ProcurementSetting } from '#/api/fdmplatform/procurement';
import type { ProcurementFinanceRecord } from '#/api/fdmplatform/procurement-finance';

import { computed, ref, watch } from 'vue';

import { useAccess } from '@vben/access';

import {
  Alert,
  AutoComplete,
  Button,
  Checkbox,
  Input,
  InputNumber,
  Modal,
  Select,
} from 'ant-design-vue';
import BigNumber from 'bignumber.js';

import { getProcurementSettings } from '#/api/fdmplatform/procurement';
import {
  procurementFinanceAction,
  registerInvoicePayment,
  registerOrderPayment,
  registerOtherPayment,
  uploadProcurementFinanceFile,
} from '#/api/fdmplatform/procurement-finance';

import FilePreviewButton from '../../../components/FilePreviewButton.vue';
import { errorText, receiptCurrencyOptions } from '../../../data';
import { localDate } from '../../../purchase/quotes/comparison';
import {
  payerAccountLabel,
  PAYMENT_AUDIT,
  paymentDefaults,
  paymentFormProblem,
  paymentMethods,
} from '../model';

/**
 * 登记付款记录（金智「付款记录」）：采购单每付一笔钱登记一张，分期付款就是登记多张。
 * 不经请款，提交后由财务审核，财务确认已付款才计入已付；有审核权限的财务可以勾选直接确认。
 * 银行回单可一起上传，也可以之后在付款记录里补。
 * 传了 record 是修改被退回（或草稿）的付款记录，保存后重新提交。
 * 传了 invoice 是付款发票「增加付款」：付款挂整张发票，不再选采购单（来源经发票查），
 * 带出发票金额、已付、剩余可付，本次付款不能超过剩余可付。
 * other 是其他付款：不挂采购单（集团内往来款、押金等），币种自选，不计入任何采购单已付。
 */
const props = defineProps<{
  /** 本单最多还能登记的金额（采购应付 − 已付 − 历史请款未付部分） */
  available?: unknown;
  contractId: string;
  currency?: string;
  /** 从付款发票增加付款；此时 contractId / orderId 不用 */
  invoice?: {
    amount: unknown;
    code?: string;
    id: string;
    invoiceNo?: string;
    orderCount?: number;
    paidAmount?: unknown;
    supplierName?: string;
    unpaidAmount?: unknown;
  };
  open: boolean;
  orderCode?: string;
  orderId: string;
  /** 其他付款：不挂采购单；此时 contractId / orderId 不用 */
  other?: boolean;
  /** 本单已有的付款记录，用来带入上一笔的付款公司和收款账户 */
  previous?: Array<Record<string, unknown>>;
  /** 修改被退回或草稿的付款记录，保存后重新提交 */
  record?: ProcurementFinanceRecord;
  /** 采购单数据参考（金智同款）：采购金额、已付、待审核、未付、已收票 */
  reference?: {
    invoiced?: unknown;
    orderAmount?: unknown;
    paid?: unknown;
    pending?: unknown;
    unpaid?: unknown;
  };
  supplierName?: string;
}>();
const emit = defineEmits<{
  close: [];
  saved: [record: ProcurementFinanceRecord];
}>();

const today = localDate();
const { hasAccessByCodes } = useAccess();
/** 财务可以不走审核，登记即确认已付款 */
const canConfirm = computed(() => hasAccessByCodes([PAYMENT_AUDIT]));
const confirmDirectly = ref(false);
const payers = ref<ProcurementSetting[]>([]);
const form = ref<PaymentForm>({});
const files = ref<File[]>([]);
const saving = ref(false);
const error = ref('');
const otherCurrency = ref('CNY');
const currencyText = computed(() =>
  props.other ? otherCurrency.value : (props.currency ?? 'CNY'),
);
let key = crypto.randomUUID();

const referenceItems = computed(() => {
  const money = (input: unknown) => {
    const number = new BigNumber(String(input ?? ''));
    return number.isFinite() ? number : undefined;
  };
  const invoice = props.invoice;
  if (invoice) {
    const text = (input: unknown) => money(input)?.toFormat(2) ?? '—';
    return [
      {
        label: '供应商',
        text: invoice.supplierName ?? props.supplierName ?? '—',
      },
      { label: '付款发票', text: invoice.code ?? invoice.invoiceNo ?? '—' },
      { label: '发票金额', text: text(invoice.amount) },
      { label: '累计已付', text: text(invoice.paidAmount) },
      { label: '剩余可付', text: text(invoice.unpaidAmount) },
      { label: '来源采购单', text: `${invoice.orderCount ?? 1} 个` },
    ];
  }
  const value = props.reference;
  if (!value) return [];
  const order = money(value.orderAmount);
  const invoiced = money(value.invoiced) ?? new BigNumber(0);
  return [
    { label: '采购金额', value: order },
    { label: '已付款金额', value: money(value.paid) },
    ...(money(value.pending)?.gt(0)
      ? [{ label: '待财务审核', value: money(value.pending) }]
      : []),
    { label: '未付款金额', value: money(value.unpaid) },
    { label: '已收票额', value: invoiced },
    { label: '未收票额', value: order?.minus(invoiced) },
  ].map((item) => ({
    label: item.label,
    text: item.value === undefined ? '—' : item.value.toFormat(2),
  }));
});
const limit = computed(() => {
  const value = new BigNumber(String(props.available ?? ''));
  return value.isFinite() ? value : undefined;
});

watch(
  () => props.open,
  async (open) => {
    if (!open) return;
    key = crypto.randomUUID();
    error.value = '';
    files.value = [];
    otherCurrency.value = 'CNY';
    confirmDirectly.value = false;
    const record = props.record;
    form.value = record
      ? {
          amount:
            record.amount === undefined ? undefined : String(record.amount),
          paidAt: record.paidAt ?? today,
          payerEntityId: record.payerEntityId,
          payerAccount: record.payerAccount,
          paymentMethod: record.paymentMethod,
          payeeName: record.payeeName,
          payeeAccount: record.payeeAccount,
          remark: record.remark,
          noInvoice: record.noInvoice,
        }
      : {
          ...paymentDefaults(props.previous ?? [], props.supplierName),
          paidAt: today,
          amount: limit.value?.gt(0) ? limit.value.toFixed(0) : undefined,
        };
    try {
      payers.value = await getProcurementSettings('entities', {
        usage: 'PAY',
        active: true,
      });
      if (!form.value.payerEntityId && payers.value.length === 1)
        pickPayer(payers.value[0]!.id);
    } catch (error_) {
      error.value = errorText(error_);
    }
  },
  { immediate: true },
);

function pickPayer(id: string) {
  form.value.payerEntityId = id;
  const label = payerAccountLabel(payers.value.find((row) => row.id === id));
  if (label) form.value.payerAccount = label;
}
function pickFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  files.value = [...files.value, ...(input.files ?? [])];
  input.value = '';
}

/** 修改被退回的付款：整单保存后重新提交（或财务直接确认），来源和已有回单不变。 */
async function resubmit(
  record: ProcurementFinanceRecord,
  fields: Record<string, unknown>,
  mode: 'CONFIRM' | 'SUBMIT',
) {
  const updated = await procurementFinanceAction(record.id, {
    action: 'UPDATE',
    expectedVersion: record.version,
    idempotencyKey: `${key}:update`,
    payload: {
      ...fields,
      name: record.name,
      sourceType: record.sourceType,
      contractId: record.invoiceId ? undefined : record.contractId || undefined,
      orderId: record.invoiceId ? undefined : record.orderId,
      invoiceId: record.invoiceId,
      batchNo: record.batchNo,
      noInvoice: form.value.noInvoice || undefined,
      evidenceRefs: (record.evidenceRefs as string[] | undefined) ?? [],
    },
  });
  return procurementFinanceAction(record.id, {
    action: mode,
    expectedVersion: updated.version,
    idempotencyKey: `${key}:${mode.toLowerCase()}`,
    payload: {},
  });
}

async function save() {
  error.value = paymentFormProblem(form.value, today, props.available);
  if (error.value) return;
  saving.value = true;
  try {
    const fields = {
      amount: form.value.amount!,
      paidAt: form.value.paidAt!,
      payerEntityId: form.value.payerEntityId!,
      payerAccount: form.value.payerAccount!.trim(),
      paymentMethod: form.value.paymentMethod?.trim() || undefined,
      payeeName: form.value.payeeName!.trim(),
      payeeAccount: form.value.payeeAccount?.trim() || undefined,
      remark: form.value.remark?.trim() || undefined,
    };
    const mode =
      canConfirm.value && confirmDirectly.value ? 'CONFIRM' : 'SUBMIT';
    let record: ProcurementFinanceRecord;
    if (props.record) record = await resubmit(props.record, fields, mode);
    else if (props.other)
      // 其他付款不走财务审核，登记即确认
      record = await registerOtherPayment(
        {
          ...fields,
          currency: otherCurrency.value,
          name: `${fields.paymentMethod ?? '其他付款'} · ${fields.payeeName}`,
          noInvoice: form.value.noInvoice || undefined,
        },
        key,
      );
    else if (props.invoice)
      record = await registerInvoicePayment(
        {
          ...fields,
          invoiceId: props.invoice.id,
          name: `${props.invoice.code ?? props.invoice.invoiceNo ?? '发票'} 付款`,
        },
        key,
        mode,
      );
    else
      record = await registerOrderPayment(
        {
          ...fields,
          contractId: props.contractId === 'standalone' ? '' : props.contractId,
          orderId: props.orderId,
          name: `${props.orderCode ?? ''} 付款`.trim(),
          noInvoice: form.value.noInvoice || undefined,
        },
        key,
        mode,
      );
    // 回单在付款确认后追加；某个文件失败不影响已登记的付款
    const failed: string[] = [];
    for (const [index, file] of files.value.entries()) {
      try {
        const uploaded = await uploadProcurementFinanceFile(record.id, file, {
          expectedVersion: record.version,
          idempotencyKey: `${key}:file:${index}`,
        });
        record = { ...record, version: uploaded.version };
      } catch {
        failed.push(file.name);
      }
    }
    if (failed.length > 0)
      Modal.warning({
        title: `付款已保存，${failed.length} 个回单没传上`,
        content: `${failed.join('、')}，可在付款记录里补传。`,
      });
    emit('saved', record);
  } catch (error_) {
    key = crypto.randomUUID();
    error.value = errorText(error_);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Modal
    :open="open"
    :title="
      record
        ? `修改付款 · ${record.code}`
        : other
          ? '登记其他付款'
          : invoice
            ? `增加付款 · ${invoice.code ?? invoice.invoiceNo ?? '付款发票'}`
            : `登记付款${orderCode ? ` · ${orderCode}` : ''}`
    "
    width="760px"
    :mask-closable="false"
    @cancel="emit('close')"
  >
    <div class="payment">
      <Alert
        type="info"
        show-icon
        :message="
          other
            ? '不挂采购单的付款，如集团内公司往来款、押金。只登记付款事实，不计入任何采购单的已付。'
            : invoice
              ? `付款针对整张发票，可以只付一部分，之后再增加付款。来源采购单跟随发票，不用重新选。提交后由财务审核付款。${
                  limit
                    ? `本次最多可付 ${currency ?? ''} ${limit.toFormat(2)}。`
                    : ''
                }`
              : `每付一笔钱登记一张付款记录，分期付款就登记多张。提交后由财务审核付款，财务确认已付款后才计入已付。${
                  limit
                    ? `本单还可登记 ${currency ?? ''} ${limit.toFormat(2)}。`
                    : ''
                }`
        "
      />
      <Alert v-if="error" type="error" :message="error" show-icon />
      <div v-if="referenceItems.length > 0" class="reference">
        <span class="reference-title">
          {{ invoice ? '发票数据参考' : '采购单数据参考' }}
        </span>
        <span v-for="item in referenceItems" :key="item.label">
          {{ item.label }}：<b>{{ item.text }}</b>
        </span>
      </div>
      <div class="sheet">
        <label v-if="other">
          <span><em>*</em>币种</span>
          <Select
            v-model:value="otherCurrency"
            :options="receiptCurrencyOptions()"
          />
        </label>
        <label>
          <span><em>*</em>付款金额（{{ currencyText }}）</span>
          <InputNumber
            v-model:value="form.amount"
            string-mode
            :min="0"
            :controls="false"
            style="width: 100%"
          />
        </label>
        <label>
          <span><em>*</em>付款日期（财务确认时填实际日期）</span>
          <Input v-model:value="form.paidAt" type="date" :max="today" />
        </label>
        <label>
          <span>付款分类</span>
          <AutoComplete
            v-model:value="form.paymentMethod"
            :options="paymentMethods.map((value) => ({ value }))"
            placeholder="公对公转账"
          />
        </label>
        <label>
          <span><em>*</em>所属公司（付款公司）</span>
          <Select
            :value="form.payerEntityId"
            :options="
              payers.map((entry) => ({
                value: entry.id,
                label: entry.legalName ?? entry.name,
              }))
            "
            placeholder="选择所属公司"
            @update:value="(value) => pickPayer(String(value))"
          />
        </label>
        <label class="wide">
          <span><em>*</em>付款方式（付款账户）</span>
          <Input
            v-model:value="form.payerAccount"
            placeholder="如：湖北飞德慕网商银行（8831）"
          />
        </label>
        <label>
          <span><em>*</em>收款方</span>
          <Input v-model:value="form.payeeName" />
        </label>
        <label class="wide">
          <span>收款账户信息</span>
          <Input
            v-model:value="form.payeeAccount"
            placeholder="开户行 + 账号；现金付款可不填"
          />
        </label>
        <label class="full">
          <span>备注</span>
          <Input v-model:value="form.remark" placeholder="如：首款 30%、尾款" />
        </label>
        <div class="full files">
          <span>银行回单（选填，可之后补传）</span>
          <div>
            <input type="file" multiple @change="pickFiles" />
            <ul v-if="files.length > 0">
              <li v-for="(file, index) in files" :key="`${file.name}-${index}`">
                {{ file.name }}
                <FilePreviewButton
                  size="small"
                  :name="file.name"
                  :file="file"
                />
                <Button
                  type="link"
                  size="small"
                  @click="files.splice(index, 1)"
                >
                  移除
                </Button>
              </li>
            </ul>
          </div>
        </div>
        <label v-if="!invoice && !record?.invoiceId">
          <span><em>*</em>是否收票</span>
          <Select
            :value="form.noInvoice ? 'NONE' : 'PENDING'"
            :options="[
              { value: 'PENDING', label: '未收票（之后登记付款发票）' },
              { value: 'NONE', label: '无需发票' },
            ]"
            @update:value="(value) => (form.noInvoice = value === 'NONE')"
          />
        </label>
      </div>
    </div>
    <template #footer>
      <Checkbox
        v-if="canConfirm"
        v-model:checked="confirmDirectly"
        class="direct"
      >
        我是财务，已转账，直接确认已付款
      </Checkbox>
      <Button @click="emit('close')">取消</Button>
      <Button type="primary" :loading="saving" @click="save">
        {{ confirmDirectly && canConfirm ? '确认已付款' : '提交财务审核' }}
      </Button>
    </template>
  </Modal>
</template>

<style scoped>
.payment {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.direct {
  float: left;
  margin-top: 5px;
}

.sheet {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px 14px;
}

.sheet label,
.files {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  font-size: 13px;
}

.sheet span {
  color: hsl(var(--muted-foreground));
}

.sheet .wide {
  grid-column: span 2;
}

.sheet .full {
  grid-column: 1 / -1;
}

.reference {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  padding: 8px 12px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--accent));
  border-radius: 6px;
}

.reference b {
  font-variant-numeric: tabular-nums;
  color: hsl(var(--foreground));
}

.reference-title {
  color: hsl(var(--foreground));
}

.files ul {
  padding-left: 18px;
  margin: 4px 0 0;
}

em {
  margin-right: 2px;
  font-style: normal;
  color: hsl(var(--destructive));
}

@media (max-width: 760px) {
  .sheet {
    grid-template-columns: minmax(0, 1fr);
  }

  .sheet .wide {
    grid-column: auto;
  }
}
</style>
