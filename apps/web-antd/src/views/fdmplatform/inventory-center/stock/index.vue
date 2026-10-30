<script setup lang="ts">
import MergedWorkspace from '../../components/MergedWorkspace.vue';
import Stocks from '../../purchase/warehouse/Stocks.vue';
import FactoryStocks from '../components/FactoryStocks.vue';

defineOptions({ name: 'FdmInventoryStock' });
/**
 * 库存中心 · 库存查询：各仓库的成品与外采货（按产品），各工厂的工序库存（原料、半成品、待入库成品、辅料）。
 * 两本账分开记：工厂做好的货生产入库进本厂仓库后才出现在仓库库存里。
 */
const views = [
  { key: 'warehouse', title: '仓库库存', component: Stocks },
  { key: 'factory', title: '工厂工序库存', component: FactoryStocks },
];
</script>
<template><MergedWorkspace :views="views" /></template>
