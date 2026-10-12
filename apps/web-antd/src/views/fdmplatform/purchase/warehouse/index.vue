<script setup lang="ts">
import MergedWorkspace from '../../components/MergedWorkspace.vue';
import StockIns from './StockIns.vue';
import StockOuts from './StockOuts.vue';
import Stocks from './Stocks.vue';
import Warehouses from './Warehouses.vue';

defineOptions({ name: 'FdmPlatformWarehouse' });
/**
 * 采购部门的仓库：外采成品与外采货的采购入库、销售出库都由采购办理（沿用金智做法）。
 * 工厂的原料、辅料与工序在制品归工厂部门，不在这里。
 */
const views = [
  { key: 'stock-ins', title: '采购入库', component: StockIns },
  { key: 'stock-outs', title: '销售出库', component: StockOuts },
  { key: 'stocks', title: '库存', component: Stocks },
  {
    key: 'ledger',
    title: '出入库流水',
    component: Stocks,
    props: { ledger: true },
  },
  { key: 'warehouses', title: '仓库', component: Warehouses },
];
</script>
<template><MergedWorkspace :views="views" /></template>
