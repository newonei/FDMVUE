<script lang="ts" setup>
import type { FdmProductApi } from '#/api/fdmproduct/product';

import { computed } from 'vue';

import { Tag } from 'ant-design-vue';

import { productStatusMeta } from '../display';

const props = defineProps<{ status: FdmProductApi.CommonStatus }>();
const meta = computed(() => productStatusMeta(props.status));
</script>

<template>
  <Tag :color="meta.color">{{ meta.label }}</Tag>
</template>
