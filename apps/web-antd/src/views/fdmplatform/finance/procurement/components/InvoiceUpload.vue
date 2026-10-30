<script setup lang="ts">
import type { InvoiceOrderLine } from '../invoice-model';

import type { PurchaseInvoice } from '#/api/fdmplatform/procurement';

import { computed, ref, watch } from 'vue';

import { Alert, Button, Input, InputNumber, Select } from 'ant-design-vue';
import BigNumber from 'bignumber.js';

import {
  createPurchaseInvoice,
  downloadPurchaseInvoiceFile,
  recognizePurchaseInvoice,
  updatePurchaseInvoice,
} from '#/api/fdmplatform/procurement';

import FilePreviewButton from '../../../components/FilePreviewButton.vue';
import { errorText } from '../../../data';
import { localDate } from '../../../purchase/quotes/comparison';
import {
  allocatedTotal,
  allocateInvoice,
  allocationInputs,
  allocationProblem,
} from '../invoice-model';

/**
 * 上传付款发票：先选发票原件（PDF、OFD、数电 XML 或图片），PDF / XML 自动识别号码、日期、
 * 价税合计带入，采购员核对金额后保存。图片识别不了时手填金额。
 * 传了 remaining 时，金额超过采购单未收票不能保存（后端同样拦截；运费、补差先加到采购单附加金额）。
 * 传了 orders 是集中收票：一张发票关联多张采购单，逐单填本发票对应金额，合计须等于发票金额。
 * 传了 invoice 就是修改这张发票：字段带入可改，原件可删掉换一份，但保存时必须有原件；
 * 集中收票的发票改金额时重新分配各单金额（采购单不能换）。
 */
const props = defineProps<{
  contractId: string;
  currency?: string;
  /** 带入的默认金额（如付款记录未收票的部分） */
  defaultAmount?: string;
  /** 修改哪张发票；不传是新登记 */
  invoice?: PurchaseInvoice;
  orderId: string;
  /** 集中收票：同一供应商的多张采购单及各自未开票金额 */
  orders?: InvoiceOrderLine[];
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
/** 分配表里的采购单：新集中收票用传入的；修改集中收票的发票用发票上已关联的 */
const lines = computed<InvoiceOrderLine[]>(() => {
  if (props.orders && props.orders.length > 0) return props.orders;
  const linked = props.invoice?.orders ?? [];
  if (linked.length < 2) return [];
  return linked.map((order) => ({
    key: order.orderId,
    contractId: order.contractId,
    orderId: order.orderId,
    code: order.orderCode ?? '采购单',
  }));
});
const central = computed(() => lines.value.length > 0);
const allocations =
  ref<Record<string, string | undefined>>(initialAllocations());
const allocated = computed(() => allocatedTotal(allocations.value));
function initialAllocations() {
  const linked = props.invoice?.orders ?? [];
  if (props.invoice && linked.length > 1)
    return Object.fromEntries(
      linked.map((order) => [order.orderId, String(order.amount)]),
    );
  if (props.orders && props.orders.length > 0)
    return allocateInvoice(props.defaultAmount, props.orders);
  return {};
}
function autoAllocate() {
  allocations.value = allocateInvoice(form.value.amount, lines.value);
}

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
    if (central.value && !props.invoice) autoAllocate();
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
  if (central.value) {
    error.value = allocationProblem(
      form.value.amount,
      allocations.value,
      lines.value,
    );
    if (error.value) return;
  } else if (excess.value) {
    error.value = `本单未收票 ${unit.value} ${available.value?.toFormat(2)}，这张发票多出 ${excess.value.toFormat(2)}，不能超额开票。请先核对金额是否识别错；运费、补差请先加到采购单附加金额。`;
    return;
  }
  void submit(file.value);
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
    orders: central.value
      ? allocationInputs(allocations.value, lines.value)
      : undefined,
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
    allocations.value = {};
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
        <FilePreviewButton
          size="small"
          :name="file?.name ?? invoice?.file?.name ?? ''"
          :file="file"
          :load="
            file ? undefined : () => downloadPurchaseInvoiceFile(invoice!.id)
          "
        />
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
        <span v-if="!central && excess" class="over">
          超出未收票 {{ excess.toFormat(2) }}，不能保存
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
      <div v-if="central" class="allocation">
        <div class="allocation-head">
          <span>
            关联采购单 {{ lines.length }} 张 · 关联合计
            <b class="num">{{ unit }} {{ allocated.toFormat(2) }}</b>
            <template v-if="!allocated.eq(form.amount || 0)">
              ，与发票金额相差
              <b class="over num">{{
                new BigNumber(form.amount || 0).minus(allocated).toFormat(2)
              }}</b>
            </template>
          </span>
          <Button size="small" @click="autoAllocate">按未开票自动分配</Button>
        </div>
        <table>
          <thead>
            <tr>
              <th>采购单</th>
              <th class="right">未开票</th>
              <th class="right">本发票关联金额</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="line in lines" :key="line.key">
              <td>{{ line.code }}</td>
              <td class="right num">
                {{
                  line.remaining === undefined
                    ? '—'
                    : new BigNumber(line.remaining).toFormat(2)
                }}
              </td>
              <td class="right">
                <InputNumber
                  v-model:value="allocations[line.key]"
                  string-mode
                  :min="0"
                  :precision="2"
                  :controls="false"
                  size="small"
                  style="width: 140px"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
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

.allocation {
  display: flex;
  flex-direction: column;
  grid-column: 1 / -1;
  gap: 6px;
  font-size: 13px;
}

.allocation-head {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
}

.allocation table {
  width: 100%;
  border-collapse: collapse;
}

.allocation th,
.allocation td {
  padding: 4px 8px;
  border-bottom: 1px solid hsl(var(--border));
}

.allocation th {
  font-weight: 500;
  color: hsl(var(--muted-foreground));
  text-align: left;
}

.allocation .right {
  text-align: right;
}

.num {
  font-variant-numeric: tabular-nums;
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
