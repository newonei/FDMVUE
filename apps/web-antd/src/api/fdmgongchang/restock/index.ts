import { requestClient } from '#/api/request';

import { factoryHeaders } from '../factory';

const BASE = '/fdmgongchang/restock';

export namespace FdmgongchangRestockApi {
  /** 常备物料：订单用掉了要补库。 */
  export interface StandingItem {
    productId: string;
    productName?: null | string;
    /** 已雕刻的常备图案款：true 补同图案，false 补对应空白。 */
    samePattern?: boolean | null;
  }

  export interface Setting {
    /** 补库订单交期 = 今天 + 几天。 */
    days?: null | number;
    items: StandingItem[];
  }

  export interface ProductOption {
    code?: null | string;
    displayName?: null | string;
    id: string;
    name?: null | string;
    specification?: null | string;
  }

  export type Status =
    | 'CANCELLED'
    | 'DONE'
    | 'FORECAST'
    | 'ORDERED'
    | 'PENDING_MAP';

  /** 补库台账一行。 */
  export interface Row {
    confirmedQuantity: number | string;
    consumedItemCode?: null | string;
    consumedProductName?: null | string;
    createTime?: null | number | string;
    forecastQuantity: number | string;
    id: number;
    orderedQuantity: number | string;
    remark?: null | string;
    restockCompletedQuantity?: null | number | string;
    restockOrderId?: null | number;
    restockOrderNo?: null | string;
    restockOrderStatus?: null | string;
    restockRequiredDate?: null | number[] | string;
    sourceOrderNo?: null | string;
    status: Status;
    targetProductId?: null | string;
    targetProductName?: null | string;
  }
}

export function getRestockLedger(status?: string) {
  return requestClient.get<FdmgongchangRestockApi.Row[]>(`${BASE}/ledger`, {
    headers: factoryHeaders(),
    params: { status: status || undefined },
  });
}

export function getRestockSetting() {
  return requestClient.get<FdmgongchangRestockApi.Setting>(`${BASE}/setting`, {
    headers: factoryHeaders(),
  });
}

export function saveRestockSetting(data: FdmgongchangRestockApi.Setting) {
  return requestClient.put<boolean>(`${BASE}/setting`, data, {
    headers: factoryHeaders(),
  });
}

export function searchStandingProducts(keyword: string) {
  return requestClient.get<FdmgongchangRestockApi.ProductOption[]>(
    `${BASE}/product-search`,
    {
      headers: factoryHeaders(),
      params: { keyword },
    },
  );
}
