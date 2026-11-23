<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';

import BusinessDocumentDetail from '../../documents/BusinessDocumentDetail.vue';
import { referenceId, withoutDetailQuery } from '../../documents/navigation';
import { useOwnedRoute } from '../../documents/useOwnedRoute';
import { useRouteOwner } from '../../documents/useRouteOwner';
import Stocktakes from '../components/Stocktakes.vue';

defineOptions({ name: 'FdmInventoryStocktake' });

const route = useOwnedRoute();
const router = useRouter();
const active = useRouteOwner();
const legacyId = computed(() => referenceId(route.query.standaloneId));

function closeLegacyDetail() {
  if (active.value)
    void router.replace({ query: withoutDetailQuery(route.query) });
}
</script>
<template>
  <Stocktakes />
  <BusinessDocumentDetail
    v-if="active && legacyId"
    open
    :id="legacyId"
    expected-type="STOCKTAKE"
    @close="closeLegacyDetail"
  />
</template>
