<script setup lang="ts">
import type { Directory } from '#/api/fdmplatform';
import type { ProcurementSetting } from '#/api/fdmplatform/procurement';
import type {
  InventoryWarehouse,
  StockIn,
  StockInKind,
} from '#/api/fdmplatform/warehouse';

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
  getStockIns,
} from '#/api/fdmplatform/warehouse';

import { errorText } from '../../data';
import { personName } from '../../directory';
import {
  inKindLabel,
  inPartner,
  inRelated,
  inSubject,
  lineSum,
  pageSum,
} from '../../inventory-center/components/doc-model';
import OtherInDialog from '../../inventory-center/components/OtherInDialog.vue';
import StockDocDrawer from '../../inventory-center/components/StockDocDrawer.vue';
import { money, qty } from './model';
import PurchaseReturnDialog from './PurchaseReturnDialog.vue';
import { canReturn, canVoidStockIn } from './return-model';
import StockInDialog from './StockInDialog.vue';
import VoidDialog from './VoidDialog.vue';

import './warehouse-pages.css';

defineOptions({ name: 'FdmPlatformStockIns' });

/**
 * 入库单（金智同款单据列表）：采购入库、生产入库、工厂收货、常规入库；点主题打开单据详情。
 * 采购部门可以开采购入库、退货、作废；库存中心（center）只开、作废常规入库，工厂库管只能操作本厂仓库。
 */
const props = defineProps<{ center?: boolean }>();

const rows = ref<StockIn[]>([]);
const total = ref(0);
const pageNo = ref(1);
const keyword = ref('');
const warehouseId = ref<string>();
const kind = ref<'' | StockInKind>('');
const warehouses = ref<ProcurementSetting[]>([]);
const directory = ref<Directory>();
/** 仓库 → 当前登录人能不能操作；没查到时不隐藏按钮，由后端拦。 */
const writable = ref<Map<string, boolean>>();
const canCreateOther = computed(
  () => !writable.value || [...writable.value.values()].some(Boolean),
);
const loading = ref(false);
const error = ref('');
const creating = ref(false);
const creatingOther = ref(false);
const returning = ref<StockIn>();
const voiding = ref<StockIn>();
const viewing = ref<StockIn>();

function canVoid(row: StockIn) {
  if (!canVoidStockIn(row)) return false;
  if (row.kind !== 'OTHER') return !props.center;
  return writable.value?.get(row.warehouseId) !== false;
}
function canReturnRow(row: StockIn) {
  return !props.center && canReturn(row);
}
const viewActions = computed(() => {
  const row = viewing.value;
  if (!row) return [];
  return [
    ...(canReturnRow(row) ? [{ key: 'return', label: '采购退货' }] : []),
    ...(canVoid(row) ? [{ key: 'void', label: '作废入库', danger: true }] : []),
  ];
});
const factoryHint = computed(() => {
  const row = viewing.value;
  if (!row || row.status === 'VOIDED') return '';
  if (row.kind === 'PRODUCTION')
    return '工厂交货入库：要冲回请在工厂排单的交货单上作废';
  if (row.kind === 'FACTORY_PURCHASE')
    return '工厂收货的原料、辅料：不进仓库库存，要冲回请在工厂的到货记录上作废';
  if (row.kind === 'FACTORY_MADE')
    return '自家工厂生产入库：要冲回请在工厂排单的入库记录上作废';
  return '';
});

const columns = [
  { title: '入库主题', key: 'subject', width: 280, fixed: 'left' as const },
  { title: '入库单号', key: 'code', width: 150 },
  { title: '供应商 / 来源', key: 'partner', width: 170 },
  { title: '对应单据', key: 'related', width: 170 },
  { title: '入库仓库', key: 'warehouse', width: 110 },
  { title: '入库日期', key: 'date', width: 105 },
  { title: '入库状态', key: 'status', width: 90 },
  { title: '经办人', key: 'person', width: 90 },
  { title: '单据类型', key: 'kind', width: 90 },
  {
    title: '实收 / 合格',
    key: 'quantity',
    width: 120,
    align: 'right' as const,
  },
  { title: '金额', key: 'amount', width: 130, align: 'right' as const },
  { title: '操作', key: 'action', width: 110, fixed: 'right' as const },
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
function received(row: StockIn) {
  return lineSum(row.lines, (line) => line.quantity);
}
function accepted(row: StockIn) {
  return lineSum(row.lines, (line) => line.acceptedQuantity);
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
function savedOther(value: StockIn) {
  creatingOther.value = false;
  message.success(`已入库 ${value.code}`);
  void load(true);
  viewing.value = value;
}
function returned(value: { code: string }) {
  returning.value = undefined;
  viewing.value = undefined;
  message.success(`已办理采购退货 ${value.code}`);
  void load();
}
function voided(code: string) {
  voiding.value = undefined;
  viewing.value = undefined;
  message.success(`已作废 ${code}`);
  void load();
}
function viewAction(key: string) {
  if (key === 'return') returning.value = viewing.value;
  else voiding.value = viewing.value;
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
      <TabPane key="PURCHASE" tab="采购入库" />
      <TabPane key="OTHER" tab="常规入库" />
      <TabPane key="PRODUCTION" tab="生产入库" />
      <TabPane key="FACTORY_PURCHASE" tab="工厂收货" />
    </Tabs>
    <div class="toolbar">
      <Input.Search
        v-model:value="keyword"
        allow-clear
        placeholder="入库单号、采购单、供应商、来源、合同、产品"
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
      <Button v-if="canCreateOther" @click="creatingOther = true">
        常规入库
      </Button>
      <Button v-if="!center" type="primary" @click="creating = true">
        新建采购入库
      </Button>
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
      :scroll="{ x: 1690 }"
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
        {{
          center
            ? '还没有入库单。采购入库在采购部门「仓库管理」或采购单上登记；不关联采购单的货（期初、客户退回、样品退回等）点「常规入库」。'
            : '还没有入库单。在采购单上点「登记入库」或右上角「新建采购入库」；不关联采购单的货点「常规入库」。'
        }}
      </template>
      <template #bodyCell="{ column, record }">
        <a
          v-if="column.key === 'subject'"
          class="doc-link ellipsis"
          :title="inSubject(record as StockIn)"
          @click="viewing = record as StockIn"
          >{{ inSubject(record as StockIn) }}</a>
        <span v-else-if="column.key === 'code'" class="mono">{{
          record.code
        }}</span>
        <span v-else-if="column.key === 'partner'" class="ellipsis">{{
          inPartner(record as StockIn)
        }}</span>
        <div v-else-if="column.key === 'related'" class="cell">
          <span class="mono ellipsis">{{ inRelated(record as StockIn) }}</span>
          <span v-if="record.contractCode" class="muted ellipsis">
            合同 {{ record.contractCode }}
          </span>
          <span v-if="record.directShip" class="muted">
            直发 · {{ record.stockOutCode }}
          </span>
        </div>
        <span v-else-if="column.key === 'warehouse'">{{
          record.warehouseName
        }}</span>
        <span v-else-if="column.key === 'date'" class="num">{{
          record.receivedDate
        }}</span>
        <span v-else-if="column.key === 'status'">
          <Tag v-if="record.status === 'VOIDED'" :title="record.voidReason">
            已作废
          </Tag>
          <span v-else class="in">已入库</span>
        </span>
        <span v-else-if="column.key === 'person'">{{
          personName(directory, record.createdBy)
        }}</span>
        <span v-else-if="column.key === 'kind'">{{
          inKindLabel(record as StockIn)
        }}</span>
        <span v-else-if="column.key === 'quantity'" class="num">
          {{ qty(received(record as StockIn)) }} /
          <b>{{ qty(accepted(record as StockIn)) }}</b>
        </span>
        <span v-else-if="column.key === 'amount'" class="num">{{
          money(record.amount, record.currency)
        }}</span>
        <div v-else-if="column.key === 'action'" class="row-actions">
          <template v-if="record.status !== 'VOIDED'">
            <Button
              v-if="canReturnRow(record as StockIn)"
              size="small"
              type="link"
              @click="returning = record as StockIn"
            >
              退货
            </Button>
            <Button
              v-if="canVoid(record as StockIn)"
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
      <template #summary>
        <Table.Summary.Row v-if="rows.length">
          <Table.Summary.Cell :index="0" :col-span="9">
            本页合计（不含作废）
          </Table.Summary.Cell>
          <Table.Summary.Cell :index="9" align="right">
            {{ qty(pageSum(rows, received)) }} /
            {{ qty(pageSum(rows, accepted)) }}
          </Table.Summary.Cell>
          <Table.Summary.Cell :index="10" />
          <Table.Summary.Cell :index="11" />
        </Table.Summary.Row>
      </template>
    </Table>
    <StockInDialog
      v-if="!center"
      :open="creating"
      @close="creating = false"
      @saved="saved"
    />
    <OtherInDialog
      :open="creatingOther"
      @close="creatingOther = false"
      @saved="savedOther"
    />
    <StockDocDrawer
      :stock-in="viewing"
      :actions="viewActions"
      :hint="factoryHint"
      @close="viewing = undefined"
      @action="viewAction"
    />
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
