import type { BusinessRecord, Contract } from '#/api/fdmplatform';

import BigNumber from 'bignumber.js';

import { rows } from '../data';

export const transferStatusOptions = [
  { value: 'PENDING', label: '待转采购' },
  { value: 'UNTRANSFERRED', label: '未转采购' },
  { value: 'PARTIALLY_TRANSFERRED', label: '部分已转' },
  { value: 'TRANSFERRED', label: '全部已转' },
];

export function transferStatusLabel(value: unknown) {
  return (
    transferStatusOptions.find((option) => option.value === value)?.label ??
    '待核实'
  );
}

function quantity(value: unknown) {
  const result = new BigNumber(String(value ?? 0));
  return result.isFinite() ? BigNumber.maximum(0, result) : new BigNumber(0);
}

export function requestRemainingQuantity(line: BusinessRecord): string {
  return quantity(line.remainingQuantity).toFixed(0);
}

export function requestAvailableQuantity(line: BusinessRecord): string {
  return line.reconciliationRequired
    ? '0'
    : quantity(line.availableQuantity).toFixed(0);
}

/** A task entry can buy only that task's request line; request entries keep each original line identity. */
export function transferableRequestLines(contract: Contract, sourceId: string) {
  const assignment = contract.assignments?.find(
    (entry) => entry.id === sourceId,
  );
  const request = contract.requests?.find(
    (entry) => entry.id === (assignment?.requestId ?? sourceId),
  );
  if (!request || request.status === 'CANCELLED') return [];
  if (
    assignment &&
    (assignment.status === 'CANCELLED' || assignment.method !== 'BUY')
  )
    return [];
  return rows(request.items).flatMap((line) => {
    if (!line.id || line.reconciliationRequired) return [];
    if (assignment && assignment.requestItemId !== line.id) return [];
    const remaining = requestAvailableQuantity(assignment ?? line);
    if (!quantity(remaining).gt(0)) return [];
    return [
      {
        line,
        requestId: String(request.id),
        assignmentId: assignment ? String(assignment.id) : undefined,
        remaining,
      },
    ];
  });
}

export function hasTransferableRequestItems(
  contract: Contract,
  request: BusinessRecord,
) {
  return transferableRequestLines(contract, String(request.id)).length > 0;
}
