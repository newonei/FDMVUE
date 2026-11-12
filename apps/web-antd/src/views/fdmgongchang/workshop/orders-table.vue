<script setup lang="ts">
import type { TableColumnsType } from 'ant-design-vue';

import type { FdmgongchangStageStockApi as StockApi } from '#/api/fdmgongchang/stage-stock';
import type { FdmgongchangWorkbenchApi as Api } from '#/api/fdmgongchang/workbench';

import { Button, Table } from 'ant-design-vue';

import { formatQty } from '../stage-stock/model';

const props = defineProps<{ completed?: boolean; options?: StockApi.Options; orders: Api.Order[] }>();
const emit = defineEmits<{ report: [order: Api.Order]; supplement: [order: Api.Order] }>();
const columns: TableColumnsType<Api.Order> = [
  { dataIndex: 'orderNo', key: 'orderNo', title: '工序单号', width: 180 },
  { key: 'production', title: '关联订单 / 任务', width: 170 },
  { key: 'inputs', title: '已领材料', width: 290 },
  { key: 'good', title: '本工序累计良品', width: 140 },
  { key: 'actions', title: '操作', width: 220, fixed: 'right' },
];
const stageOf = (stage: string) => props.options?.stages.find((item) => item.code === stage);
</script>

<template>
  <Table :columns="columns" :data-source="orders" row-key="id" :scroll="{ x: 1000 }" :pagination="{ defaultPageSize: 5, hideOnSinglePage: true, showSizeChanger: false }" size="small" bordered>
    <template #bodyCell="{ column, record }">
      <template v-if="column.key === 'production'">{{ record.contractCode || (record.scheduleTaskId ? `任务 #${record.scheduleTaskId}` : '独立生产') }}</template>
      <template v-else-if="column.key === 'inputs'">
        <div class="tabular-nums">{{ formatQty(record.inputQuantity) }} {{ record.inputUnit }} {{ stageOf(record.sourceStage)?.label }}</div>
        <div v-if="record.inputSummary" class="break-words text-xs text-muted-foreground">{{ record.inputSummary }}</div>
      </template>
      <template v-else-if="column.key === 'good'">{{ formatQty(record.goodQuantity) }} {{ stageOf(record.outputStage)?.unit }}</template>
      <template v-else-if="column.key === 'actions'">
        <div class="flex flex-wrap gap-2">
          <Button v-if="!completed" size="small" type="primary" @click="emit('report', record as Api.Order)">报本工序产出</Button>
          <Button size="small" @click="emit('supplement', record as Api.Order)">{{ completed ? '补登领料' : '补领材料' }}</Button>
        </div>
      </template>
    </template>
  </Table>
</template>
