import type { BusinessDocument } from './business-documents';
import type { CustomsBatch } from './customs';
import type { Contract } from './index';
import type { ProcurementFinanceRecord } from './procurement-finance';

import { requestClient } from '#/api/request';

import { businessDocumentAction } from './business-documents';
import { createCustoms, customsAction } from './customs';
import { contractAction, createContract } from './index';
import {
  createProcurementFinance,
  procurementFinanceAction,
} from './procurement-finance';
import { submissionFormData } from './submission-files';

const base = '/fdmplatform/v1/submissions';
function submit<T>(
  path: string,
  request: unknown,
  files: File[],
  categories?: string[],
) {
  // The standard uploader indexes arrays; these endpoints require repeated multipart "files" parts.
  return requestClient.post<T>(
    `${base}${path}`,
    submissionFormData(request, files, categories),
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 300_000,
    },
  );
}

export function createContractWithAttachments(
  body: Parameters<typeof createContract>[0],
  files: File[],
) {
  return files.length > 0
    ? submit<Contract>('/contracts', body, files)
    : createContract(body);
}
export function businessDocumentActionWithAttachments(
  id: string,
  body: Parameters<typeof businessDocumentAction>[1],
  files: File[],
) {
  return files.length > 0
    ? submit<BusinessDocument>(
        `/business-documents/${encodeURIComponent(id)}/actions`,
        body,
        files,
      )
    : businessDocumentAction(id, body);
}
export function contractActionWithAttachments(
  id: string,
  action: string,
  expectedVersion: number,
  idempotencyKey: string,
  payload: Record<string, unknown>,
  files: File[],
) {
  return files.length > 0
    ? submit<Contract>(
        `/contracts/${encodeURIComponent(id)}/actions`,
        { action, expectedVersion, idempotencyKey, payload },
        files,
      )
    : contractAction(id, action, expectedVersion, idempotencyKey, payload);
}
export function createProcurementFinanceWithAttachments(
  body: Parameters<typeof createProcurementFinance>[0],
  files: File[],
) {
  return files.length > 0
    ? submit<ProcurementFinanceRecord>('/procurement-finance', body, files)
    : createProcurementFinance(body);
}
export function procurementFinanceActionWithAttachments(
  id: string,
  body: Parameters<typeof procurementFinanceAction>[1],
  files: File[],
) {
  return files.length > 0
    ? submit<ProcurementFinanceRecord>(
        `/procurement-finance/${encodeURIComponent(id)}/actions`,
        body,
        files,
      )
    : procurementFinanceAction(id, body);
}
export function createCustomsWithAttachments(
  body: Parameters<typeof createCustoms>[0],
  files: File[],
  fileCategories?: string[],
) {
  return files.length > 0
    ? submit<CustomsBatch>('/customs', body, files, fileCategories)
    : createCustoms(body);
}
export function customsActionWithAttachments(
  id: string,
  expectedVersion: number,
  idempotencyKey: string,
  action: string,
  payload: Record<string, unknown>,
  files: File[],
  fileCategories?: string[],
) {
  return files.length > 0
    ? submit<CustomsBatch>(
        `/customs/${encodeURIComponent(id)}/actions`,
        { expectedVersion, idempotencyKey, action, payload },
        files,
        fileCategories,
      )
    : customsAction(id, expectedVersion, idempotencyKey, action, payload);
}
