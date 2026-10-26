<script setup lang="ts">
import type { CountRow } from './model';

import type {
  InventoryWarehouse,
  Stocktake,
} from '#/api/fdmplatform/warehouse';

import { computed, ref, watch } from 'vue';

import {
  Alert,
  Button,
  Checkbox,
  Input,
  InputNumber,
  Modal,
  Select,
} from 'ant-design-vue';

import {
  createStocktake,
  getInventoryWarehouses,
  getStocks,
} from '#/api/fdmplatform/warehouse';

import { errorText } from '../../data';
import { localDate } from '../../purchase/quotes/comparison';
import { qty } from '../../purchase/warehouse/model';
import {
  countDiff,
  countErrors,
  countPayload,
  countRows,
  firstWarehouse,
  writableWarehouses,
} from './model';

import '../../purchase/warehouse/stock-dialog.css';

/**
 * 盘点单：选仓库带出账面数，录实盘数，过账时按差额调整库存（盘盈按平均成本入、盘亏按平均成本出）。
 * 实盘数留空的行不盘；过账时账面数变了（期间有进出）要刷新重盘。
 */
const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: []; saved: [value: Stocktake] }>();

const today = localDate();
const warehouses = ref<InventoryWarehouse[]>([]);
const rows = ref<CountRow[]>([]);
const keyword = ref('');
const showZero = ref(false);
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const submitted = ref(false);
let idempotencyKey = '';
const form = ref({
  warehouseId: undefined as string | undefined,
  countedDate: today,
  remark: '',
});

const errors = computed(() => countErrors(form.value, rows.value));
const visible = computed(() => {
  const k = keyword.value.trim().toLowerCase();
  return rows.value.filter(
    (row) =>
      (showZero.value || Number(row.book) !== 0 || (row.actual ?? '') !== '') &&
      (!k ||
        `${row.productName} ${row.productCode} ${row.specification}`
          .toLowerCase()
          .includes(k)),
  );
});
const counted = computed(() =>
  rows.value.filter((row) => countDiff(row) !== undefined),
);
const changed = computed(
  () => counted.value.filter((row) => Number(countDiff(row)) !== 0).length,
);

async function loadStocks() {
  rows.value = [];
  if (!form.value.warehouseId) return;
  loading.value = true;
  try {
    rows.value = countRows(
      await getStocks({
        warehouseId: form.value.warehouseId,
        inStockOnly: false,
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
    form.value = { warehouseId: undefined, countedDate: today, remark: '' };
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

/** 实盘 = 账面：这几行盘过、没差异。 */
function sameAsBook(row: CountRow) {
  row.actual = row.book;
}

async function save() {
  submitted.value = true;
  if (errors.value.sheet || Object.keys(errors.value.lines).length > 0) return;
  saving.value = true;
  error.value = '';
  try {
    emit(
      'saved',
      await createStocktake(
        countPayload(form.value, rows.value, idempotencyKey),
      ),
    );
  } catch (error_) {
    error.value = errorText(error_);
    // 账面变了：重新带出账面数，已录的实盘数保留
    if (error.value.includes('重盘')) {
      const actual = new Map(
        rows.value.map((row) => [row.stockId, row.actual]),
      );
      await loadStocks();
      for (const row of rows.value) row.actual = actual.get(row.stockId);
      idempotencyKey = crypto.randomUUID();
    }
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Modal
    :open="open"
    title="盘点单"
    width="960px"
    :mask-closable="false"
    @cancel="emit('close')"
  >
    <div class="stock-dialog">
      <Alert v-if="error" type="error" :message="error" show-icon />
      <div class="sheet">
        <label class="field">
          <span>盘点仓库</span>
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
          <span>盘点日期</span>
          <Input v-model:value="form.countedDate" type="date" :max="today" />
        </label>
        <label class="field">
          <span>备注</span>
          <Input
            v-model:value="form.remark"
            :maxlength="2000"
            placeholder="选填，例如 月底盘点"
          />
        </label>
      </div>
      <p v-if="submitted && errors.sheet" class="field-error">
        {{ errors.sheet }}
      </p>
      <div style="display: flex; gap: 12px; align-items: center">
        <Input.Search
          v-model:value="keyword"
          allow-clear
          placeholder="搜产品名称、编号、规格"
          style="max-width: 280px"
        />
        <Checkbox v-model:checked="showZero">显示账面为 0 的</Checkbox>
      </div>
      <div class="table-wrap">
        <table class="stock-grid">
          <thead>
            <tr>
              <th>产品 / 规格</th>
              <th class="num">账面</th>
              <th class="qty">实盘</th>
              <th class="num">差异</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!visible.length">
              <td colspan="4" class="empty">
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
              <td class="num">{{ qty(row.book) }} {{ row.unit }}</td>
              <td>
                <span style="display: flex; gap: 6px; align-items: center">
                  <InputNumber
                    v-model:value="row.actual"
                    string-mode
                    :min="0"
                    :controls="false"
                    placeholder="不盘留空"
                    style="width: 120px"
                    :aria-label="`${row.productName} 实盘数`"
                  />
                  <Button size="small" type="link" @click="sameAsBook(row)">同账面</Button>
                </span>
              </td>
              <td
                class="num"
                :style="{
                  color:
                    Number(countDiff(row)) > 0
                      ? 'hsl(var(--success))'
                      : Number(countDiff(row)) < 0
                        ? 'hsl(var(--destructive))'
                        : undefined,
                }"
              >
                {{
                  countDiff(row) === undefined
                    ? '—'
                    : `${Number(countDiff(row)) > 0 ? '+' : ''}${qty(countDiff(row))}`
                }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <template #footer>
      <span class="stock-footer-count">已盘 {{ counted.length }} 行，有差异 {{ changed }} 行</span>
      <Button @click="emit('close')">取消</Button>
      <Button type="primary" :loading="saving" @click="save">过账</Button>
    </template>
  </Modal>
</template>
