import type { BusinessDocument } from './business-documents';
import type { CustomsBatch } from './customs';
import type { Contract } from './index';

import { businessDocumentAction } from './business-documents';
import { createCustoms, customsAction } from './customs';
import { contractAction, createContract } from './index';
import {
  createProcurementFinance,
  procurementFinanceAction,
} from './procurement-finance';
import { submitWithAttachments as submit } from './submission-request';

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
  return createProcurementFinance(body, files);
}
export function procurementFinanceActionWithAttachments(
  id: string,
  body: Parameters<typeof procurementFinanceAction>[1],
  files: File[],
) {
  return procurementFinanceAction(id, body, files);
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
