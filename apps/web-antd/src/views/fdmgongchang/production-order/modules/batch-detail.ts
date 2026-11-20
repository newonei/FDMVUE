import type { AuxUsageDraft } from '../../shared/auxiliary-usage';
import type { RouteDraft } from '../shared';

export interface BatchDetailLine {
  aux: AuxUsageDraft[];
  key: string;
  quantity: null | number;
  remark: string;
  route: RouteDraft;
  unit?: null | string;
}

interface BatchDetailValues {
  quantity?: number;
  remark?: string;
  route?: RouteDraft;
}

export type BatchDetailPatch = BatchDetailValues & { key: string };

function sameRoute(current: RouteDraft, next: RouteDraft) {
  return current.routeId === next.routeId
    && current.steps.length === next.steps.length
    && current.steps.every((step, index) => step === next.steps[index]);
}

export function planBatchDetails(
  lines: BatchDetailLine[],
  { quantity, remark, route }: BatchDetailValues,
  overwrite: boolean,
) {
  const changes: BatchDetailPatch[] = [];
  const counts = { route: 0, quantity: 0, remark: 0 };
  const quantityUnits = new Set<string>();
  let overwritten = 0;
  let auxConflicts = 0;

  for (const line of lines) {
    const patch: BatchDetailPatch = { key: line.key };
    const hasRoute = line.route.steps.length > 0;
    const hasQuantity = line.quantity !== null;
    const currentRemark = line.remark.trim();

    if (route && (!hasRoute || overwrite) && !sameRoute(line.route, route)) {
      patch.route = route;
      counts.route++;
      if (line.aux.some(({ process }) => process && !route.steps.includes(process))) {
        auxConflicts++;
      }
    }
    if (quantity !== undefined && (!hasQuantity || overwrite) && line.quantity !== quantity) {
      patch.quantity = quantity;
      counts.quantity++;
      quantityUnits.add(line.unit?.trim() ?? '');
    }
    if (remark && (!currentRemark || overwrite) && currentRemark !== remark) {
      patch.remark = remark;
      counts.remark++;
    }

    if (patch.route || patch.quantity !== undefined || patch.remark !== undefined) {
      changes.push(patch);
      if ((patch.route && hasRoute) || (patch.quantity !== undefined && hasQuantity) || (patch.remark !== undefined && currentRemark)) {
        overwritten++;
      }
    }
  }
  return { auxConflicts, changes, counts, mixedUnits: quantityUnits.size > 1, overwritten };
}
