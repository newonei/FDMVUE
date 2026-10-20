<script setup lang="ts">
import type { ProcurementSetting } from '#/api/fdmplatform/procurement';
import type { StockBalance, StockTxn } from '#/api/fdmplatform/warehouse';

import { computed, onMounted, ref } from 'vue';

import { Alert, Button, Checkbox, Input, Select, Table } from 'ant-design-vue';

import { getProcurementSettings } from '#/api/fdmplatform/procurement';
import { getStocks, getStockTxns } from '#/api/fdmplatform/warehouse';
import { FdmResizableDrawer } from '#/components/fdm-resizable-drawer';

import { errorText } from '../../data';
import { averageCost, money, qty } from './model';
import TxnTable from './TxnTable.vue';

import './warehouse-pages.css';

defineOptions({ name: 'FdmPlatformStocks' });

const props = defineProps<{ ledger?: boolean }>();

const rows = ref<StockBalance[]>([]);
const keyword = ref('');
const warehouseId = ref<string>();
const inStockOnly = ref(true);
const warehouses = ref<ProcurementSetting[]>([]);
const loading = ref(false);
const error = ref('');
const selected = ref<StockBalance>();
const txns = ref<StockTxn[]>([]);
const txnTotal = ref(0);
const txnPage = ref(1);
const txnLoading = ref(false);

const totals = computed(() => {
  const amount = rows.value.reduce(
    (value, row) => value + (row.costKnown ? Number(row.costAmount) : 0),
    0,
  );
  return { products: rows.value.length, amount };
});

async function load() {
  loading.value = true;
  error.value = '';
  try {
    rows.value = await getStocks({
      warehouseId: warehouseId.value,
      keyword: keyword.value.trim() || undefined,
      inStockOnly: inStockOnly.value,
    });
  } catch (error_) {
    error.value = errorText(error_);
  } finally {
    loading.value = false;
  }
}
async function loadTxns(reset = false) {
  if (reset) txnPage.value = 1;
  txnLoading.value = true;
  try {
    const page = await getStockTxns({
      pageNo: txnPage.value,
      pageSize: 20,
      stockId: props.ledger ? undefined : selected.value?.id,
      warehouseId: props.ledger ? warehouseId.value : undefined,
      keyword: props.ledger ? keyword.value.trim() || undefined : undefined,
    });
    txns.value = page.list;
    txnTotal.value = page.total;
  } catch (error_) {
    error.value = errorText(error_);
  } finally {
    txnLoading.value = false;
  }
}
function open(row: StockBalance) {
  selected.value = row;
  void loadTxns(true);
}
function refresh() {
  if (props.ledger) void loadTxns(true);
  else void load();
}
onMounted(async () => {
  refresh();
  try {
    warehouses.value = await getProcurementSettings('warehouses');
  } catch {
    // 只影响仓库筛选
  }
});
</script>

<template>
  <div class="warehouse-page">
    <div class="toolbar">
      <Input.Search
        v-model:value="keyword"
        allow-clear
        :placeholder="
          ledger ? '单据号、产品、合同、往来单位' : '产品名称、编号、规格'
        "
        style="width: 300px"
        @search="refresh"
      />
      <Select
        v-model:value="warehouseId"
        allow-clear
        placeholder="全部仓库"
        style="width: 150px"
        :options="
          warehouses.map((entry) => ({ value: entry.id, label: entry.name }))
        "
        @change="refresh"
      />
      <Checkbox v-if="!ledger" v-model:checked="inStockOnly" @change="load">
        只看有库存
      </Checkbox>
      <span class="grow"></span>
      <span v-if="!ledger" class="muted">
        {{ totals.products }} 种产品 · 库存金额 {{ money(totals.amount) }}
      </span>
      <Button :loading="loading || txnLoading" @click="refresh">刷新</Button>
    </div>
    <Alert v-if="error" type="error" :message="error" show-icon />
    <Table
      v-if="!ledger"
      class="fdm-business-table"
      size="middle"
      table-layout="fixed"
      row-key="id"
      :data-source="rows"
      :loading="loading"
      :pagination="{ pageSize: 50, showSizeChanger: false }"
      :scroll="{ x: 1000 }"
      :columns="[
        { title: '仓库', key: 'warehouse', width: 110 },
        { title: '产品 / 规格', key: 'product', width: 300 },
        { title: '现存', key: 'onHand', width: 120, align: 'right' },
        { title: '平均成本', key: 'cost', width: 110, align: 'right' },
        { title: '库存金额', key: 'amount', width: 130, align: 'right' },
        { title: '最近入 / 出', key: 'last', width: 160 },
        { title: '', key: 'action', width: 80 },
      ]"
    >
      <template #emptyText>
        还没有库存。采购入库后这里会按仓库和产品汇总。
      </template>
      <template #bodyCell="{ column, record }">
        <span v-if="column.key === 'warehouse'">{{
          record.warehouseName
        }}</span>
        <div v-else-if="column.key === 'product'" class="cell">
          <span class="ellipsis">{{ record.productName }}</span>
          <span class="muted ellipsis">{{ record.productCode }} {{ record.specification }}</span>
        </div>
        <b v-else-if="column.key === 'onHand'" class="num">{{ qty(record.onHand) }}
          <span class="muted">{{ record.unit }}</span></b>
        <span v-else-if="column.key === 'cost'" class="num">{{
          averageCost(record as StockBalance) ?? '—'
        }}</span>
        <span v-else-if="column.key === 'amount'" class="num">{{
          record.costKnown ? money(record.costAmount) : '成本未知'
        }}</span>
        <span v-else-if="column.key === 'last'" class="muted">
          入 {{ record.lastInDate ?? '—' }} · 出 {{ record.lastOutDate ?? '—' }}
        </span>
        <Button
          v-else-if="column.key === 'action'"
          type="link"
          size="small"
          @click="open(record as StockBalance)"
        >
          流水
        </Button>
      </template>
    </Table>
    <TxnTable
      v-if="ledger"
      :rows="txns"
      :loading="txnLoading"
      :total="txnTotal"
      :page="txnPage"
      @page="
        (value) => {
          txnPage = value;
          loadTxns();
        }
      "
    />
    <FdmResizableDrawer
      resize-key="warehouse-stock-flow"
      v-else
      :open="!!selected"
      width="1000px"
      :title="`${selected?.warehouseName ?? ''} · ${selected?.productName ?? ''} 出入库流水`"
      @close="selected = undefined"
    >
      <TxnTable
        :rows="txns"
        :loading="txnLoading"
        :total="txnTotal"
        :page="txnPage"
        @page="
          (value) => {
            txnPage = value;
            loadTxns();
          }
        "
      />
    </FdmResizableDrawer>
  </div>
</template>
