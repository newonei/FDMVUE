<script setup lang="ts">
import type { Directory } from '#/api/fdmplatform';
import type { ProcurementSetting } from '#/api/fdmplatform/procurement';
import type { StockOut } from '#/api/fdmplatform/warehouse';

import { onMounted, ref } from 'vue';

import {
  Alert,
  Button,
  Input,
  message,
  Select,
  Table,
  Tag,
} from 'ant-design-vue';

import { getDirectory } from '#/api/fdmplatform';
import { getProcurementSettings } from '#/api/fdmplatform/procurement';
import { getStockOuts } from '#/api/fdmplatform/warehouse';

import { errorText } from '../../data';
import { personName } from '../../directory';
import { linesTitle, money, qty } from './model';
import StockOutDialog from './StockOutDialog.vue';

import './warehouse-pages.css';

defineOptions({ name: 'FdmPlatformStockOuts' });

const rows = ref<StockOut[]>([]);
const total = ref(0);
const pageNo = ref(1);
const keyword = ref('');
const warehouseId = ref<string>();
const warehouses = ref<ProcurementSetting[]>([]);
const directory = ref<Directory>();
const loading = ref(false);
const error = ref('');
const creating = ref(false);

const columns = [
  { title: '出库单号', key: 'code', width: 180 },
  { title: '仓库', key: 'warehouse', width: 110 },
  { title: '合同 / 客户', key: 'contract', width: 220 },
  { title: '产品', key: 'product', width: 240 },
  { title: '数量', key: 'quantity', width: 100, align: 'right' as const },
  { title: '出库成本', key: 'cost', width: 130, align: 'right' as const },
  { title: '出库日期 / 经办', key: 'date', width: 130 },
];

async function load(reset = false) {
  if (reset) pageNo.value = 1;
  loading.value = true;
  error.value = '';
  try {
    const page = await getStockOuts({
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
function sum(row: StockOut) {
  return row.lines.reduce((value, line) => value + Number(line.quantity), 0);
}
function saved(value: StockOut) {
  creating.value = false;
  message.success(`已出库 ${value.code}`);
  void load(true);
}
onMounted(async () => {
  void load();
  try {
    [warehouses.value, directory.value] = await Promise.all([
      getProcurementSettings('warehouses'),
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
        placeholder="出库单号、合同、客户、产品"
        style="width: 320px"
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
      <Button :loading="loading" @click="load()">刷新</Button>
      <Button type="primary" @click="creating = true">新建销售出库</Button>
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
      :scroll="{ x: 1150 }"
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
        还没有销售出库单。从仓库给客户发货时点右上角「新建销售出库」；直发的货在采购入库时勾选「直发客户」会自动生成。
      </template>
      <template #expandedRowRender="{ record }">
        <table class="lines">
          <tr>
            <th>产品 / 规格</th>
            <th>数量</th>
            <th>成本单价</th>
            <th>成本金额</th>
            <th>合同单价</th>
          </tr>
          <tr v-for="line in record.lines" :key="line.contractItemId">
            <td>
              {{ line.productName }}
              <span class="muted">{{ line.specification }}</span>
            </td>
            <td>{{ qty(line.quantity) }} {{ line.unit }}</td>
            <td>{{ qty(line.unitCost) }}</td>
            <td>{{ money(line.costAmount) }}</td>
            <td>{{ qty(line.salesUnitPrice) }}</td>
          </tr>
        </table>
      </template>
      <template #bodyCell="{ column, record }">
        <div v-if="column.key === 'code'" class="cell">
          <b class="mono">{{ record.code }}</b>
          <Tag v-if="record.kind === 'DIRECT'" color="blue">
            直发 · {{ record.stockInCode }}
          </Tag>
        </div>
        <span v-else-if="column.key === 'warehouse'">{{
          record.warehouseName
        }}</span>
        <div v-else-if="column.key === 'contract'" class="cell">
          <span>{{ record.contractCode }}</span>
          <span class="muted ellipsis">{{ record.customerName }}</span>
        </div>
        <span v-else-if="column.key === 'product'" class="ellipsis">{{
          linesTitle(record.lines)
        }}</span>
        <span v-else-if="column.key === 'quantity'" class="num">{{
          qty(sum(record as StockOut))
        }}</span>
        <span v-else-if="column.key === 'cost'" class="num">{{
          money(record.costAmount)
        }}</span>
        <div v-else-if="column.key === 'date'" class="cell">
          <span class="num">{{ record.shippedDate }}</span>
          <span class="muted">{{
            personName(directory, record.createdBy)
          }}</span>
        </div>
      </template>
    </Table>
    <StockOutDialog :open="creating" @close="creating = false" @saved="saved" />
  </div>
</template>
