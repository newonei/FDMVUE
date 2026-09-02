import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace FdmWaimaoBankReceiptApi {
  export type AllocationState = 'FULL' | 'PARTIAL' | 'UNALLOCATED';
  export type DateTimeValue = number | string;
  export type DecimalValue = string;
  export type ReceiptStatus = 'ACTIVE' | 'VOIDED';

  export interface BankReceipt {
    allocatedAmount: DecimalValue;
    allocationState: AllocationState;
    arrivalAmount: DecimalValue;
    arrivalAmountCny: DecimalValue;
    companyId: string;
    companyName: string;
    createTime?: DateTimeValue | null;
    currency: string;
    currencyToCnyRate: DecimalValue;
    customerId?: null | string;
    customerName?: null | string;
    externalReceiptKey: string;
    id: string;
    ownerUserId?: null | string;
    payerAccountMasked?: null | string;
    payerNameMasked?: null | string;
    rateDate: string;
    rateFallbackUsed: boolean;
    rateRetrievedAt?: DateTimeValue | null;
    rateSource: string;
    receiptDate: string;
    receiptNo: string;
    remainingAmount: DecimalValue;
    remark?: null | string;
    sourceSystem: string;
    status: ReceiptStatus;
    version: number;
  }

  export interface PageReq extends PageParam {
    allocationState?: AllocationState;
    companyId?: string;
    currency?: string;
    customerId?: string;
    keyword?: string;
    receiptDate?: [string, string];
    status?: ReceiptStatus;
  }

  /**
   * 浏览器只提交银行业务事实。外部 payload hash、汇率、CNY 金额、已分配金额
   * 与负责人均由服务端生成或冻结，故意不属于此契约。
   */
  export interface CreateReq {
    arrivalAmount: DecimalValue;
    companyId: string;
    confirmPotentialDuplicate: boolean;
    currency: string;
    customerId?: string;
    externalReceiptKey: string;
    payerAccountMasked?: string;
    payerNameMasked?: string;
    receiptDate: string;
    remark?: string;
    sourceSystem: string;
  }

  export interface CreateResult {
    created: boolean;
    id: string;
    potentialDuplicateIds: string[];
  }

  export interface UpdateReq {
    arrivalAmount: DecimalValue;
    companyId: string;
    confirmPotentialDuplicate: boolean;
    currency: string;
    customerId?: string;
    expectedVersion: number;
    id: string;
    payerAccountMasked?: string;
    payerNameMasked?: string;
    receiptDate: string;
    remark?: string;
  }

  export interface VoidReq {
    expectedVersion: number;
    id: string;
    reason: string;
  }
}

export const BANK_RECEIPT_DUPLICATE_CONFIRM_REQUIRED = 1_206_013_006;

const BASE_URL = '/fdmwaimao/bank-receipt';

interface RequestFailure {
  data?: { code?: number | string; msg?: string };
  response?: { data?: { code?: number | string; msg?: string } };
}

export function getBankReceiptBusinessErrorCode(error: unknown) {
  const failure = error as RequestFailure;
  return failure.data?.code ?? failure.response?.data?.code;
}

export function isBankReceiptDuplicateConfirmationError(error: unknown) {
  return (
    Number(getBankReceiptBusinessErrorCode(error)) ===
    BANK_RECEIPT_DUPLICATE_CONFIRM_REQUIRED
  );
}

export function getBankReceiptPage(params: FdmWaimaoBankReceiptApi.PageReq) {
  return requestClient.get<PageResult<FdmWaimaoBankReceiptApi.BankReceipt>>(
    `${BASE_URL}/page`,
    { params },
  );
}

export function getBankReceipt(id: string) {
  return requestClient.get<FdmWaimaoBankReceiptApi.BankReceipt>(
    `${BASE_URL}/get`,
    { params: { id } },
  );
}

export function createBankReceipt(data: FdmWaimaoBankReceiptApi.CreateReq) {
  const payload: FdmWaimaoBankReceiptApi.CreateReq = {
    arrivalAmount: data.arrivalAmount,
    companyId: data.companyId,
    confirmPotentialDuplicate: data.confirmPotentialDuplicate,
    currency: data.currency,
    customerId: data.customerId,
    externalReceiptKey: data.externalReceiptKey,
    payerAccountMasked: data.payerAccountMasked,
    payerNameMasked: data.payerNameMasked,
    receiptDate: data.receiptDate,
    remark: data.remark,
    sourceSystem: data.sourceSystem,
  };
  return requestClient.post<FdmWaimaoBankReceiptApi.CreateResult>(
    `${BASE_URL}/create`,
    payload,
  );
}

export function updateBankReceipt(data: FdmWaimaoBankReceiptApi.UpdateReq) {
  const payload: FdmWaimaoBankReceiptApi.UpdateReq = {
    arrivalAmount: data.arrivalAmount,
    companyId: data.companyId,
    confirmPotentialDuplicate: data.confirmPotentialDuplicate,
    currency: data.currency,
    customerId: data.customerId,
    expectedVersion: data.expectedVersion,
    id: data.id,
    payerAccountMasked: data.payerAccountMasked,
    payerNameMasked: data.payerNameMasked,
    receiptDate: data.receiptDate,
    remark: data.remark,
  };
  return requestClient.put<boolean>(`${BASE_URL}/update`, payload);
}

export function voidBankReceipt(data: FdmWaimaoBankReceiptApi.VoidReq) {
  return requestClient.put<boolean>(`${BASE_URL}/void`, data);
}
