<script setup lang="ts">
import type { Directory } from '#/api/fdmplatform';
import type { ProcurementSetting } from '#/api/fdmplatform/procurement';
import type { PurchaseReturn } from '#/api/fdmplatform/warehouse';

import { onMounted, ref } from 'vue';

import { Alert, Button, Input, Select, Table, Tag } from 'ant-design-vue';

import { getDirectory } from '#/api/fdmplatform';
import { getProcurementSettings } from '#/api/fdmplatform/procurement';
import { getPurchaseReturns } from '#/api/fdmplatform/warehouse';

import { errorText } from '../../data';
import { personName } from '../../directory';
import { linesTitle, money, qty } from './model';

import './warehouse-pages.css';

defineOptions({ name: 'FdmPlatformPurchaseReturns' });

const rows = ref<PurchaseReturn[]>([]);
const total = ref(0);
const pageNo = ref(1);
const keyword = ref('');
const warehouseId = ref<string>();
const warehouses = ref<ProcurementSetting[]>([]);
const directory = ref<Directory>();
const loading = ref(false);
const error = ref('');

const columns = [
  { title: '退货单号', key: 'code', width: 170 },
  { title: '原入库单 / 仓库', key: 'stockIn', width: 170 },
  { title: '采购单 / 供应商', key: 'order', width: 220 },
  { title: '产品', key: 'product', width: 220 },
  { title: '数量', key: 'quantity', width: 90, align: 'right' as const },
  { title: '金额', key: 'amount', width: 130, align: 'right' as const },
  { title: '原因', key: 'reason', width: 180 },
  { title: '退货日期 / 经办', key: 'date', width: 130 },
];

async function load(reset = false) {
  if (reset) pageNo.value = 1;
  loading.value = true;
  error.value = '';
  try {
    const page = await getPurchaseReturns({
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
function sum(row: PurchaseReturn) {
  return row.lines.reduce((value, line) => value + Number(line.quantity), 0);
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
        placeholder="退货单号、入库单、采购单、供应商、产品"
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
      :scroll="{ x: 1310 }"
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
        还没有采购退货单。在「采购入库」找到对应入库单，点「退货」。
      </template>
      <template #expandedRowRender="{ record }">
        <table class="lines">
          <tr>
            <th>产品 / 规格</th>
            <th>类别</th>
            <th>数量</th>
            <th>单价</th>
            <th>金额</th>
          </tr>
          <tr
            v-for="line in record.lines"
            :key="`${line.orderLineId}:${line.kind}`"
          >
            <td>
              {{ line.productName }}
              <span class="muted">{{ line.specification }}</span>
            </td>
            <td>{{ line.kind === 'ACCEPTED' ? '合格品' : '不合格品' }}</td>
            <td>{{ qty(line.quantity) }} {{ line.unit }}</td>
            <td>{{ qty(line.unitPrice) }}</td>
            <td>{{ money(line.amount, record.currency) }}</td>
          </tr>
        </table>
      </template>
      <template #bodyCell="{ column, record }">
        <div v-if="column.key === 'code'" class="cell">
          <b class="mono">{{ record.code }}</b>
          <Tag v-if="record.noReplacement" color="orange">不再补货</Tag>
          <Tag v-else color="blue">供应商补发</Tag>
        </div>
        <div v-else-if="column.key === 'stockIn'" class="cell">
          <span class="mono">{{ record.stockInCode }}</span>
          <span class="muted">{{ record.warehouseName }}</span>
        </div>
        <div v-else-if="column.key === 'order'" class="cell">
          <span class="mono">{{ record.orderCode }}</span>
          <span class="muted ellipsis">{{ record.supplierName }}</span>
        </div>
        <span v-else-if="column.key === 'product'" class="ellipsis">{{
          linesTitle(record.lines)
        }}</span>
        <span v-else-if="column.key === 'quantity'" class="num">{{
          qty(sum(record as PurchaseReturn))
        }}</span>
        <span v-else-if="column.key === 'amount'" class="num">{{
          money(record.amount, record.currency)
        }}</span>
        <span
          v-else-if="column.key === 'reason'"
          class="ellipsis"
          :title="record.reason"
          >{{ record.reason }}</span>
        <div v-else-if="column.key === 'date'" class="cell">
          <span class="num">{{ record.returnedDate }}</span>
          <span class="muted">{{
            personName(directory, record.createdBy)
          }}</span>
        </div>
      </template>
    </Table>
  </div>
</template>
