import { computed, watch } from 'vue';
import { useRouter } from 'vue-router';

import { referenceId } from '../../documents/navigation';
import { useOwnedRoute } from '../../documents/useOwnedRoute';
import { useRouteOwner } from '../../documents/useRouteOwner';

export function useWarehouseDocumentLink<T>(
  queryKey:
    | 'returnId'
    | 'stockInId'
    | 'stockOutId'
    | 'stocktakeId'
    | 'transferId',
  read: (id: string) => Promise<T>,
  show: (document: T) => void,
  showError: (error: unknown) => void,
) {
  const route = useOwnedRoute();
  const router = useRouter();
  const active = useRouteOwner();
  const linkedId = computed(() => referenceId(route.query[queryKey]));

  watch(
    [active, linkedId],
    async ([isActive, id], _, onCleanup) => {
      if (!isActive || !id) return;
      let current = true;
      onCleanup(() => {
        current = false;
      });
      try {
        const document = await read(id);
        if (current) show(document);
      } catch (error) {
        if (current) showError(error);
      }
    },
    { immediate: true },
  );

  function clearLink() {
    if (!active.value || route.query[queryKey] === undefined) return;
    const { [queryKey]: _linkedDocument, ...query } = route.query;
    void router.replace({ query });
  }

  return { active, clearLink, linkedId };
}
