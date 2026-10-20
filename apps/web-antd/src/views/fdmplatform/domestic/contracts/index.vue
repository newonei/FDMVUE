<script setup lang="ts">
import ContractBoard from '../../trade/contracts/ContractBoard.vue';

defineOptions({ name: 'FdmPlatformDomesticContracts' });
</script>

<template>
  <ContractBoard sales-channel="DOMESTIC" />
</template>
