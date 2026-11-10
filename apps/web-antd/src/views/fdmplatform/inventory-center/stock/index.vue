<script setup lang="ts">
import StockQuery from './StockQuery.vue';

defineOptions({ name: 'FdmInventoryStock' });
/**
 * 库存中心 · 库存查询：各仓库按产品的库存。工厂的库存也在这里——每个工厂一个原料仓（原料、辅料）、
 * 半成品仓（各道工序的半成品）和成品仓，工厂领料、报工自动生成生产领料、生产入库单。
 */
</script>
<template><StockQuery /></template>
