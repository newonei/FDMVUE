<script lang="ts" setup>
import type { FdmNeimaoCrmProductApi } from '#/api/fdmneimaocrm/product';

import { useDescription } from '#/components/description';

import { useDetailBaseSchema } from '../data';

defineProps<{
  product: FdmNeimaoCrmProductApi.Product;
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
