<script setup lang="ts">
import type { InRow } from './model';

import type { ProcurementSetting } from '#/api/fdmplatform/procurement';
import type { StockIn } from '#/api/fdmplatform/warehouse';

import { computed, ref, watch } from 'vue';

import {
  Alert,
  Button,
  Input,
  InputNumber,
  Modal,
  Select,
  Switch,
} from 'ant-design-vue';

import {
  getProcurementOrders,
  getProcurementSettings,
} from '#/api/fdmplatform/procurement';
import { createStockIn, getInboundLines } from '#/api/fdmplatform/warehouse';

import { errorText } from '../../data';
import { purchaseRowLabels } from '../manage/model';
import { localDate } from '../quotes/comparison';
import {
  defaultWarehouse,
  filledInRows,
  inboundRows,
  qty,
  stockInErrors,
  stockInPayload,
} from './model';

import './stock-dialog.css';

const props = defineProps<{
  contractId?: string;
  open: boolean;
  orderId?: string;
}>();
const emit = defineEmits<{ close: []; saved: [value: StockIn] }>();

const today = localDate();
const warehouses = ref<ProcurementSetting[]>([]);
const orders = ref<{ contractId: string; label: string; value: string }[]>([]);
const picked = ref<string>();
const rows = ref<InRow[]>([]);
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const submitted = ref(false);
let idempotencyKey = '';
const form = ref({
  warehouseId: undefined as string | undefined,
  receivedDate: today,
  deliveryNo: '',
  remark: '',
  directShip: false,
});
const target = computed(() => {
  if (props.contractId && props.orderId)
    return { contractId: props.contractId, orderId: props.orderId };
  const order = orders.value.find((entry) => entry.value === picked.value);
  return order
    ? { contractId: order.contractId, orderId: order.value }
    : undefined;
});
const errors = computed(() => stockInErrors(form.value, rows.value));
const count = computed(() => filledInRows(rows.value).length);

async function loadOrders(keyword = '') {
  const page = await getProcurementOrders({
    pageNo: 1,
    pageSize: 30,
    keyword: keyword || undefined,
    pendingCompletion: false,
  });
  orders.value = page.list
    .filter((row) =>
      ['ORDERED', 'PARTIALLY_RECEIVED'].includes(String(row.record?.status)),
    )
    .map((row) => {
      const labels = purchaseRowLabels(row);
      return {
        value: String(row.id),
        contractId: String(row.contractId),
        label: `${labels.order} · ${labels.supplier} · ${row.contractCode ?? ''}`,
      };
    });
}
async function loadLines() {
  rows.value = [];
  const value = target.value;
  if (!value) return;
  loading.value = true;
  try {
    rows.value = inboundRows(
      await getInboundLines(value.contractId, value.orderId),
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
    form.value = {
      warehouseId: undefined,
      receivedDate: today,
      deliveryNo: '',
      remark: '',
      directShip: false,
    };
    try {
      warehouses.value = await getProcurementSettings('warehouses', {
        active: true,
      });
      form.value.warehouseId = defaultWarehouse(warehouses.value);
      await (props.orderId ? loadLines() : loadOrders());
    } catch (error_) {
      error.value = errorText(error_);
    }
  },
  { immediate: true },
);
watch(picked, loadLines);

async function save() {
  submitted.value = true;
  const value = target.value;
  if (
    !value ||
    errors.value.sheet ||
    Object.keys(errors.value.lines).length > 0
  )
    return;
  saving.value = true;
  error.value = '';
  try {
    const result = await createStockIn(
      stockInPayload(form.value, rows.value, { ...value, idempotencyKey }),
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
    title="采购入库"
    width="980px"
    :mask-closable="false"
    @cancel="emit('close')"
  >
    <div class="stock-dialog">
      <Alert v-if="error" type="error" :message="error" show-icon />
      <div class="sheet">
        <label v-if="!orderId" class="field wide">
          <span>采购单</span>
          <Select
            v-model:value="picked"
            show-search
            :filter-option="false"
            :options="orders"
            placeholder="搜索采购单号、供应商或合同号"
            @search="loadOrders"
          />
        </label>
        <label class="field">
          <span>入库仓库</span>
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
          <span>入库日期</span>
          <Input v-model:value="form.receivedDate" type="date" :max="today" />
        </label>
        <label class="field">
          <span>送货单 / 物流单号</span>
          <Input v-model:value="form.deliveryNo" placeholder="选填" />
        </label>
        <label class="field direct">
          <span>直发客户</span>
          <span class="direct-line">
            <Switch v-model:checked="form.directShip" />
            <small>{{
              form.directShip
                ? '保存时自动生成同数量的销售出库，库存一进一出'
                : '货进仓库，之后再做销售出库'
            }}</small>
          </span>
        </label>
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
              <th class="num">未入库</th>
              <th class="qty">本次实收</th>
              <th class="qty">合格</th>
              <th>不合格原因</th>
              <th class="batch">批次号</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!rows.length">
              <td colspan="6" class="empty">
                {{
                  loading
                    ? '正在读取采购单'
                    : target
                      ? '这张采购单已全部入库'
                      : '先选择采购单'
                }}
              </td>
            </tr>
            <tr
              v-for="row in rows"
              :key="row.orderLineId"
              :class="{ invalid: submitted && errors.lines[row.orderLineId] }"
            >
              <td>
                <b>{{ row.productName }}</b>
                <span v-if="row.specification" class="hint">{{
                  row.specification
                }}</span>
                <span
                  v-if="submitted && errors.lines[row.orderLineId]"
                  class="field-error"
                  >{{ errors.lines[row.orderLineId] }}</span>
              </td>
              <td class="num">{{ qty(row.remaining) }} {{ row.unit }}</td>
              <td>
                <InputNumber
                  :value="row.quantity"
                  string-mode
                  :min="0"
                  :controls="false"
                  placeholder="不入留空"
                  style="width: 100%"
                  :aria-label="`${row.productName} 实收`"
                  @update:value="
                    (value) => {
                      row.quantity = value == null ? undefined : String(value);
                      row.acceptedQuantity = row.quantity;
                    }
                  "
                />
              </td>
              <td>
                <InputNumber
                  v-model:value="row.acceptedQuantity"
                  string-mode
                  :min="0"
                  :controls="false"
                  style="width: 100%"
                  :aria-label="`${row.productName} 合格`"
                />
              </td>
              <td>
                <Input
                  v-model:value="row.exceptionReason"
                  :disabled="row.acceptedQuantity === row.quantity"
                  placeholder="合格数少于实收时填"
                />
              </td>
              <td>
                <Input v-model:value="row.batchNo" placeholder="选填" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <template #footer>
      <span class="stock-footer-count">将入库 {{ count }} 行</span>
      <Button @click="emit('close')">取消</Button>
      <Button
        type="primary"
        :loading="saving"
        :disabled="!target"
        @click="save"
      >
        {{ form.directShip ? '入库并直发' : '确认入库' }}
      </Button>
    </template>
  </Modal>
</template>
