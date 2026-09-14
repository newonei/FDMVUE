import type { MasterRecord, PageResult } from './index';

import { requestClient } from '#/api/request';

export type MasterType =
  | 'CUSTOMER'
  | 'SKU'
  | 'STOCK_OWNER'
  | 'SUPPLIER'
  | 'WAREHOUSE';
export function getMasterPage(params: {
  active?: boolean;
  keyword?: string;
  pageNo: number;
  pageSize: number;
  type: MasterType;
}) {
  return requestClient.get<PageResult<MasterRecord>>(
    '/fdmplatform/v1/master-data/page',
    { params: { companyId: 0, ...params } },
  );
}
export function getMasterRecord(type: MasterType, id: string) {
  return requestClient.get<MasterRecord>(
    `/fdmplatform/v1/master-data/${type}/${encodeURIComponent(id)}`,
    { params: { companyId: 0 } },
  );
}
