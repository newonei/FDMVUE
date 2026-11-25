<script setup lang="ts">
import type { Directory } from '#/api/fdmplatform';
import type { ProcurementSetting } from '#/api/fdmplatform/procurement';
import type { PurchaseReturn } from '#/api/fdmplatform/warehouse';

import { onMounted, ref } from 'vue';

import { Alert, Button, Input, Select, Table, Tag } from 'ant-design-vue';

import { getDirectory } from '#/api/fdmplatform';
import { getProcurementSettings } from '#/api/fdmplatform/procurement';
import {
  getPurchaseReturn,
  getPurchaseReturns,
} from '#/api/fdmplatform/warehouse';
import AiCheckPanel from '#/views/fdmaicheck/components/AiCheckPanel.vue';
import AiReviewStatus from '#/views/fdmaicheck/components/AiReviewStatus.vue';
import { useAiReviewStatuses } from '#/views/fdmaicheck/components/useAiReviewStatuses';

import { errorText } from '../../data';
import { personName } from '../../directory';
import { returnSubject } from '../../inventory-center/components/doc-model';
import { linesTitle, money, qty } from './model';
import { useWarehouseDocumentLink } from './useWarehouseDocumentLink';

import './warehouse-pages.css';

defineOptions({ name: 'FdmPlatformPurchaseReturns' });

const rows = ref<PurchaseReturn[]>([]);
const expandedRowKeys = ref<(number | string)[]>([]);
const total = ref(0);
const pageNo = ref(1);
const keyword = ref('');
const warehouseId = ref<string>();
const warehouses = ref<ProcurementSetting[]>([]);
const directory = ref<Directory>();
const loading = ref(false);
const error = ref('');
const { active, linkedId } = useWarehouseDocumentLink(
  'returnId',
  getPurchaseReturn,
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
    ? rows.value.map(({ id }) => ({ docType: 'PURCHASE_RETURN', docId: id }))
    : [],
);

const columns = [
  { title: '退货主题', key: 'subject', width: 170 },
  { title: '原入库单 / 仓库', key: 'stockIn', width: 170 },
  { title: '采购单 / 供应商', key: 'order', width: 220 },
  { title: '产品', key: 'product', width: 220 },
  { title: '数量', key: 'quantity', width: 90, align: 'right' as const },
  { title: '金额', key: 'amount', width: 130, align: 'right' as const },
  { title: '原因', key: 'reason', width: 180 },
  { title: '退货日期 / 经办', key: 'date', width: 130 },
  { title: 'AI 审核', key: 'aiReview', width: 180 },
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
  if (!linkedId.value) void load();
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
        placeholder="内部单号、供应商、退货原因、产品"
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
      <Button :loading="loading" @click="load().then(refreshReviewStatuses)">
        刷新
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
      v-model:expanded-row-keys="expandedRowKeys"
      :loading="loading"
      :scroll="{ x: 1490 }"
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
        <AiCheckPanel
          v-if="active && expandedRowKeys.includes(record.id)"
          doc-type="PURCHASE_RETURN"
          :doc-id="record.id"
          default-collapsed
        />
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
            <td>{{ money(line.unitPrice, '') }}</td>
            <td>{{ money(line.amount, record.currency) }}</td>
          </tr>
        </table>
      </template>
      <template #bodyCell="{ column, record }">
        <div v-if="column.key === 'subject'" class="cell">
          <b>{{ returnSubject(record as PurchaseReturn) }}</b>
          <Tag v-if="record.noReplacement" color="orange">不再补货</Tag>
          <Tag v-else color="blue">供应商补发</Tag>
        </div>
        <div v-else-if="column.key === 'stockIn'" class="cell">
          <span>关联入库单</span>
          <span class="muted">{{ record.warehouseName }}</span>
        </div>
        <div v-else-if="column.key === 'order'" class="cell">
          <span>关联采购单</span>
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
        <AiReviewStatus
          v-else-if="column.key === 'aiReview'"
          :status="statusFor('PURCHASE_RETURN', record.id)"
        />
      </template>
    </Table>
  </div>
</template>
