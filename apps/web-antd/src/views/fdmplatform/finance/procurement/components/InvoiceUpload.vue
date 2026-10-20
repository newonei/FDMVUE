<script setup lang="ts">
import type { PurchaseInvoice } from '#/api/fdmplatform/procurement';

import { computed, ref, watch } from 'vue';

import {
  Alert,
  Button,
  Input,
  InputNumber,
  Modal,
  Select,
} from 'ant-design-vue';
import BigNumber from 'bignumber.js';

import {
  createPurchaseInvoice,
  recognizePurchaseInvoice,
  updatePurchaseInvoice,
} from '#/api/fdmplatform/procurement';

import { errorText } from '../../../data';
import { localDate } from '../../../purchase/quotes/comparison';

/**
 * 上传付款发票：先选发票原件（PDF、OFD、数电 XML 或图片），PDF / XML 自动识别号码、日期、
 * 价税合计带入，采购员核对金额后保存。图片识别不了时手填金额。
 * 传了 remaining 时，金额超过采购单未收票会提示（不拦截，运费、补差等可确认后照存）。
 * 传了 invoice 就是修改这张发票：字段带入可改，原件可删掉换一份，但保存时必须有原件。
 */
const props = defineProps<{
  contractId: string;
  currency?: string;
  /** 带入的默认金额（如付款记录未收票的部分） */
  defaultAmount?: string;
  /** 修改哪张发票；不传是新登记 */
  invoice?: PurchaseInvoice;
  orderId: string;
  /** 固定挂到这笔付款下；不传时可在 paymentOptions 里选 */
  paymentId?: string;
  paymentOptions?: Array<{ label: string; value: string }>;
  /** 采购单未收票金额（采购金额 − 有效发票合计），用于超额提示；不传不提示 */
  remaining?: string;
}>();
const emit = defineEmits<{ saved: [invoice: PurchaseInvoice] }>();

const TYPE_NAMES: Record<PurchaseInvoice['invoiceType'], string> = {
  SPECIAL: '增值税专票',
  ORDINARY: '增值税普票',
  OTHER: '其他',
};
const ACCEPT = '.pdf,.ofd,.xml,.png,.jpg,.jpeg,.webp';
const today = localDate();
const file = ref<File>();
/** 修改时是否保留发票上原来的原件（删掉后须重新上传一份） */
const kept = ref(!!props.invoice?.file);
const input = ref<HTMLInputElement>();
const recognizing = ref(false);
const hint = ref('');
const saving = ref(false);
const error = ref('');
const form = ref(blank());
let key = crypto.randomUUID();

function blank() {
  const invoice = props.invoice;
  if (invoice)
    return {
      invoiceNo: invoice.invoiceNo ?? '',
      invoiceDate: invoice.invoiceDate,
      invoiceType: invoice.invoiceType,
      taxRate:
        invoice.taxRate === undefined || invoice.taxRate === null
          ? ''
          : String(invoice.taxRate),
      amount: String(invoice.amount) as string | undefined,
      remark: invoice.remark ?? '',
      paymentId: invoice.paymentId,
    };
  return {
    invoiceNo: '',
    invoiceDate: today,
    invoiceType: 'SPECIAL' as PurchaseInvoice['invoiceType'],
    taxRate: '13',
    amount: props.defaultAmount as string | undefined,
    remark: '',
    paymentId: props.paymentId,
  };
}
const unit = computed(() => props.currency || 'CNY');
/** 发票金额超出采购单未收票的部分；未超或无从比较时为空 */
/** 这张发票最多可开的金额：未收票，修改时加回这张发票原来的金额 */
const available = computed(() => {
  const remaining = new BigNumber(props.remaining ?? '');
  if (!remaining.isFinite()) return undefined;
  const own =
    props.invoice?.status === 'VALID'
      ? new BigNumber(String(props.invoice.amount))
      : new BigNumber(0);
  return BigNumber.max(remaining.plus(own), 0);
});
const excess = computed(() => {
  const amount = new BigNumber(form.value.amount ?? '');
  if (!available.value || !amount.isFinite()) return undefined;
  const value = amount.minus(available.value);
  return value.gt(0) ? value : undefined;
});
watch(
  () => [props.defaultAmount, props.paymentId],
  () => {
    if (!file.value && !props.invoice) form.value = blank();
  },
);

/** 删掉附件：先删新选的文件，再删发票上原来的原件 */
function removeFile() {
  if (file.value) {
    file.value = undefined;
    hint.value = '';
    return;
  }
  kept.value = false;
}

async function pick(event: Event) {
  const target = event.target as HTMLInputElement;
  const chosen = target.files?.[0];
  target.value = '';
  if (!chosen) return;
  file.value = chosen;
  error.value = '';
  hint.value = '';
  if (!/\.(?:pdf|xml)$/i.test(chosen.name)) {
    hint.value = '图片 / OFD 不能自动识别，请核对填写金额和号码';
    return;
  }
  recognizing.value = true;
  try {
    const result = await recognizePurchaseInvoice(chosen);
    if (!result.recognized) {
      hint.value = '没识别出发票信息，请手填金额和号码';
      return;
    }
    form.value = {
      ...form.value,
      invoiceNo: result.invoiceNo ?? form.value.invoiceNo,
      invoiceDate: result.invoiceDate ?? form.value.invoiceDate,
      invoiceType: result.invoiceType ?? form.value.invoiceType,
      taxRate:
        result.taxRate === undefined || result.taxRate === null
          ? form.value.taxRate
          : String(result.taxRate),
      amount:
        result.amount === undefined || result.amount === null
          ? form.value.amount
          : String(result.amount),
    };
    hint.value = `已识别${result.sellerName ? `：${result.sellerName}` : ''}，请核对金额`;
  } catch (error_) {
    hint.value = `识别失败，请手填：${errorText(error_)}`;
  } finally {
    recognizing.value = false;
  }
}

function save() {
  if (!file.value && !kept.value) {
    error.value = '请先上传发票文件';
    return;
  }
  if (!new BigNumber(form.value.amount ?? '').gt(0)) {
    error.value = '发票金额须大于 0';
    return;
  }
  if (!excess.value) {
    void submit(file.value);
    return;
  }
  const chosen = file.value;
  Modal.confirm({
    title: '发票金额超出采购单未收票',
    content: `本单未收票 ${unit.value} ${available.value?.toFormat(2)}，这张发票 ${unit.value} ${new BigNumber(form.value.amount ?? 0).toFormat(2)}，多出 ${excess.value.toFormat(2)}。请先核对金额是否识别错，确认无误再保存。`,
    okText: '仍然保存',
    cancelText: '返回核对',
    onOk: () => submit(chosen),
  });
}

async function submit(chosen: File | undefined) {
  saving.value = true;
  error.value = '';
  const fields = {
    idempotencyKey: key,
    paymentId: form.value.paymentId,
    invoiceNo: form.value.invoiceNo.trim() || undefined,
    invoiceDate: form.value.invoiceDate || undefined,
    invoiceType: form.value.invoiceType,
    taxRate: form.value.taxRate || undefined,
    amount: form.value.amount!,
    remark: form.value.remark.trim() || undefined,
  };
  try {
    const invoice = props.invoice
      ? await updatePurchaseInvoice(props.invoice.id, chosen, {
          ...fields,
          expectedVersion: props.invoice.version,
        })
      : await createPurchaseInvoice(chosen!, {
          ...fields,
          contractId: props.contractId,
          orderId: props.orderId,
        });
    key = crypto.randomUUID();
    if (props.invoice) {
      emit('saved', invoice);
      return;
    }
    file.value = undefined;
    hint.value = '';
    form.value = { ...blank(), amount: undefined };
    emit('saved', invoice);
  } catch (error_) {
    key = crypto.randomUUID();
    error.value = errorText(error_);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <section class="upload" aria-label="上传付款发票">
    <Alert v-if="error" type="error" :message="error" show-icon />
    <div class="picker">
      <input ref="input" type="file" :accept="ACCEPT" hidden @change="pick" />
      <Button :loading="recognizing" @click="input?.click()">
        {{ file || kept ? '重新选择发票' : '上传发票文件' }}
      </Button>
      <span v-if="file || kept" class="attachment">
        <span class="name">{{ file?.name ?? invoice?.file?.name }}</span>
        <Button type="link" size="small" danger @click="removeFile">
          删除
        </Button>
      </span>
      <span v-else class="muted">PDF、OFD、数电 XML 或图片；PDF / XML 自动识别</span>
      <span v-if="hint" class="muted">{{ hint }}</span>
    </div>
    <div v-if="file || invoice" class="sheet">
      <label>
        <span><em>*</em>价税合计（{{ unit }}）</span>
        <InputNumber
          v-model:value="form.amount"
          string-mode
          :min="0"
          :controls="false"
          style="width: 100%"
        />
        <span v-if="excess" class="over">
          超出未收票 {{ excess.toFormat(2) }}，请核对
        </span>
      </label>
      <label>
        <span>发票号码</span>
        <Input v-model:value="form.invoiceNo" placeholder="识别不到可不填" />
      </label>
      <label>
        <span>开票日期</span>
        <Input v-model:value="form.invoiceDate" type="date" :max="today" />
      </label>
      <label>
        <span>发票类型</span>
        <Select
          v-model:value="form.invoiceType"
          :options="
            Object.entries(TYPE_NAMES).map(([value, label]) => ({
              value,
              label,
            }))
          "
        />
      </label>
      <label>
        <span>税率 %</span>
        <InputNumber
          v-model:value="form.taxRate"
          string-mode
          :min="0"
          :max="100"
          :controls="false"
          style="width: 100%"
        />
      </label>
      <label v-if="!paymentId && paymentOptions">
        <span>对应付款（选填）</span>
        <Select
          v-model:value="form.paymentId"
          :options="paymentOptions"
          allow-clear
          :disabled="paymentOptions.length === 0"
          :placeholder="
            paymentOptions.length > 0 ? '挂到某笔付款' : '暂无付款记录'
          "
        />
      </label>
      <label class="note">
        <span>备注</span>
        <Input v-model:value="form.remark" />
      </label>
      <Button type="primary" :loading="saving" @click="save">
        {{ invoice ? '保存修改' : '保存发票' }}
      </Button>
    </div>
  </section>
</template>

<style scoped>
.upload {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.picker {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  font-size: 13px;
}

.name {
  font-weight: 500;
}

.attachment {
  display: inline-flex;
  gap: 2px;
  align-items: center;
}

.muted,
label span {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.sheet {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px 12px;
  align-items: end;
}

label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.note {
  grid-column: span 2;
}

.over {
  color: hsl(var(--warning));
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

  .note {
    grid-column: auto;
  }
}
</style>
