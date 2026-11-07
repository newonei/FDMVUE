<script setup lang="ts">
import type { ProcurementSetting } from '#/api/fdmplatform/procurement';
import type { ProcurementFinanceRecord } from '#/api/fdmplatform/procurement-finance';

import { computed, ref, watch } from 'vue';

import {
  Alert,
  AutoComplete,
  Button,
  Input,
  Modal,
  Select,
} from 'ant-design-vue';
import BigNumber from 'bignumber.js';

import { newIdempotencyKey } from '#/api/fdmplatform';
import { getProcurementSettings } from '#/api/fdmplatform/procurement';
import {
  procurementFinanceAction,
  uploadProcurementFinanceFile,
} from '#/api/fdmplatform/procurement-finance';

import FilePreviewButton from '../../../components/FilePreviewButton.vue';
import { errorText } from '../../../data';
import { localDate } from '../../../purchase/quotes/comparison';
import { payerAccountLabel, paymentMethods } from '../model';

/**
 * 财务确认付款：核对采购登记的金额和收款方，转账后填实际付款日期，可改付款公司、账户和分类，
 * 同时上传银行回单。金额、收款方不对要退回采购修改，这里不改。
 */
const props = defineProps<{
  open: boolean;
  record?: ProcurementFinanceRecord;
}>();
const emit = defineEmits<{
  close: [];
  done: [record: ProcurementFinanceRecord];
  /** 回单已上传（确认前），让详情刷新附件 */
  uploaded: [];
}>();

const today = localDate();
const payers = ref<ProcurementSetting[]>([]);
const form = ref<{
  paidAt?: string;
  payerAccount?: string;
  payerEntityId?: string;
  paymentMethod?: string;
  reason?: string;
}>({});
const files = ref<File[]>([]);
const saving = ref(false);
const error = ref('');
let key = newIdempotencyKey();
/** 本次办理中已上传回单后的单据版本 */
let version: number | undefined;

const amountText = computed(() => {
  const value = new BigNumber(String(props.record?.amount ?? ''));
  return value.isFinite()
    ? `${props.record?.currency ?? ''} ${value.toFormat(2)}`.trim()
    : '—';
});

watch(
  () => [props.open, props.record?.id],
  async () => {
    if (!props.open || !props.record) return;
    key = newIdempotencyKey();
    version = undefined;
    error.value = '';
    files.value = [];
    form.value = {
      paidAt: today,
      payerEntityId: props.record.payerEntityId,
      payerAccount: props.record.payerAccount,
      paymentMethod: props.record.paymentMethod,
    };
    try {
      payers.value = await getProcurementSettings('entities', {
        usage: 'PAY',
        active: true,
      });
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

async function confirm() {
  const record = props.record;
  if (!record) return;
  if (!form.value.paidAt) error.value = '请填写实际付款日期';
  else if (form.value.paidAt > today) error.value = '付款日期不能晚于今天';
  else if (!form.value.payerEntityId) error.value = '请选择付款公司';
  else if (form.value.payerAccount?.trim()) {
    error.value = '';
  } else {
    error.value = '请填写付款账户';
  }
  if (error.value) return;
  saving.value = true;
  try {
    // 回单先传到这笔付款下，再确认；传好的从待传列表移走，确认失败重试时不会重复上传
    version ??= record.version;
    while (files.value.length > 0) {
      const file = files.value[0]!;
      const uploaded = await uploadProcurementFinanceFile(record.id, file, {
        expectedVersion: version,
        idempotencyKey: newIdempotencyKey(),
      });
      version = uploaded.version;
      files.value.shift();
      emit('uploaded');
    }
    const value = await procurementFinanceAction(record.id, {
      action: 'APPROVE',
      expectedVersion: version,
      idempotencyKey: `${key}:approve`,
      payload: {
        paidAt: form.value.paidAt,
        payerEntityId: form.value.payerEntityId,
        payerAccount: form.value.payerAccount?.trim(),
        paymentMethod: form.value.paymentMethod?.trim() || undefined,
        reason: form.value.reason?.trim() || undefined,
      },
    });
    emit('done', value);
  } catch (error_) {
    error.value = errorText(error_);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Modal
    :open="open"
    :title="`确认付款 · ${record?.code ?? ''}`"
    width="680px"
    :mask-closable="false"
    @cancel="!saving && emit('close')"
  >
    <div v-if="record" class="review">
      <div class="check">
        <div>
          <span>付款金额</span>
          <b class="amount">{{ amountText }}</b>
        </div>
        <div>
          <span>收款方</span>
          <b>{{ record.payeeName || '—' }}</b>
        </div>
        <div>
          <span>收款账户</span>
          <b>{{ record.payeeAccount || '—' }}</b>
        </div>
        <div>
          <span>采购填写的付款日期</span>
          <b>{{ record.paidAt || '—' }}</b>
        </div>
        <div v-if="record.remark" class="full">
          <span>备注</span>
          <b>{{ record.remark }}</b>
        </div>
      </div>
      <Alert
        type="info"
        show-icon
        message="核对金额和收款方无误、已经转账后再确认。确认后计入采购单已付，并按付款日期冻结汇率；金额或收款方不对请「退回采购」。"
      />
      <Alert v-if="error" type="error" show-icon :message="error" />
      <div class="sheet">
        <label>
          <span><em>*</em>实际付款日期</span>
          <Input v-model:value="form.paidAt" type="date" :max="today" />
        </label>
        <label>
          <span>付款分类</span>
          <AutoComplete
            v-model:value="form.paymentMethod"
            :options="paymentMethods.map((value) => ({ value }))"
          />
        </label>
        <label>
          <span><em>*</em>付款公司</span>
          <Select
            :value="form.payerEntityId"
            :options="
              payers.map((entry) => ({
                value: entry.id,
                label: entry.legalName ?? entry.name,
              }))
            "
            placeholder="选择付款公司"
            @update:value="(value) => pickPayer(String(value))"
          />
        </label>
        <label>
          <span><em>*</em>付款账户</span>
          <Input v-model:value="form.payerAccount" />
        </label>
        <div class="full files">
          <span>银行回单（选填，也可以之后补传）</span>
          <div>
            <input
              type="file"
              multiple
              :disabled="saving"
              @change="pickFiles"
            />
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
                  :disabled="saving"
                  @click="files.splice(index, 1)"
                >
                  移除
                </Button>
              </li>
            </ul>
          </div>
        </div>
        <label class="full">
          <span>审核意见</span>
          <Input.TextArea
            v-model:value="form.reason"
            :rows="2"
            placeholder="选填，例如：已于网银转账"
          />
        </label>
      </div>
    </div>
    <template #footer>
      <Button :disabled="saving" @click="emit('close')">取消</Button>
      <Button type="primary" :loading="saving" @click="confirm">
        确认已付款
      </Button>
    </template>
  </Modal>
</template>

<style scoped>
.review {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.check {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 16px;
  padding: 12px 14px;
  background: hsl(var(--accent));
  border-radius: 8px;
}

.check > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.check span,
.sheet span {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.check b {
  font-weight: 600;
  overflow-wrap: anywhere;
}

.check .amount {
  font-size: 18px;
  font-variant-numeric: tabular-nums;
}

.check .full,
.sheet .full {
  grid-column: 1 / -1;
}

.sheet {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 14px;
}

.sheet label,
.files {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
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

@media (max-width: 640px) {
  .check,
  .sheet {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
