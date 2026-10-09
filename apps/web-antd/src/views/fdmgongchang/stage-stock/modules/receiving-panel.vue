<script setup lang="ts">
import type { TablePaginationConfig } from 'ant-design-vue';

import type { FdmgongchangStageStockApi as Api } from '#/api/fdmgongchang/stage-stock';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { useAccess } from '@vben/access';
import { formatDateTime } from '@vben/utils';

import { Input, Segmented, Table, Tag } from 'ant-design-vue';

import {
  getRawOpenLines,
  getReceiptPage,
  getTradeOpenLines,
} from '#/api/fdmgongchang/stage-stock';

import {
  contractProductText,
  formatDate,
  formatQty,
  RAW_CATEGORY_LABELS,
  RECEIPT_SOURCE_LABELS,
} from '../model';

/**
 * 到货入库：原材料采购单（采购部门「原材料采购」下单）和外贸合同外采采购单的待到货明细，
 * 收货后分别进「原材料」和「已包装成品」库存；到货记录列出每次收货。
 */
const props = defineProps<{ refreshKey: number }>();
const emit = defineEmits<{
  pending: [count: number];
  receiveRaw: [line: Api.RawOpenLine];
  receiveTrade: [line: Api.TradePurchaseLine];
}>();

const { hasAccessByCodes } = useAccess();
const canReceive = computed(() =>
  hasAccessByCodes(['fdmgongchang:stage-stock:receive']),
);

type View = 'raw' | 'records' | 'trade';
const view = ref<View>('raw');
const rawLines = ref<Api.RawOpenLine[]>([]);
const tradeLines = ref<Api.TradePurchaseLine[]>([]);
const loading = ref(false);
const keyword = ref('');

const receipts = ref<Api.Receipt[]>([]);
const receiptTotal = ref(0);
const receiptPageNo = ref(1);
const receiptPageSize = ref(20);
const receiptLoading = ref(false);

const viewOptions = computed(() => [
  { label: `原材料待到货${rawLines.value.length > 0 ? ` ${rawLines.value.length}` : ''}`, value: 'raw' },
  { label: `外采成品待到货${tradeLines.value.length > 0 ? ` ${tradeLines.value.length}` : ''}`, value: 'trade' },
  { label: '到货记录', value: 'records' },
]);

function matches(text: Array<null | string | undefined>) {
  const k = keyword.value.trim().toLowerCase();
  return !k || text.some((t) => (t ?? '').toLowerCase().includes(k));
}
const visibleRaw = computed(() =>
  rawLines.value.filter((l) =>
    matches([l.purchaseNo, l.supplierName, l.rawMaterialName, l.rawMaterialCode]),
  ),
);
const visibleTrade = computed(() =>
  tradeLines.value.filter((l) =>
    matches([l.contractCode, l.orderCode, l.supplierName, l.customerName, l.productName, l.productCode]),
  ),
);

async function loadOpen() {
  loading.value = true;
  try {
    const [raw, trade] = await Promise.all([getRawOpenLines(), getTradeOpenLines()]);
    rawLines.value = raw;
    tradeLines.value = trade;
    emit('pending', raw.length + trade.length);
  } finally {
    loading.value = false;
  }
}

async function loadReceipts() {
  receiptLoading.value = true;
  try {
    const page = await getReceiptPage({
      keyword: keyword.value.trim() || undefined,
      pageNo: receiptPageNo.value,
      pageSize: receiptPageSize.value,
    });
    receipts.value = page.list;
    receiptTotal.value = page.total;
  } finally {
    receiptLoading.value = false;
  }
}

watch(
  () => props.refreshKey,
  () => {
    loadOpen();
    loadReceipts();
  },
  { immediate: true },
);

let timer: ReturnType<typeof setTimeout> | undefined;
watch(keyword, () => {
  if (view.value !== 'records') return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    receiptPageNo.value = 1;
    loadReceipts();
  }, 300);
});
onBeforeUnmount(() => clearTimeout(timer));

function onReceiptPage(pagination: TablePaginationConfig) {
  receiptPageNo.value = pagination.current ?? 1;
  receiptPageSize.value = pagination.pageSize ?? 20;
  loadReceipts();
}

const rawColumns = [
  { key: 'purchase', title: '采购单 / 供应商' },
  { key: 'material', title: '原材料' },
  { key: 'expected', title: '预计到货' },
  { align: 'right' as const, key: 'progress', title: '已到 / 采购' },
  { align: 'right' as const, key: 'remaining', title: '待到货' },
  { align: 'right' as const, key: 'actions', title: '', width: 80 },
];
const tradeColumns = [
  { key: 'contract', title: '合同 / 客户' },
  { key: 'order', title: '采购单 / 供应商' },
  { key: 'product', title: '产品' },
  { align: 'right' as const, key: 'progress', title: '已到 / 采购' },
  { align: 'right' as const, key: 'remaining', title: '待到货' },
  { align: 'right' as const, key: 'actions', title: '', width: 80 },
];
const receiptColumns = [
  { key: 'no', title: '到货单 / 时间' },
  { key: 'source', title: '来源' },
  { key: 'product', title: '物料' },
  { align: 'right' as const, key: 'quantity', title: '实收 / 入库' },
  { key: 'batch', title: '批次 / 库位' },
  { key: 'operator', title: '收货人' },
];
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <Segmented v-model:value="view" :options="viewOptions" />
      <Input
        id="receiving-search"
        v-model:value="keyword"
        allow-clear
        class="w-60"
        placeholder="搜采购单、供应商或物料"
        size="small"
      />
    </div>
    <p class="m-0 text-xs text-muted-foreground">
      <template v-if="view === 'raw'">
        采购部门「原材料采购」下的单。收货后进「原材料」库存，采购单同步更新到货数量。
      </template>
      <template v-else-if="view === 'trade'">
        外贸合同分派为「外采」的采购单。收货后良品进「已包装成品」，并登记为合同的到货记录，之后从「外贸订单」出货。
      </template>
      <template v-else>每次收货的记录，可按到货单号、采购单号、合同号或供应商搜索。</template>
    </p>

    <Table
      v-if="view === 'raw'"
      :columns="rawColumns"
      :data-source="visibleRaw"
      :loading="loading"
      :pagination="{ pageSize: 20, showTotal: (t: number) => `共 ${t} 行` }"
      :scroll="{ x: 'max-content' }"
      row-key="lineId"
      size="small"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'purchase'">
          <div class="flex flex-col">
            <span class="font-mono text-xs">{{ record.purchaseNo }}</span>
            <span class="text-xs text-muted-foreground">{{ record.supplierName || '—' }}</span>
          </div>
        </template>
        <template v-else-if="column.key === 'material'">
          <div class="flex min-w-[160px] flex-col">
            <span class="text-sm">{{ record.rawMaterialName }}</span>
            <span class="text-xs text-muted-foreground">
              {{ record.rawMaterialCode }}<template v-if="record.rawCategory"> · {{ RAW_CATEGORY_LABELS[record.rawCategory] ?? record.rawCategory }}</template>
            </span>
          </div>
        </template>
        <template v-else-if="column.key === 'expected'">
          <span class="whitespace-nowrap text-xs">{{ formatDate(record.expectedDate) || '—' }}</span>
        </template>
        <template v-else-if="column.key === 'progress'">
          <span class="whitespace-nowrap tabular-nums">
            {{ formatQty(record.receivedQuantity) }} / {{ formatQty(record.quantity) }}
            <small class="text-xs text-muted-foreground">kg</small>
          </span>
        </template>
        <template v-else-if="column.key === 'remaining'">
          <b class="tabular-nums">{{ formatQty(record.remainingQuantity) }}</b>
        </template>
        <template v-else-if="column.key === 'actions'">
          <button
            v-if="canReceive"
            type="button"
            class="whitespace-nowrap text-xs text-primary hover:underline"
            @click="emit('receiveRaw', record as Api.RawOpenLine)"
          >
            收货
          </button>
        </template>
      </template>
      <template #emptyText>
        <div class="py-6 text-sm text-muted-foreground">
          没有待到货的原材料。采购部门在「原材料采购」下单后会出现在这里。
        </div>
      </template>
    </Table>

    <Table
      v-else-if="view === 'trade'"
      :columns="tradeColumns"
      :data-source="visibleTrade"
      :loading="loading"
      :pagination="{ pageSize: 20, showTotal: (t: number) => `共 ${t} 行` }"
      :scroll="{ x: 'max-content' }"
      :row-key="(row: Api.TradePurchaseLine) => `${row.orderId}:${row.orderLineId}`"
      size="small"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'contract'">
          <div class="flex flex-col">
            <span class="font-mono text-xs">{{ record.contractCode }}</span>
            <span class="text-xs text-muted-foreground">{{ record.customerName || '—' }}</span>
          </div>
        </template>
        <template v-else-if="column.key === 'order'">
          <div class="flex flex-col">
            <span class="font-mono text-xs">{{ record.orderCode || '—' }}</span>
            <span class="text-xs text-muted-foreground">{{ record.supplierName || '—' }}</span>
          </div>
        </template>
        <template v-else-if="column.key === 'product'">
          <span class="text-sm">{{ contractProductText(record as Api.TradePurchaseLine) }}</span>
        </template>
        <template v-else-if="column.key === 'progress'">
          <span class="whitespace-nowrap tabular-nums">
            {{ formatQty(record.arrivedQuantity) }} / {{ formatQty(record.quantity) }}
            <small class="text-xs text-muted-foreground">{{ record.unit }}</small>
          </span>
        </template>
        <template v-else-if="column.key === 'remaining'">
          <b class="tabular-nums">{{ formatQty(record.remainingQuantity) }}</b>
        </template>
        <template v-else-if="column.key === 'actions'">
          <button
            v-if="canReceive"
            type="button"
            class="whitespace-nowrap text-xs text-primary hover:underline"
            @click="emit('receiveTrade', record as Api.TradePurchaseLine)"
          >
            收货
          </button>
        </template>
      </template>
      <template #emptyText>
        <div class="py-6 text-sm text-muted-foreground">
          没有待到货的外采成品。外贸合同的外采采购单下达后会出现在这里。
        </div>
      </template>
    </Table>

    <Table
      v-else
      :columns="receiptColumns"
      :data-source="receipts"
      :loading="receiptLoading"
      :pagination="{ current: receiptPageNo, pageSize: receiptPageSize, total: receiptTotal, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 单` }"
      :scroll="{ x: 'max-content' }"
      row-key="id"
      size="small"
      @change="onReceiptPage"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'no'">
          <div class="flex flex-col">
            <span class="font-mono text-xs">{{ record.receiptNo }}</span>
            <span class="whitespace-nowrap text-xs text-muted-foreground">{{ formatDateTime(record.receivedAt) }}</span>
          </div>
        </template>
        <template v-else-if="column.key === 'source'">
          <div class="flex flex-col gap-0.5">
            <Tag :color="record.sourceType === 'RAW_PURCHASE' ? 'blue' : 'purple'" class="m-0 w-fit">
              {{ RECEIPT_SOURCE_LABELS[record.sourceType as Api.ReceiptSource] }}
            </Tag>
            <span class="font-mono text-xs">{{ record.purchaseNo || '—' }}</span>
            <span v-if="record.contractCode" class="text-xs text-muted-foreground">合同 {{ record.contractCode }}</span>
          </div>
        </template>
        <template v-else-if="column.key === 'product'">
          <div class="flex min-w-[200px] flex-col">
            <span class="text-sm">{{ record.productName || '—' }}</span>
            <span class="font-mono text-xs text-muted-foreground">{{ record.itemCode }}</span>
            <span class="text-xs text-muted-foreground">{{ record.supplierName }}</span>
          </div>
        </template>
        <template v-else-if="column.key === 'quantity'">
          <div class="flex flex-col items-end">
            <span class="whitespace-nowrap tabular-nums">
              {{ formatQty(record.quantity) }} / <b>{{ formatQty(record.acceptedQuantity) }}</b>
            </span>
            <span v-if="record.exceptionReason" class="max-w-[200px] text-right text-xs text-warning">
              {{ record.exceptionReason }}
            </span>
          </div>
        </template>
        <template v-else-if="column.key === 'batch'">
          <div class="flex flex-col text-xs">
            <span class="font-mono">{{ record.batchNo }}</span>
            <span class="text-muted-foreground">{{ record.location }}</span>
          </div>
        </template>
        <template v-else-if="column.key === 'operator'">
          <span class="whitespace-nowrap text-xs">{{ record.operatorName || '—' }}</span>
        </template>
      </template>
      <template #emptyText>
        <div class="py-6 text-sm text-muted-foreground">还没有到货记录。</div>
      </template>
    </Table>
  </div>
</template>
