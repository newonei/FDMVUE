<script setup lang="ts">
import DocumentWorkspace from '../../documents/DocumentWorkspace.vue';

/** 外贸部门「开票记录」：与内销、财务同一份数据，这里只看外贸合同的开票。 */
defineOptions({ name: 'FdmPlatformTradeInvoices' });
</script>
<template>
  <DocumentWorkspace kind="invoices" sales-channel="FOREIGN" />
</template>
