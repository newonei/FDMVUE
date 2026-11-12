<script setup lang="ts">
import type { TableColumnsType } from 'ant-design-vue';

import type { FdmgongchangProductionOrderApi as Api,FdmgongchangSupplyMatchApi } from '#/api/fdmgongchang/production-order';

import { onMounted, ref } from 'vue';

import { Button, Table } from 'ant-design-vue';

import { getTargetOptions } from '#/api/fdmgongchang/production-order';

import { dimensionTextInMm } from '../../shared/dimensions';
import { PROCESS_LABELS } from '../../shared/schedule';
import { colorModeText, parameterText, thicknessText } from '../manufacturing';
import { num, specText } from '../shared';

defineProps<{ editable?: boolean; items: Api.Item[] }>();
const emit = defineEmits<{ edit: [item: Api.Item] }>();
const options = ref<FdmgongchangSupplyMatchApi.TargetOptions>();
onMounted(async () => { options.value = await getTargetOptions().catch(() => undefined); });
function named(value: null | string | undefined, kind: 'colors' | 'textures') {
  return parameterText(value, options.value?.[kind].find((item) => item.value === value)?.label);
}

const columns: TableColumnsType<Api.Item> = [
  { key: 'product', title: '订单产品', width: 230 },
  { key: 'spec', title: '订单产品规格', width: 240 },
  { key: 'quantity', title: '订单数量 / 已完成', width: 150 },
  { key: 'mode', title: '已保存：单双色 / 总厚', width: 170 },
  { key: 'front', title: '已保存：正面参数', width: 230 },
  { key: 'back', title: '已保存：反面参数', width: 230 },
  { key: 'route', title: '实际工艺路线', width: 240 },
  { key: 'configuration', title: '生产配置', width: 170 },
];
</script>

<template>
  <Table :columns="columns" :data-source="items" :pagination="false" :scroll="{ x: 1660 }" row-key="id" size="small">
    <template #bodyCell="{ column, record }">
      <template v-if="column.key === 'product'">
        <div>{{ record.productName || '未填写产品名称' }}</div>
        <div class="text-xs text-muted-foreground">{{ record.productCode || '未填写编码' }} · 明细 #{{ record.id }}</div>
        <Button v-if="editable" size="small" type="link" class="!px-0" @click="emit('edit', record as Api.Item)">修改参数与工艺</Button>
      </template>
      <template v-else-if="column.key === 'spec'">
        <div>{{ dimensionTextInMm(specText(record as Api.Item)) || '未填写规格' }}</div>
        <div v-if="record.printing || record.packaging" class="text-xs text-muted-foreground">
          <template v-if="record.printing">印花：{{ record.printing }}</template><template v-if="record.packaging"> 包装：{{ record.packaging }}</template>
        </div>
      </template>
      <template v-else-if="column.key === 'quantity'">
        <div>订单 {{ num(record.quantity) }} {{ record.unit || '（单位未填）' }}</div>
        <div class="text-xs text-muted-foreground">已完成 {{ num(record.completedQuantity) }} {{ record.unit }}</div>
      </template>
      <template v-else-if="column.key === 'mode'">
        <div>{{ colorModeText(record.targetColorMode) }} · {{ ({ SINGLE_LAYER: '单层', DOUBLE_LAYER: '双层' } as Record<string, string>)[record.targetConstructionType] || '结构未填写' }}</div>
        <div class="text-xs text-muted-foreground">成品总厚 {{ thicknessText(record.targetThickness) }}</div>
      </template>
      <template v-else-if="column.key === 'front'">
        <div>颜色：{{ named(record.targetFrontColor, 'colors') }}</div>
        <div class="text-xs">层厚：{{ thicknessText(record.targetFrontThickness) }}</div>
        <div class="text-xs">压花纹路：{{ named(record.targetTextureFront, 'textures') }}</div>
      </template>
      <template v-else-if="column.key === 'back'">
        <div>颜色：{{ named(record.targetBackColor, 'colors') }}</div>
        <div class="text-xs">层厚：{{ thicknessText(record.targetBackThickness) }}</div>
        <div class="text-xs">压花纹路：{{ named(record.targetTextureBack, 'textures') }}</div>
      </template>
      <template v-else-if="column.key === 'route'">
        <div>{{ record.routeName || '自选工艺' }}</div>
        <div class="text-xs" :class="record.processes?.length ? 'text-muted-foreground' : 'text-orange-600'">
          {{ record.processes?.length ? record.processes.map((code: string) => PROCESS_LABELS[code] || code).join(' → ') : '未配置工艺，拆分前需补充' }}
        </div>
      </template>
      <template v-else-if="column.key === 'configuration'">
        <div :class="record.targetConfirmedAt ? '' : 'text-orange-600'">{{ record.targetConfirmedAt ? '生产参数已确认' : '生产参数待确认' }}</div>
        <div class="text-xs text-muted-foreground">配方：{{ record.recipeCode || '未配置' }}</div>
      </template>
    </template>
  </Table>
</template>
