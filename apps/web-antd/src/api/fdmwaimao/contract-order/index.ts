import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace FdmWaimaoContractOrderApi {
  export type DateTimeValue = number | string;
  export type LocalDateValue = [number, number, number] | string;
  export type DecimalValue = string;
  export type OrderStatus = 'CANCELLED' | 'CONFIRMED' | 'DRAFT';
  export type OrderType = 'BULK' | 'SAMPLE';
  export type FulfillmentMode = 'DIRECT_SHIP' | 'MIXED' | 'STANDARD';
  export type ProductEntrySource = 'MANUAL' | 'PRODUCT_CENTER';
  export type PaymentStatus = 'OVERPAID' | 'PARTIAL' | 'SETTLED' | 'UNPAID';

  export interface CompanyOption {
    id: string;
    name: string;
  }

  export interface ContactOption {
    email?: null | string;
    id: string;
    name?: null | string;
    phone?: null | string;
    primary: boolean;
    title?: null | string;
  }

  export interface OwnerOption {
    deptName?: null | string;
    disabled?: boolean;
    id: string;
    name: string;
    selectable?: boolean;
  }

  export interface FormOptions {
    companies: CompanyOption[];
    currentUser?: null | string;
    currentUserId?: null | string;
    defaultCurrency?: null | string;
    defaultOrderType?: null | OrderType;
    defaultSignDate?: LocalDateValue | null;
    /** 销售只能使用当前用户时，后端返回 false；最终权限仍由后端校验。 */
    ownerEditable?: boolean;
    owners: OwnerOption[];
  }

  export interface PageReq extends PageParam {
    companyId?: string;
    currency?: string;
    customerId?: string;
    keyword?: string;
    orderType?: OrderType;
    ownerUserId?: string;
    signDate?: [string, string];
    status?: OrderStatus;
  }

  export interface PageItem {
    alibabaTradeAssuranceNo: string;
    companyId: string;
    companyName: string;
    cashReceivedAmount?: DecimalValue | null;
    cashReceivedAmountCny?: DecimalValue | null;
    cancelReason?: null | string;
    cancelledByUserId?: null | string;
    cancelledByUserName?: null | string;
    cancelledTime?: DateTimeValue | null;
    contactEmail?: null | string;
    contactId?: null | string;
    contactName?: null | string;
    contactPhone?: null | string;
    confirmedByUserId?: null | string;
    confirmedByUserName?: null | string;
    confirmedTime?: DateTimeValue | null;
    certificationRequirements?: null | string[];
    countryComplianceRequirements?: null | string[];
    createTime?: DateTimeValue | null;
    customerComplianceRequirements?: null | string[];
    currency: string;
    consumptionAmount?: DecimalValue | null;
    consumptionAmountCny?: DecimalValue | null;
    consumptionCount?: null | number;
    customerId: string;
    customerName: string;
    deliveryLocation?: null | string;
    directShipRequired?: boolean | null;
    fulfillmentMode?: FulfillmentMode | null;
    id: string;
    incoterm?: null | string;
    itemCount?: null | number;
    orderNo: string;
    orderType: OrderType;
    outstandingAmount?: DecimalValue | null;
    overpaidAmount?: DecimalValue | null;
    ownerDeptId?: null | string;
    ownerDeptName?: null | string;
    ownerUserId?: null | string;
    ownerUserName?: null | string;
    paymentStatus?: null | PaymentStatus;
    packagingRequirements?: null | string[];
    receiptCount?: null | number;
    receivedAmount?: DecimalValue | null;
    receivedAmountCny?: DecimalValue | null;
    signDate: string;
    status: OrderStatus;
    settlementVersion?: null | number;
    subject: string;
    totalAmount: DecimalValue;
    totalQuantity?: DecimalValue | null;
    updateTime?: DateTimeValue | null;
    version: number;
  }

  export interface ContractItem {
    category?: null | string;
    code?: null | string;
    customizationText?: null | string;
    discountRate: DecimalValue;
    entrySource?: null | ProductEntrySource;
    gift: boolean;
    id: string;
    imageUrl?: null | string;
    lineAmount: DecimalValue;
    name: string;
    productId?: null | string;
    quantity: DecimalValue;
    remark?: null | string;
    retailPrice?: DecimalValue | null;
    skuId?: null | string;
    unit?: null | string;
    unitPrice: DecimalValue;
    versionToken?: null | string;
  }

  export interface ContractDetail extends PageItem {
    additionalFeeAmount: DecimalValue;
    additionalFeeCategory?: null | string;
    discountedProductAmount: DecimalValue;
    items: ContractItem[];
    orderDiscountAmount: DecimalValue;
    orderDiscountRate: DecimalValue;
    paymentTerms?: null | string;
    productAmount: DecimalValue;
    remark?: null | string;
    requiredDeliveryDate?: null | string;
    roundingDiscountAmount: DecimalValue;
  }

  /** 产品行只提交人工可编辑字段；产品中心来源字段由后端维护。 */
  export interface SaveItemReq {
    category?: string;
    code?: string;
    customizationText?: string;
    discountRate: DecimalValue;
    entrySource?: ProductEntrySource;
    gift: boolean;
    imageUrl?: string;
    name: string;
    productId?: string;
    quantity: DecimalValue;
    remark?: string;
    retailPrice?: DecimalValue;
    skuId?: string;
    unit?: string;
    unitPrice: DecimalValue;
    versionToken?: string;
  }

  export interface SaveReq {
    additionalFeeAmount: DecimalValue;
    additionalFeeCategory?: string;
    alibabaTradeAssuranceNo: string;
    companyId: string;
    contactId?: string;
    currency: string;
    customerId: string;
    deliveryLocation?: string;
    directShipRequired?: boolean;
    fulfillmentMode?: FulfillmentMode;
    incoterm?: string;
    items: SaveItemReq[];
    orderDiscountRate: DecimalValue;
    orderType: OrderType;
    ownerUserId?: string;
    packagingRequirements?: string[];
    paymentTerms?: string;
    certificationRequirements?: string[];
    countryComplianceRequirements?: string[];
    customerComplianceRequirements?: string[];
    remark?: string;
    requiredDeliveryDate?: string;
    /** 优惠抹零金额，按公式从订单金额中扣减。 */
    roundingDiscountAmount: DecimalValue;
    signDate: string;
    subject: string;
  }

  export interface UpdateReq extends SaveReq {
    expectedVersion: number;
    id: string;
  }

  export interface ConfirmReq {
    expectedVersion: number;
    id: string;
  }

  export interface CancelReq extends ConfirmReq {
    reason: string;
  }

  export interface AmountPreviewReq {
    additionalFeeAmount: DecimalValue;
    additionalFeeCategory?: string;
    items: SaveItemReq[];
    orderDiscountRate: DecimalValue;
    roundingDiscountAmount: DecimalValue;
  }

  export interface AmountPreview {
    additionalFeeAmount: DecimalValue;
    discountedProductAmount: DecimalValue;
    lineAmounts: DecimalValue[];
    orderDiscountAmount: DecimalValue;
    orderDiscountRate: DecimalValue;
    productAmount: DecimalValue;
    roundingDiscountAmount: DecimalValue;
    totalAmount: DecimalValue;
  }
}

const BASE_URL = '/fdmwaimao/contract-order';

export function getContractOrderPage(
  params: FdmWaimaoContractOrderApi.PageReq,
) {
  return requestClient.get<PageResult<FdmWaimaoContractOrderApi.PageItem>>(
    `${BASE_URL}/page`,
    { params },
  );
}

export function getContractOrder(id: string) {
  return requestClient.get<FdmWaimaoContractOrderApi.ContractDetail>(
    `${BASE_URL}/get`,
    { params: { id } },
  );
}

export function getContractOrderFormOptions() {
  return requestClient.get<FdmWaimaoContractOrderApi.FormOptions>(
    `${BASE_URL}/form-options`,
  );
}

export function getContractOrderContactOptions(params: {
  customerId: string;
  orderId?: string;
}) {
  return requestClient.get<FdmWaimaoContractOrderApi.ContactOption[]>(
    `${BASE_URL}/contact-options`,
    { params },
  );
}

export function createContractOrder(data: FdmWaimaoContractOrderApi.SaveReq) {
  return requestClient.post<string>(`${BASE_URL}/create`, data);
}

export function updateContractOrder(data: FdmWaimaoContractOrderApi.UpdateReq) {
  return requestClient.put<boolean>(`${BASE_URL}/update`, data);
}

export function deleteContractOrder(id: string) {
  return requestClient.delete<boolean>(`${BASE_URL}/delete`, {
    params: { id },
  });
}

export function confirmContractOrder(
  data: FdmWaimaoContractOrderApi.ConfirmReq,
) {
  return requestClient.put<boolean>(`${BASE_URL}/confirm`, data);
}

export function cancelContractOrder(data: FdmWaimaoContractOrderApi.CancelReq) {
  return requestClient.put<boolean>(`${BASE_URL}/cancel`, data);
}

export function previewContractOrderAmount(
  data: FdmWaimaoContractOrderApi.AmountPreviewReq,
) {
  return requestClient.post<FdmWaimaoContractOrderApi.AmountPreview>(
    `${BASE_URL}/amount-preview`,
    data,
    { silent: true },
  );
}
