import type { FdmgongchangStageStockApi } from './index';

import { factoryHeaders } from '#/api/fdmgongchang/factory';
import { requestClient } from '#/api/request';

type Decimal = FdmgongchangStageStockApi.Decimal;
const BASE = '/fdmgongchang/stage-stock/order-report-correction';

export interface ReportCorrectionQuantity {
  backDefectQuantity?: Decimal | null;
  backGoodQuantity?: Decimal | null;
  defectQuantity: Decimal;
  frontDefectQuantity?: Decimal | null;
  frontGoodQuantity?: Decimal | null;
  goodQuantity: Decimal;
}

export interface ReportCorrectionLine extends ReportCorrectionQuantity {
  batchNo?: null | string;
  id: number;
  itemCode: string;
}

export interface ReportCorrectionRecord {
  applicantName?: string;
  createTime?: string;
  id: number;
  originalRows?: Array<ReportCorrectionQuantity & { outputId: number }>;
  reason: string;
  reviewNote?: string;
  reviewedAt?: string;
  reviewerName?: string;
  rows: Array<ReportCorrectionQuantity & { outputId: number }>;
  status: string;
}

export interface ReportCorrectionBatch {
  history: ReportCorrectionRecord[];
  pending?: null | ReportCorrectionRecord;
  reportedAt?: string;
  reportSeq: number;
  rows: ReportCorrectionLine[];
}

export interface PendingReportCorrection {
  applicantName?: string;
  createTime?: string;
  id: number;
  orderId: number;
  orderNo: string;
  outputStage: string;
  process: string;
  reason: string;
  reportSeq: number;
}

export function getPendingReportCorrections(process: string) {
  return requestClient.get<{
    canReview: boolean;
    hasMore: boolean;
    rows: PendingReportCorrection[];
  }>(`${BASE}/pending`, { headers: factoryHeaders(), params: { process } });
}

export function getReportCorrections(orderId: number) {
  return requestClient.get<{
    batches: ReportCorrectionBatch[];
    canConfirm: boolean;
    canSubmit: boolean;
  }>(`${BASE}/list`, { headers: factoryHeaders(), params: { orderId } });
}

export function submitReportCorrection(data: {
  orderId: number;
  reason: string;
  reportSeq: number;
  rows: Array<ReportCorrectionQuantity & { outputId: number }>;
}) {
  return requestClient.post<number>(`${BASE}/submit`, data, {
    headers: factoryHeaders(),
  });
}

export function reviewReportCorrection(data: {
  decision: 'APPROVE' | 'REJECT';
  id: number;
  note?: string;
}) {
  return requestClient.post<boolean>(`${BASE}/confirm`, data, {
    headers: factoryHeaders(),
  });
}
