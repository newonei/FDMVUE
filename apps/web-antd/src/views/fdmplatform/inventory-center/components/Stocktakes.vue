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
  getStocktake,
  getStocktakes,
} from '#/api/fdmplatform/warehouse';
import AiCheckPanel from '#/views/fdmaicheck/components/AiCheckPanel.vue';
import AiReviewStatus from '#/views/fdmaicheck/components/AiReviewStatus.vue';
import { useAiReviewStatuses } from '#/views/fdmaicheck/components/useAiReviewStatuses';

import { errorText } from '../../data';
import { personName } from '../../directory';
import { money, qty } from '../../purchase/warehouse/model';
import { useWarehouseDocumentLink } from '../../purchase/warehouse/useWarehouseDocumentLink';
import StocktakeDialog from './StocktakeDialog.vue';

import '../../purchase/warehouse/warehouse-pages.css';

defineOptions({ name: 'FdmInventoryStocktakes' });

const rows = ref<Stocktake[]>([]);
const expandedRowKeys = ref<(number | string)[]>([]);
const total = ref(0);
const pageNo = ref(1);
const keyword = ref('');
const warehouseId = ref<string>();
const warehouses = ref<InventoryWarehouse[]>([]);
const directory = ref<Directory>();
const loading = ref(false);
const error = ref('');
const creating = ref(false);
const { active, linkedId } = useWarehouseDocumentLink(
  'stocktakeId',
  getStocktake,
  (document) => {
    keyword.value = '';
    warehouseId.value = undefined;
    pageNo.value = 1;
    rows.value = [document];
    total.value = 1;
    expandedRowKeys.value = [document.id];
  },
  (error_) => {
    error.value = errorText(error_);
  },
);
const { statusFor, refresh: refreshReviewStatuses } = useAiReviewStatuses(() =>
  active.value
    ? rows.value.map(({ id }) => ({ docType: 'STOCKTAKE', docId: id }))
    : [],
);

const columns = [
  { title: '盘点主题', key: 'subject', width: 180 },
  { title: '仓库', key: 'warehouse', width: 120 },
  { title: '盘点 / 有差异', key: 'count', width: 130, align: 'right' as const },
  { title: '盘盈金额', key: 'gain', width: 130, align: 'right' as const },
  { title: '盘亏金额', key: 'loss', width: 130, align: 'right' as const },
  { title: '盘点日期 / 经办', key: 'date', width: 130 },
  { title: 'AI 审核', key: 'aiReview', width: 180 },
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
      ? `已过账，调整了 ${value.changedCount} 行库存`
      : '已过账，账实相符',
  );
  void load(true);
}
onMounted(async () => {
  if (!linkedId.value) void load();
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
        placeholder="产品、备注"
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
      <span class="muted">工厂的原料仓、半成品仓也在这里盘点</span>
      <Button :loading="loading" @click="load().then(refreshReviewStatuses)">
        刷新
      </Button>
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
      v-model:expanded-row-keys="expandedRowKeys"
      :loading="loading"
      :scroll="{ x: 1200 }"
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
        <AiCheckPanel
          v-if="active && expandedRowKeys.includes(record.id)"
          doc-type="STOCKTAKE"
          :doc-id="record.id"
          default-collapsed
        />
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
        <b v-if="column.key === 'subject'">{{ record.warehouseName }}盘点</b>
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
        <AiReviewStatus
          v-else-if="column.key === 'aiReview'"
          :status="statusFor('STOCKTAKE', record.id)"
        />
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
