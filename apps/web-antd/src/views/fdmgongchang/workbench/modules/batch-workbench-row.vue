<script setup lang="ts">
import type { Job } from '../use-job';

import { provideJob } from '../use-job';
import PickStep from './pick-step.vue';
import ReportStep from './report-step.vue';

const props = defineProps<{ job: Job; mode: 'issue' | 'report' }>();
const emit = defineEmits<{ confirmed: [] }>();
provideJob(props.job);
</script>

<template>
  <PickStep v-if="mode === 'issue'" embedded @next="emit('confirmed')" />
  <ReportStep v-else embedded />
</template>
