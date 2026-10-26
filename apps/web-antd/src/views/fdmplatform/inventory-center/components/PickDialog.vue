<script setup lang="ts">
import type { PickRow } from './model';

import type {
  InventoryWarehouse,
  StockOut,
  Transfer,
} from '#/api/fdmplatform/warehouse';

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

import {
  createOtherOut,
  createTransfer,
  getInventoryWarehouses,
  getStocks,
} from '#/api/fdmplatform/warehouse';

import { errorText } from '../../data';
import { localDate } from '../../purchase/quotes/comparison';
import { qty } from '../../purchase/warehouse/model';
import {
  firstWarehouse,
  pickErrors,
  pickLines,
  pickRows,
  writableWarehouses,
} from './model';

import '../../purchase/warehouse/stock-dialog.css';

/**
 * 按库存行出货的两种单据：其它出库（不关联合同，记去向）和调拨（调到另一个仓库）。
 * 只列当前登录人能操作的仓库（工厂库管只能选本厂仓库）。
 */
const props = defineProps<{ kind: 'other' | 'transfer'; open: boolean }>();
const emit = defineEmits<{ close: []; saved: [code: string] }>();

const DESTINATIONS = ['电商仓', '平台仓', '样品', '报废', '工厂领用'];
const today = localDate();
const warehouses = ref<InventoryWarehouse[]>([]);
const rows = ref<PickRow[]>([]);
const keyword = ref('');
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const submitted = ref(false);
let idempotencyKey = '';
const form = ref({
  warehouseId: undefined as string | undefined,
  toWarehouseId: undefined as string | undefined,
  date: today,
  destination: '',
  remark: '',
});

const transfer = computed(() => props.kind === 'transfer');
const name = computed(() => (transfer.value ? '调拨' : '出库'));
const errors = computed(() => {
  const result = pickErrors(form.value, rows.value, name.value);
  if (!result.sheet && transfer.value) {
    if (!form.value.toWarehouseId) result.sheet = '请选择调入仓库';
    else if (form.value.toWarehouseId === form.value.warehouseId)
      result.sheet = '调出和调入不能是同一个仓库';
  }
  if (!result.sheet && !transfer.value && !form.value.destination.trim())
    result.sheet = '请填写出库去向';
  return result;
});
const visible = computed(() => {
  const k = keyword.value.trim().toLowerCase();
  return rows.value.filter(
    (row) =>
      !k ||
      Number(row.quantity) > 0 ||
      `${row.productName} ${row.productCode} ${row.specification}`
        .toLowerCase()
        .includes(k),
  );
});
const count = computed(
  () => rows.value.filter((row) => Number(row.quantity) > 0).length,
);

async function loadStocks() {
  rows.value = [];
  if (!form.value.warehouseId) return;
  loading.value = true;
  try {
    rows.value = pickRows(
      await getStocks({
        warehouseId: form.value.warehouseId,
        inStockOnly: true,
      }),
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
    keyword.value = '';
    form.value = {
      warehouseId: undefined,
      toWarehouseId: undefined,
      date: today,
      destination: '',
      remark: '',
    };
    try {
      warehouses.value = await getInventoryWarehouses();
      form.value.warehouseId = firstWarehouse(warehouses.value);
    } catch (error_) {
      error.value = errorText(error_);
    }
  },
  { immediate: true },
);
watch(() => form.value.warehouseId, loadStocks);

async function save() {
  submitted.value = true;
  if (errors.value.sheet || Object.keys(errors.value.lines).length > 0) return;
  saving.value = true;
  error.value = '';
  try {
    const lines = pickLines(rows.value);
    const result: StockOut | Transfer = transfer.value
      ? await createTransfer({
          idempotencyKey,
          fromWarehouseId: form.value.warehouseId ?? '',
          toWarehouseId: form.value.toWarehouseId ?? '',
          transferDate: form.value.date || undefined,
          remark: form.value.remark.trim() || undefined,
          lines,
        })
      : await createOtherOut({
          idempotencyKey,
          warehouseId: form.value.warehouseId ?? '',
          shippedDate: form.value.date || undefined,
          destination: form.value.destination.trim(),
          remark: form.value.remark.trim() || undefined,
          lines,
        });
    emit('saved', result.code);
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
    :title="transfer ? '调拨单' : '其它出库'"
    width="920px"
    :mask-closable="false"
    @cancel="emit('close')"
  >
    <div class="stock-dialog">
      <Alert v-if="error" type="error" :message="error" show-icon />
      <Alert
        v-if="!transfer"
        type="info"
        show-icon
        message="不关联合同的出库：没有合同的自产货发电商仓 / 平台仓、样品、报废等。给客户发货请用「销售出库」。"
      />
      <div class="sheet">
        <label class="field">
          <span>{{ transfer ? '调出仓库' : '出库仓库' }}</span>
          <Select
            v-model:value="form.warehouseId"
            :options="
              writableWarehouses(warehouses).map((entry) => ({
                value: entry.id,
                label: entry.name,
              }))
            "
            :placeholder="
              writableWarehouses(warehouses).length > 0
                ? '选择仓库'
                : '没有你能操作的仓库'
            "
          />
        </label>
        <label v-if="transfer" class="field">
          <span>调入仓库</span>
          <Select
            v-model:value="form.toWarehouseId"
            :options="
              warehouses
                .filter((entry) => entry.id !== form.warehouseId)
                .map((entry) => ({ value: entry.id, label: entry.name }))
            "
            placeholder="选择仓库"
          />
        </label>
        <label v-else class="field">
          <span>去向</span>
          <AutoComplete
            v-model:value="form.destination"
            :options="DESTINATIONS.map((value) => ({ value }))"
            :maxlength="200"
            placeholder="例如 电商仓、样品、报废"
          />
        </label>
        <label class="field">
          <span>{{ transfer ? '调拨日期' : '出库日期' }}</span>
          <Input v-model:value="form.date" type="date" :max="today" />
        </label>
        <label class="field wide">
          <span>备注</span>
          <Input
            v-model:value="form.remark"
            :maxlength="2000"
            placeholder="选填"
          />
        </label>
      </div>
      <p v-if="submitted && errors.sheet" class="field-error">
        {{ errors.sheet }}
      </p>
      <Input.Search
        v-model:value="keyword"
        allow-clear
        placeholder="搜产品名称、编号、规格"
        style="max-width: 280px"
      />
      <div class="table-wrap">
        <table class="stock-grid">
          <thead>
            <tr>
              <th>产品 / 规格</th>
              <th class="num">现存</th>
              <th class="qty">本次{{ name }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!visible.length">
              <td colspan="3" class="empty">
                {{
                  loading
                    ? '正在读取库存'
                    : form.warehouseId
                      ? '这个仓库没有库存'
                      : '先选择仓库'
                }}
              </td>
            </tr>
            <tr
              v-for="row in visible"
              :key="row.stockId"
              :class="{ invalid: submitted && errors.lines[row.stockId] }"
            >
              <td>
                <b>{{ row.productName }}</b>
                <span class="hint">{{ row.productCode }} {{ row.specification }}</span>
                <span
                  v-if="submitted && errors.lines[row.stockId]"
                  class="field-error"
                  >{{ errors.lines[row.stockId] }}</span>
              </td>
              <td class="num">{{ qty(row.onHand) }} {{ row.unit }}</td>
              <td>
                <InputNumber
                  v-model:value="row.quantity"
                  string-mode
                  :min="0"
                  :controls="false"
                  placeholder="不出留空"
                  style="width: 100%"
                  :aria-label="`${row.productName} ${name}数量`"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <template #footer>
      <span class="stock-footer-count">将{{ name }} {{ count }} 行</span>
      <Button @click="emit('close')">取消</Button>
      <Button type="primary" :loading="saving" @click="save">
        确认{{ name }}
      </Button>
    </template>
  </Modal>
</template>
