<script setup lang="ts">
import type { OtherInRow } from './doc-model';

import type { Product } from '#/api/fdmplatform/products';
import type { InventoryWarehouse, StockIn } from '#/api/fdmplatform/warehouse';

import { computed, defineAsyncComponent, ref, watch } from 'vue';

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
  createOtherIn,
  getInventoryWarehouses,
} from '#/api/fdmplatform/warehouse';

import { errorText } from '../../data';
import { localDate } from '../../purchase/quotes/comparison';
import { IN_SOURCES, otherInErrors, otherInLines } from './doc-model';
import { firstWarehouse, writableWarehouses } from './model';

import '../../purchase/warehouse/stock-dialog.css';

/**
 * 常规入库（金智同款）：不关联采购单的货进仓库——期初、客户退回、样品退回、电商仓退回等。
 * 产品从产品中心选；填了成本单价按它计入库存成本，不填成本未知。只列当前登录人能操作的仓库。
 */
const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: []; saved: [value: StockIn] }>();

const ProductPicker = defineAsyncComponent(
  () => import('../../products/components/ProductPicker.vue'),
);

const today = localDate();
const warehouses = ref<InventoryWarehouse[]>([]);
const rows = ref<OtherInRow[]>([]);
const pickerMounted = ref(false);
const pickerOpen = ref(false);
const saving = ref(false);
const error = ref('');
const submitted = ref(false);
let idempotencyKey = '';
const form = ref({
  warehouseId: undefined as string | undefined,
  receivedDate: today,
  source: '',
  remark: '',
});
const errors = computed(() => otherInErrors(form.value, rows.value));

watch(
  () => props.open,
  async (open) => {
    if (!open) return;
    idempotencyKey = crypto.randomUUID();
    submitted.value = false;
    error.value = '';
    rows.value = [];
    form.value = {
      warehouseId: undefined,
      receivedDate: today,
      source: '',
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

function openPicker() {
  pickerMounted.value = true;
  pickerOpen.value = true;
}
function picked(products: Product[]) {
  pickerOpen.value = false;
  const have = new Set(rows.value.map((row) => row.productId));
  for (const product of products) {
    if (have.has(product.id)) continue;
    rows.value.push({
      productId: product.id,
      productName: product.displayName || product.name,
      productCode: product.code ?? '',
      specification: product.specification ?? '',
      unit: product.unit ?? '',
    });
  }
}
function remove(row: OtherInRow) {
  rows.value = rows.value.filter((entry) => entry !== row);
}

async function save() {
  submitted.value = true;
  if (errors.value.sheet || Object.keys(errors.value.lines).length > 0) return;
  saving.value = true;
  error.value = '';
  try {
    const result = await createOtherIn({
      idempotencyKey,
      warehouseId: form.value.warehouseId ?? '',
      receivedDate: form.value.receivedDate || undefined,
      source: form.value.source.trim(),
      remark: form.value.remark.trim() || undefined,
      lines: otherInLines(rows.value),
    });
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
    title="常规入库"
    width="920px"
    :mask-closable="false"
    @cancel="emit('close')"
  >
    <div class="stock-dialog">
      <Alert v-if="error" type="error" :message="error" show-icon />
      <Alert
        type="info"
        show-icon
        message="不关联采购单的入库：期初库存、客户退回、样品退回、电商仓退回等。采购来的货请在采购单上登记「采购入库」。"
      />
      <div class="sheet">
        <label class="field">
          <span>入库仓库</span>
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
        <label class="field">
          <span>来源</span>
          <AutoComplete
            v-model:value="form.source"
            :options="IN_SOURCES.map((value) => ({ value }))"
            :maxlength="200"
            placeholder="例如 期初库存、客户退回"
          />
        </label>
        <label class="field">
          <span>入库日期</span>
          <Input v-model:value="form.receivedDate" type="date" :max="today" />
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
      <div>
        <Button @click="openPicker">从产品中心添加产品</Button>
      </div>
      <div class="table-wrap">
        <table class="stock-grid">
          <thead>
            <tr>
              <th>产品 / 规格</th>
              <th class="qty">入库数量</th>
              <th class="qty">成本单价</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!rows.length">
              <td colspan="4" class="empty">还没有产品，点上方按钮添加</td>
            </tr>
            <tr
              v-for="row in rows"
              :key="row.productId"
              :class="{ invalid: submitted && errors.lines[row.productId] }"
            >
              <td>
                <b>{{ row.productName }}</b>
                <span class="hint">
                  {{ row.productCode }} {{ row.specification }}
                  {{ row.unit ? `· ${row.unit}` : '' }}
                </span>
                <span
                  v-if="submitted && errors.lines[row.productId]"
                  class="field-error"
                  >{{ errors.lines[row.productId] }}</span>
              </td>
              <td>
                <InputNumber
                  v-model:value="row.quantity"
                  string-mode
                  :min="0"
                  :controls="false"
                  style="width: 100%"
                  :aria-label="`${row.productName} 入库数量`"
                />
              </td>
              <td>
                <InputNumber
                  v-model:value="row.unitCost"
                  string-mode
                  :min="0"
                  :controls="false"
                  placeholder="不知道留空"
                  style="width: 100%"
                  :aria-label="`${row.productName} 成本单价`"
                />
              </td>
              <td>
                <Button size="small" type="link" danger @click="remove(row)">
                  移除
                </Button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <template #footer>
      <span class="stock-footer-count">将入库 {{ rows.length }} 行</span>
      <Button @click="emit('close')">取消</Button>
      <Button type="primary" :loading="saving" @click="save">确认入库</Button>
    </template>
    <ProductPicker
      v-if="pickerMounted"
      allow-incomplete
      :company-id="0"
      :open="pickerOpen"
      title="选择入库产品"
      @close="pickerOpen = false"
      @selected="picked"
    />
  </Modal>
</template>
