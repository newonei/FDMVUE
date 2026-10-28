<script setup lang="ts">
import type { Directory } from '#/api/fdmplatform';
import type { ProcurementSetting } from '#/api/fdmplatform/procurement';
import type { InventoryWarehouse, StockOut } from '#/api/fdmplatform/warehouse';

import { computed, onMounted, ref } from 'vue';

import {
  Alert,
  Button,
  Input,
  message,
  Select,
  Table,
  TabPane,
  Tabs,
  Tag,
} from 'ant-design-vue';

import { getDirectory } from '#/api/fdmplatform';
import { getProcurementSettings } from '#/api/fdmplatform/procurement';
import {
  getInventoryWarehouses,
  getStockOuts,
} from '#/api/fdmplatform/warehouse';

import { errorText } from '../../data';
import { personName } from '../../directory';
import {
  lineSum,
  OUT_KIND_LABELS,
  outPartner,
  outSalesAmount,
  outSubject,
  pageSum,
} from '../../inventory-center/components/doc-model';
import PickDialog from '../../inventory-center/components/PickDialog.vue';
import StockDocDrawer from '../../inventory-center/components/StockDocDrawer.vue';
import { money, qty } from './model';
import StockOutDialog from './StockOutDialog.vue';
import VoidDialog from './VoidDialog.vue';

import './warehouse-pages.css';

defineOptions({ name: 'FdmPlatformStockOuts' });

/**
 * 出库单（金智同款单据列表）：销售出库（按合同）、其它出库（不关联合同，记去向）、入库直发；
 * 点主题打开单据详情。采购部门和库存中心共用。
 */

const rows = ref<StockOut[]>([]);
const total = ref(0);
const pageNo = ref(1);
const keyword = ref('');
const warehouseId = ref<string>();
const kind = ref<'' | 'OTHER' | 'SALES'>('');
const warehouses = ref<ProcurementSetting[]>([]);
const directory = ref<Directory>();
/** 库存中心里启用的仓库 → 当前登录人能不能出库；没查到时不隐藏按钮，由后端拦。业务员只能看。 */
const writable = ref<Map<string, boolean>>();
const canCreate = computed(
  () => !writable.value || [...writable.value.values()].some(Boolean),
);
/** 停用仓库的单据不在列表里，有出库权限就显示，由后端判断。直发出库随入库单作废。 */
function canVoid(row: StockOut) {
  return (
    row.status !== 'VOIDED' &&
    row.kind !== 'DIRECT' &&
    canCreate.value &&
    writable.value?.get(row.warehouseId) !== false
  );
}
const loading = ref(false);
const error = ref('');
const creating = ref(false);
const creatingOther = ref(false);
const voiding = ref<StockOut>();
const viewing = ref<StockOut>();
const viewActions = computed(() =>
  viewing.value && canVoid(viewing.value)
    ? [{ key: 'void', label: '作废出库', danger: true }]
    : [],
);

const columns = [
  { title: '出库主题', key: 'subject', width: 260, fixed: 'left' as const },
  { title: '出库单号', key: 'code', width: 150 },
  { title: '客户 / 去向', key: 'partner', width: 170 },
  { title: '对应单据', key: 'related', width: 150 },
  { title: '出库仓库', key: 'warehouse', width: 110 },
  { title: '出库日期', key: 'date', width: 105 },
  { title: '出库状态', key: 'status', width: 90 },
  { title: '经办人', key: 'person', width: 90 },
  { title: '单据类型', key: 'kind', width: 90 },
  { title: '数量', key: 'quantity', width: 90, align: 'right' as const },
  {
    title: '销售出库额',
    key: 'sales',
    width: 120,
    align: 'right' as const,
  },
  { title: '总成本', key: 'cost', width: 130, align: 'right' as const },
  { title: '操作', key: 'action', width: 80, fixed: 'right' as const },
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
      kind: kind.value || undefined,
    });
    rows.value = page.list;
    total.value = page.total;
  } catch (error_) {
    error.value = errorText(error_);
  } finally {
    loading.value = false;
  }
}
function quantity(row: StockOut) {
  return lineSum(row.lines, (line) => line.quantity);
}
function saved(value: StockOut) {
  creating.value = false;
  message.success(`已出库 ${value.code}`);
  void load(true);
  viewing.value = value;
}
function savedOther(code: string) {
  creatingOther.value = false;
  message.success(`已出库 ${code}`);
  void load(true);
}
function voided(code: string) {
  voiding.value = undefined;
  viewing.value = undefined;
  message.success(`已作废 ${code}`);
  void load();
}
onMounted(async () => {
  void load();
  getInventoryWarehouses()
    .then((list: InventoryWarehouse[]) => {
      writable.value = new Map(list.map((entry) => [entry.id, entry.writable]));
    })
    .catch(() => {});
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
    <Tabs v-model:active-key="kind" class="doc-tabs" @change="load(true)">
      <TabPane key="" tab="全部" />
      <TabPane key="SALES" tab="销售出库" />
      <TabPane key="OTHER" tab="其它出库" />
    </Tabs>
    <div class="toolbar">
      <Input.Search
        v-model:value="keyword"
        allow-clear
        placeholder="出库单号、合同、客户、去向、产品"
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
      <template v-if="canCreate">
        <Button @click="creatingOther = true">其它出库</Button>
        <Button type="primary" @click="creating = true">新建销售出库</Button>
      </template>
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
      :scroll="{ x: 1560 }"
      :row-class-name="
        (record: StockOut) => (record.status === 'VOIDED' ? 'voided' : '')
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
        还没有出库单。给客户发货点「新建销售出库」；没有合同的货（电商仓、样品、报废等）点「其它出库」；直发的货在采购入库时勾选「直发客户」会自动生成。
      </template>
      <template #bodyCell="{ column, record }">
        <a
          v-if="column.key === 'subject'"
          class="doc-link ellipsis"
          :title="outSubject(record as StockOut)"
          @click="viewing = record as StockOut"
          >{{ outSubject(record as StockOut) }}</a>
        <span v-else-if="column.key === 'code'" class="mono">{{
          record.code
        }}</span>
        <span v-else-if="column.key === 'partner'" class="ellipsis">{{
          outPartner(record as StockOut)
        }}</span>
        <div v-else-if="column.key === 'related'" class="cell">
          <span class="mono">{{ record.contractCode }}</span>
          <span v-if="record.kind === 'DIRECT'" class="muted">
            直发 · {{ record.stockInCode }}
          </span>
        </div>
        <span v-else-if="column.key === 'warehouse'">{{
          record.warehouseName
        }}</span>
        <span v-else-if="column.key === 'date'" class="num">{{
          record.shippedDate
        }}</span>
        <span v-else-if="column.key === 'status'">
          <Tag v-if="record.status === 'VOIDED'" :title="record.voidReason">
            已作废
          </Tag>
          <span v-else class="in">已出库</span>
        </span>
        <span v-else-if="column.key === 'person'">{{
          personName(directory, record.createdBy)
        }}</span>
        <span v-else-if="column.key === 'kind'">{{
          OUT_KIND_LABELS[record.kind as StockOut['kind']]
        }}</span>
        <span v-else-if="column.key === 'quantity'" class="num">{{
          qty(quantity(record as StockOut))
        }}</span>
        <span v-else-if="column.key === 'sales'" class="num">{{
          qty(outSalesAmount(record as StockOut))
        }}</span>
        <span v-else-if="column.key === 'cost'" class="num">{{
          money(record.costAmount)
        }}</span>
        <div v-else-if="column.key === 'action'" class="row-actions">
          <Button
            v-if="canVoid(record as StockOut)"
            danger
            size="small"
            type="link"
            @click="voiding = record as StockOut"
          >
            作废
          </Button>
        </div>
      </template>
      <template #summary>
        <Table.Summary.Row v-if="rows.length">
          <Table.Summary.Cell :index="0" :col-span="9">
            本页合计（不含作废）
          </Table.Summary.Cell>
          <Table.Summary.Cell :index="9" align="right">
            {{ qty(pageSum(rows, quantity)) }}
          </Table.Summary.Cell>
          <Table.Summary.Cell :index="10" align="right">
            {{ qty(pageSum(rows, outSalesAmount)) }}
          </Table.Summary.Cell>
          <Table.Summary.Cell :index="11" align="right">
            {{ money(pageSum(rows, (row) => row.costAmount)) }}
          </Table.Summary.Cell>
          <Table.Summary.Cell :index="12" />
        </Table.Summary.Row>
      </template>
    </Table>
    <StockOutDialog :open="creating" @close="creating = false" @saved="saved" />
    <PickDialog
      kind="other"
      :open="creatingOther"
      @close="creatingOther = false"
      @saved="savedOther"
    />
    <StockDocDrawer
      :stock-out="viewing"
      :actions="viewActions"
      @close="viewing = undefined"
      @action="voiding = viewing"
    />
    <VoidDialog
      :stock-out="voiding"
      @close="voiding = undefined"
      @saved="voided"
    />
  </div>
</template>
