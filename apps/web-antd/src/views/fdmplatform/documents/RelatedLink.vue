<script setup lang="ts">
import type { RelatedTarget } from './navigation';

import { computed } from 'vue';
import { RouterLink } from 'vue-router';

import { navigationRoute } from './navigation';
const props = defineProps<{ target?: RelatedTarget }>();
const destination = computed(() =>
  props.target ? navigationRoute(props.target) : undefined,
);
</script>
<template>
  <RouterLink v-if="destination" class="business-reference" :to="destination">
    <slot></slot>
</RouterLink><span v-else><slot></slot></span>
</template>
<style scoped>
.business-reference {
  display: inline-block;
  max-width: 100%;
  vertical-align: baseline;
  color: #1677ff;
  cursor: pointer;
}

.business-reference:hover {
  text-decoration: underline;
}
</style>
