<script setup lang="ts">
import type { Dayjs } from 'dayjs';

import type { FdmgongchangStageStockApi as Api } from '#/api/fdmgongchang/stage-stock';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import {
  Alert,
  Button,
  DatePicker,
  Drawer,
  Empty,
  Input,
  InputNumber,
  Select,
  Table,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import {
  createShipment,
  getShippableItems,
  getStockPage,
} from '#/api/fdmgongchang/stage-stock';

import {
  attrSummary,
  contractProductText,
  formatQty,
  makeLabels,
  sumQty,
  toNumber,
} from '../model';

/** 工厂出货：选外贸合同明细 → 从已包装成品选库存和数量 → 出库并登记到合同出货记录。 */
const props = defineProps<{
  initialContractId?: string;
  initialItemId?: string;
  options: Api.Options;
}>();
const emit = defineEmits<{ saved: [message: string] }>();
const open = defineModel<boolean>('open', { required: true });
const items = ref<Api.ShippableItem[]>([]);
const itemsLoading = ref(false);
const selectedKey = ref<string>();
const stockRows = ref<Api.Stock[]>([]);
const stockTotal = ref(0);
const stockLoading = ref(false);
const stockKeyword = ref('');
const quantities = ref<Record<number, null | number>>({});
const picked = ref<Record<number, Api.Stock>>({});
const shippedDate = ref<Dayjs>(dayjs());
const operatorName = ref('');
const remark = ref('');
const errors = ref<string[]>([]);
const submitting = ref(false);

const labels = computed(() => makeLabels(props.options));
const packedUnit = computed(
  () => props.options.stages.find((s) => s.code === 'PACKED')?.unit ?? '',
);
const keyOf = (row: Pick<Api.ShippableItem, 'contractId' | 'contractItemId'>) =>
  `${row.contractId}:${row.contractItemId}`;
const selected = computed(() =>
  items.value.find((row) => keyOf(row) === selectedKey.value),
);
const itemOptions = computed(() =>
  items.value.map((row) => ({
    label: `${row.contractCode} · ${row.customerName ?? ''} · ${contractProductText(row)} · 待出货 ${formatQty(row.remainingQuantity)}${row.unit ?? ''}`,
    value: keyOf(row),
  })),
);

const lines = computed(() =>
  Object.values(picked.value)
    .filter((stock) => (quantities.value[stock.id] ?? 0) > 0)
    .map((stock) => ({ quantity: quantities.value[stock.id]!, stock })),
);
const total = computed(() => sumQty(lines.value.map((l) => l.quantity)));

watch(open, async (value) => {
  if (!value) return;
  quantities.value = {};
  picked.value = {};
  errors.value = [];
  remark.value = '';
  operatorName.value = '';
  shippedDate.value = dayjs();
  stockKeyword.value = '';
  selectedKey.value =
    props.initialContractId && props.initialItemId
      ? `${props.initialContractId}:${props.initialItemId}`
      : undefined;
  itemsLoading.value = true;
  try {
    items.value = await getShippableItems();
  } finally {
    itemsLoading.value = false;
  }
  if (selectedKey.value && !selected.value) {
    errors.value = ['这项合同明细已经出完货，或合同不在可出货状态，请重新选择。'];
    selectedKey.value = undefined;
  }
  await loadStock();
});

async function loadStock() {
  stockLoading.value = true;
  try {
    const page = await getStockPage({
      keyword: stockKeyword.value.trim() || undefined,
      pageNo: 1,
      pageSize: 200,
      stage: 'PACKED',
    });
    stockRows.value = page.list;
    stockTotal.value = page.total;
  } finally {
    stockLoading.value = false;
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;
watch(stockKeyword, () => {
  if (!open.value) return;
  clearTimeout(timer);
  timer = setTimeout(loadStock, 300);
});
onBeforeUnmount(() => clearTimeout(timer));

const visibleStock = computed(() => {
  const ids = new Set(stockRows.value.map((s) => s.id));
  return [
    ...Object.values(picked.value).filter((s) => !ids.has(s.id)),
    ...stockRows.value,
  ];
});

function setQuantity(stock: Api.Stock, value: null | number) {
  quantities.value = { ...quantities.value, [stock.id]: value };
  if (value && value > 0) picked.value = { ...picked.value, [stock.id]: stock };
}

const stockColumns = [
  { key: 'item', title: '编码 / 规格' },
  { key: 'batchNo', title: '批次' },
  { align: 'right' as const, key: 'available', title: '可用' },
  { align: 'right' as const, key: 'take', title: '出货数量', width: 140 },
];

const summaryText = computed(() => {
  const unit = packedUnit.value;
  if (!selected.value) return `出货 ${formatQty(total.value)} ${unit}`;
  const left = (toNumber(selected.value.remainingQuantity) ?? 0) - total.value;
  return `出货 ${formatQty(total.value)} ${unit} · 合同这项还剩 ${formatQty(Math.max(0, left))} ${selected.value.unit ?? ''} 未出`;
});

async function submit() {
  const problems: string[] = [];
  if (!selected.value) problems.push('请选择要出货的合同明细。');
  if (lines.value.length === 0) problems.push('请在已包装成品里至少填一行出货数量。');
  for (const line of lines.value) {
    if (line.quantity > (toNumber(line.stock.quantity) ?? 0))
      problems.push(`${line.stock.itemCode}（批次 ${line.stock.batchNo}）只剩 ${formatQty(line.stock.quantity)}。`);
  }
  if (selected.value && total.value > (toNumber(selected.value.remainingQuantity) ?? 0))
    problems.push(`出货数量超过合同这项待出货的 ${formatQty(selected.value.remainingQuantity)}。`);
  errors.value = problems;
  if (problems.length > 0 || !selected.value) return;
  submitting.value = true;
  try {
    await createShipment({
      contractId: selected.value.contractId,
      contractItemId: selected.value.contractItemId,
      lines: lines.value.map((l) => ({ quantity: l.quantity, stockId: l.stock.id })),
      operatorName: operatorName.value.trim() || undefined,
      remark: remark.value.trim() || undefined,
      shippedDate: shippedDate.value?.format('YYYY-MM-DD'),
    });
    emit('saved', `已出货 ${formatQty(total.value)} ${packedUnit.value}，并登记到合同 ${selected.value.contractCode}`);
    open.value = false;
  } catch {
    // 后端错误已由全局提示展示，保留内容方便修改
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <Drawer v-model:open="open" :width="820" class="max-w-full" destroy-on-close title="工厂出货">
    <div class="flex flex-col gap-6">
      <section class="flex flex-col gap-2">
        <h3 class="m-0 flex items-center gap-2 text-sm font-semibold">
          <span class="inline-flex size-5 items-center justify-center rounded-full bg-primary/10 text-xs text-primary">1</span>
          选择外贸合同明细
        </h3>
        <Select
          id="shipment-item"
          v-model:value="selectedKey"
          :loading="itemsLoading"
          :options="itemOptions"
          :not-found-content="itemsLoading ? '加载中…' : '没有待出货的合同明细'"
          option-filter-prop="label"
          placeholder="搜合同号、客户或产品"
          show-search
        />
        <div v-if="selected" class="grid grid-cols-2 gap-2 rounded-md border border-border bg-muted/30 p-3 text-xs sm:grid-cols-4">
          <div class="col-span-2 flex flex-col">
            <span class="text-muted-foreground">产品</span>
            <span>{{ contractProductText(selected) }}</span>
          </div>
          <div class="flex flex-col">
            <span class="text-muted-foreground">合同数量 / 已出货</span>
            <span class="tabular-nums">{{ formatQty(selected.itemQuantity) }} / {{ formatQty(selected.shippedQuantity) }} {{ selected.unit }}</span>
          </div>
          <div class="flex flex-col">
            <span class="text-muted-foreground">待出货</span>
            <b class="tabular-nums">{{ formatQty(selected.remainingQuantity) }} {{ selected.unit }}</b>
          </div>
        </div>
      </section>

      <section class="flex flex-col gap-2">
        <h3 class="m-0 flex flex-wrap items-center gap-2 text-sm font-semibold">
          <span class="inline-flex size-5 items-center justify-center rounded-full bg-primary/10 text-xs text-primary">2</span>
          从已包装成品出库
          <span class="text-xs font-normal text-muted-foreground">请核对成品规格和合同产品一致</span>
        </h3>
        <div class="flex flex-wrap items-center gap-3">
          <Input id="shipment-stock-search" v-model:value="stockKeyword" allow-clear class="w-52" placeholder="搜编码或批次" size="small" />
          <span v-if="stockTotal > 200" class="text-xs text-muted-foreground">共 {{ stockTotal }} 行，只显示前 200 行</span>
        </div>
        <Table
          :columns="stockColumns"
          :data-source="visibleStock"
          :loading="stockLoading"
          :pagination="false"
          :scroll="{ x: 'max-content', y: 300 }"
          row-key="id"
          size="small"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'item'">
              <div class="flex min-w-[200px] flex-col">
                <span class="font-mono text-xs">{{ record.itemCode }}</span>
                <span class="text-xs text-muted-foreground">{{ attrSummary('PACKED', record.item, labels) }}</span>
              </div>
            </template>
            <template v-else-if="column.key === 'batchNo'">
              <span class="font-mono text-xs">{{ record.batchNo }}</span>
            </template>
            <template v-else-if="column.key === 'available'">
              <span class="whitespace-nowrap tabular-nums">{{ formatQty(record.quantity) }}
                <small class="text-xs text-muted-foreground">{{ packedUnit }}</small></span>
            </template>
            <template v-else-if="column.key === 'take'">
              <InputNumber
                :id="`shipment-take-${record.id}`"
                :value="quantities[record.id] ?? undefined"
                :min="0"
                :max="Number(record.quantity)"
                :precision="3"
                class="w-28"
                size="small"
                :aria-label="`${record.itemCode} 出货数量`"
                @change="(v) => setQuantity(record as Api.Stock, (v as null | number | undefined) ?? null)"
              />
            </template>
          </template>
          <template #emptyText>
            <Empty description="已包装成品没有库存。包装工序报完工后会入库到这里。" />
          </template>
        </Table>
      </section>

      <section class="flex flex-col gap-2">
        <h3 class="m-0 flex items-center gap-2 text-sm font-semibold">
          <span class="inline-flex size-5 items-center justify-center rounded-full bg-primary/10 text-xs text-primary">3</span>
          出货信息
        </h3>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label for="shipment-date" class="flex flex-col gap-1 text-xs text-muted-foreground">
            出货日期
            <DatePicker id="shipment-date" v-model:value="shippedDate" :allow-clear="false" class="w-full" />
          </label>
          <label for="shipment-operator" class="flex flex-col gap-1 text-xs text-muted-foreground">
            操作人
            <Input id="shipment-operator" v-model:value="operatorName" :maxlength="64" placeholder="不填则记为当前登录人" />
          </label>
          <label for="shipment-remark" class="flex flex-col gap-1 text-xs text-muted-foreground">
            备注
            <Input id="shipment-remark" v-model:value="remark" :maxlength="500" placeholder="例如 柜号、物流单号" />
          </label>
        </div>
      </section>
    </div>
    <template #footer>
      <div class="flex flex-col gap-2">
        <Alert v-if="errors.length > 0" type="error" show-icon>
          <template #message>
            <ul class="m-0 list-disc pl-4">
              <li v-for="e in errors" :key="e">{{ e }}</li>
            </ul>
          </template>
        </Alert>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <span class="text-sm tabular-nums">{{ summaryText }}</span>
          <div class="flex gap-2">
            <Button @click="open = false">取消</Button>
            <Button :loading="submitting" type="primary" @click="submit">确认出货</Button>
          </div>
        </div>
      </div>
    </template>
  </Drawer>
</template>
