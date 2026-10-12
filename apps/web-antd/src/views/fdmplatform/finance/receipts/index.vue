<script setup lang="ts">
import MergedWorkspace from '../../components/MergedWorkspace.vue';
import DocumentWorkspace from '../../documents/DocumentWorkspace.vue';
import CashPartyList from '../cash/CashPartyList.vue';
import ContractReceivables from '../receivables/ContractReceivables.vue';

defineOptions({ name: 'FdmPlatformFinanceReceipts' });
/** Menu consolidation: former standalone menus redirect here with `?view=`. */
const documents = [
  'receipts|回款记录',
  'refunds|退款与冲销',
  'invoices|开票记录',
  'allocations|回款核销',
].map((entry) => {
  const [kind, title] = entry.split('|') as [string, string];
  return { key: kind, title, component: DocumentWorkspace, props: { kind } };
});
const views = [
  documents[0]!,
  { key: 'receivables', title: '按合同看应收', component: ContractReceivables },
  {
    key: 'customers',
    title: '客户回款',
    component: CashPartyList,
    props: { direction: 'IN' },
  },
  ...documents.slice(1),
];
</script>
<template><MergedWorkspace :views="views" /></template>
