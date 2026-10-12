<script setup lang="ts">
import type { OutRow } from './model';

import type { ProcurementSetting } from '#/api/fdmplatform/procurement';
import type { StockOut } from '#/api/fdmplatform/warehouse';

import { computed, ref, watch } from 'vue';

import {
  Alert,
  Button,
  Input,
  InputNumber,
  Modal,
  Select,
} from 'ant-design-vue';

import { getContractBoard } from '#/api/fdmplatform/contract-board';
import { getProcurementSettings } from '#/api/fdmplatform/procurement';
import { createStockOut, getOutboundItems } from '#/api/fdmplatform/warehouse';

import { errorText } from '../../data';
import { localDate } from '../quotes/comparison';
import {
  defaultWarehouse,
  outboundRows,
  qty,
  stockOutErrors,
  stockOutPayload,
} from './model';

import './stock-dialog.css';

const props = defineProps<{ contractId?: string; open: boolean }>();
const emit = defineEmits<{ close: []; saved: [value: StockOut] }>();

const today = localDate();
const warehouses = ref<ProcurementSetting[]>([]);
const contracts = ref<{ label: string; value: string }[]>([]);
const picked = ref<string>();
const rows = ref<OutRow[]>([]);
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const submitted = ref(false);
let idempotencyKey = '';
const form = ref({
  warehouseId: undefined as string | undefined,
  shippedDate: today,
  remark: '',
});
const contractId = computed(() => props.contractId ?? picked.value);
const errors = computed(() => stockOutErrors(form.value, rows.value));
const count = computed(
  () => rows.value.filter((row) => Number(row.quantity) > 0).length,
);

async function loadContracts(keyword = '') {
  const page = await getContractBoard({
    pageNo: 1,
    pageSize: 30,
    tab: 'ACTIVE',
    keyword: keyword || undefined,
    shipState: 'OPEN',
  });
  contracts.value = page.list.map((row) => ({
    value: row.id,
    label: `${row.code} · ${row.customerName ?? ''} · ${row.firstItem ?? ''}`,
  }));
}
async function loadItems() {
  rows.value = [];
  if (!contractId.value) return;
  loading.value = true;
  try {
    rows.value = outboundRows(
      await getOutboundItems(contractId.value, form.value.warehouseId),
    );
  } catch (error_) {
    error.value = errorText(error_);
  } finally {
    loading.value = false;
  }
}
watch(
  () => props.open,
  async (open) => {
    if (!open) return;
    idempotencyKey = crypto.randomUUID();
    submitted.value = false;
    error.value = '';
    picked.value = undefined;
    form.value = { warehouseId: undefined, shippedDate: today, remark: '' };
    try {
      warehouses.value = await getProcurementSettings('warehouses', {
        active: true,
      });
      form.value.warehouseId = defaultWarehouse(warehouses.value);
      await (props.contractId ? loadItems() : loadContracts());
    } catch (error_) {
      error.value = errorText(error_);
    }
  },
  { immediate: true },
);
watch([picked, () => form.value.warehouseId], loadItems);

async function save() {
  submitted.value = true;
  if (
    !contractId.value ||
    errors.value.sheet ||
    Object.keys(errors.value.lines).length > 0
  )
    return;
  saving.value = true;
  error.value = '';
  try {
    const result = await createStockOut(
      stockOutPayload(form.value, rows.value, {
        contractId: contractId.value,
        idempotencyKey,
      }),
    );
    emit('saved', result);
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
    title="销售出库"
    width="920px"
    :mask-closable="false"
    @cancel="emit('close')"
  >
    <div class="stock-dialog">
      <Alert v-if="error" type="error" :message="error" show-icon />
      <div class="sheet">
        <label v-if="!props.contractId" class="field wide">
          <span>合同</span>
          <Select
            v-model:value="picked"
            show-search
            :filter-option="false"
            :options="contracts"
            placeholder="搜索合同号、客户或产品"
            @search="loadContracts"
          />
        </label>
        <label class="field">
          <span>出库仓库</span>
          <Select
            v-model:value="form.warehouseId"
            :options="
              warehouses.map((entry) => ({
                value: entry.id,
                label: entry.name,
              }))
            "
            placeholder="选择仓库"
          />
        </label>
        <label class="field">
          <span>出库日期</span>
          <Input v-model:value="form.shippedDate" type="date" :max="today" />
        </label>
        <label class="field">
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
              <th class="num">合同未出</th>
              <th class="num">仓库现存</th>
              <th class="qty">本次出库</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!rows.length">
              <td colspan="4" class="empty">
                {{
                  loading
                    ? '正在读取合同'
                    : contractId
                      ? '这份合同没有待出库的产品'
                      : '先选择合同'
                }}
              </td>
            </tr>
            <tr
              v-for="row in rows"
              :key="row.contractItemId"
              :class="{
                invalid: submitted && errors.lines[row.contractItemId],
              }"
            >
              <td>
                <b>{{ row.productName }}</b>
                <span v-if="row.specification" class="hint">{{
                  row.specification
                }}</span>
                <span
                  v-if="submitted && errors.lines[row.contractItemId]"
                  class="field-error"
                  >{{ errors.lines[row.contractItemId] }}</span>
              </td>
              <td class="num">{{ qty(row.remaining) }} {{ row.unit }}</td>
              <td class="num">{{ qty(row.onHand) }} {{ row.unit }}</td>
              <td>
                <InputNumber
                  v-model:value="row.quantity"
                  string-mode
                  :min="0"
                  :controls="false"
                  placeholder="不出留空"
                  style="width: 100%"
                  :aria-label="`${row.productName} 出库数量`"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <template #footer>
      <span class="stock-footer-count">将出库 {{ count }} 行</span>
      <Button @click="emit('close')">取消</Button>
      <Button
        type="primary"
        :loading="saving"
        :disabled="!contractId"
        @click="save"
      >
        确认出库
      </Button>
    </template>
  </Modal>
</template>
