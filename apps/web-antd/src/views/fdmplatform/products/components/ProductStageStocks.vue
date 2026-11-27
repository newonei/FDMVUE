<script setup lang="ts">
import type { FdmgongchangStageStockApi as Api } from '#/api/fdmgongchang/stage-stock';

import { ref, watch } from 'vue';

import { useAccess } from '@vben/access';

import { Spin, Table } from 'ant-design-vue';

import { getCenterStockPage } from '#/api/fdmgongchang/stage-stock';
import { stockUnit } from '#/views/fdmgongchang/stage-stock/model';

import { stageOf } from '../../inventory-center/components/model';
import { qty } from '../../purchase/warehouse/model';

/** 这个产品在各工厂的工序库存；没有库存或没有查看权限时不显示。 */
const props = defineProps<{ productId: string; showEmpty?: boolean }>();

const { hasAccessByCodes } = useAccess();
const rows = ref<Api.Stock[]>([]);
const total = ref(0);
const loading = ref(false);
const failed = ref(false);

watch(
  () => props.productId,
  async (productId, _, onCleanup) => {
    let current = true;
    onCleanup(() => {
      current = false;
    });
    rows.value = [];
    total.value = 0;
    failed.value = false;
    loading.value = false;
    if (
      !hasAccessByCodes([
        'fdmgongchang:stage-stock:query',
        'fdmplatform:inventory:query',
      ])
    )
      return;
    loading.value = true;
    try {
      const page = await getCenterStockPage({
        pageNo: 1,
        pageSize: 50,
        productId,
      });
      if (!current) return;
      rows.value = page.list;
      total.value = page.total;
    } catch {
      if (current) failed.value = true;
    } finally {
      if (current) loading.value = false;
    }
  },
  { immediate: true },
);
</script>

<template>
  <div v-if="rows.length > 0" style="margin-top: 16px">
    <h4>
      工厂库存（原料仓 / 半成品仓）
      <span v-if="total > rows.length">
        （显示前 {{ rows.length }} 行，共 {{ total }} 行）
      </span>
    </h4>
    <Table
      size="small"
      row-key="id"
      :data-source="rows"
      :pagination="false"
      :columns="[
        { title: '工厂', dataIndex: 'factoryName' },
        { title: '阶段', key: 'stage' },
        { title: '批次', dataIndex: 'batchNo' },
        { title: '库位', dataIndex: 'location' },
        { title: '数量', key: 'quantity', align: 'right' },
      ]"
    >
      <template #bodyCell="{ column, record }">
        <span v-if="column.key === 'stage'">{{
          stageOf(record.stage)?.label ?? record.stage
        }}</span>
        <span v-else-if="column.key === 'quantity'">
          {{ qty(record.quantity) }}
          {{
            stockUnit(record.stage, record.item, stageOf(record.stage)?.unit)
          }}
        </span>
      </template>
    </Table>
  </div>
  <template v-else-if="showEmpty">
    <Spin v-if="loading" size="small" aria-label="加载工厂库存" />
    <p v-else-if="failed" role="alert">工厂库存加载失败</p>
    <p v-else>暂无关联工厂库存</p>
  </template>
</template>
