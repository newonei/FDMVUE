<script setup lang="ts">
import type { FdmgongchangProductionOrderApi as Api } from '#/api/fdmgongchang/production-order';

import { computed } from 'vue';
import { useRouter } from 'vue-router';

import { useAccess } from '@vben/access';

import { navigationRoute } from '#/views/fdmplatform/documents/navigation';

const props = defineProps<{
  order: Pick<Api.Order, 'sourceContractId' | 'sourceOrderCode' | 'sourceOrderId'>;
}>();
const router = useRouter();
const { hasAccessByCodes } = useAccess();
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
    采购单 {{ order.sourceOrderCode }}
  </button>
  <span v-else>采购单 {{ order.sourceOrderCode }}</span>
</template>
