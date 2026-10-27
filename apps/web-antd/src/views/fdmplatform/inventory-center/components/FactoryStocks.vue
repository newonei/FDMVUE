<script setup lang="ts">
import type { FdmgongchangStageStockApi as Api } from '#/api/fdmgongchang/stage-stock';

import { computed, onMounted, ref } from 'vue';

import { useAccess } from '@vben/access';

import { Alert, Button, Input, Select, Table } from 'ant-design-vue';

import {
  getCenterFactories,
  getCenterStockPage,
  getStageStockOptions,
} from '#/api/fdmgongchang/stage-stock';
import {
  makeLabels,
  stockSpec,
  stockTitle,
  stockUnit,
} from '#/views/fdmgongchang/stage-stock/model';

import { errorText } from '../../data';
import { qty } from '../../purchase/warehouse/model';
import { stageOf, STAGES } from './model';

import '../../purchase/warehouse/warehouse-pages.css';

/**
 * 各工厂的工序库存（只读）：原材料、各道工序的半成品、还没入库的成品、辅料。
 * 领料、报工、盘点在「工厂部门 → 工序库存」办理；做好的成品由工厂生产入库进本厂仓库后，在「仓库库存」里出库。
 */
defineOptions({ name: 'FdmInventoryFactoryStocks' });

const { hasAccessByCodes } = useAccess();
const rows = ref<Api.Stock[]>([]);
const total = ref(0);
const pageNo = ref(1);
const keyword = ref('');
const factoryId = ref<number>();
const stage = ref<string>();
const factories = ref<Array<{ id: number; name: string }>>([]);
const options = ref<Api.Options>();
const loading = ref(false);
const error = ref('');

const labels = computed(() => makeLabels(options.value));

async function load(reset = false) {
  if (reset) pageNo.value = 1;
  loading.value = true;
  error.value = '';
  try {
    const page = await getCenterStockPage({
      pageNo: pageNo.value,
      pageSize: 50,
      factoryId: factoryId.value,
      stage: stage.value,
      keyword: keyword.value.trim() || undefined,
    });
    rows.value = page.list;
    total.value = page.total;
  } catch (error_) {
    error.value = errorText(error_);
  } finally {
    loading.value = false;
  }
}
function title(row: Api.Stock) {
  return stockTitle(
    row.stage,
    stageOf(row.stage)?.label ?? row.stage,
    row.item,
    labels.value,
    row.itemCode,
  );
}
onMounted(async () => {
  void load();
  try {
    factories.value = await getCenterFactories();
    // 颜色、材质等字典名称；没有工厂权限时显示编码
    if (hasAccessByCodes(['fdmgongchang:stage-stock:query']))
      options.value = await getStageStockOptions();
  } catch {
    // 只影响筛选和名称显示
  }
});
</script>

<template>
  <div class="warehouse-page">
    <div class="toolbar">
      <Input.Search
        v-model:value="keyword"
        allow-clear
        placeholder="物料编码、批次"
        style="width: 240px"
        @search="load(true)"
      />
      <Select
        v-model:value="factoryId"
        allow-clear
        placeholder="全部工厂"
        style="width: 150px"
        :options="
          factories.map((entry) => ({ value: entry.id, label: entry.name }))
        "
        @change="load(true)"
      />
      <Select
        v-model:value="stage"
        allow-clear
        placeholder="全部阶段"
        style="width: 150px"
        :options="
          STAGES.map((entry) => ({ value: entry.code, label: entry.label }))
        "
        @change="load(true)"
      />
      <span class="grow"></span>
      <span class="muted">只读；领料、报工、盘点在「工厂部门 → 工序库存」</span>
      <Button :loading="loading" @click="load()">刷新</Button>
    </div>
    <Alert v-if="error" type="error" :message="error" show-icon />
    <Table
      class="fdm-business-table"
      size="middle"
      table-layout="fixed"
      row-key="id"
      :data-source="rows"
      :loading="loading"
      :scroll="{ x: 1000 }"
      :columns="[
        { title: '工厂', key: 'factory', width: 110 },
        { title: '阶段', key: 'stage', width: 110 },
        { title: '物料 / 规格', key: 'item', width: 320 },
        { title: '批次 / 库位', key: 'batch', width: 180 },
        { title: '数量', key: 'quantity', width: 120, align: 'right' },
      ]"
      :pagination="{
        current: pageNo,
        pageSize: 50,
        total,
        showSizeChanger: false,
        showTotal: (count: number) => `共 ${count} 行`,
      }"
      @change="
        (pagination) => {
          pageNo = pagination.current ?? 1;
          load();
        }
      "
    >
      <template #emptyText>工厂没有工序库存。</template>
      <template #bodyCell="{ column, record }">
        <span v-if="column.key === 'factory'">{{ record.factoryName }}</span>
        <span v-else-if="column.key === 'stage'">{{
          stageOf(record.stage)?.label ?? record.stage
        }}</span>
        <div v-else-if="column.key === 'item'" class="cell">
          <span class="ellipsis">{{ title(record as Api.Stock) }}</span>
          <span class="muted ellipsis">
            <span class="mono">{{ record.itemCode }}</span>
            {{ stockSpec(record.stage, record.item, labels) }}
          </span>
        </div>
        <div v-else-if="column.key === 'batch'" class="cell">
          <span class="mono">{{ record.batchNo }}</span>
          <span class="muted">{{ record.location }}</span>
        </div>
        <b v-else-if="column.key === 'quantity'" class="num">
          {{ qty(record.quantity) }}
          <span class="muted">{{
            stockUnit(record.stage, record.item, stageOf(record.stage)?.unit)
          }}</span>
        </b>
      </template>
    </Table>
  </div>
</template>
