import { requestClient } from '#/api/request';

export type Decimal = number | string;
export type BusinessRecord = Record<string, unknown> & {
  id: string;
  name?: string;
  status?: string;
  version?: number;
};
export interface Grant {
  id: string;
  userId: number;
  companyId: number;
  role: string;
  scope: 'ALL' | 'DEPARTMENT' | 'OWN';
  departmentId?: number;
  expiresAt?: string;
  reason?: string;
  active?: boolean;
  revoked?: boolean;
}
export interface Access {
  userId: number;
  grants: Grant[];
  companies: { companyId: number; companyName?: string; roles: string[] }[];
  roles: string[];
}
export interface MasterRecord extends BusinessRecord {
  type: string;
  companyId: number;
  name: string;
  code: string;
  sourceSystem: string;
  externalId?: string;
  specification?: string;
  unit?: string;
  active: boolean;
}
export interface ContractItem extends BusinessRecord {
  skuId: string;
  skuName: string;
  specVersion: string;
  specification: string;
  unit: string;
  quantity: Decimal;
  unitPrice?: Decimal;
  requiredDate?: string;
}
export interface Contract extends BusinessRecord {
  code: string;
  name: string;
  companyId: number;
  departmentId: number;
  ownerUserId: number;
  customerId: string;
  customerName: string;
  businessType: string;
  currency: string;
  amount?: Decimal;
  status: string;
  version: number;
  businessVersion: number;
  paymentTerms?: string;
  signedDate?: string;
  items: ContractItem[];
  requests?: BusinessRecord[];
  assignments?: BusinessRecord[];
  quotes?: BusinessRecord[];
  plans?: BusinessRecord[];
  purchaseOrders?: BusinessRecord[];
  productionRequirements?: BusinessRecord[];
  receipts?: BusinessRecord[];
  shipments?: BusinessRecord[];
  aiReviews?: BusinessRecord[];
  finance?: {
    allocations?: BusinessRecord[];
    costs?: BusinessRecord[];
    invoices?: BusinessRecord[];
    receipts?: BusinessRecord[];
  };
  financeSummary?: Record<string, unknown>;
  allowedActions: string[];
}
export interface StockView {
  version: number;
  pools: BusinessRecord[];
  events: BusinessRecord[];
  reservations: BusinessRecord[];
}

const base = '/fdmplatform/v1';

export function newIdempotencyKey() {
  return crypto.randomUUID();
}
export function getAccess() {
  return requestClient.get<Access>(`${base}/access`);
}
export function getContracts(companyId: number) {
  return requestClient.get<Contract[]>(`${base}/contracts`, {
    params: { companyId },
  });
}
export function getContract(id: string) {
  return requestClient.get<Contract>(
    `${base}/contracts/${encodeURIComponent(id)}`,
  );
}
export function createContract(data: Record<string, unknown>) {
  return requestClient.post<Contract>(`${base}/contracts`, data);
}
export function contractAction(
  id: string,
  action: string,
  expectedVersion: number,
  idempotencyKey: string,
  payload: Record<string, unknown>,
) {
  return requestClient.post<Contract>(
    `${base}/contracts/${encodeURIComponent(id)}/actions`,
    { action, expectedVersion, idempotencyKey, payload },
  );
}
export function getMasterData(companyId: number, type: string) {
  return requestClient.get<MasterRecord[]>(`${base}/master-data`, {
    params: { companyId, type },
  });
}
export function saveMasterData(data: Record<string, unknown>) {
  return requestClient.post<MasterRecord>(`${base}/master-data`, data);
}
export function getStock(companyId: number) {
  return requestClient.get<StockView>(`${base}/stock`, {
    params: { companyId },
  });
}
export function stockAction(data: Record<string, unknown>) {
  return requestClient.post<BusinessRecord>(`${base}/stock/actions`, data);
}
export function getGrants(companyId: number) {
  return requestClient.get<Grant[]>(`${base}/grants`, {
    params: { companyId },
  });
}
export function createGrant(data: Record<string, unknown>) {
  return requestClient.post<Grant>(`${base}/grants`, data);
}
export function revokeGrant(id: string, data: Record<string, unknown>) {
  return requestClient.post<boolean>(
    `${base}/grants/${encodeURIComponent(id)}/revoke`,
    data,
  );
}
export function getAiReviews(contractId: string) {
  return requestClient.get<BusinessRecord[]>(
    `${base}/contracts/${encodeURIComponent(contractId)}/ai-reviews`,
  );
}
export function requestAiReview(
  contractId: string,
  data: Record<string, unknown>,
) {
  return requestClient.post<BusinessRecord>(
    `${base}/contracts/${encodeURIComponent(contractId)}/ai-reviews`,
    data,
  );
}
export function refreshAiReview(contractId: string, reviewId: string) {
  return requestClient.post<BusinessRecord>(
    `${base}/contracts/${encodeURIComponent(contractId)}/ai-reviews/${encodeURIComponent(reviewId)}/refresh`,
  );
}
export function getRoutingRules(companyId: number) {
  return requestClient.get<BusinessRecord[]>(`${base}/routing-rules`, {
    params: { companyId },
  });
}
export function saveRoutingRule(data: Record<string, unknown>) {
  return requestClient.post<BusinessRecord>(`${base}/routing-rules`, data);
}
export function getContractAudit(contractId: string) {
  return requestClient.get<Record<string, unknown>[]>(
    `${base}/contracts/${encodeURIComponent(contractId)}/audit`,
  );
}
export function getImports(companyId: number) {
  return requestClient.get<BusinessRecord[]>(`${base}/imports`, {
    params: { companyId },
  });
}
export function getImport(id: string) {
  return requestClient.get<BusinessRecord>(
    `${base}/imports/${encodeURIComponent(id)}`,
  );
}
export function validateImport(data: Record<string, unknown>) {
  return requestClient.post<BusinessRecord>(`${base}/imports`, data);
}
export function confirmImport(id: string, data: Record<string, unknown>) {
  return requestClient.post<BusinessRecord>(
    `${base}/imports/${encodeURIComponent(id)}/confirm`,
    data,
  );
}
