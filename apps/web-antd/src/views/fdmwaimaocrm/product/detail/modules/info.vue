<script lang="ts" setup>
import type { FdmWaimaoCrmProductApi } from '#/api/fdmwaimaocrm/product';

import { useDescription } from '#/components/description';

import { useDetailBaseSchema } from '../data';

defineProps<{
  product: FdmWaimaoCrmProductApi.Product;
}>();

const [ProductDescriptions] = useDescription({
  bordered: false,
  column: 4,
  schema: useDetailBaseSchema(),
});
</script>

<template>
  <div>
    <ProductDescriptions :data="product" />
  </div>
</template>
