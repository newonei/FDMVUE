import type { FdmWaimaoCrmCustomerApplicationApi } from '#/api/fdmwaimaocrm/customer-application';

export interface CustomerApplicationDraftFormValues {
  alibabaLevelText: string;
  contactEmail: string;
  contactName: string;
  contactPhone: string;
  countryAddressText: string;
  customerName: string;
  dealEvidenceText: string;
  id?: number;
  productCategoryText: string;
  remark: string;
  sourceText: string;
  version?: number;
  vipFlag: boolean;
}

export interface CustomerApplicationDraftSearchValues {
  alibabaLevelText?: string;
  countryAddressText?: string;
  createTime?: string[];
  keyword?: string;
  sourceText?: string;
  vipFlag?: boolean;
}

type UnknownRecord = Record<string, unknown>;

const CUSTOMER_APPLICATION_VERSION_CONFLICT_CODE = 1_205_001_002;

function normalizeOptionalText(value: null | string | undefined) {
  const normalized = value?.trim();
  return normalized || undefined;
}

function normalizeNullableText(value: null | string | undefined) {
  return normalizeOptionalText(value) ?? null;
}

function normalizeTimeRange(
  value: string[] | undefined,
): FdmWaimaoCrmCustomerApplicationApi.TimeRange | undefined {
  if (value?.length !== 2 || !value[0] || !value[1]) {
    return undefined;
  }
  return [value[0], value[1]];
}

function toRecord(value: unknown): undefined | UnknownRecord {
  return typeof value === 'object' && value !== null
    ? (value as UnknownRecord)
    : undefined;
}

export function buildCustomerApplicationDraftCreateRequest(
  values: CustomerApplicationDraftFormValues,
): FdmWaimaoCrmCustomerApplicationApi.CustomerApplicationDraftCreateReq {
  return {
    alibabaLevelText: normalizeOptionalText(values.alibabaLevelText),
    contactEmail: normalizeOptionalText(values.contactEmail),
    contactName: normalizeOptionalText(values.contactName),
    contactPhone: normalizeOptionalText(values.contactPhone),
    countryAddressText: normalizeOptionalText(values.countryAddressText),
    customerName: values.customerName.trim(),
    dealEvidenceText: normalizeOptionalText(values.dealEvidenceText),
    productCategoryText: normalizeOptionalText(values.productCategoryText),
    remark: normalizeOptionalText(values.remark),
    sourceText: normalizeOptionalText(values.sourceText),
    vipFlag: Boolean(values.vipFlag),
  };
}

export function buildCustomerApplicationDraftPageRequest(
  pageNo: number,
  pageSize: number,
  values: Partial<CustomerApplicationDraftSearchValues>,
): FdmWaimaoCrmCustomerApplicationApi.CustomerApplicationDraftPageReq {
  return {
    alibabaLevelText: normalizeOptionalText(values.alibabaLevelText),
    countryAddressText: normalizeOptionalText(values.countryAddressText),
    createTime: normalizeTimeRange(values.createTime),
    keyword: normalizeOptionalText(values.keyword),
    pageNo,
    pageSize,
    sourceText: normalizeOptionalText(values.sourceText),
    vipFlag: values.vipFlag,
  };
}

export function buildCustomerApplicationDraftUpdateRequest(
  values: CustomerApplicationDraftFormValues,
): FdmWaimaoCrmCustomerApplicationApi.CustomerApplicationDraftUpdateReq {
  if (values.id === undefined || values.version === undefined) {
    throw new Error('草稿缺少版本信息，请重新打开后再试');
  }
  return {
    alibabaLevelText: normalizeNullableText(values.alibabaLevelText),
    contactEmail: normalizeNullableText(values.contactEmail),
    contactName: normalizeNullableText(values.contactName),
    contactPhone: normalizeNullableText(values.contactPhone),
    countryAddressText: normalizeNullableText(values.countryAddressText),
    customerName: values.customerName.trim(),
    dealEvidenceText: normalizeNullableText(values.dealEvidenceText),
    id: values.id,
    productCategoryText: normalizeNullableText(values.productCategoryText),
    remark: normalizeNullableText(values.remark),
    sourceText: normalizeNullableText(values.sourceText),
    version: values.version,
    vipFlag: Boolean(values.vipFlag),
  };
}

export function createEmptyCustomerApplicationDraftFormValues(): CustomerApplicationDraftFormValues {
  return {
    alibabaLevelText: '',
    contactEmail: '',
    contactName: '',
    contactPhone: '',
    countryAddressText: '',
    customerName: '',
    dealEvidenceText: '',
    productCategoryText: '',
    remark: '',
    sourceText: '',
    vipFlag: false,
  };
}

export function isCustomerApplicationVersionConflict(error: unknown) {
  const root = toRecord(error);
  const data = toRecord(root?.data);
  const response = toRecord(root?.response);
  const responseData = toRecord(response?.data);

  const statusCandidates = [root?.status, response?.status];
  if (statusCandidates.some((value) => Number(value) === 409)) {
    return true;
  }

  const codeCandidates = [root?.code, data?.code, responseData?.code];
  if (
    codeCandidates.some(
      (value) =>
        Number(value) === CUSTOMER_APPLICATION_VERSION_CONFLICT_CODE ||
        String(value ?? '')
          .toUpperCase()
          .includes('VERSION_CONFLICT'),
    )
  ) {
    return true;
  }

  const messageCandidates = [
    root?.message,
    root?.msg,
    data?.message,
    data?.msg,
    responseData?.message,
    responseData?.msg,
  ];
  return messageCandidates.some(
    (value) =>
      typeof value === 'string' &&
      (/版本.{0,8}(冲突|过期)/.test(value) ||
        /已被.{0,12}更新/.test(value) ||
        /version.{0,8}conflict/i.test(value)),
  );
}

export function mapCustomerApplicationDraftToFormValues(
  draft: FdmWaimaoCrmCustomerApplicationApi.CustomerApplicationDraft,
): CustomerApplicationDraftFormValues {
  return {
    alibabaLevelText: draft.alibabaLevelText ?? '',
    contactEmail: draft.contactEmail ?? '',
    contactName: draft.contactName ?? '',
    contactPhone: draft.contactPhone ?? '',
    countryAddressText: draft.countryAddressText ?? '',
    customerName: draft.customerName,
    dealEvidenceText: draft.dealEvidenceText ?? '',
    id: draft.id,
    productCategoryText: draft.productCategoryText ?? '',
    remark: draft.remark ?? '',
    sourceText: draft.sourceText ?? '',
    version: draft.version,
    vipFlag: Boolean(draft.vipFlag),
  };
}
