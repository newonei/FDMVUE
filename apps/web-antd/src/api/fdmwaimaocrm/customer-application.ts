import type { PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace FdmWaimaoCrmCustomerApplicationApi {
  export type DraftStatus = 'DRAFT';
  export type NullableText = null | string;
  export type TimeRange = [string, string];

  export interface CustomerApplicationDraft {
    alibabaLevelText: NullableText;
    contactEmail: NullableText;
    contactName: NullableText;
    contactPhone: NullableText;
    countryAddressText: NullableText;
    createTime: string;
    customerName: string;
    dealEvidenceText: NullableText;
    id: number;
    productCategoryText: NullableText;
    remark: NullableText;
    sourceText: NullableText;
    status: DraftStatus;
    updateTime: string;
    version: number;
    vipFlag: boolean;
  }

  export interface CustomerApplicationDraftCreateReq {
    alibabaLevelText?: string;
    contactEmail?: string;
    contactName?: string;
    contactPhone?: string;
    countryAddressText?: string;
    customerName: string;
    dealEvidenceText?: string;
    productCategoryText?: string;
    remark?: string;
    sourceText?: string;
    vipFlag: boolean;
  }

  export interface CustomerApplicationDraftPageReq {
    alibabaLevelText?: string;
    countryAddressText?: string;
    createTime?: TimeRange;
    keyword?: string;
    pageNo: number;
    pageSize: number;
    sourceText?: string;
    vipFlag?: boolean;
  }

  /** PUT 全量替换草稿；可空文本必须显式发送 null 才能清空旧值。 */
  export interface CustomerApplicationDraftUpdateReq {
    alibabaLevelText: NullableText;
    contactEmail: NullableText;
    contactName: NullableText;
    contactPhone: NullableText;
    countryAddressText: NullableText;
    customerName: string;
    dealEvidenceText: NullableText;
    id: number;
    productCategoryText: NullableText;
    remark: NullableText;
    sourceText: NullableText;
    version: number;
    vipFlag: boolean;
  }
}

const CUSTOMER_APPLICATION_URL = '/fdmwaimaocrm/customer-application';

export function createCustomerApplicationDraft(
  data: FdmWaimaoCrmCustomerApplicationApi.CustomerApplicationDraftCreateReq,
) {
  return requestClient.post<number>(`${CUSTOMER_APPLICATION_URL}/create`, data);
}

export function deleteCustomerApplicationDraft(id: number, version: number) {
  return requestClient.delete<boolean>(`${CUSTOMER_APPLICATION_URL}/delete`, {
    params: { id, version },
  });
}

export function getCustomerApplicationDraft(id: number) {
  return requestClient.get<FdmWaimaoCrmCustomerApplicationApi.CustomerApplicationDraft>(
    `${CUSTOMER_APPLICATION_URL}/get`,
    { params: { id } },
  );
}

export function getCustomerApplicationDraftPage(
  params: FdmWaimaoCrmCustomerApplicationApi.CustomerApplicationDraftPageReq,
) {
  return requestClient.get<
    PageResult<FdmWaimaoCrmCustomerApplicationApi.CustomerApplicationDraft>
  >(`${CUSTOMER_APPLICATION_URL}/page`, { params });
}

export function updateCustomerApplicationDraft(
  data: FdmWaimaoCrmCustomerApplicationApi.CustomerApplicationDraftUpdateReq,
) {
  return requestClient.put<boolean>(`${CUSTOMER_APPLICATION_URL}/update`, data);
}
