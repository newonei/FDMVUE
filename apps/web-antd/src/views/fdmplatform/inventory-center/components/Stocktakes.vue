<script setup lang="ts">
import type { Directory } from '#/api/fdmplatform';
import type {
  InventoryWarehouse,
  Stocktake,
} from '#/api/fdmplatform/warehouse';

import { onMounted, ref } from 'vue';

import { Alert, Button, Input, message, Select, Table } from 'ant-design-vue';

import { getDirectory } from '#/api/fdmplatform';
import {
  getInventoryWarehouses,
  getStocktakes,
} from '#/api/fdmplatform/warehouse';

import { errorText } from '../../data';
import { personName } from '../../directory';
import { money, qty } from '../../purchase/warehouse/model';
import StocktakeDialog from './StocktakeDialog.vue';

import '../../purchase/warehouse/warehouse-pages.css';

defineOptions({ name: 'FdmInventoryStocktakes' });

const rows = ref<Stocktake[]>([]);
const total = ref(0);
const pageNo = ref(1);
const keyword = ref('');
const warehouseId = ref<string>();
const warehouses = ref<InventoryWarehouse[]>([]);
const directory = ref<Directory>();
const loading = ref(false);
const error = ref('');
const creating = ref(false);

const columns = [
  { title: '盘点单号', key: 'code', width: 180 },
  { title: '仓库', key: 'warehouse', width: 120 },
  { title: '盘点 / 有差异', key: 'count', width: 130, align: 'right' as const },
  { title: '盘盈金额', key: 'gain', width: 130, align: 'right' as const },
  { title: '盘亏金额', key: 'loss', width: 130, align: 'right' as const },
  { title: '盘点日期 / 经办', key: 'date', width: 130 },
  { title: '备注', key: 'remark', width: 200 },
];

async function load(reset = false) {
  if (reset) pageNo.value = 1;
  loading.value = true;
  error.value = '';
  try {
    const page = await getStocktakes({
      pageNo: pageNo.value,
      pageSize: 20,
      keyword: keyword.value.trim() || undefined,
      warehouseId: warehouseId.value,
    });
    rows.value = page.list;
    total.value = page.total;
  } catch (error_) {
    error.value = errorText(error_);
  } finally {
    loading.value = false;
  }
}
function saved(value: Stocktake) {
  creating.value = false;
  message.success(
    value.changedCount > 0
      ? `已过账 ${value.code}，调整了 ${value.changedCount} 行库存`
      : `已过账 ${value.code}，账实相符`,
  );
  void load(true);
}
onMounted(async () => {
  void load();
  try {
    [warehouses.value, directory.value] = await Promise.all([
      getInventoryWarehouses(),
      getDirectory(0),
    ]);
  } catch {
    // 只影响筛选和经办人显示
  }
});
</script>

<template>
  <div class="warehouse-page">
    <div class="toolbar">
      <Input.Search
        v-model:value="keyword"
        allow-clear
        placeholder="盘点单号、产品"
        style="width: 280px"
        @search="load(true)"
      />
      <Select
        v-model:value="warehouseId"
        allow-clear
        placeholder="全部仓库"
        style="width: 150px"
        :options="
          warehouses.map((entry) => ({ value: entry.id, label: entry.name }))
        "
        @change="load(true)"
      />
      <span class="grow"></span>
      <span class="muted">工厂原料、辅料和在制品在「工厂部门 → 工序库存」盘点</span>
      <Button :loading="loading" @click="load()">刷新</Button>
      <Button type="primary" @click="creating = true">新建盘点</Button>
    </div>
    <Alert v-if="error" type="error" :message="error" show-icon />
    <Table
      class="fdm-business-table"
      size="middle"
      table-layout="fixed"
      row-key="id"
      :columns="columns"
      :data-source="rows"
      :loading="loading"
      :scroll="{ x: 1020 }"
      :pagination="{
        current: pageNo,
        pageSize: 20,
        total,
        showSizeChanger: false,
        showTotal: (count: number) => `共 ${count} 张`,
      }"
      @change="
        (pagination) => {
          pageNo = pagination.current ?? 1;
          load();
        }
      "
    >
      <template #emptyText>
        还没有盘点单。点右上角「新建盘点」，选仓库录实盘数，过账后按差额调整库存。
      </template>
      <template #expandedRowRender="{ record }">
        <table class="lines">
          <tr>
            <th>产品 / 规格</th>
            <th>账面</th>
            <th>实盘</th>
            <th>差异</th>
            <th>差异金额</th>
          </tr>
          <tr v-for="line in record.lines" :key="line.stockId">
            <td>
              {{ line.productName }}
              <span class="muted">{{ line.specification }}</span>
            </td>
            <td>{{ qty(line.bookQuantity) }} {{ line.unit }}</td>
            <td>{{ qty(line.actualQuantity) }}</td>
            <td
              :class="
                Number(line.diffQuantity) > 0
                  ? 'in'
                  : Number(line.diffQuantity) < 0
                    ? 'out'
                    : ''
              "
            >
              {{ Number(line.diffQuantity) > 0 ? '+' : ''
              }}{{ qty(line.diffQuantity) }}
            </td>
            <td>{{ money(line.diffAmount) }}</td>
          </tr>
        </table>
      </template>
      <template #bodyCell="{ column, record }">
        <b v-if="column.key === 'code'" class="mono">{{ record.code }}</b>
        <span v-else-if="column.key === 'warehouse'">{{
          record.warehouseName
        }}</span>
        <span v-else-if="column.key === 'count'" class="num">
          {{ record.lines.length }} / {{ record.changedCount }}
        </span>
        <span v-else-if="column.key === 'gain'" class="num in">{{
          money(record.gainAmount)
        }}</span>
        <span v-else-if="column.key === 'loss'" class="num out">{{
          money(record.lossAmount)
        }}</span>
        <div v-else-if="column.key === 'date'" class="cell">
          <span class="num">{{ record.countedDate }}</span>
          <span class="muted">{{
            personName(directory, record.createdBy)
          }}</span>
        </div>
        <span v-else-if="column.key === 'remark'" class="muted ellipsis">{{
          record.remark
        }}</span>
      </template>
    </Table>
    <StocktakeDialog
      :open="creating"
      @close="creating = false"
      @saved="saved"
    />
  </div>
</template>
