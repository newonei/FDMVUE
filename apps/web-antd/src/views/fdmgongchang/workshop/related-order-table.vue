<script setup lang="ts">
import type { TableColumnsType } from 'ant-design-vue';

import type { FdmgongchangScheduleApi as Api } from '#/api/fdmgongchang/schedule';
import type { FdmgongchangStageStockApi as StockApi } from '#/api/fdmgongchang/stage-stock';

import { Table } from 'ant-design-vue';

import { dateText, PROCESS_LABELS } from '../shared/schedule';
import { formatQty } from '../stage-stock/model';
import { orderProductSpec, orderTargetSpec } from './order-details';

defineProps<{ items: Api.RelatedOrderItem[]; options?: StockApi.Options }>();

const columns: TableColumnsType<Api.RelatedOrderItem> = [
  { key: 'order', title: '关联订单 / 交期', width: 190 },
  { key: 'product', title: '订单产品', width: 220 },
  { key: 'snapshot', title: '订单产品规格', width: 240 },
  { key: 'target', title: '工厂生产参数（mm）', width: 270 },
  { key: 'quantity', title: '订单产品数量', width: 150 },
  { key: 'route', title: '工艺 / 配方', width: 180 },
  { key: 'notes', title: '印刷 / 包装 / 备注', width: 230 },
];
const routeText = (item: Api.RelatedOrderItem) => (item.routeSteps ?? '').split(',')
  .map((code) => PROCESS_LABELS[code.trim()] ?? code.trim()).filter(Boolean).join(' → ');
</script>

<template>
  <Table class="workshop-related-orders" :columns="columns" :data-source="items" :row-key="(item: Api.RelatedOrderItem) => `${item.orderId}:${item.itemId}`" :pagination="false" :scroll="{ x: 1480 }" size="small" bordered :locale="{ emptyText: '没有关联的工厂订单产品明细，请按本工序任务要求生产' }">
    <template #bodyCell="{ column, record }">
      <template v-if="column.key === 'order'">
        <div class="break-words font-medium">{{ record.orderNo }}</div>
        <div v-if="record.customerName" class="text-xs text-muted-foreground">{{ record.customerName }}</div>
        <div v-if="record.requiredDate" class="text-xs text-muted-foreground">期望 {{ dateText(record.requiredDate) }}</div>
        <div v-if="record.promisedDate" class="text-xs text-muted-foreground">承诺 {{ dateText(record.promisedDate) }}</div>
      </template>
      <template v-else-if="column.key === 'product'">
        <div class="break-words font-medium">{{ record.productName || '未填写产品名称' }}</div>
        <div v-if="record.productCode" class="break-all font-mono text-xs text-muted-foreground">{{ record.productCode }}</div>
        <div class="text-xs text-muted-foreground">订单明细 #{{ record.itemId }}</div>
      </template>
      <template v-else-if="column.key === 'snapshot'">{{ orderProductSpec(record as Api.RelatedOrderItem) || '未填写订单产品规格' }}</template>
      <template v-else-if="column.key === 'target'">
        <div>{{ orderTargetSpec(record as Api.RelatedOrderItem, options) || '尚未填写生产参数' }}</div>
        <div class="mt-1 text-xs text-muted-foreground">{{ record.targetConfirmedAt ? `已确认${record.targetConfirmedBy ? ` · ${record.targetConfirmedBy}` : ''}` : '参数待确认' }}</div>
      </template>
      <template v-else-if="column.key === 'quantity'">
        <div class="tabular-nums">订购 {{ record.quantity == null ? '未填写' : formatQty(record.quantity) }} {{ record.unit }}</div>
        <div class="text-xs tabular-nums text-muted-foreground">已完成 {{ record.completedQuantity == null ? '未填写' : formatQty(record.completedQuantity) }} {{ record.unit }}</div>
      </template>
      <template v-else-if="column.key === 'route'">
        <div v-if="record.routeName">{{ record.routeName }}</div>
        <div v-if="record.routeSteps" class="text-xs text-muted-foreground">{{ routeText(record as Api.RelatedOrderItem) }}</div>
        <div v-if="record.recipeCode" class="text-xs">配方 {{ record.recipeCode }}</div>
        <span v-if="!record.routeName && !record.routeSteps && !record.recipeCode">—</span>
      </template>
      <template v-else-if="column.key === 'notes'">
        <div v-if="record.printing">印刷：{{ record.printing }}</div>
        <div v-if="record.packaging">包装：{{ record.packaging }}</div>
        <div v-if="record.remark">备注：{{ record.remark }}</div>
        <span v-if="!record.printing && !record.packaging && !record.remark">—</span>
      </template>
    </template>
  </Table>
</template>
