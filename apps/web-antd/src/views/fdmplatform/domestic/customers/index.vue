<script setup lang="ts">
import CustomerManagement from '../../trade/customers/index.vue';

defineOptions({ name: 'FdmPlatformDomesticCustomers' });
</script>

<template>
  <CustomerManagement sales-channel="DOMESTIC" />
</template>
