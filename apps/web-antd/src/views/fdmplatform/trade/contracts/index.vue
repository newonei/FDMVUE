<script setup lang="ts">
import ContractBoard from './ContractBoard.vue';

defineOptions({ name: 'FdmPlatformTradeContracts' });
</script>

<template>
  <ContractBoard sales-channel="FOREIGN" />
</template>
