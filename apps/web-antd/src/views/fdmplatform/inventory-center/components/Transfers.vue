<script setup lang="ts">
import type { Directory } from '#/api/fdmplatform';
import type { InventoryWarehouse, Transfer } from '#/api/fdmplatform/warehouse';

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
import {
  getInventoryWarehouses,
  getTransfers,
} from '#/api/fdmplatform/warehouse';

import { errorText } from '../../data';
import { personName } from '../../directory';
import { linesTitle, money, qty } from '../../purchase/warehouse/model';
import VoidDialog from '../../purchase/warehouse/VoidDialog.vue';
import PickDialog from './PickDialog.vue';

import '../../purchase/warehouse/warehouse-pages.css';

defineOptions({ name: 'FdmInventoryTransfers' });

const rows = ref<Transfer[]>([]);
const total = ref(0);
const pageNo = ref(1);
const keyword = ref('');
const warehouseId = ref<string>();
const warehouses = ref<InventoryWarehouse[]>([]);
const directory = ref<Directory>();
const loading = ref(false);
const error = ref('');
const creating = ref(false);
const voiding = ref<Transfer>();

const columns = [
  { title: '调拨单号', key: 'code', width: 180 },
  { title: '调出 → 调入', key: 'route', width: 220 },
  { title: '产品', key: 'product', width: 240 },
  { title: '数量', key: 'quantity', width: 100, align: 'right' as const },
  { title: '调拨日期 / 经办', key: 'date', width: 130 },
  { title: '操作', key: 'action', width: 110, fixed: 'right' as const },
];

async function load(reset = false) {
  if (reset) pageNo.value = 1;
  loading.value = true;
  error.value = '';
  try {
    const page = await getTransfers({
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
function sum(row: Transfer) {
  return row.lines.reduce((value, line) => value + Number(line.quantity), 0);
}
function saved(code: string) {
  creating.value = false;
  message.success(`已调拨 ${code}`);
  void load(true);
}
function voided(code: string) {
  voiding.value = undefined;
  message.success(`已作废 ${code}`);
  void load();
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
        placeholder="调拨单号、产品"
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
      <Button :loading="loading" @click="load()">刷新</Button>
      <Button type="primary" @click="creating = true">新建调拨</Button>
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
      :scroll="{ x: 980 }"
      :row-class-name="
        (record: Transfer) => (record.status === 'VOIDED' ? 'voided' : '')
      "
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
        还没有调拨单。货从一个仓库搬到另一个仓库时点右上角「新建调拨」，成本跟着货走。
      </template>
      <template #expandedRowRender="{ record }">
        <table class="lines">
          <tr>
            <th>产品 / 规格</th>
            <th>数量</th>
            <th>成本单价</th>
            <th>成本金额</th>
          </tr>
          <tr v-for="line in record.lines" :key="line.stockId">
            <td>
              {{ line.productName }}
              <span class="muted">{{ line.specification }}</span>
            </td>
            <td>{{ qty(line.quantity) }} {{ line.unit }}</td>
            <td>{{ line.costKnown ? qty(line.unitCost) : '成本未知' }}</td>
            <td>
              {{
                line.costKnown
                  ? money(Number(line.unitCost) * Number(line.quantity))
                  : '—'
              }}
            </td>
          </tr>
        </table>
      </template>
      <template #bodyCell="{ column, record }">
        <div v-if="column.key === 'code'" class="cell">
          <b class="mono">{{ record.code }}</b>
          <Tag v-if="record.status === 'VOIDED'" :title="record.voidReason">
            已作废
          </Tag>
        </div>
        <span v-else-if="column.key === 'route'">
          {{ record.fromWarehouseName }} → {{ record.toWarehouseName }}
        </span>
        <span v-else-if="column.key === 'product'" class="ellipsis">{{
          linesTitle(record.lines)
        }}</span>
        <span v-else-if="column.key === 'quantity'" class="num">{{
          qty(sum(record as Transfer))
        }}</span>
        <div v-else-if="column.key === 'date'" class="cell">
          <span class="num">{{ record.transferDate }}</span>
          <span class="muted">{{
            personName(directory, record.createdBy)
          }}</span>
        </div>
        <div v-else-if="column.key === 'action'" class="row-actions">
          <span
            v-if="record.status === 'VOIDED'"
            class="muted ellipsis"
            :title="record.voidReason"
            >{{ record.voidReason }}</span>
          <Button
            v-else
            danger
            size="small"
            type="link"
            @click="voiding = record as Transfer"
          >
            作废
          </Button>
        </div>
      </template>
    </Table>
    <PickDialog
      kind="transfer"
      :open="creating"
      @close="creating = false"
      @saved="saved"
    />
    <VoidDialog
      :transfer="voiding"
      @close="voiding = undefined"
      @saved="voided"
    />
  </div>
</template>
