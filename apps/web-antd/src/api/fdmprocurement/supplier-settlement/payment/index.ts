import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

import { normalizeId, normalizeNullableId } from '../../id-normalizer';

export namespace FdmProcurementSupplierSettlementPaymentApi {
  export type PostingStatus = 'DRAFT' | 'POSTED';
  export type SettlementDirection = 'PAYMENT' | 'REFUND';
  export type DecimalValue = number | string;

  export interface PageReq extends PageParam {
    companyId?: string;
    status?: PostingStatus;
    supplierId?: string;
  }

  export interface PaymentAccount {
    accountCode: string;
    accountName: string;
    currencyCode?: null | string;
    defaultStatus: boolean;
    id: string;
    remark?: null | string;
    sort: number;
    status: 'DISABLED' | 'ENABLED';
    version: number;
  }

  export interface RateSnapshot {
    effectiveDate: string;
    exchangeRateToCny: DecimalValue;
    fallbackUsed: boolean;
    provider: string;
    requestedDate: string;
    retrievedAt: string;
  }

  export interface PreviewRequest {
    currencyCode: string;
    obligationLineId: string;
    paymentTime: string;
    settlementDirection: SettlementDirection;
    supplierId: string;
    transactionAmount: DecimalValue;
  }

  export interface Preview {
    allocationKind: string;
    balanceVersion: number;
    companyId: string;
    currencyCode: string;
    obligationId: string;
    obligationLineId: string;
    obligationNetCny: DecimalValue;
    obligationType: string;
    openBalanceCny: DecimalValue;
    previewHash: string;
    purchaseOrderId: string;
    rate: RateSnapshot;
    settledCny: DecimalValue;
    sourceDocumentId: string;
    sourceDocumentType: string;
    supplierId: string;
    transactionAmount: DecimalValue;
    transactionAmountCny: DecimalValue;
  }

  export interface SaveRequest {
    accountId: string;
    currencyCode: string;
    expectedVersion?: number;
    financeUserId?: null | string;
    id?: string;
    obligationLineId: string;
    paymentTime: string;
    previewHash: string;
    remark?: string;
    settlementDirection: SettlementDirection;
    supplierId: string;
    transactionAmount: DecimalValue;
  }

  export interface Allocation {
    allocationKind: string;
    allocationRef: string;
    amountCny: DecimalValue;
    balanceVersionAfter: number;
    expectedBalanceVersion: number;
    id: string;
    obligationId: string;
    obligationLineId: string;
    purchaseOrderId: string;
    purchaseOrderLineId: string;
    settlementAmountCny: DecimalValue;
    status: string;
    transactionAmount: DecimalValue;
    version: number;
  }

  export interface SupplierPayment {
    accountId: string;
    allocation: Allocation;
    allocationHash: string;
    allocationRevision: number;
    companyId: string;
    currencyCode: string;
    financeUserId?: null | string;
    id: string;
    lastActorUserId: string;
    lastReverseReason?: string;
    no: string;
    paymentTime: string;
    postingVersion: number;
    rate: RateSnapshot;
    remark?: string;
    settlementDirection: SettlementDirection;
    status: PostingStatus;
    statusChangedAt: string;
    supplierId: string;
    transactionAmount: DecimalValue;
    transactionAmountCny: DecimalValue;
    version: number;
  }

  export interface TransitionRequest {
    expectedPostingVersion: number;
    expectedVersion: number;
    id: string;
    reason?: string;
  }
}

const BASE_URL = '/fdmprocurement/supplier-settlement/payment';
const ACCOUNT_BASE_URL = '/fdmprocurement/supplier-settlement/payment-account';

function normalizePreview(
  value: FdmProcurementSupplierSettlementPaymentApi.Preview,
): FdmProcurementSupplierSettlementPaymentApi.Preview {
  return {
    ...value,
    companyId: normalizeId(value.companyId, 'supplierPaymentPreview.companyId'),
    obligationId: normalizeId(
      value.obligationId,
      'supplierPaymentPreview.obligationId',
    ),
    obligationLineId: normalizeId(
      value.obligationLineId,
      'supplierPaymentPreview.obligationLineId',
    ),
    purchaseOrderId: normalizeId(
      value.purchaseOrderId,
      'supplierPaymentPreview.purchaseOrderId',
    ),
    sourceDocumentId: normalizeId(
      value.sourceDocumentId,
      'supplierPaymentPreview.sourceDocumentId',
    ),
    supplierId: normalizeId(
      value.supplierId,
      'supplierPaymentPreview.supplierId',
    ),
  };
}

function normalizeAllocation(
  value: FdmProcurementSupplierSettlementPaymentApi.Allocation,
): FdmProcurementSupplierSettlementPaymentApi.Allocation {
  return {
    ...value,
    id: normalizeId(value.id, 'supplierPayment.allocation.id'),
    obligationId: normalizeId(
      value.obligationId,
      'supplierPayment.allocation.obligationId',
    ),
    obligationLineId: normalizeId(
      value.obligationLineId,
      'supplierPayment.allocation.obligationLineId',
    ),
    purchaseOrderId: normalizeId(
      value.purchaseOrderId,
      'supplierPayment.allocation.purchaseOrderId',
    ),
    purchaseOrderLineId: normalizeId(
      value.purchaseOrderLineId,
      'supplierPayment.allocation.purchaseOrderLineId',
    ),
  };
}

function normalizePayment(
  value: FdmProcurementSupplierSettlementPaymentApi.SupplierPayment,
): FdmProcurementSupplierSettlementPaymentApi.SupplierPayment {
  return {
    ...value,
    accountId: normalizeId(value.accountId, 'supplierPayment.accountId'),
    allocation: normalizeAllocation(value.allocation),
    companyId: normalizeId(value.companyId, 'supplierPayment.companyId'),
    financeUserId: normalizeNullableId(
      value.financeUserId,
      'supplierPayment.financeUserId',
    ),
    id: normalizeId(value.id, 'supplierPayment.id'),
    lastActorUserId: normalizeId(
      value.lastActorUserId,
      'supplierPayment.lastActorUserId',
    ),
    supplierId: normalizeId(value.supplierId, 'supplierPayment.supplierId'),
  };
}

function normalizePaymentAccount(
  value: FdmProcurementSupplierSettlementPaymentApi.PaymentAccount,
): FdmProcurementSupplierSettlementPaymentApi.PaymentAccount {
  return {
    ...value,
    id: normalizeId(value.id, 'supplierPaymentAccount.id'),
  };
}

export async function getSupplierPaymentAccountList(enabledOnly = true) {
  const result = await requestClient.get<
    FdmProcurementSupplierSettlementPaymentApi.PaymentAccount[]
  >(`${ACCOUNT_BASE_URL}/list`, { params: { enabledOnly } });
  return (result || []).map((account) => normalizePaymentAccount(account));
}

export async function getSupplierPaymentPage(
  params: FdmProcurementSupplierSettlementPaymentApi.PageReq,
) {
  const result = await requestClient.get<
    PageResult<FdmProcurementSupplierSettlementPaymentApi.SupplierPayment>
  >(`${BASE_URL}/page`, { params });
  return {
    ...result,
    list: (result.list || []).map((payment) => normalizePayment(payment)),
  };
}

export async function getSupplierPayment(id: string) {
  const result =
    await requestClient.get<FdmProcurementSupplierSettlementPaymentApi.SupplierPayment>(
      `${BASE_URL}/get`,
      { params: { id } },
    );
  return normalizePayment(result);
}

export async function previewSupplierPayment(
  data: FdmProcurementSupplierSettlementPaymentApi.PreviewRequest,
) {
  const result =
    await requestClient.post<FdmProcurementSupplierSettlementPaymentApi.Preview>(
      `${BASE_URL}/preview`,
      data,
    );
  return normalizePreview(result);
}

export async function createSupplierPayment(
  data: FdmProcurementSupplierSettlementPaymentApi.SaveRequest,
) {
  const result =
    await requestClient.post<FdmProcurementSupplierSettlementPaymentApi.SupplierPayment>(
      `${BASE_URL}/create`,
      data,
    );
  return normalizePayment(result);
}

export async function updateSupplierPayment(
  data: FdmProcurementSupplierSettlementPaymentApi.SaveRequest,
) {
  const result =
    await requestClient.put<FdmProcurementSupplierSettlementPaymentApi.SupplierPayment>(
      `${BASE_URL}/update`,
      data,
    );
  return normalizePayment(result);
}

export async function postSupplierPayment(
  data: FdmProcurementSupplierSettlementPaymentApi.TransitionRequest,
) {
  const result =
    await requestClient.put<FdmProcurementSupplierSettlementPaymentApi.SupplierPayment>(
      `${BASE_URL}/post`,
      data,
    );
  return normalizePayment(result);
}

export async function reverseSupplierPayment(
  data: FdmProcurementSupplierSettlementPaymentApi.TransitionRequest,
) {
  const result =
    await requestClient.put<FdmProcurementSupplierSettlementPaymentApi.SupplierPayment>(
      `${BASE_URL}/reverse`,
      data,
    );
  return normalizePayment(result);
}
