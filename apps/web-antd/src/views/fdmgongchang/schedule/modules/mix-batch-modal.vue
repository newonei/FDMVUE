<script setup lang="ts">
import type { Dayjs } from 'dayjs';

import type { FdmgongchangFactoryApi } from '#/api/fdmgongchang/factory';
import type { FdmgongchangProductionOrderApi as OrderApi } from '#/api/fdmgongchang/production-order';
import type {
  MixBatchPreview,
  MixBatchRequest,
  MixBatchRow,
} from '#/api/fdmgongchang/schedule/mix-batch';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import {
  Alert,
  Button,
  Checkbox,
  DatePicker,
  Empty,
  Input,
  message,
  Modal,
  Select,
  Spin,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import { getWorkerList } from '#/api/fdmgongchang/factory';
import { getOpenProductionOrders } from '#/api/fdmgongchang/production-order';
import {
  previewMixBatch,
  releaseMixBatch,
} from '#/api/fdmgongchang/schedule/mix-batch';
import { newIdempotencyKey } from '#/api/fdmplatform';
import { errorText } from '#/views/fdmplatform/data';

import { dateText } from '../../production-order/shared';
import { factoryToday } from '../../shared/factory-date';
import { attrSummary, formatQty, makeLabels } from '../../stage-stock/model';

const props = defineProps<{
  initialDate?: string;
  initialOrderNo?: string;
  orders?: OrderApi.Order[];
}>();
const emit = defineEmits<{ released: [scheduleId: number] }>();
const open = defineModel<boolean>('open', { required: true });
const MAX = 50;
const MAX_TASKS = 300;
const availableOrders = ref<OrderApi.Order[]>([]);
const workers = ref<FdmgongchangFactoryApi.Worker[]>([]);
const checkedOrders = ref<number[]>([]);
const keyword = ref('');
const workDate = ref<Dayjs>(factoryToday());
const workerIds = ref<number[]>([]);
const note = ref('');
const loading = ref(false);
const previewing = ref(false);
const submitting = ref(false);
const errorMessage = ref('');
const optionsError = ref('');
const preview = ref<MixBatchPreview>();
const selectedRows = ref<string[]>([]);
let sequence = 0;
let requestId = newIdempotencyKey();

const busy = computed(
  () => loading.value || previewing.value || submitting.value,
);
const shownOrders = computed(() => {
  const search = keyword.value.trim().toLowerCase();
  return availableOrders.value.filter(
    (order) =>
      !search ||
      [
        order.orderNo,
        order.sourceContractCode,
        order.customerName,
        ...order.items.map((item) => item.productName),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(search),
  );
});
const allOrdersChecked = computed(
  () =>
    shownOrders.value.length > 0 &&
    shownOrders.value.every((order) => checkedOrders.value.includes(order.id)),
);
const someOrdersChecked = computed(
  () =>
    shownOrders.value.some((order) => checkedOrders.value.includes(order.id)) &&
    !allOrdersChecked.value,
);
const workerOptions = computed(() =>
  workers.value
    .filter((worker) => worker.posts.includes('MIX') && worker.status !== 1)
    .map((worker) => ({
      label: [worker.nickname, worker.team].filter(Boolean).join(' · '),
      value: worker.userId,
    })),
);
const eligibleRows = computed(
  () =>
    preview.value?.rows.filter(
      (row) => row.status === 'READY' && Number(row.quantity) > 0,
    ) ?? [],
);
const selected = computed(() =>
  eligibleRows.value.filter((row) => selectedRows.value.includes(row.rowKey)),
);
const selectedBoards = computed(() =>
  selected.value.reduce((sum, row) => sum + Number(row.quantity), 0),
);
const allRowsChecked = computed(
  () =>
    eligibleRows.value.length > 0 &&
    eligibleRows.value.every((row) => selectedRows.value.includes(row.rowKey)),
);
const validRequest = computed(
  () =>
    checkedOrders.value.length > 0 &&
    checkedOrders.value.length <= MAX &&
    workDate.value?.isValid() &&
    !workDate.value.isBefore(factoryToday(), 'day'),
);
const request = computed<MixBatchRequest>(() => ({
  productionOrderIds: checkedOrders.value.toSorted((a, b) => a - b),
  workDate: workDate.value?.format('YYYY-MM-DD') ?? '',
  workerIds: workerIds.value.toSorted((a, b) => a - b),
  note: note.value.trim() || undefined,
}));
const requestKey = computed(() => JSON.stringify(request.value));
watch(
  requestKey,
  () => {
    ++sequence;
    preview.value = undefined;
    selectedRows.value = [];
    requestId = newIdempotencyKey();
    previewing.value = false;
    errorMessage.value = '';
  },
  { flush: 'sync' },
);

async function loadOptions() {
  const run = ++sequence;
  loading.value = true;
  optionsError.value = '';
  const results = await Promise.allSettled([
    getOpenProductionOrders(),
    getWorkerList({ assigned: true, status: 0 }),
  ]);
  if (run !== sequence || !open.value) return;
  const [orderResult, workerResult] = results;
  if (orderResult.status === 'fulfilled') {
    availableOrders.value = orderResult.value.filter(
      (order) => order.status === 'ACCEPTED',
    );
    const preset = new Set(props.orders?.map((order) => order.id));
    checkedOrders.value = availableOrders.value
      .filter(
        (order) =>
          preset.has(order.id) ||
          (!!props.initialOrderNo && order.orderNo === props.initialOrderNo),
      )
      .map((order) => order.id);
  } else {
    optionsError.value = `订单读取失败：${errorText(orderResult.reason)}`;
  }
  if (workerResult.status === 'fulfilled') workers.value = workerResult.value;
  else
    optionsError.value += `${optionsError.value ? '；' : ''}人员读取失败：${errorText(workerResult.reason)}`;
  loading.value = false;
}
watch(
  open,
  (value) => {
    ++sequence;
    if (!value) return;
    keyword.value = '';
    note.value = '';
    workerIds.value = [];
    checkedOrders.value = [];
    availableOrders.value = [];
    workers.value = [];
    preview.value = undefined;
    selectedRows.value = [];
    errorMessage.value = '';
    optionsError.value = '';
    workDate.value =
      props.initialDate && dayjs(props.initialDate).isValid()
        ? dayjs(props.initialDate)
        : factoryToday();
    requestId = newIdempotencyKey();
    void loadOptions();
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  ++sequence;
});

function toggleOrder(id: number, checked: boolean) {
  checkedOrders.value = checked
    ? [...new Set([...checkedOrders.value, id])]
    : checkedOrders.value.filter((value) => value !== id);
}
function toggleAllOrders(checked: boolean) {
  const ids = new Set(shownOrders.value.map((order) => order.id));
  checkedOrders.value = checked
    ? [...new Set([...checkedOrders.value, ...ids])]
    : checkedOrders.value.filter((id) => !ids.has(id));
}
function toggleRow(key: string, checked: boolean) {
  selectedRows.value = checked
    ? [...new Set([...selectedRows.value, key])]
    : selectedRows.value.filter((value) => value !== key);
  requestId = newIdempotencyKey();
}
function toggleAllRows(checked: boolean) {
  selectedRows.value = checked
    ? eligibleRows.value.map((row) => row.rowKey)
    : [];
  requestId = newIdempotencyKey();
}
async function loadPreview() {
  if (!validRequest.value || busy.value || optionsError.value) return;
  const run = ++sequence;
  const key = requestKey.value;
  previewing.value = true;
  errorMessage.value = '';
  try {
    const result = await previewMixBatch(request.value);
    if (run !== sequence || key !== requestKey.value || !open.value) return;
    preview.value = result;
    selectedRows.value = result.rows
      .filter((row) => row.status === 'READY' && Number(row.quantity) > 0)
      .map((row) => row.rowKey);
    requestId = newIdempotencyKey();
  } catch (error) {
    if (run === sequence) errorMessage.value = errorText(error);
  } finally {
    if (run === sequence) previewing.value = false;
  }
}
async function submit() {
  if (
    !preview.value?.previewKey ||
    selected.value.length === 0 ||
    selected.value.length > MAX_TASKS ||
    busy.value ||
    !validRequest.value
  )
    return;
  submitting.value = true;
  errorMessage.value = '';
  const run = sequence;
  try {
    const result = await releaseMixBatch({
      ...request.value,
      previewKey: preview.value.previewKey,
      requestId,
      rowKeys: selected.value.map((row) => row.rowKey),
    });
    if (run !== sequence || !open.value) return;
    message.success(
      `已下发 ${result.taskCount} 项发泡任务，共 ${formatQty(result.totalBoards)} 张板`,
    );
    if (result.warnings.length > 0) message.warning(result.warnings.join('；'), 8);
    open.value = false;
    emit('released', result.scheduleId);
  } catch (error) {
    errorMessage.value = errorText(error);
  } finally {
    submitting.value = false;
  }
}
function side(row: MixBatchRow) {
  if (row.side === 'UNSPECIFIED') return '待确认结构';
  const name =
    { FRONT: '正面层', BACK: '反面层', BOTH: '正反同规格层' }[
      row.side as 'FRONT'
    ] || '—';
  return `${name}${(row.layerThickness === null || row.layerThickness === undefined) ? '' : ` · ${Number((Number(row.layerThickness) * 10).toFixed(2))} mm`}`;
}
const boardText = (row: MixBatchRow) =>
  attrSummary('BOARD', row.boardAttrs, makeLabels(), [], 'mm') ||
  '板材规格待确认';
</script>

<template>
  <Modal
    :open="open"
    title="批量安排发泡"
    width="min(1280px, 98vw)"
    :style="{ top: '24px' }"
    :body-style="{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }"
    :closable="!busy"
    :mask-closable="false"
    @cancel="open = false"
  >
    <div class="batch-stack">
      <p class="m-0 text-sm text-muted-foreground">
        选择一个或多个订单，预览全部产品明细和制造层，再一次下发选中的发泡任务。每项任务保留所属订单、明细及层面。
      </p>
      <Alert v-if="optionsError" show-icon type="error" :message="optionsError">
<template #description>
<Button :disabled="busy" @click="loadOptions">
重新读取订单和人员
</Button>
</template>
</Alert>
      <Alert v-if="errorMessage" show-icon type="error" :message="errorMessage" />
      <Spin :spinning="loading">
        <div class="batch-controls">
          <section class="batch-orders">
            <div class="batch-toolbar">
              <Input
                id="mix-batch-order-search"
                v-model:value="keyword"
                :disabled="busy"
                placeholder="搜索订单号、客户或产品"
                allow-clear
              />
              <Checkbox
                :checked="allOrdersChecked"
                :indeterminate="someOrdersChecked"
                :disabled="busy || !shownOrders.length"
                @change="(event) => toggleAllOrders(event.target.checked)"
                >
全选显示订单
</Checkbox>
            </div>
            <div class="batch-order-list">
              <label
                v-for="order in shownOrders"
                :key="order.id"
                class="batch-order"
              >
                <Checkbox
                  :checked="checkedOrders.includes(order.id)"
                  :disabled="busy"
                  :aria-label="`发泡订单 ${order.orderNo}`"
                  @change="
                    (event) => toggleOrder(order.id, event.target.checked)
                  "
                />
                <span><b>{{ order.orderNo }}</b><span v-if="order.customerName">
                    · {{ order.customerName }}</span><small class="batch-order-products">{{
                      order.items
                        .slice(0, 2)
                        .map((item) => item.productName)
                        .join('、')
                    }}<template v-if="order.items.length > 2">
                      等 {{ order.items.length }} 个产品</template></small></span>
                <small class="shrink-0">交期
                  {{
                    dateText(order.promisedDate) ||
                    dateText(order.requiredDate) ||
                    '未填写'
                  }}</small>
              </label>
              <Empty
                v-if="!loading && !shownOrders.length"
                :image="Empty.PRESENTED_IMAGE_SIMPLE"
                description="没有匹配的已接单订单"
              />
            </div>
            <p
              class="m-0 text-xs"
              :class="
                checkedOrders.length > MAX
                  ? 'text-destructive'
                  : 'text-muted-foreground'
              "
            >
              已选 {{ checkedOrders.length }} 张订单，一次最多 {{ MAX }} 张。
            </p>
          </section>
          <section class="batch-common">
            <label for="mix-batch-date">统一生产日期<DatePicker
                id="mix-batch-date"
                v-model:value="workDate"
                :disabled="busy"
                :allow-clear="false"
                :disabled-date="
                  (date: Dayjs) => date.isBefore(factoryToday(), 'day')
                "
            /></label>
            <label for="mix-batch-workers">统一指派人员<Select
                id="mix-batch-workers"
                v-model:value="workerIds"
                :disabled="busy"
                :options="workerOptions"
                mode="multiple"
                option-filter-prop="label"
                placeholder="仅发泡岗位；留空进入任务大厅"
            /></label>
            <label for="mix-batch-note">生产说明（选填）<Input.TextArea
                id="mix-batch-note"
                v-model:value="note"
                :disabled="busy"
                :maxlength="500"
                :rows="2"
            /></label>
            <Button
              :disabled="!validRequest || busy || !!optionsError"
              :loading="previewing"
              type="primary"
              @click="loadPreview"
              >
{{ preview ? '刷新发泡预览' : '预览发泡任务' }}
</Button>
          </section>
        </div>
      </Spin>
      <template v-if="preview">
        <details v-if="preview.warnings.length" class="batch-warnings">
          <summary>原料与排产提示（{{ preview.warnings.length }} 项）</summary>
          <ul>
            <li v-for="(warning, index) in preview.warnings" :key="index">
              {{ warning }}
            </li>
          </ul>
        </details>
        <div class="batch-toolbar">
          <Checkbox
            :checked="allRowsChecked"
            :indeterminate="selected.length > 0 && !allRowsChecked"
            :disabled="busy || !eligibleRows.length"
            @change="(event) => toggleAllRows(event.target.checked)"
            >
全选可安排项
</Checkbox>
          <span>本次选中 <b>{{ selected.length }}</b> 项，共
            <b>{{ formatQty(selectedBoards) }}</b> 张板</span>
        </div>
        <Alert
          v-if="selected.length > MAX_TASKS"
          type="error"
          show-icon
          :message="`每批最多下发 ${MAX_TASKS} 项，当前已选 ${selected.length} 项。请取消部分勾选后提交；全部预览明细仍保留。`"
        />
        <div class="batch-table-wrap">
          <table class="batch-table">
            <thead>
              <tr>
                <th>安排</th>
                <th>订单 / 产品明细</th>
                <th>制造层 / 颜色</th>
                <th>发泡板材 / 配方</th>
                <th>所需板数</th>
                <th>已排覆盖</th>
                <th>本次待排</th>
                <th>状态与提示</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in preview.rows" :key="row.rowKey">
                <td>
                  <Checkbox
                    :checked="selectedRows.includes(row.rowKey)"
                    :disabled="
                      busy ||
                      row.status !== 'READY' ||
                      Number(row.quantity) <= 0
                    "
                    :aria-label="`安排 ${row.rowKey}`"
                    @change="
                      (event) => toggleRow(row.rowKey, event.target.checked)
                    "
                  />
                </td>
                <td>
                  <b>{{ row.orderNo }}</b>
                  <div>{{ row.productName }}</div>
                  <small>{{ row.productCode || '—' }} · 明细 {{ row.itemId }}</small>
                </td>
                <td>
                  {{ side(row) }}
                  <div>{{ row.color || '颜色待确认' }}</div>
                </td>
                <td>
                  {{ boardText(row) }}
                  <div class="text-xs text-muted-foreground">
                    配方 {{ row.recipeCode || '未确认' }}
                  </div>
                </td>
                <td class="text-right tabular-nums">
                  {{
                    row.side === 'UNSPECIFIED'
                      ? '—'
                      : `${formatQty(row.requiredBoards)} 张`
                  }}
                </td>
                <td class="text-right tabular-nums">
                  {{
                    row.side === 'UNSPECIFIED'
                      ? '—'
                      : `${formatQty(row.existingMixBoards)} 张`
                  }}
                </td>
                <td class="text-right tabular-nums">
                  <b>{{
                    row.side === 'UNSPECIFIED'
                      ? '—'
                      : `${formatQty(row.quantity)} 张`
                  }}</b>
                </td>
                <td>
                  <span
                    :class="row.status === 'BLOCKED' ? 'text-destructive' : ''"
                    >{{
                      row.status === 'READY'
                        ? '可安排'
                        : row.status === 'BLOCKED'
                          ? '需处理'
                          : '无需安排'
                    }}</span>
                  <div v-if="row.reason" class="batch-row-reason">
                    {{ row.reason }}
                  </div>
                  <details
                    v-if="row.warnings.length"
                    class="batch-row-warnings"
                  >
                    <summary>查看 {{ row.warnings.length }} 条提示</summary>
                    <ul>
                      <li v-for="(warning, index) in row.warnings" :key="index">
                        {{ warning }}
                      </li>
                    </ul>
                  </details>
                </td>
              </tr>
              <tr v-if="!preview.rows.length">
                <td colspan="8">所选订单暂无需要安排的发泡任务</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="m-0 text-xs text-muted-foreground">
          本次待排由库存、在制及已有任务共同计算；已排覆盖仅表示已有发泡任务覆盖的板数。修改订单、日期、人员或说明后需重新预览。
        </p>
      </template>
      <p v-else class="m-0 text-sm text-muted-foreground">
        先预览，核对各订单的明细、层面和本次板数后下发。
      </p>
    </div>
    <template #footer>
      <Button :disabled="busy" @click="open = false">取消</Button>
      <Button
        type="primary"
        :disabled="
          !preview || !selected.length || selected.length > MAX_TASKS || busy
        "
        :loading="submitting"
        @click="submit"
        >
下发选中的 {{ selected.length }} 项发泡任务
</Button>
    </template>
  </Modal>
</template>

<style scoped>
.batch-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.batch-controls {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(260px, 1fr);
  gap: 16px;
}

.batch-orders,
.batch-common {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.batch-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.batch-toolbar :deep(.ant-input-affix-wrapper) {
  flex: 1;
  min-width: 200px;
}

.batch-order-list {
  max-height: 230px;
  overflow: auto;
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
}

.batch-order {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px;
  cursor: pointer;
  border-bottom: 1px solid hsl(var(--border));
}

.batch-order > span {
  flex: 1;
  min-width: 0;
}

.batch-order small {
  display: block;
  color: hsl(var(--muted-foreground));
}

.batch-order .batch-order-products {
  display: -webkit-box;
  overflow: hidden;
  -webkit-line-clamp: 2;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
}

.batch-common label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
}

.batch-table-wrap {
  overflow-x: auto;
}

.batch-warnings {
  padding: 10px 12px;
  font-size: 12px;
  background: hsl(var(--warning) / 6%);
  border: 1px solid hsl(var(--warning) / 40%);
  border-radius: 6px;
}

.batch-warnings summary,
.batch-row-warnings summary {
  color: hsl(var(--foreground));
  cursor: pointer;
}

.batch-warnings ul,
.batch-row-warnings ul {
  padding-left: 18px;
  margin: 8px 0 0;
}

.batch-warnings li,
.batch-row-warnings li {
  margin-top: 4px;
  overflow-wrap: anywhere;
}

.batch-row-warnings {
  margin-top: 4px;
  color: hsl(var(--muted-foreground));
}

.batch-table {
  width: 100%;
  min-width: 1050px;
  font-size: 12px;
  border-collapse: collapse;
}

.batch-table th {
  font-weight: 500;
  background: hsl(var(--muted));
}

.batch-table td,
.batch-table th {
  padding: 8px;
  vertical-align: top;
  border: 1px solid hsl(var(--border));
}

.batch-table small {
  color: hsl(var(--muted-foreground));
}

@media (max-width: 720px) {
  .batch-controls {
    grid-template-columns: 1fr;
  }
}
</style>
