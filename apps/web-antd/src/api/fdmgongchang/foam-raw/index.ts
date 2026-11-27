import { factoryHeaders } from '#/api/fdmgongchang/factory';
import { requestClient } from '#/api/request';

export interface FoamRawMaterial {
  itemId: number;
  low: boolean;
  materialCode: string;
  materialName: string;
  observedAt?: null | number | string;
  packageWeight?: null | number;
  pendingQuantity: number;
  remainingQuantity?: null | number;
  thresholdQuantity?: null | number;
  warehouseQuantity: number;
}

export interface FoamRawIssue {
  id: number;
  itemId: number;
  lineId: number;
  materialName: string;
  occurredOn: string;
  quantity: number;
  returnedQuantity: number;
  warehouseDocNo?: string;
}

export interface FoamRawOrder {
  createdAt: number | string;
  creator?: string;
  id: number;
  issues: FoamRawIssue[];
  lines: {
    id: number;
    issuedQuantity: number;
    itemId: number;
    materialName: string;
    requestedQuantity: number;
  }[];
  orderNo: string;
  remark?: string;
  status: 'CANCELLED' | 'ISSUED' | 'PARTIAL' | 'PENDING';
}

export interface FoamRawInventoryLine {
  countedQuantity?: null | number;
  issuedQuantity: number;
  itemId: number;
  materialName: string;
  previousQuantity?: null | number;
  returnedQuantity: number;
  usedQuantity?: null | number;
}

export interface FoamRawInventory {
  confirmed: boolean;
  lines: FoamRawInventoryLine[];
  month: string;
}

const base = '/fdmgongchang/foam-raw';

export function getFoamRawMaterials(factoryId: number) {
  return requestClient.get<FoamRawMaterial[]>(`${base}/materials`, {
    headers: factoryHeaders(factoryId),
  });
}

export function getFoamRawOrders(
  factoryId: number,
  pageNo: number,
  pageSize: number,
) {
  return requestClient.get<{ list: FoamRawOrder[]; total: number }>(
    `${base}/orders`,
    {
      headers: factoryHeaders(factoryId),
      params: { pageNo, pageSize },
    },
  );
}

export function getFoamRawInventory(factoryId: number, month: string) {
  return requestClient.get<FoamRawInventory>(`${base}/inventory`, {
    headers: factoryHeaders(factoryId),
    params: { month },
  });
}

export function applyFoamRawOrder(
  factoryId: number,
  data: {
    lines: { itemId: number; quantity: number }[];
    remark?: string;
    requestKey: string;
  },
) {
  return requestClient.post<number>(`${base}/apply`, data, {
    headers: factoryHeaders(factoryId),
  });
}

export function issueFoamRawOrder(
  factoryId: number,
  data: {
    lines: { lineId: number; quantity: number }[];
    occurredOn?: string;
    orderId: number;
    requestKey: string;
  },
) {
  return requestClient.post<number>(`${base}/issue`, data, {
    headers: factoryHeaders(factoryId),
  });
}

export function returnFoamRawIssue(
  factoryId: number,
  data: {
    issueId: number;
    occurredOn?: string;
    quantity: number;
    reason: string;
    requestKey: string;
  },
) {
  return requestClient.post<number>(`${base}/return`, data, {
    headers: factoryHeaders(factoryId),
  });
}

export function cancelFoamRawOrder(factoryId: number, orderId: number) {
  return requestClient.post<boolean>(
    `${base}/cancel`,
    { orderId },
    { headers: factoryHeaders(factoryId) },
  );
}

export function observeFoamRawMaterial(
  factoryId: number,
  data: {
    itemId: number;
    low?: boolean;
    remainingQuantity?: number;
  },
) {
  return requestClient.post<boolean>(`${base}/observe`, data, {
    headers: factoryHeaders(factoryId),
  });
}

export function saveFoamRawMaterialSetting(
  factoryId: number,
  data: {
    itemId: number;
    packageWeight?: number;
    thresholdQuantity: number;
  },
) {
  return requestClient.post<boolean>(`${base}/material-setting`, data, {
    headers: factoryHeaders(factoryId),
  });
}

export function confirmFoamRawInventory(
  factoryId: number,
  data: {
    lines: {
      countedQuantity: number;
      itemId: number;
      openingQuantity?: number;
    }[];
    month: string;
  },
) {
  return requestClient.post<boolean>(`${base}/inventory/confirm`, data, {
    headers: factoryHeaders(factoryId),
  });
}
