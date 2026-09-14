/** Product identity comes from the selected contract snapshot, never from the whole catalog. */
export function documentActionDataNeeds(action?: string) {
  const stock =
    action === 'RECORD_ARRIVAL' || Boolean(action?.startsWith('STOCK_'));
  return {
    stock,
    suppliers: false,
    warehouses: false,
  };
}
