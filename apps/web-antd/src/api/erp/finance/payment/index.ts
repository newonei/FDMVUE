import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace ErpFinancePaymentApi {
  export type AllocatedPaymentDirection = 'PAYMENT' | 'REFUND';

  export type AllocatedPaymentSourceMode = 'ALLOCATED_V2';

  /** 付款单信息 */
  export interface FinancePayment {
    id?: number; // 付款单编号
    no: string; // 付款单号
    supplierId?: number; // 供应商编号
    supplierName?: string; // 供应商名称
    paymentTime?: Date; // 付款时间
    totalPrice: number; // 合计金额，单位：元
    discountPrice: number; // 优惠金额
    paymentPrice: number; // 实际付款金额
    status: number; // 状态
    remark: string; // 备注
    fileUrl?: string; // 附件
    accountId?: number; // 付款账户
    accountName?: string; // 账户名称
    financeUserId?: number; // 财务人员
    financeUserName?: string; // 财务人员姓名
    creator?: string; // 创建人
    creatorName?: string; // 创建人姓名
    items?: FinancePaymentItem[]; // 付款明细
    bizNo?: string; // 业务单号

    /**
     * 下列字段只属于新的供应商结算 V2。旧付款单不会回填它们，
     * 页面也不会根据空值伪造冻结汇率或分摊数据。
     */
    sourceMode?: 'LEGACY' | AllocatedPaymentSourceMode;
    settlementDirection?: AllocatedPaymentDirection;
    currencyCode?: string;
    transactionAmount?: string;
    transactionAmountCny?: string;
    rateRequestedDate?: string;
    rateEffectiveDate?: string;
    exchangeRateToCny?: string;
    rateProvider?: string;
    rateFallbackUsed?: boolean;
    rateRetrievedAt?: string;
    allocationRevision?: number;
    allocationHash?: string;
    postingVersion?: number;
    version?: number;
    statusChangedAt?: string;
    lastActorUserId?: string;
    lastReverseReason?: string;
  }

  /**
   * 列表同时包含 legacy 和 V2；V2 的 Long 必须保留服务端返回的字符串形式。
   * 旧表单的 FinancePayment 类型保持不变，避免影响原有选择器和子表单。
   */
  export type FinancePaymentPageItem = Omit<
    FinancePayment,
    'accountId' | 'financeUserId' | 'id' | 'supplierId'
  > & {
    accountId?: number | string;
    financeUserId?: number | string;
    id?: number | string;
    supplierId?: number | string;
  };

  /** 付款单项 */
  export interface FinancePaymentItem {
    id?: number;
    row_id?: number; // 前端使用的临时 ID
    bizId: number; // 业务ID
    bizType: number; // 业务类型
    bizNo: string; // 业务编号
    totalPrice: number; // 应付金额
    paidPrice: number; // 已付金额
    paymentPrice: number; // 本次付款
    remark?: string; // 备注
  }

  /** 供应商付款结算 V2 分摊预览请求 */
  export interface AllocationPreviewRequest {
    supplierId: string;
    settlementDirection: AllocatedPaymentDirection;
    currencyCode: string;
    paymentDate: string;
    transactionAmount: string;
    obligationLineId: string;
  }

  export interface AllocationRateSnapshot {
    requestedDate: string;
    effectiveDate: string;
    rateToCny: string;
    provider: string;
    fallbackUsed: boolean;
    retrievedAt: string;
  }

  /** 待结算义务行；所有 Long ID 都作为字符串使用。 */
  export interface AllocationCandidateLine {
    obligationId: string;
    obligationLineId: string;
    obligationType: 'CREDIT' | 'PAYABLE' | string;
    sourceDocumentType: string;
    sourceDocumentId: string;
    sourceDocumentNo: string;
    sourceDocumentVersion: number;
    sourceDocumentItemId: string;
    purchaseOrderId: string;
    purchaseOrderNo: string;
    purchaseOrderItemId: string;
    lineRef: string;
    requisitionItemId: string;
    sourcingAllocationId: string;
    productId?: string;
    netObligationCny: string;
    settledCny: string;
    openBalanceCny: string;
    balanceVersion: number;
  }

  export interface ProposedAllocation {
    obligationLineId: string;
    allocationKind: 'DIRECT_PAY' | 'RETURN_REFUND' | string;
    transactionAmount: string;
    amountCny: string;
    settlementAmountCny: string;
    expectedBalanceVersion: number;
  }

  export interface AllocationPreview {
    supplierId: string;
    settlementDirection: AllocatedPaymentDirection;
    allocationKind: 'DIRECT_PAY' | 'RETURN_REFUND' | string;
    currencyCode: string;
    paymentDate: string;
    transactionAmount: string;
    transactionAmountCny: string;
    rate: AllocationRateSnapshot;
    candidates: AllocationCandidateLine[];
    proposedAllocation: ProposedAllocation;
    previewHash: string;
  }

  /** 新建/修改 V2 草稿的唯一可提交数据。 */
  export interface AllocatedPaymentSaveRequest {
    id?: string;
    expectedVersion?: number;
    paymentTime: string;
    financeUserId?: string;
    supplierId: string;
    accountId: string;
    direction: AllocatedPaymentDirection;
    currency: string;
    transactionAmount: string;
    obligationLineId: string;
    previewHash: string;
    remark?: string;
  }

  export interface AllocatedPayment {
    id: string;
    no: string;
    sourceMode: AllocatedPaymentSourceMode;
    status: number;
    paymentTime: string;
    financeUserId?: string;
    supplierId: string;
    accountId: string;
    direction: AllocatedPaymentDirection;
    currency: string;
    transactionAmount: string;
    transactionAmountCny: string;
    rateRequestedDate: string;
    rateEffectiveDate: string;
    exchangeRateToCny: string;
    rateProvider: string;
    rateFallbackUsed: boolean;
    rateRetrievedAt: string;
    obligationLineId: string;
    allocationKind: 'DIRECT_PAY' | 'RETURN_REFUND' | string;
    allocationRevision: number;
    allocationHash: string;
    postingVersion: number;
    version: number;
    remark?: string;
    statusChangedAt: string;
    lastActorUserId: string;
    lastReverseReason?: string;
    createTime: string;
    updateTime: string;
  }

  export interface AllocatedPaymentPostRequest {
    id: string;
    expectedVersion: number;
  }

  export interface AllocatedPaymentReverseRequest extends AllocatedPaymentPostRequest {
    reason: string;
  }
}

/** 查询付款单分页 */
export function getFinancePaymentPage(params: PageParam) {
  return requestClient.get<
    PageResult<ErpFinancePaymentApi.FinancePaymentPageItem>
  >('/erp/finance-payment/page', {
    params,
  });
}

/** 查询付款单详情 */
export function getFinancePayment(id: number) {
  return requestClient.get<ErpFinancePaymentApi.FinancePayment>(
    `/erp/finance-payment/get?id=${id}`,
  );
}

/** 新增付款单 */
export function createFinancePayment(
  data: ErpFinancePaymentApi.FinancePayment,
) {
  return requestClient.post('/erp/finance-payment/create', data);
}

/** 修改付款单 */
export function updateFinancePayment(
  data: ErpFinancePaymentApi.FinancePayment,
) {
  return requestClient.put('/erp/finance-payment/update', data);
}

/** 更新付款单的状态 */
export function updateFinancePaymentStatus(id: number, status: number) {
  return requestClient.put('/erp/finance-payment/update-status', null, {
    params: { id, status },
  });
}

/** 删除付款单 */
export function deleteFinancePayment(ids: number[]) {
  return requestClient.delete('/erp/finance-payment/delete', {
    params: {
      ids: ids.join(','),
    },
  });
}

/** 导出付款单 Excel */
export function exportFinancePayment(params: any) {
  return requestClient.download('/erp/finance-payment/export-excel', {
    params,
  });
}

/** 按当前义务余额和真实汇率预览 V2 分摊，不产生任何账务。 */
export function previewFinancePaymentAllocation(
  data: ErpFinancePaymentApi.AllocationPreviewRequest,
) {
  return requestClient.post<ErpFinancePaymentApi.AllocationPreview>(
    '/erp/finance-payment/allocation-preview',
    data,
  );
}

/** 读取最新 V2 付款头、冻结汇率与当前分摊身份。 */
export function getAllocatedV2Payment(id: string) {
  return requestClient.get<ErpFinancePaymentApi.AllocatedPayment>(
    '/erp/finance-payment/allocated-v2/get',
    { params: { id } },
  );
}

/** 新建供应商结算 V2 草稿。 */
export function createAllocatedV2Payment(
  data: ErpFinancePaymentApi.AllocatedPaymentSaveRequest,
) {
  return requestClient.post<ErpFinancePaymentApi.AllocatedPayment>(
    '/erp/finance-payment/allocated-v2/create',
    data,
  );
}

/** 修改供应商结算 V2 草稿，且生成新的不可变分摊版本。 */
export function updateAllocatedV2Payment(
  data: ErpFinancePaymentApi.AllocatedPaymentSaveRequest,
) {
  return requestClient.put<ErpFinancePaymentApi.AllocatedPayment>(
    '/erp/finance-payment/allocated-v2/update',
    data,
  );
}

/** 过账 V2 草稿并核销供应商义务余额。 */
export function postAllocatedV2Payment(
  data: ErpFinancePaymentApi.AllocatedPaymentPostRequest,
) {
  return requestClient.put<ErpFinancePaymentApi.AllocatedPayment>(
    '/erp/finance-payment/allocated-v2/post',
    data,
  );
}

/** 冲销已过账的 V2 结算并恢复供应商义务余额。 */
export function reverseAllocatedV2Payment(
  data: ErpFinancePaymentApi.AllocatedPaymentReverseRequest,
) {
  return requestClient.put<ErpFinancePaymentApi.AllocatedPayment>(
    '/erp/finance-payment/allocated-v2/reverse',
    data,
  );
}
