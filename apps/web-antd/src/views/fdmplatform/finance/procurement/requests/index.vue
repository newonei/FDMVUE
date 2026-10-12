<script setup lang="ts">
import MergedWorkspace from '../../../components/MergedWorkspace.vue';
import CashPartyList from '../../cash/CashPartyList.vue';
import FinanceWorkspace from '../index.vue';
import ReimbursementWorkspace from '../reimbursements/ReimbursementWorkspace.vue';

defineOptions({ name: 'FdmPlatformProcurementRequests' });
/** Menu consolidation: former standalone menus redirect here with `?view=`. */
const views = [
  {
    key: 'requests',
    title: '采购请款',
    component: FinanceWorkspace,
    props: { type: 'REQUEST' },
  },
  {
    key: 'payments',
    title: '采购付款',
    component: FinanceWorkspace,
    props: { type: 'PAYMENT' },
  },
  {
    key: 'suppliers',
    title: '供应商付款',
    component: CashPartyList,
    props: { direction: 'OUT' },
  },
  {
    key: 'reimbursements',
    title: '费用报销',
    component: ReimbursementWorkspace,
  },
];
</script>
<template><MergedWorkspace :views="views" /></template>
