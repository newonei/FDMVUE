<script setup lang="ts">
import type { FdmgongchangProductionOrderApi as Api } from '#/api/fdmgongchang/production-order';

import { computed } from 'vue';
import { useRouter } from 'vue-router';

import { useAccess } from '@vben/access';

import { navigationRoute } from '#/views/fdmplatform/documents/navigation';

const props = defineProps<{
  codeOnly?: boolean;
  order: Pick<Api.Order, 'sourceContractId' | 'sourceOrderCode' | 'sourceOrderId'>;
}>();
const router = useRouter();
const { hasAccessByCodes } = useAccess();
const label = computed(() => props.codeOnly ? props.order.sourceOrderCode : `采购单 ${props.order.sourceOrderCode}`);
const target = computed(() => {
  if (!props.order.sourceOrderId || !hasAccessByCodes(['fdmplatform:orders:query'])) {
    return undefined;
  }
  return navigationRoute({
    type: 'document',
    kind: 'orders',
    contractId: props.order.sourceContractId || 'standalone',
    documentId: props.order.sourceOrderId,
  });
});
</script>

<template>
  <button v-if="target" type="button" class="text-primary hover:underline" @click.stop="router.push(target)">
    {{ label }}
  </button>
  <span v-else>{{ label }}</span>
</template>
