import type { ProductColorMode } from './products';

import { requestClient } from '#/api/request';

export interface RepairColors {
  colorMode?: null | ProductColorMode;
  colorCode?: null | string;
  frontColor?: null | string;
  backColor?: null | string;
}
export interface ProductColorRepairRow {
  productId: string;
  version: number;
  code: string;
  name: string;
  model?: null | string;
  active: boolean;
  current: RepairColors;
  suggested: RepairColors;
  singleText?: null | string;
  frontText?: null | string;
  backText?: null | string;
  status:
    | 'ALREADY_SET'
    | 'CONFLICT'
    | 'INCOMPLETE'
    | 'NEEDS_COLOR'
    | 'NEEDS_DIRECTION'
    | 'READY'
    | 'UNRECOGNIZED';
  reasons: string[];
  canApply: boolean;
}
export interface ProductColorRepairResult {
  batchId: string;
  updatedCount: number;
  items: Array<{ productId: string; version: number }>;
}
const base = '/fdmplatform/v1/products/color-repair';
export function previewProductColorRepair(data: {
  active?: boolean;
  companyId: number;
  keyword?: string;
  pageNo?: number;
  pageSize?: number;
  productIds?: string[];
}) {
  return requestClient.post<{
    list: ProductColorRepairRow[];
    ruleVersion: string;
    total: number;
  }>(`${base}/preview`, data);
}
export function applyProductColorRepair(data: {
  companyId: number;
  idempotencyKey: string;
  items: Array<
    RepairColors & {
      colorMode: 'DUAL' | 'SINGLE';
      expectedVersion: number;
      productId: string;
      reviewed: true;
    }
  >;
}) {
  return requestClient.post<ProductColorRepairResult>(`${base}/apply`, data);
}
export function rollbackProductColorRepair(data: {
  batchId: string;
  companyId: number;
  idempotencyKey: string;
}) {
  return requestClient.post<ProductColorRepairResult>(`${base}/rollback`, data);
}
