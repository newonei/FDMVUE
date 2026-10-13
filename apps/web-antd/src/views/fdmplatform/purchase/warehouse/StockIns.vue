<script setup lang="ts">
import type { Directory } from '#/api/fdmplatform';
import type { ProcurementSetting } from '#/api/fdmplatform/procurement';
import type { StockIn } from '#/api/fdmplatform/warehouse';

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
import { getStockIns } from '#/api/fdmplatform/warehouse';

import { errorText } from '../../data';
import { personName } from '../../directory';
import { linesTitle, money, qty } from './model';
import PurchaseReturnDialog from './PurchaseReturnDialog.vue';
import { canReturn, canVoidStockIn } from './return-model';
import StockInDialog from './StockInDialog.vue';
import VoidDialog from './VoidDialog.vue';

import './warehouse-pages.css';

defineOptions({ name: 'FdmPlatformStockIns' });

const rows = ref<StockIn[]>([]);
const total = ref(0);
const pageNo = ref(1);
const keyword = ref('');
const warehouseId = ref<string>();
const warehouses = ref<ProcurementSetting[]>([]);
const directory = ref<Directory>();
const loading = ref(false);
const error = ref('');
const creating = ref(false);
const returning = ref<StockIn>();
const voiding = ref<StockIn>();

const columns = [
  { title: '入库单号', key: 'code', width: 170 },
  { title: '仓库', key: 'warehouse', width: 110 },
  { title: '采购单 / 供应商', key: 'order', width: 220 },
  { title: '关联合同 / 客户', key: 'contract', width: 200 },
  { title: '产品', key: 'product', width: 220 },
  {
    title: '实收 / 合格',
    key: 'quantity',
    width: 120,
    align: 'right' as const,
  },
  { title: '金额', key: 'amount', width: 130, align: 'right' as const },
  { title: '入库日期 / 经办', key: 'date', width: 130 },
  { title: '操作', key: 'action', width: 120, fixed: 'right' as const },
];

async function load(reset = false) {
  if (reset) pageNo.value = 1;
  loading.value = true;
  error.value = '';
  try {
    const page = await getStockIns({
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
function sum(row: StockIn, field: 'acceptedQuantity' | 'quantity') {
  return row.lines.reduce((value, line) => value + Number(line[field] ?? 0), 0);
}
function saved(value: StockIn) {
  creating.value = false;
  message.success(
    value.directShip
      ? `已入库 ${value.code}，并直发出库 ${value.stockOutCode}`
      : `已入库 ${value.code}`,
  );
  void load(true);
}
function returned(value: { code: string }) {
  returning.value = undefined;
  message.success(`已办理采购退货 ${value.code}`);
  void load();
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
        placeholder="入库单号、采购单、供应商、合同、产品"
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
      <Button type="primary" @click="creating = true">新建采购入库</Button>
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
      :scroll="{ x: 1420 }"
      :row-class-name="
        (record: StockIn) => (record.status === 'VOIDED' ? 'voided' : '')
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
        还没有采购入库单。在采购单上点「登记入库」或右上角「新建采购入库」。
      </template>
      <template #expandedRowRender="{ record }">
        <table class="lines">
          <tr>
            <th>产品 / 规格</th>
            <th>实收</th>
            <th>合格</th>
            <th>不合格原因</th>
            <th>批次</th>
            <th>单价</th>
            <th>金额</th>
          </tr>
          <tr v-for="line in record.lines" :key="line.orderLineId">
            <td>
              {{ line.productName }}
              <span class="muted">{{ line.specification }}</span>
            </td>
            <td>{{ qty(line.quantity) }} {{ line.unit }}</td>
            <td>
              {{ qty(line.acceptedQuantity) }}
              <span
                v-if="
                  Number(line.returnedAcceptedQuantity ?? 0) > 0 ||
                  Number(line.returnedExceptionQuantity ?? 0) > 0
                "
                class="muted"
              >
                已退 {{ qty(line.returnedAcceptedQuantity ?? 0) }} 合格 /
                {{ qty(line.returnedExceptionQuantity ?? 0) }} 不合格
              </span>
            </td>
            <td>{{ line.exceptionReason ?? '—' }}</td>
            <td>{{ line.batchNo ?? '—' }}</td>
            <td>{{ qty(line.unitPrice) }}</td>
            <td>{{ money(line.amount, record.currency) }}</td>
          </tr>
        </table>
      </template>
      <template #bodyCell="{ column, record }">
        <div v-if="column.key === 'code'" class="cell">
          <b class="mono">{{ record.code }}</b>
          <Tag v-if="record.status === 'VOIDED'" :title="record.voidReason">
            已作废
          </Tag>
          <Tag v-if="record.directShip" color="blue">
            直发 · {{ record.stockOutCode }}
          </Tag>
          <Tag
            v-if="record.kind === 'PRODUCTION'"
            color="green"
            title="工厂交货入库：要冲回请在工厂下单的交货单上作废"
          >
            工厂交货 · {{ record.deliveryNo }}
          </Tag>
          <Tag
            v-if="record.kind === 'FACTORY_PURCHASE'"
            color="green"
            title="工厂收货的原料、辅料：不进采购仓库，要冲回请在工厂的到货记录上作废"
          >
            工厂收货 · {{ record.warehouseName }}
          </Tag>
        </div>
        <span v-else-if="column.key === 'warehouse'">{{
          record.warehouseName
        }}</span>
        <div v-else-if="column.key === 'order'" class="cell">
          <span class="mono">{{ record.orderCode }}</span>
          <span class="muted ellipsis">{{ record.supplierName }}</span>
        </div>
        <div v-else-if="column.key === 'contract'" class="cell">
          <span>{{ record.contractCode }}</span>
          <span class="muted ellipsis">{{ record.customerName }}</span>
        </div>
        <span v-else-if="column.key === 'product'" class="ellipsis">{{
          linesTitle(record.lines)
        }}</span>
        <span v-else-if="column.key === 'quantity'" class="num">
          {{ qty(sum(record as StockIn, 'quantity')) }} /
          <b>{{ qty(sum(record as StockIn, 'acceptedQuantity')) }}</b>
        </span>
        <span v-else-if="column.key === 'amount'" class="num">{{
          money(record.amount, record.currency)
        }}</span>
        <div v-else-if="column.key === 'date'" class="cell">
          <span class="num">{{ record.receivedDate }}</span>
          <span class="muted">{{
            personName(directory, record.createdBy)
          }}</span>
        </div>
        <div v-else-if="column.key === 'action'" class="row-actions">
          <template v-if="record.status === 'VOIDED'">
            <span class="muted ellipsis" :title="record.voidReason">
              {{ record.voidReason }}
            </span>
          </template>
          <template v-else>
            <Button
              v-if="canReturn(record as StockIn)"
              size="small"
              type="link"
              @click="returning = record as StockIn"
            >
              退货
            </Button>
            <Button
              v-if="canVoidStockIn(record as StockIn)"
              danger
              size="small"
              type="link"
              @click="voiding = record as StockIn"
            >
              作废
            </Button>
          </template>
        </div>
      </template>
    </Table>
    <StockInDialog :open="creating" @close="creating = false" @saved="saved" />
    <PurchaseReturnDialog
      :stock-in="returning"
      @close="returning = undefined"
      @saved="returned"
    />
    <VoidDialog
      :stock-in="voiding"
      @close="voiding = undefined"
      @saved="voided"
    />
  </div>
</template>
