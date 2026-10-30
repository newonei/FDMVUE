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
  orderGroups,
  qty,
  splitInRow,
  stockInErrors,
  stockInPayload,
  warehouseGroups,
} from './model';

import './stock-dialog.css';

const props = defineProps<{
  contractId?: string;
  open: boolean;
  orderId?: string;
  /** 列表「转入库」：多张同供应商采购单一起登记，每张单、每个仓库各一张入库单 */
  targets?: { code: string; contractId: string; orderId: string }[];
}>();
/** 分仓时会一次生成多张入库单，saved 带回全部 */
const emit = defineEmits<{
  close: [];
  saved: [value: StockIn, all: StockIn[]];
}>();
const multi = computed(() => (props.targets?.length ?? 0) > 0);
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
  if (multi.value) {
    const first = props.targets![0]!;
    return { contractId: first.contractId, orderId: first.orderId };
  }
  // 从采购单打开时 orderId 一定有；不关联合同的采购单 contractId 为空
  if (props.orderId)
    return { contractId: props.contractId ?? '', orderId: props.orderId };
  const order = orders.value.find((entry) => entry.value === picked.value);
  return order
    ? { contractId: order.contractId, orderId: order.value }
    : undefined;
});
const errors = computed(() => stockInErrors(form.value, rows.value));
const count = computed(() => filledInRows(rows.value).length);
const saveLabel = computed(() => {
  if (form.value.directShip) return '入库并直发';
  let notes = 0;
  for (const group of orderGroups(rows.value).values())
    notes += warehouseGroups(group, form.value.warehouseId).size;
  return notes > 1 ? `确认入库（生成 ${notes} 张入库单）` : '确认入库';
});

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
        value: String(row.standaloneId ?? row.id),
        contractId: row.contractId ? String(row.contractId) : '',
        label: `${labels.order} · ${labels.supplier} · ${row.contractCode ?? '未关联合同'}`,
      };
    });
}
async function loadLines() {
  rows.value = [];
  const value = target.value;
  if (!value) return;
  loading.value = true;
  try {
    const sources = multi.value ? props.targets! : [value];
    const loaded = await Promise.all(
      sources.map((source) =>
        getInboundLines(source.contractId, source.orderId),
      ),
    );
    rows.value = loaded.flatMap((lines, index) =>
      inboundRows(lines).map((row) => ({
        ...row,
        orderId: sources[index]!.orderId,
        contractId: sources[index]!.contractId,
        orderCode:
          'code' in sources[index]!
            ? String(sources[index]!.code)
            : row.orderCode,
      })),
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
      await (props.orderId || multi.value ? loadLines() : loadOrders());
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
  const created: StockIn[] = [];
  try {
    // 每张采购单、每个仓库一张入库单；幂等键按单和仓库区分，失败后重试不会重复入库
    for (const [orderId, orderRows] of orderGroups(rows.value)) {
      const ids = {
        contractId: orderRows[0]?.contractId ?? value.contractId,
        orderId: orderId || value.orderId,
      };
      for (const [warehouseId, group] of warehouseGroups(
        orderRows,
        form.value.warehouseId,
      )) {
        created.push(
          await createStockIn(
            stockInPayload({ ...form.value, warehouseId }, group, {
              ...ids,
              idempotencyKey: `${idempotencyKey}:${ids.orderId}:${warehouseId}`,
            }),
          ),
        );
      }
    }
    emit('saved', created[0]!, created);
  } catch (error_) {
    error.value =
      created.length > 0
        ? `已生成 ${created.map((entry) => entry.code).join('、')}，其余仓库失败：${errorText(error_)}`
        : errorText(error_);
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
        <label v-if="!orderId && !multi" class="field wide">
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
              <th class="warehouse">仓库</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!rows.length">
              <td colspan="7" class="empty">
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
              :key="row.key"
              :class="{ invalid: submitted && errors.lines[row.key] }"
            >
              <td>
                <template v-if="!row.split">
                  <span v-if="multi" class="hint">{{ row.orderCode }}</span>
                  <b>{{ row.productName }}</b>
                  <span v-if="row.specification" class="hint">{{
                    row.specification
                  }}</span>
                </template>
                <span v-else class="hint">↳ 分到其他仓</span>
                <span
                  v-if="submitted && errors.lines[row.key]"
                  class="field-error"
                  >{{ errors.lines[row.key] }}</span>
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
              <td>
                <Select
                  v-model:value="row.warehouseId"
                  allow-clear
                  :options="
                    warehouses.map((entry) => ({
                      value: entry.id,
                      label: entry.name,
                    }))
                  "
                  :placeholder="row.split ? '选择仓库' : '同表头'"
                  style="width: 100%"
                />
                <Button
                  v-if="!row.split"
                  type="link"
                  size="small"
                  @click="rows = splitInRow(rows, row)"
                >
                  分到其他仓
                </Button>
                <Button
                  v-else
                  type="link"
                  size="small"
                  danger
                  @click="rows = rows.filter((entry) => entry.key !== row.key)"
                >
                  删除
                </Button>
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
        {{ saveLabel }}
      </Button>
    </template>
  </Modal>
</template>
