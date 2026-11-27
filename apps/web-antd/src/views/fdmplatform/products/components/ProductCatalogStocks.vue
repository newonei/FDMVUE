<script setup lang="ts">
import type { TableColumnsType } from 'ant-design-vue';

import type { BusinessRecord } from '#/api/fdmplatform';

import { ref, watch } from 'vue';

import { Table } from 'ant-design-vue';

import { getStockPage } from '#/api/fdmplatform/stock';

import { errorText } from '../../data';
import { qty } from '../../purchase/warehouse/model';
import ProductStageStocks from './ProductStageStocks.vue';

const props = defineProps<{
  productId: string;
  showWarehouse: boolean;
}>();

const columns: TableColumnsType<BusinessRecord> = [
  { title: '仓库', dataIndex: 'warehouseName' },
  { title: '货主', dataIndex: 'stockOwnerName' },
  { title: '计量单位', dataIndex: 'unit' },
  { title: '现存', key: 'onHand', align: 'right' },
  { title: '可用', key: 'available', align: 'right' },
];
const pageSize = 10;
const page = ref(1);
const rows = ref<BusinessRecord[]>([]);
const total = ref(0);
const loading = ref(false);
const loadError = ref('');

watch(
  [() => props.showWarehouse, () => props.productId, page],
  async ([showWarehouse, productId, pageNo], _, onCleanup) => {
    let current = true;
    onCleanup(() => {
      current = false;
    });
    if (!showWarehouse) return;

    rows.value = [];
    loadError.value = '';
    loading.value = true;
    try {
      const result = await getStockPage({ skuId: productId, pageNo, pageSize });
      if (!current) return;
      rows.value = result.list;
      total.value = result.total;
    } catch (error) {
      if (current) loadError.value = errorText(error);
    } finally {
      if (current) loading.value = false;
    }
  },
  { immediate: true },
);
</script>

<template>
  <div>
    <template v-if="showWarehouse">
      <h4>履约库存</h4>
      <p v-if="loadError" role="alert">{{ loadError }}</p>
      <Table
        v-else
        size="small"
        row-key="id"
        :columns="columns"
        :data-source="rows"
        :loading="loading"
        :pagination="
          total > pageSize
            ? { current: page, pageSize, total, showSizeChanger: false }
            : false
        "
        @change="(pagination) => (page = pagination.current ?? 1)"
      >
        <template #bodyCell="{ column, record, text }">
          <span v-if="column.key === 'onHand' || column.key === 'available'">
            {{ qty(record[column.key]) }}
          </span>
          <template v-else>{{ text || '—' }}</template>
        </template>
        <template #emptyText>暂无关联履约库存</template>
      </Table>
    </template>
    <ProductStageStocks :product-id="productId" :show-empty="!showWarehouse" />
  </div>
</template>
