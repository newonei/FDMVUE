<script lang="ts" setup>
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';

import { usePerformancePath } from '../shared/route';

defineOptions({ name: 'FdmPerformanceMockWorkbench' });

const router = useRouter();
const { performancePath } = usePerformancePath();

onMounted(() => {
  router.replace(performancePath('/dashboard'));
});
</script>

<template>
  <div></div>
</template>
