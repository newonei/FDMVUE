<script setup lang="ts">
import type { TablePaginationConfig } from 'ant-design-vue';

import type { FdmgongchangStageStockApi as Api } from '#/api/fdmgongchang/stage-stock';

import { onBeforeUnmount, ref, watch } from 'vue';

import { formatDateTime } from '@vben/utils';

import { Input, Table } from 'ant-design-vue';

import { getShipmentPage } from '#/api/fdmgongchang/stage-stock';

import { formatDate, formatQty } from '../model';

/**
 * 早期出货记录：工厂以前从已包装成品直接出货的单，只查不再新建。
 * 现在工厂做好的货先入本厂仓库，由仓库在库存中心出库。
 */
const props = defineProps<{ refreshKey: number }>();

const keyword = ref('');
const shipments = ref<Api.Shipment[]>([]);
const shipmentTotal = ref(0);
const shipmentPageNo = ref(1);
const shipmentPageSize = ref(20);
const shipmentLoading = ref(false);

async function loadShipments() {
  shipmentLoading.value = true;
  try {
    const page = await getShipmentPage({
      keyword: keyword.value.trim() || undefined,
      pageNo: shipmentPageNo.value,
      pageSize: shipmentPageSize.value,
    });
    shipments.value = page.list;
    shipmentTotal.value = page.total;
  } finally {
    shipmentLoading.value = false;
  }
}

watch(() => props.refreshKey, loadShipments, { immediate: true });

let timer: ReturnType<typeof setTimeout> | undefined;
watch(keyword, () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    shipmentPageNo.value = 1;
    loadShipments();
  }, 300);
});
onBeforeUnmount(() => clearTimeout(timer));

function onShipmentPage(pagination: TablePaginationConfig) {
  shipmentPageNo.value = pagination.current ?? 1;
  shipmentPageSize.value = pagination.pageSize ?? 20;
  loadShipments();
}

const shipmentColumns = [
  { key: 'no', title: '出货单 / 日期' },
  { key: 'contract', title: '合同 / 客户' },
  { key: 'product', title: '产品' },
  { align: 'right' as const, key: 'quantity', title: '出货数量' },
  { key: 'lines', title: '出库明细' },
  { key: 'operator', title: '操作人' },
];
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="m-0 text-xs text-muted-foreground">
        工厂以前直接出货的记录（同时显示在外贸合同的发货记录里）。现在工厂做好的货先入本厂仓库，由仓库在「库存中心 → 出库单」出库。
      </p>
      <Input
        id="trade-search"
        v-model:value="keyword"
        allow-clear
        :style="{ width: '15rem' }"
        placeholder="搜合同号、客户或产品"
        size="small"
      />
    </div>

    <Table
      :columns="shipmentColumns"
      :data-source="shipments"
      :loading="shipmentLoading"
      :pagination="{ current: shipmentPageNo, pageSize: shipmentPageSize, total: shipmentTotal, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 单` }"
      :scroll="{ x: 'max-content' }"
      row-key="id"
      size="small"
      @change="onShipmentPage"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'no'">
          <div class="flex flex-col">
            <span class="font-mono text-xs">{{ record.shipmentNo }}</span>
            <span class="whitespace-nowrap text-xs text-muted-foreground">
              {{ formatDate(record.shippedDate) || formatDateTime(record.shippedAt) }}
            </span>
          </div>
        </template>
        <template v-else-if="column.key === 'contract'">
          <div class="flex flex-col">
            <span class="font-mono text-xs">{{ record.contractCode || '—' }}</span>
            <span class="text-xs text-muted-foreground">{{ record.customerName || '—' }}</span>
          </div>
        </template>
        <template v-else-if="column.key === 'product'">
          <span class="text-sm">{{ record.productName || '—' }}</span>
        </template>
        <template v-else-if="column.key === 'quantity'">
          <b class="tabular-nums">{{ formatQty(record.quantity) }}</b>
        </template>
        <template v-else-if="column.key === 'lines'">
          <div class="flex min-w-[220px] flex-col text-xs">
            <span v-for="line in record.lines ?? []" :key="line.stockId">
              <span class="font-mono">{{ line.itemCode }}</span>
              <span class="ml-1 text-muted-foreground">批次 {{ line.batchNo }}</span>
              <b class="ml-1 tabular-nums">{{ formatQty(line.quantity) }}</b>
            </span>
          </div>
        </template>
        <template v-else-if="column.key === 'operator'">
          <span class="whitespace-nowrap text-xs">{{ record.operatorName || '—' }}</span>
        </template>
      </template>
      <template #emptyText>
        <div class="py-6 text-sm text-muted-foreground">还没有出货记录。</div>
      </template>
    </Table>
  </div>
</template>
