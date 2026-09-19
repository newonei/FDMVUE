<script setup lang="ts">
import { computed } from 'vue';

import { label as displayLabel } from '../../data';

const props = defineProps<{ label?: string; status?: string }>();
const tone = computed(() => {
  const status = props.status?.toUpperCase() ?? '';
  if (['CANCELLED', 'CLOSED', 'VOID'].includes(status)) return 'neutral';
  if (['EXCEPTION', 'FAILED', 'REJECTED', 'RETURNED'].includes(status))
    return 'danger';
  if (
    [
      'PARTIALLY_APPROVED',
      'PARTIALLY_RECEIVED',
      'PENDING',
      'REVIEW',
      'SUBMITTED',
    ].includes(status)
  )
    return 'attention';
  if (
    [
      'APPROVED',
      'COMPLETED',
      'CONFIRMED',
      'PAID',
      'RECEIVED',
      'VALID',
    ].includes(status)
  )
    return 'success';
  if (
    [
      'ARRIVAL',
      'ASSIGNED',
      'EXECUTING',
      'ORDER',
      'ORDERED',
      'PRODUCTION',
      'QUOTE',
    ].includes(status)
  )
    return 'active';
  return 'neutral';
});
</script>

<template>
  <span class="procurement-status" :data-tone="tone">
    <span class="procurement-status-dot" aria-hidden="true"></span>
    {{ label || (status ? displayLabel(status) : '待补齐') }}
  </span>
</template>
