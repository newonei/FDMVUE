<script setup lang="ts">
import type { TableColumnsType } from 'ant-design-vue';

import type { FdmgongchangOrderSplitApi as Api } from '#/api/fdmgongchang/schedule';

import { Button, Table } from 'ant-design-vue';

import { colorModeText, parameterText, thicknessText } from '../../production-order/manufacturing';
import { finishedSpecText, orderQuantityText } from './order-split-display';

defineProps<{ editable?: boolean; rows: Api.Row[] }>();
const emit = defineEmits<{ edit: [row: Api.Row] }>();
const columns: TableColumnsType<Api.Row> = [
  { key: 'product', title: '订单 / 产品明细', width: 260 },
  { key: 'quantity', title: '订单数量 / 待产', width: 140 },
  { key: 'spec', title: '成品规格 / 结构', width: 220 },
  { key: 'front', title: '正面颜色 / 拆分层厚', width: 175 },
  { key: 'back', title: '反面颜色 / 拆分层厚', width: 175 },
  { key: 'texture', title: '订单要求的压花纹路', width: 200 },
];
</script>

<template>
  <Table class="split-product-specs" :columns="columns" :data-source="rows" :pagination="false" :scroll="{ x: 1170, y: 260 }" row-key="itemId" size="small">
    <template #bodyCell="{ column, record }">
      <template v-if="column.key === 'product'">
        <div class="font-mono text-xs">{{ record.orderNo }} · #{{ record.itemId }}</div>
        <div>{{ record.productName || '未填写产品名称' }}</div>
        <div class="text-xs text-muted-foreground">{{ record.productCode || '未填写编码' }}</div>
        <Button v-if="editable" type="link" size="small" class="!px-0" @click="emit('edit', record as Api.Row)">修改参数与工艺</Button>
      </template>
      <template v-else-if="column.key === 'quantity'">
        <div>订单 {{ orderQuantityText(record.orderQuantity, record.orderUnit) }}</div>
        <div class="font-semibold">待产 {{ orderQuantityText(record.remainingQuantity, record.orderUnit) }}</div>
      </template>
      <template v-else-if="column.key === 'spec'">
        <div>{{ finishedSpecText(record as Api.Row) || '成品规格未填写' }}</div>
        <div>{{ colorModeText(record.colorMode) }} · {{ ({ SINGLE_LAYER: '单层', DOUBLE_LAYER: '双层' } as Record<string, string>)[record.constructionType] || '结构未填写' }}</div>
      </template>
      <template v-else-if="column.key === 'front'">
        <div>{{ parameterText(record.frontColor, record.frontColorName) }}</div>
        <div class="text-xs">本次拆分层厚 {{ thicknessText(record.frontThickness) }}</div>
      </template>
      <template v-else-if="column.key === 'back'">
        <div>{{ parameterText(record.backColor, record.backColorName) }}</div>
        <div class="text-xs">{{ record.colorMode === 'SINGLE' ? '单色单层，无反面独立层' : `本次拆分层厚 ${thicknessText(record.backThickness)}` }}</div>
      </template>
      <template v-else-if="column.key === 'texture'">
        <div>正面：{{ parameterText(record.textureFront, record.textureFrontName) }}</div>
        <div>反面：{{ parameterText(record.textureBack, record.textureBackName) }}</div>
      </template>
    </template>
  </Table>
</template>
