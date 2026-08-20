<script lang="ts" setup>
import type { FdmNeimaoCrmCustomerApi } from '#/api/fdmneimaocrm/customer';

import { Divider } from 'ant-design-vue';

import { useDescription } from '#/components/description';
import { useFollowUpDetailSchema } from '#/views/fdmneimaocrm/followup/data';

import { useDetailBaseSchema } from '../data';

defineProps<{
  customer: FdmNeimaoCrmCustomerApi.Customer; // 客户信息
}>();

const [BaseDescriptions] = useDescription({
  title: '基本信息',
  bordered: false,
  column: 4,
  class: 'mx-4',
  schema: useDetailBaseSchema(),
});

const [SystemDescriptions] = useDescription({
  title: '系统信息',
  bordered: false,
  column: 3,
  class: 'mx-4',
  schema: useFollowUpDetailSchema(),
});
</script>

<template>
  <div>
    <BaseDescriptions :data="customer" />
    <Divider />
    <SystemDescriptions :data="customer" />
  </div>
</template>
