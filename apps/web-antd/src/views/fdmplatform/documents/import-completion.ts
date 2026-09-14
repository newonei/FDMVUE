import type { Contract, ContractItem } from '#/api/fdmplatform';

export function needsImportedValue(value: unknown) {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim() === '')
  );
}
export function importedContractGaps(contract: Contract) {
  const keys = [
    'companyId',
    'currency',
    'customerId',
    'businessType',
    'productCategory',
    'ownerUserId',
    'departmentId',
  ] as const;
  return keys.filter(
    (key) =>
      needsImportedValue(contract[key]) ||
      (['companyId', 'departmentId', 'ownerUserId'].includes(key) &&
        contract[key] === 0),
  );
}
export function importedItemGaps(item: ContractItem) {
  return (['skuId', 'unit', 'taxBasis', 'specification'] as const).filter(
    (key) => needsImportedValue(item[key]),
  );
}
export function importedCompletionPayload(
  contract: Contract,
  values: Record<string, unknown>,
  mappings: Record<string, Record<string, unknown>>,
) {
  if (!String(values.reason ?? '').trim())
    throw new Error('请填写补齐依据说明');
  const payload: Record<string, unknown> = { reason: values.reason };
  if (values.verifyCarryover === true) payload.verifyCarryover = true;
  for (const key of importedContractGaps(contract))
    if (!needsImportedValue(values[key])) payload[key] = values[key];
  const itemMappings = contract.items.flatMap((item) => {
    const change: Record<string, unknown> = { itemId: item.id };
    for (const key of importedItemGaps(item))
      if (!needsImportedValue(mappings[item.id]?.[key]))
        change[key] = mappings[item.id]![key];
    return Object.keys(change).length > 1 ? [change] : [];
  });
  if (itemMappings.length > 0) payload.itemMappings = itemMappings;
  if (Object.keys(payload).length === 1)
    throw new Error('请至少补齐一项缺少的资料');
  return payload;
}
