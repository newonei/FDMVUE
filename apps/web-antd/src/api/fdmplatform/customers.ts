import type { MasterRecord, PageResult } from './index';

import { requestClient } from '#/api/request';

export interface Customer extends MasterRecord {
  version: number;
  contactSelection?: string;
  shortName?: string;
  country?: string;
  customerSource?: string;
  companyName?: string;
  sourceCountry?: string;
  sourceCustomerSource?: string;
  sourceCode?: string;
  province?: string;
  city?: string;
  address?: string;
  website?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  lastSyncedAt?: string;
  sourceUpdatedAt?: string;
}
export interface OkkiCustomerSource {
  externalId: string;
  name: string;
  shortName?: string;
  code?: string;
  sourceUpdatedAt?: string;
  localId?: string;
}
export interface OkkiCustomerPreview {
  customer: Partial<Customer> & { externalId: string; name: string };
  previewHash: string;
  existingId?: string;
  existingVersion?: number;
  fetchedAt: string;
}
export interface OkkiCustomerSearch {
  items: OkkiCustomerSource[];
  nextCursor: null | number;
  hasMore: boolean;
  scannedCount: number;
  remoteTotal: null | number;
  notice: string;
}
const base = '/fdmplatform/v1/customers';
export interface CountryOption {
  code: string;
  nameZh: string;
  nameEn: string;
  iso3: string;
  aliases?: string[];
}
export function getCustomerOptions() {
  return requestClient.get<{
    countries: CountryOption[];
    productCategories: { label: string; value: string }[];
  }>(`${base}/options`);
}
export function getCustomers(params: {
  active?: boolean;
  keyword?: string;
  pageNo: number;
  pageSize: number;
  sourceSystem?: string;
}) {
  return requestClient.get<PageResult<Customer>>(`${base}/page`, { params });
}
export function getCustomer(id: string) {
  return requestClient.get<Customer>(`${base}/${encodeURIComponent(id)}`);
}
export function saveCustomer(data: Record<string, unknown>) {
  return requestClient.post<Customer>(base, data);
}
export function setCustomerStatus(
  id: string,
  data: {
    active: boolean;
    expectedVersion: number;
    idempotencyKey: string;
  },
) {
  return requestClient.post<Customer>(
    `${base}/${encodeURIComponent(id)}/status`,
    data,
  );
}
export function getOkkiCustomerStatus() {
  return requestClient.get<{
    configured: boolean;
    enabled: boolean;
    message: string;
    missingFields: string[];
    readOnly: boolean;
  }>(`${base}/okki/status`);
}
export function searchOkkiCustomers(params: {
  cursor: number;
  keyword: string;
}) {
  return requestClient.get<OkkiCustomerSearch>(`${base}/okki/search`, {
    params,
    timeout: 120_000,
  });
}
export function previewOkkiCustomer(externalId: string) {
  return requestClient.get<OkkiCustomerPreview>(`${base}/okki/preview`, {
    params: { externalId },
    timeout: 120_000,
  });
}
export function syncOkkiCustomer(data: {
  country?: string;
  expectedVersion?: number;
  externalId: string;
  idempotencyKey: string;
  previewHash: string;
}) {
  return requestClient.post<Customer>(`${base}/okki/sync`, data, {
    timeout: 120_000,
  });
}
export function refreshOkkiCustomer(
  id: string,
  data: {
    country?: string;
    expectedVersion: number;
    idempotencyKey: string;
    previewHash: string;
  },
) {
  return requestClient.post<Customer>(
    `${base}/${encodeURIComponent(id)}/okki-refresh`,
    data,
    { timeout: 120_000 },
  );
}
