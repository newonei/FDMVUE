<script setup lang="ts">
import type { PaymentForm } from '../model';

import type { ProcurementSetting } from '#/api/fdmplatform/procurement';
import type { ProcurementFinanceRecord } from '#/api/fdmplatform/procurement-finance';

import { computed, ref, watch } from 'vue';

import {
  Alert,
  AutoComplete,
  Button,
  Input,
  InputNumber,
  Modal,
  Select,
} from 'ant-design-vue';
import BigNumber from 'bignumber.js';

import { getProcurementSettings } from '#/api/fdmplatform/procurement';
import {
  registerOrderPayment,
  uploadProcurementFinanceFile,
} from '#/api/fdmplatform/procurement-finance';

import { errorText } from '../../../data';
import { localDate } from '../../../purchase/quotes/comparison';
import {
  payerAccountLabel,
  paymentDefaults,
  paymentFormProblem,
  paymentMethods,
} from '../model';

/**
 * 登记付款记录（金智「付款记录」）：采购单每付一笔钱登记一张，分期付款就是登记多张。
 * 不经请款，保存即确认、计入已付；银行回单可一起上传，也可以之后在付款记录里补。
 */
const props = defineProps<{
  /** 本单最多还能登记的金额（采购应付 − 已付 − 历史请款未付部分） */
  available?: unknown;
  contractId: string;
  currency?: string;
  open: boolean;
  orderCode?: string;
  orderId: string;
  /** 本单已有的付款记录，用来带入上一笔的付款公司和收款账户 */
  previous?: Array<Record<string, unknown>>;
  /** 采购单数据参考（金智同款）：采购金额、已付、未付、已收票 */
  reference?: {
    invoiced?: unknown;
    orderAmount?: unknown;
    paid?: unknown;
    unpaid?: unknown;
  };
  supplierName?: string;
}>();
const emit = defineEmits<{
  close: [];
  saved: [record: ProcurementFinanceRecord];
}>();

const today = localDate();
const payers = ref<ProcurementSetting[]>([]);
const form = ref<PaymentForm>({});
const files = ref<File[]>([]);
const saving = ref(false);
const error = ref('');
let key = crypto.randomUUID();

const referenceItems = computed(() => {
  const value = props.reference;
  if (!value) return [];
  const money = (input: unknown) => {
    const number = new BigNumber(String(input ?? ''));
    return number.isFinite() ? number : undefined;
  };
  const order = money(value.orderAmount);
  const invoiced = money(value.invoiced) ?? new BigNumber(0);
  return [
    { label: '采购金额', value: order },
    { label: '已付款金额', value: money(value.paid) },
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
    form.value = {
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

async function save() {
  error.value = paymentFormProblem(form.value, today, props.available);
  if (error.value) return;
  saving.value = true;
  try {
    let record = await registerOrderPayment(
      {
        contractId: props.contractId === 'standalone' ? '' : props.contractId,
        orderId: props.orderId,
        name: `${props.orderCode ?? ''} 付款`.trim(),
        amount: form.value.amount!,
        paidAt: form.value.paidAt!,
        payerEntityId: form.value.payerEntityId!,
        payerAccount: form.value.payerAccount!.trim(),
        paymentMethod: form.value.paymentMethod?.trim() || undefined,
        payeeName: form.value.payeeName!.trim(),
        payeeAccount: form.value.payeeAccount?.trim() || undefined,
        remark: form.value.remark?.trim() || undefined,
        noInvoice: form.value.noInvoice || undefined,
      },
      key,
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
        title: `付款已登记，${failed.length} 个回单没传上`,
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
    :title="`登记付款${orderCode ? ` · ${orderCode}` : ''}`"
    width="760px"
    :mask-closable="false"
    @cancel="emit('close')"
  >
    <div class="payment">
      <Alert
        type="info"
        show-icon
        :message="`每付一笔钱登记一张付款记录，分期付款就登记多张。${
          limit ? `本单还可登记 ${currency ?? ''} ${limit.toFormat(2)}。` : ''
        }`"
      />
      <Alert v-if="error" type="error" :message="error" show-icon />
      <div v-if="referenceItems.length > 0" class="reference">
        <span class="reference-title">采购单数据参考</span>
        <span v-for="item in referenceItems" :key="item.label">
          {{ item.label }}：<b>{{ item.text }}</b>
        </span>
      </div>
      <div class="sheet">
        <label>
          <span><em>*</em>付款金额（{{ currency ?? 'CNY' }}）</span>
          <InputNumber
            v-model:value="form.amount"
            string-mode
            :min="0"
            :controls="false"
            style="width: 100%"
          />
        </label>
        <label>
          <span><em>*</em>付款日期</span>
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
        <label>
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
      <Button @click="emit('close')">取消</Button>
      <Button type="primary" :loading="saving" @click="save"> 登记付款 </Button>
    </template>
  </Modal>
</template>

<style scoped>
.payment {
  display: flex;
  flex-direction: column;
  gap: 12px;
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
