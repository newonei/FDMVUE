<script setup lang="ts">
import type { TablePaginationConfig } from 'ant-design-vue';

import type { FdmgongchangStageStockApi as Api } from '#/api/fdmgongchang/stage-stock';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { useAccess } from '@vben/access';
import { formatDateTime } from '@vben/utils';

import { Input, message, Modal, Segmented, Table, Tag } from 'ant-design-vue';

import {
  getPurchaseLines,
  getReceiptPage,
  voidReceipt,
} from '#/api/fdmgongchang/stage-stock';

import {
  formatDate,
  formatQty,
  MATERIAL_KIND_LABELS,
  RECEIPT_SOURCE_LABELS,
} from '../model';

/**
 * 到货入库：采购部门的采购单选了本厂收货的原料、辅料，在这里确认收货；原料进「原材料」、辅料进「辅料」库存，
 * 采购单同步更新到货。到货记录列出每次收货，采购收货和以前的外采到货都可以作废（扣回库存、冲回采购单）。
 */
const props = defineProps<{ refreshKey: number }>();
const emit = defineEmits<{
  pending: [count: number];
  receive: [line: Api.PurchaseLine];
}>();

const { hasAccessByCodes } = useAccess();
const canReceive = computed(() =>
  hasAccessByCodes(['fdmgongchang:stage-stock:receive']),
);

type View = 'open' | 'records';
const view = ref<View>('open');
const lines = ref<Api.PurchaseLine[]>([]);
const loading = ref(false);
const keyword = ref('');

const receipts = ref<Api.Receipt[]>([]);
const receiptTotal = ref(0);
const receiptPageNo = ref(1);
const receiptPageSize = ref(20);
const receiptLoading = ref(false);

const voiding = ref<Api.Receipt>();
const voidReason = ref('');
const voidSaving = ref(false);

const viewOptions = computed(() => [
  {
    label: `待收货${lines.value.length > 0 ? ` ${lines.value.length}` : ''}`,
    value: 'open',
  },
  { label: '到货记录', value: 'records' },
]);

function matches(text: Array<null | string | undefined>) {
  const k = keyword.value.trim().toLowerCase();
  return !k || text.some((t) => (t ?? '').toLowerCase().includes(k));
}
const visibleLines = computed(() =>
  lines.value.filter((l) =>
    matches([
      l.orderCode,
      l.supplierName,
      l.productName,
      l.productCode,
      l.contractCode,
    ]),
  ),
);

async function loadOpen() {
  loading.value = true;
  try {
    lines.value = await getPurchaseLines();
    emit('pending', lines.value.length);
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

function canVoid(record: Api.Receipt) {
  return (
    canReceive.value &&
    ['PURCHASE', 'TRADE_PURCHASE'].includes(record.sourceType) &&
    record.status !== 'VOIDED'
  );
}

function askVoid(record: Api.Receipt) {
  voiding.value = record;
  voidReason.value = '';
}

async function confirmVoid() {
  if (!voiding.value) return;
  if (!voidReason.value.trim()) {
    message.warning('请写明作废原因');
    return;
  }
  voidSaving.value = true;
  try {
    await voidReceipt({ id: voiding.value.id, reason: voidReason.value.trim() });
    message.success(
      `已作废 ${voiding.value.receiptNo}，库存扣回，采购单到货冲回`,
    );
    voiding.value = undefined;
    loadOpen();
    loadReceipts();
  } finally {
    voidSaving.value = false;
  }
}

const openColumns = [
  { key: 'purchase', title: '采购单 / 供应商' },
  { key: 'product', title: '原料 / 辅料' },
  { key: 'contract', title: '合同' },
  { align: 'right' as const, key: 'progress', title: '已收 / 采购' },
  { align: 'right' as const, key: 'remaining', title: '待收' },
  { align: 'right' as const, key: 'actions', title: '', width: 80 },
];
const receiptColumns = [
  { key: 'no', title: '到货单 / 时间' },
  { key: 'source', title: '来源' },
  { key: 'product', title: '物料' },
  { align: 'right' as const, key: 'quantity', title: '实收 / 入库' },
  { key: 'batch', title: '批次 / 库位' },
  { key: 'operator', title: '收货人' },
  { align: 'right' as const, key: 'actions', title: '', width: 70 },
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
        :style="{ width: '15rem' }"
        placeholder="搜采购单、供应商、物料或合同"
        size="small"
      />
    </div>
    <p class="m-0 text-xs text-muted-foreground">
      <template v-if="view === 'open'">
        采购部门的采购单选了本厂收货的原料、辅料。收货后原料进「原材料」、辅料进「辅料」库存，采购单同步更新到货。
      </template>
      <template v-else>
        每次收货的记录，可按到货单号、采购单号、合同号、供应商或物料搜索；收错了可以作废。
      </template>
    </p>

    <Table
      v-if="view === 'open'"
      :columns="openColumns"
      :data-source="visibleLines"
      :loading="loading"
      :pagination="{ pageSize: 20, showTotal: (t: number) => `共 ${t} 行` }"
      :scroll="{ x: 'max-content' }"
      row-key="orderLineId"
      size="small"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'purchase'">
          <div class="flex flex-col">
            <span class="font-mono text-xs">{{ record.orderCode }}</span>
            <span class="text-xs text-muted-foreground">
              {{ record.supplierName || '—' }}
              <template v-if="record.orderDate"> · {{ formatDate(record.orderDate) }}</template>
            </span>
          </div>
        </template>
        <template v-else-if="column.key === 'product'">
          <div class="flex min-w-[200px] flex-col gap-0.5">
            <span class="flex items-center gap-1 text-sm">
              <Tag :color="record.kind === 'RAW' ? 'blue' : 'orange'" class="m-0">
                {{ MATERIAL_KIND_LABELS[record.kind as Api.MaterialKind] }}
              </Tag>
              {{ record.productName }}
            </span>
            <span class="text-xs text-muted-foreground">
              {{ [record.productCode, record.specification].filter(Boolean).join(' · ') }}
            </span>
            <span v-if="record.kind === 'RAW'" class="text-xs text-muted-foreground">
              对应原材料：{{ record.rawMaterialName || record.rawMaterialCode || '第一次收货时选' }}
            </span>
          </div>
        </template>
        <template v-else-if="column.key === 'contract'">
          <div v-if="record.contractCode" class="flex flex-col text-xs">
            <span class="font-mono">{{ record.contractCode }}</span>
            <span class="text-muted-foreground">{{ record.customerName || '' }}</span>
          </div>
          <span v-else class="text-xs text-muted-foreground">—</span>
        </template>
        <template v-else-if="column.key === 'progress'">
          <span class="whitespace-nowrap tabular-nums">
            {{ formatQty(record.receivedQuantity) }} / {{ formatQty(record.quantity) }}
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
            @click="emit('receive', record as Api.PurchaseLine)"
          >
            收货
          </button>
        </template>
      </template>
      <template #emptyText>
        <div class="py-6 text-sm text-muted-foreground">
          没有待收货的原料、辅料。采购部门新建采购单时选本厂为收货工厂后会出现在这里。
        </div>
      </template>
    </Table>

    <Table
      v-else
      :columns="receiptColumns"
      :data-source="receipts"
      :loading="receiptLoading"
      :pagination="{ current: receiptPageNo, pageSize: receiptPageSize, total: receiptTotal, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 单` }"
      :row-class-name="(record: Api.Receipt) => (record.status === 'VOIDED' ? 'opacity-60' : '')"
      :scroll="{ x: 'max-content' }"
      row-key="id"
      size="small"
      @change="onReceiptPage"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'no'">
          <div class="flex flex-col">
            <span class="flex items-center gap-1 font-mono text-xs">
              {{ record.receiptNo }}
              <Tag v-if="record.status === 'VOIDED'" class="m-0">已作废</Tag>
            </span>
            <span class="whitespace-nowrap text-xs text-muted-foreground">{{ formatDateTime(record.receivedAt) }}</span>
          </div>
        </template>
        <template v-else-if="column.key === 'source'">
          <div class="flex flex-col gap-0.5">
            <Tag :color="record.sourceType === 'TRADE_PURCHASE' ? 'purple' : 'blue'" class="m-0 w-fit">
              {{
                record.materialKind
                  ? `${MATERIAL_KIND_LABELS[record.materialKind as Api.MaterialKind]}收货`
                  : RECEIPT_SOURCE_LABELS[record.sourceType as Api.ReceiptSource]
              }}
            </Tag>
            <span class="font-mono text-xs">{{ record.purchaseNo || '—' }}</span>
            <span v-if="record.stockInCode" class="text-xs text-muted-foreground">采购入库 {{ record.stockInCode }}</span>
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
              <small v-if="record.unit" class="text-xs text-muted-foreground">{{ record.unit }}</small>
            </span>
            <span v-if="record.exceptionReason" class="max-w-[200px] text-right text-xs text-warning">
              {{ record.exceptionReason }}
            </span>
            <span v-if="record.status === 'VOIDED'" class="max-w-[200px] text-right text-xs text-muted-foreground">
              作废：{{ record.voidReason }}
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
        <template v-else-if="column.key === 'actions'">
          <button
            v-if="canVoid(record as Api.Receipt)"
            type="button"
            class="whitespace-nowrap text-xs text-destructive hover:underline"
            @click="askVoid(record as Api.Receipt)"
          >
            作废
          </button>
        </template>
      </template>
      <template #emptyText>
        <div class="py-6 text-sm text-muted-foreground">还没有到货记录。</div>
      </template>
    </Table>

    <Modal
      :open="!!voiding"
      :confirm-loading="voidSaving"
      ok-text="作废"
      :ok-button-props="{ danger: true }"
      :title="`作废到货 ${voiding?.receiptNo ?? ''}`"
      @cancel="voiding = undefined"
      @ok="confirmVoid"
    >
      <p class="text-xs text-muted-foreground">
        作废后这批货从库存扣回（已经领用或出货的要先退回），采购单的到货一并冲回，可以重新收货。
      </p>
      <Input
        id="receipt-void-reason"
        v-model:value="voidReason"
        :maxlength="255"
        placeholder="作废原因（必填）"
      />
    </Modal>
  </div>
</template>
