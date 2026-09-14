import type { BusinessRecord, PageResult } from './index';

import { requestClient } from '#/api/request';
export function getStockPage(params: {
  contractId?: string;
  keyword?: string;
  pageNo: number;
  pageSize: number;
  skuId?: string;
  specVersion?: string;
  warehouseId?: string;
}) {
  return requestClient.get<PageResult<BusinessRecord>>(
    '/fdmplatform/v1/stock/page',
    { params: { companyId: 0, ...params } },
  );
}
export function getStockPool(id: string) {
  return requestClient.get<BusinessRecord>(
    `/fdmplatform/v1/stock/${encodeURIComponent(id)}`,
    { params: { companyId: 0 } },
  );
}
/** Loads only this contract's candidate/reserved pools, never the tenant's full event ledger. */
export async function getContractStockPools(contractId: string) {
  const pools: BusinessRecord[] = [];
  for (let pageNo = 1; ; pageNo++) {
    const page = await getStockPage({ contractId, pageNo, pageSize: 100 });
    pools.push(...page.list);
    if (pools.length >= page.total || page.list.length === 0) break;
  }
  return { pools };
}
