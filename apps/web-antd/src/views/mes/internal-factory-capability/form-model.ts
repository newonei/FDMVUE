import type { MesInternalFactoryCapabilityApi } from '#/api/mes/internal-factory-capability';

export interface CapabilityFormDraft {
  companyId: string;
  directShipSupported: boolean;
  evidenceMode: MesInternalFactoryCapabilityApi.EvidenceMode;
  evidenceNote: string;
  evidenceSourceName: string;
  evidenceSourceRefId: string;
  evidenceSourceSystem: string;
  evidenceSourceVersion: string;
  evidenceTime: string;
  evidenceValidUntil: string;
  factoryId: string;
  productSkuId: string;
  productVersionToken: string;
  status: MesInternalFactoryCapabilityApi.CapabilityStatus;
  supportedCertificationRequirements: string[];
  supportedCountryComplianceRequirements: string[];
  supportedCustomerComplianceRequirements: string[];
  supportedPackagingRequirements: string[];
  validFrom: string;
  validUntil: string;
}

export interface CapabilityPayloadResult {
  data?: MesInternalFactoryCapabilityApi.CreateReq;
  errors: string[];
}

const POSITIVE_ID = /^[1-9]\d*$/;
const REQUIREMENT_CODE = /^[A-Z0-9][A-Z0-9._:-]{0,63}$/;

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function localDate(value: Date) {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

export function toLocalDateTimeInput(value?: null | string) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return `${localDate(parsed)}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}

export function createCapabilityDraft(
  companyId = '',
  now = new Date(),
): CapabilityFormDraft {
  return {
    companyId,
    directShipSupported: false,
    evidenceMode: 'AUTHORITATIVE',
    evidenceNote: '',
    evidenceSourceName: '',
    evidenceSourceRefId: '',
    evidenceSourceSystem: '',
    evidenceSourceVersion: '',
    evidenceTime: toLocalDateTimeInput(now.toISOString()),
    evidenceValidUntil: '',
    factoryId: '',
    productSkuId: '',
    productVersionToken: '',
    status: 'UNKNOWN',
    supportedCertificationRequirements: [],
    supportedCountryComplianceRequirements: [],
    supportedCustomerComplianceRequirements: [],
    supportedPackagingRequirements: [],
    validFrom: localDate(now),
    validUntil: '',
  };
}

export function capabilityToDraft(
  value: MesInternalFactoryCapabilityApi.Capability,
): CapabilityFormDraft {
  return {
    companyId: value.companyId,
    directShipSupported: value.directShipSupported,
    evidenceMode: value.evidenceMode,
    evidenceNote: value.evidenceNote || '',
    evidenceSourceName: value.evidenceSourceName || '',
    evidenceSourceRefId: value.evidenceSourceRefId || '',
    evidenceSourceSystem: value.evidenceSourceSystem || '',
    evidenceSourceVersion: value.evidenceSourceVersion || '',
    evidenceTime: toLocalDateTimeInput(value.evidenceTime),
    evidenceValidUntil: toLocalDateTimeInput(value.evidenceValidUntil),
    factoryId: value.factoryId,
    productSkuId: value.productSkuId,
    productVersionToken: value.productVersionToken,
    status: value.status,
    supportedCertificationRequirements: [
      ...value.supportedCertificationRequirements,
    ],
    supportedCountryComplianceRequirements: [
      ...value.supportedCountryComplianceRequirements,
    ],
    supportedCustomerComplianceRequirements: [
      ...value.supportedCustomerComplianceRequirements,
    ],
    supportedPackagingRequirements: [...value.supportedPackagingRequirements],
    validFrom: value.validFrom,
    validUntil: value.validUntil || '',
  };
}

export function normalizeRequirementCodes(values: string[]) {
  return [...new Set(values.map((value) => value.trim().toUpperCase()))].filter(
    Boolean,
  );
}

function optionalText(value: string) {
  return value.trim() || undefined;
}

function offsetDateTime(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function validateCodes(label: string, values: string[], errors: string[]) {
  const normalized = normalizeRequirementCodes(values);
  if (normalized.length > 50) errors.push(`${label}最多填写 50 项`);
  if (normalized.some((value) => !REQUIREMENT_CODE.test(value))) {
    errors.push(`${label}仅允许大写字母、数字及 . _ : -，单项最长 64 位`);
  }
  return normalized;
}

export function buildCapabilityPayload(
  draft: CapabilityFormDraft,
  now = new Date(),
): CapabilityPayloadResult {
  const errors: string[] = [];
  const companyId = draft.companyId.trim();
  const factoryId = draft.factoryId.trim();
  const productSkuId = draft.productSkuId.trim();
  const productVersionToken = draft.productVersionToken.trim();
  if (!POSITIVE_ID.test(companyId)) errors.push('公司 ID 必须是正整数');
  if (!POSITIVE_ID.test(factoryId)) errors.push('工厂 ID 必须是正整数');
  if (!POSITIVE_ID.test(productSkuId)) errors.push('产品 SKU ID 必须是正整数');
  if (!productVersionToken || productVersionToken.length > 128) {
    errors.push('产品版本 Token 必填且不能超过 128 位');
  }
  if (!draft.validFrom) errors.push('能力有效开始日期必填');
  if (draft.validUntil && draft.validUntil < draft.validFrom) {
    errors.push('能力有效结束日期不能早于开始日期');
  }

  const evidenceTime = offsetDateTime(draft.evidenceTime);
  const evidenceValidUntil = offsetDateTime(draft.evidenceValidUntil);
  if (!evidenceTime) errors.push('证据时间必填');
  if (!evidenceValidUntil) errors.push('证据有效截止时间必填');
  if (
    evidenceTime &&
    new Date(evidenceTime).getTime() > now.getTime() + 5 * 60_000
  ) {
    errors.push('证据时间不能晚于当前时间 5 分钟以上');
  }
  if (evidenceTime && evidenceValidUntil && evidenceValidUntil < evidenceTime) {
    errors.push('证据有效截止时间不能早于证据时间');
  }

  const supportedPackagingRequirements = validateCodes(
    '包装要求',
    draft.supportedPackagingRequirements,
    errors,
  );
  const supportedCertificationRequirements = validateCodes(
    '认证要求',
    draft.supportedCertificationRequirements,
    errors,
  );
  const supportedCountryComplianceRequirements = validateCodes(
    '国家合规要求',
    draft.supportedCountryComplianceRequirements,
    errors,
  );
  const supportedCustomerComplianceRequirements = validateCodes(
    '客户合规要求',
    draft.supportedCustomerComplianceRequirements,
    errors,
  );

  const sourceSystem = optionalText(draft.evidenceSourceSystem);
  const sourceVersion = optionalText(draft.evidenceSourceVersion);
  const sourceRefId = optionalText(draft.evidenceSourceRefId);
  const sourceName = optionalText(draft.evidenceSourceName);
  const evidenceNote = optionalText(draft.evidenceNote);
  if (draft.evidenceMode === 'AUTHORITATIVE') {
    if (!sourceSystem || !sourceVersion || !sourceRefId || !sourceName) {
      errors.push('权威证据必须填写来源系统、版本、引用 ID 和来源名称');
    }
    if ((sourceSystem?.length || 0) > 64) {
      errors.push('证据来源系统不能超过 64 位');
    }
    if (
      [sourceVersion, sourceRefId, sourceName].some(
        (value) => (value?.length || 0) > 128,
      )
    ) {
      errors.push('证据来源版本、引用 ID 和名称不能超过 128 位');
    }
  } else if (!evidenceNote || evidenceNote.length > 1000) {
    errors.push('人工确认必须填写不超过 1000 位的确认说明');
  }

  if (errors.length > 0 || !evidenceTime || !evidenceValidUntil) {
    return { errors };
  }

  return {
    data: {
      companyId,
      directShipSupported: draft.directShipSupported,
      evidenceMode: draft.evidenceMode,
      evidenceNote:
        draft.evidenceMode === 'HUMAN_CONFIRMED' ? evidenceNote : undefined,
      evidenceSourceName:
        draft.evidenceMode === 'AUTHORITATIVE' ? sourceName : undefined,
      evidenceSourceRefId:
        draft.evidenceMode === 'AUTHORITATIVE' ? sourceRefId : undefined,
      evidenceSourceSystem:
        draft.evidenceMode === 'AUTHORITATIVE' ? sourceSystem : undefined,
      evidenceSourceVersion:
        draft.evidenceMode === 'AUTHORITATIVE' ? sourceVersion : undefined,
      evidenceTime,
      evidenceValidUntil,
      factoryId,
      productSkuId,
      productVersionToken,
      status: draft.status,
      supportedCertificationRequirements,
      supportedCountryComplianceRequirements,
      supportedCustomerComplianceRequirements,
      supportedPackagingRequirements,
      validFrom: draft.validFrom,
      validUntil: draft.validUntil || undefined,
    },
    errors,
  };
}
