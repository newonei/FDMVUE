import type { MigrationInfo } from './business-documents';

import { requestClient } from '#/api/request';

export { newIdempotencyKey } from './idempotency';

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
  sharedAccess?: boolean;
  userId: number;
  superAdmin?: boolean;
  departmentId?: number;
  canBootstrap?: boolean;
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
  remark?: string;
}
export interface ContractItem extends BusinessRecord {
  skuId: string;
  skuCode?: string;
  skuName: string;
  productVersion?: null | number;
  productImageUrl?: string;
  specVersion: string;
  specification: string;
  unit: string;
  quantity: Decimal;
  unitPrice?: Decimal | null;
  requiredDate?: string;
  taxBasis?: string;
  material?: string;
  size?: string;
  color?: string;
  shape?: string;
  printing?: string;
  packaging?: string;
  attachmentIds?: string[];
  priceSourceId?: string;
  priceSourceVersion?: number;
  productAttachmentRefs?: {
    id: string;
    name: string;
    productId: string;
    sha256: string;
    size: number;
    type: string;
  }[];
}
export interface Contract extends BusinessRecord {
  migration?: MigrationInfo;
  blockReasons?: string[];
  additionalAmount?: Decimal;
  companyName?: string;
  code: string;
  name: string;
  companyId: number;
  departmentId: number;
  ownerUserId: number;
  customerId: string;
  customerName: string;
  businessType: string;
  productCategory?: null | string;
  currency: string;
  amount?: Decimal;
  status: string;
  version: number;
  businessVersion: number;
  alibabaTradeAssuranceNo?: string;
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
  total?: number;
  version: number;
  pools: BusinessRecord[];
  events: BusinessRecord[];
  reservations: BusinessRecord[];
}

export type PageResource =
  | 'allocations'
  | 'arrivals'
  | 'assignments'
  | 'contracts'
  | 'costs'
  | 'invoices'
  | 'outbound-shipments'
  | 'production-progress'
  | 'purchase-intake'
  | 'purchase-invoices'
  | 'purchase-orders'
  | 'purchase-plans'
  | 'purchase-requests'
  | 'purchase-returns'
  | 'quotes'
  | 'receipt-records'
  | 'receipt-refunds'
  | 'receipts'
  | 'sales-returns'
  | 'stock-ins'
  | 'stock-outs'
  | 'stocktakes';
export interface PageQuery {
  companyId: number;
  pageNo: number;
  pageSize: number;
  keyword?: string;
  status?: string;
  assignmentStatus?: string;
  contractId?: string;
  ownerUserId?: number;
}
export interface PageResult<T> {
  list: T[];
  total: number;
}
export interface DocumentRow extends BusinessRecord {
  standaloneId?: string;
  recordType?: string;
  migration?: MigrationInfo;
  blockReasons?: string[];
  contractId: string;
  customerId?: string;
  customerName?: string;
  contractCode: string;
  contractName: string;
  contractVersion: number;
  companyId: number;
  contractStatus: string;
  allowedActions: string[];
  record: BusinessRecord;
}
export interface Directory {
  users: {
    departmentId?: number;
    departmentName?: string;
    id: number;
    nickname: string;
  }[];
  departments: { id: number; name: string }[];
  companies: { companyId: number; companyName: string }[];
}
export interface ContractAttachment extends BusinessRecord {
  name: string;
  type: string;
  size: number;
  sha256: string;
  category: string;
  uploadedBy: number;
  createdAt: string;
  targets?: { id: string; kind: string }[];
}
export interface AttachmentTarget {
  targetKind: string;
  targetId: string;
}
export interface AttachmentView {
  enabled: boolean;
  uploadCategories: string[];
  items: ContractAttachment[];
}
export interface MasterSourceRecord {
  type: string;
  sourceSystem: string;
  externalId: string;
  name: string;
  code: string;
  specification?: string;
  unit?: null | string;
  sourceKind: string;
  sourceLabel: string;
}

const base = '/fdmplatform/v1';

export function getAttachments(contractId: string, target?: AttachmentTarget) {
  return requestClient.get<AttachmentView>(
    `${base}/contracts/${encodeURIComponent(contractId)}/attachments`,
    { params: target },
  );
}
export function uploadAttachment(
  contractId: string,
  file: File,
  category: string,
  idempotencyKey: string,
  target?: AttachmentTarget,
) {
  return requestClient.upload<ContractAttachment>(
    `${base}/contracts/${encodeURIComponent(contractId)}/attachments`,
    { file, category, idempotencyKey, ...target },
    { timeout: 300_000 },
  );
}
export function downloadAttachment(contractId: string, attachmentId: string) {
  return requestClient.download<Blob>(
    `${base}/contracts/${encodeURIComponent(contractId)}/attachments/${encodeURIComponent(attachmentId)}/download`,
  );
}
export function getMasterSourceTypes(companyId: number) {
  return requestClient.get<
    {
      description: string;
      label: string;
      sourceKinds: string[];
      type: string;
    }[]
  >(`${base}/master-sources/types`, { params: { companyId } });
}
export function getMasterSources(params: {
  companyId: number;
  keyword?: string;
  pageNo: number;
  pageSize: number;
  sourceKind?: string;
  type: string;
}) {
  return requestClient.get<PageResult<MasterSourceRecord>>(
    `${base}/master-sources`,
    { params },
  );
}

export function getBusinessPage<T extends Contract | DocumentRow>(
  resource: PageResource,
  params: PageQuery,
) {
  return requestClient.get<PageResult<T>>(`${base}/${resource}/page`, {
    params,
  });
}
export function getDirectory(companyId: number, keyword?: string) {
  return requestClient.get<Directory>(`${base}/directory`, {
    params: { companyId, keyword },
  });
}
export function getSetupOptions(keyword?: string) {
  return requestClient.get<Directory>(`${base}/setup/options`, {
    params: { keyword },
  });
}
export function bootstrapAccess(data: Record<string, unknown>) {
  return requestClient.post<{ companyId: number; grantIds: string[] }>(
    `${base}/setup/bootstrap`,
    data,
  );
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
export function updateMasterData(
  type: string,
  id: string,
  data: Record<string, unknown>,
) {
  return requestClient.put<MasterRecord>(
    `${base}/master-data/${encodeURIComponent(type)}/${encodeURIComponent(id)}`,
    data,
  );
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
