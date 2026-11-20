import { requestClient } from '#/api/request';

export interface SupplierImportResult {
  createdCount: number;
  failedCount: number;
  issues: { code: string; message: string; row: number }[];
  skippedCount: number;
  updatedCount: number;
}

const base = '/fdmplatform/v1/suppliers';

export function downloadSupplierImportTemplate() {
  return requestClient.download<Blob>(`${base}/import-template`, {
    silent: true,
  });
}

export function importSuppliers(file: File) {
  return requestClient.upload<SupplierImportResult>(
    `${base}/import`,
    { file },
    { silent: true, timeout: 300_000 },
  );
}
