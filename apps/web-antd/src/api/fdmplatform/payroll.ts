import { requestClient } from '#/api/request';

const base = '/fdmplatform/payroll';

export type PayrollAmountField =
  | 'adjustment'
  | 'attendanceDeduction'
  | 'base'
  | 'beeAward'
  | 'bonus'
  | 'commission'
  | 'employerFund'
  | 'employerSocial'
  | 'grade'
  | 'gross'
  | 'net'
  | 'otherAddition'
  | 'otherAllowance'
  | 'otherDeduction'
  | 'performance'
  | 'performanceBase'
  | 'personalFund'
  | 'personalSocial'
  | 'priorBonus'
  | 'priorPaid'
  | 'shiftAllowance'
  | 'tax'
  | 'tenurePay';

export type PayrollStatisticField =
  | 'attendanceDays'
  | 'deductionDays'
  | 'performanceFactor'
  | 'seq'
  | 'sickDays'
  | 'tenure';

export type PayrollTextField =
  | 'company'
  | 'department'
  | 'joined'
  | 'left'
  | 'name';

export type PayrollValues = Record<PayrollAmountField, number> &
  Record<PayrollStatisticField, null | number> &
  Record<PayrollTextField, string>;

export type PayrollRow = PayrollValues & { employeeKey: string; id: string };

export interface PayrollBatch {
  importedAt?: number | string;
  rows: PayrollRow[];
  source: string;
  version: number | string;
}

export interface PayrollImportPreview {
  errors: string[];
  rows: PayrollValues[];
  sheet: string;
  version: number | string;
}

export interface PayrollMonthlyTotals {
  /** Amounts are integer cents. */
  gross: number;
  month: string;
  net: number;
  people: number;
}

export type PayrollDeliveryStatus =
  | 'ACCEPTED'
  | 'DELIVERED'
  | 'EXPIRED'
  | 'FAILED'
  | 'QUEUED'
  | 'REVOKED'
  | 'SENDING'
  | 'UNCERTAIN'
  | 'VIEWED';

export interface PayrollDelivery {
  company: string;
  department: string;
  error?: string;
  id: string;
  minutes: number;
  name: string;
  recipient: string;
  rowId: string;
  sentAt?: number | string;
  status: PayrollDeliveryStatus;
  userId: number | string;
}

export interface PayrollCandidate {
  department: string;
  dingTalkName: string;
  nickname: string;
  userId: number | string;
}

export interface PayrollRecipient {
  rowId: string;
  userId: PayrollCandidate['userId'];
}

interface PayrollSettings {
  minutes: number;
}

export function getPayrollMonth(month: string) {
  return requestClient.get<PayrollBatch>(`${base}/month`, {
    params: { month },
  });
}

export function getPayrollTrend(
  month: string,
  company: string,
  department: string,
) {
  return requestClient.get<PayrollMonthlyTotals[]>(`${base}/trend`, {
    params: {
      company: company || undefined,
      department: department || undefined,
      month,
    },
  });
}

export function getPayrollHistory(rowId: string) {
  return requestClient.get<PayrollMonthlyTotals[]>(`${base}/history`, {
    params: { rowId },
  });
}

export function previewPayrollImport(file: File, month: string) {
  return requestClient.upload<PayrollImportPreview>(
    `${base}/import/preview`,
    { file, month },
    { timeout: 60_000 },
  );
}

export function commitPayrollImport(
  file: File,
  month: string,
  version: PayrollBatch['version'],
) {
  return requestClient.upload<PayrollBatch>(
    `${base}/import/commit`,
    { file, month, version: String(version) },
    { timeout: 60_000 },
  );
}

export function getPayrollSettings() {
  return requestClient.get<PayrollSettings>(`${base}/settings`);
}

export function updatePayrollSettings(minutes: number) {
  return requestClient.put<PayrollSettings>(`${base}/settings`, { minutes });
}

export function getPayrollDeliveries(month: string) {
  return requestClient.get<PayrollDelivery[]>(`${base}/deliveries`, {
    params: { month },
  });
}

export function getPayrollCandidates(rowIds: string[]) {
  return requestClient.post<Record<string, PayrollCandidate[]>>(
    `${base}/candidates`,
    { rowIds },
  );
}

export function sendPayrollSlips(recipients: PayrollRecipient[]) {
  return requestClient.post<PayrollDelivery[]>(`${base}/send`, { recipients });
}
