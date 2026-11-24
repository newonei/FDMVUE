import type { FdmgongchangProductionOrderApi as Api, FdmgongchangSupplyMatchApi as MatchApi } from '#/api/fdmgongchang/production-order';
import type { ProductStructure } from '#/api/fdmplatform/products';

import { shallowRef, watch } from 'vue';

import { getPurchaseSheet } from '#/api/fdmgongchang/production-order';

import { purchaseSheetStructure } from './purchase-sheet-structure';

export type RoutePurchaseReference =
  | 'loading'
  | 'unavailable'
  | ReadonlyMap<string, ProductStructure>;

export function routePurchaseReferencesFromSheet(
  { details, order }: Api.PurchaseSheet,
  options?: MatchApi.TargetOptions,
): ReadonlyMap<string, ProductStructure> {
  return new Map(order.lines.map((line) => [
    line.id,
    purchaseSheetStructure(line, details?.lineExtras?.[line.id], options),
  ]));
}

export function useRoutePurchaseReference(orderId: () => number | undefined) {
  const reference = shallowRef<RoutePurchaseReference>();

  watch(
    orderId,
    async (id, _, onCleanup) => {
      reference.value = id ? 'loading' : undefined;
      if (!id) return;

      let active = true;
      onCleanup(() => { active = false; });
      try {
        const sheet = await getPurchaseSheet(id);
        if (active) reference.value = routePurchaseReferencesFromSheet(sheet);
      } catch {
        if (active) reference.value = 'unavailable';
      }
    },
    { immediate: true },
  );

  return reference;
}

export function routePurchaseReferenceProps(
  reference: RoutePurchaseReference | undefined,
  sourceLineId: null | string | undefined,
) {
  if (typeof reference === 'string') return { purchaseState: reference };
  if (!reference) return {};

  const value = sourceLineId ? reference.get(sourceLineId) : undefined;
  return value ? { value } : { purchaseState: 'unavailable' as const };
}
