<script setup lang="ts">
import type { PurchaseInvoice } from '#/api/fdmplatform/procurement';

import { computed, ref, watch } from 'vue';

import { Alert, Button, Input, InputNumber, Select } from 'ant-design-vue';
import BigNumber from 'bignumber.js';

import {
  createPurchaseInvoice,
  recognizePurchaseInvoice,
} from '#/api/fdmplatform/procurement';

import { errorText } from '../../../data';
import { localDate } from '../../../purchase/quotes/comparison';

/**
 * 上传付款发票：先选发票原件（PDF、OFD、数电 XML 或图片），PDF / XML 自动识别号码、日期、
 * 价税合计带入，采购员核对金额后保存。图片识别不了时手填金额。
 */
const props = defineProps<{
  contractId: string;
  currency?: string;
  /** 带入的默认金额（如付款记录未收票的部分） */
  defaultAmount?: string;
  orderId: string;
  /** 固定挂到这笔付款下；不传时可在 paymentOptions 里选 */
  paymentId?: string;
  paymentOptions?: Array<{ label: string; value: string }>;
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
const input = ref<HTMLInputElement>();
const recognizing = ref(false);
const hint = ref('');
const saving = ref(false);
const error = ref('');
const form = ref(blank());
let key = crypto.randomUUID();

function blank() {
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
watch(
  () => [props.defaultAmount, props.paymentId],
  () => {
    if (!file.value) form.value = blank();
  },
);

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

async function save() {
  if (!file.value) {
    error.value = '请先上传发票文件';
    return;
  }
  if (!new BigNumber(form.value.amount ?? '').gt(0)) {
    error.value = '发票金额须大于 0';
    return;
  }
  saving.value = true;
  error.value = '';
  try {
    const invoice = await createPurchaseInvoice(file.value, {
      idempotencyKey: key,
      contractId: props.contractId,
      orderId: props.orderId,
      paymentId: form.value.paymentId,
      invoiceNo: form.value.invoiceNo.trim() || undefined,
      invoiceDate: form.value.invoiceDate || undefined,
      invoiceType: form.value.invoiceType,
      taxRate: form.value.taxRate || undefined,
      amount: form.value.amount!,
      remark: form.value.remark.trim() || undefined,
    });
    key = crypto.randomUUID();
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
        {{ file ? '重新选择发票' : '上传发票文件' }}
      </Button>
      <span v-if="file" class="name">{{ file.name }}</span>
      <span v-else class="muted">PDF、OFD、数电 XML 或图片；PDF / XML 自动识别</span>
      <span v-if="hint" class="muted">{{ hint }}</span>
    </div>
    <div v-if="file" class="sheet">
      <label>
        <span><em>*</em>价税合计（{{ unit }}）</span>
        <InputNumber
          v-model:value="form.amount"
          string-mode
          :min="0"
          :controls="false"
          style="width: 100%"
        />
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
      <Button type="primary" :loading="saving" @click="save"> 保存发票 </Button>
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
