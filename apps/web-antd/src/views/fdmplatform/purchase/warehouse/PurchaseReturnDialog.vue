<script setup lang="ts">
import type { ReturnRow } from './return-model';

import type { PurchaseReturn, StockIn } from '#/api/fdmplatform/warehouse';

import { computed, ref, watch } from 'vue';

import {
  Alert,
  Button,
  Input,
  InputNumber,
  Modal,
  Switch,
} from 'ant-design-vue';

import { createPurchaseReturn } from '#/api/fdmplatform/warehouse';

import { errorText } from '../../data';
import { localDate } from '../quotes/comparison';
import { qty } from './model';
import { returnErrors, returnPayload, returnRows } from './return-model';

import './stock-dialog.css';

/** 采购退货单：从一张入库单退给供应商（金智「采购退货单」）。 */
const props = defineProps<{ stockIn?: StockIn }>();
const emit = defineEmits<{
  close: [];
  saved: [value: PurchaseReturn];
}>();

const today = localDate();
const rows = ref<ReturnRow[]>([]);
const saving = ref(false);
const error = ref('');
const submitted = ref(false);
let idempotencyKey = '';
const form = ref({
  returnedDate: today,
  reason: '',
  noReplacement: false,
  remark: '',
});
const errors = computed(() => returnErrors(form.value, rows.value));
const count = computed(
  () => rows.value.filter((row) => Number(row.quantity) > 0).length,
);

watch(
  () => props.stockIn,
  (stockIn) => {
    if (!stockIn) return;
    idempotencyKey = crypto.randomUUID();
    submitted.value = false;
    error.value = '';
    form.value = {
      returnedDate: today,
      reason: '',
      noReplacement: false,
      remark: '',
    };
    rows.value = returnRows(stockIn);
  },
  { immediate: true },
);

async function save() {
  submitted.value = true;
  const stockIn = props.stockIn;
  if (
    !stockIn ||
    errors.value.sheet ||
    Object.keys(errors.value.lines).length > 0
  )
    return;
  saving.value = true;
  error.value = '';
  try {
    emit(
      'saved',
      await createPurchaseReturn(
        returnPayload(form.value, rows.value, {
          idempotencyKey,
          stockInId: stockIn.id,
        }),
      ),
    );
  } catch (error_) {
    error.value = errorText(error_);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Modal
    :open="Boolean(stockIn)"
    :title="`采购退货 · ${stockIn?.code ?? ''}`"
    width="860px"
    :mask-closable="false"
    @cancel="emit('close')"
  >
    <div v-if="stockIn" class="stock-dialog">
      <Alert v-if="error" type="error" :message="error" show-icon />
      <div class="sheet">
        <div class="field">
          <span>采购单 / 供应商</span>
          <b>{{ stockIn.orderCode }} · {{ stockIn.supplierName }}</b>
        </div>
        <div class="field">
          <span>仓库</span>
          <b>{{ stockIn.warehouseName }}</b>
        </div>
        <label class="field">
          <span>退货日期</span>
          <Input v-model:value="form.returnedDate" type="date" :max="today" />
        </label>
        <label class="field wide">
          <span>退货原因</span>
          <Input
            v-model:value="form.reason"
            :maxlength="500"
            placeholder="例如：色差、破损、规格不符"
          />
        </label>
        <div class="field wide">
          <span>后续</span>
          <div class="direct-line">
            <Switch v-model:checked="form.noReplacement" />
            <span>{{ form.noReplacement ? '不再补货' : '供应商补发' }}</span>
            <small>
              {{
                form.noReplacement
                  ? '退货数量同时取消采购余额，采购金额与应付一起减少'
                  : '退货后采购单可以再收补发的货，采购金额不变'
              }}
            </small>
          </div>
        </div>
        <label class="field wide">
          <span>备注</span>
          <Input v-model:value="form.remark" placeholder="选填" />
        </label>
      </div>
      <p v-if="submitted && errors.sheet" class="field-error">
        {{ errors.sheet }}
      </p>
      <div class="table-wrap">
        <table class="stock-grid">
          <thead>
            <tr>
              <th>产品 / 规格</th>
              <th>类别</th>
              <th class="num">可退</th>
              <th class="qty">本次退货</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!rows.length">
              <td colspan="4" class="empty">这张入库单已经没有可退的货</td>
            </tr>
            <tr
              v-for="row in rows"
              :key="row.key"
              :class="{ invalid: submitted && errors.lines[row.key] }"
            >
              <td>
                <b>{{ row.productName }}</b>
                <span v-if="row.specification" class="hint">{{
                  row.specification
                }}</span>
                <span
                  v-if="submitted && errors.lines[row.key]"
                  class="field-error"
                  >{{ errors.lines[row.key] }}</span>
              </td>
              <td>
                {{ row.kind === 'ACCEPTED' ? '合格品（扣库存）' : '不合格品' }}
              </td>
              <td class="num">{{ qty(row.available) }} {{ row.unit }}</td>
              <td>
                <InputNumber
                  v-model:value="row.quantity"
                  string-mode
                  :min="0"
                  :controls="false"
                  placeholder="不退留空"
                  style="width: 100%"
                  :aria-label="`${row.productName} 退货数量`"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <template #footer>
      <span class="stock-footer-count">将退货 {{ count }} 行</span>
      <Button @click="emit('close')">取消</Button>
      <Button type="primary" :loading="saving" @click="save">确认退货</Button>
    </template>
  </Modal>
</template>
