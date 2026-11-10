<script setup lang="ts">
import DocumentWorkspace from '../../documents/DocumentWorkspace.vue';

/** 内销部门「开票记录」：与外贸、财务同一份数据，这里只看内销合同的开票。 */
defineOptions({ name: 'FdmPlatformDomesticInvoices' });
</script>
<template>
  <DocumentWorkspace kind="invoices" sales-channel="DOMESTIC" />
</template>
