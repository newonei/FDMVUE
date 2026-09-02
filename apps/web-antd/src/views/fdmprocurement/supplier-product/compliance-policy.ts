import type { FdmProcurementSupplierProductApi } from '#/api/fdmprocurement/supplier-product';

export interface ComplianceDraftFact
  extends FdmProcurementSupplierProductApi.ComplianceFactReq {
  key: string;
}

export interface ComplianceFactSetHealth {
  detail: string;
  failClosed: boolean;
  level: 'error' | 'success' | 'warning';
  title: string;
}

export interface ComplianceDraftValidation {
  errors: string[];
  facts: FdmProcurementSupplierProductApi.ComplianceFactReq[];
  valid: boolean;
}

export const COMPLIANCE_FACT_TYPE_OPTIONS: Array<{
  label: string;
  value: FdmProcurementSupplierProductApi.ComplianceFactType;
}> = [
  { label: '贸易术语', value: 'INCOTERM' },
  { label: '交付地点', value: 'DELIVERY_LOCATION' },
  { label: '包装要求', value: 'PACKAGING' },
  { label: '认证要求', value: 'CERTIFICATION' },
  { label: '国家 / 地区合规', value: 'COUNTRY_COMPLIANCE' },
  { label: '客户专属合规', value: 'CUSTOMER_COMPLIANCE' },
];

export const COMPLIANCE_FACT_TYPE_LABEL = Object.fromEntries(
  COMPLIANCE_FACT_TYPE_OPTIONS.map((item) => [item.value, item.label]),
) as Record<FdmProcurementSupplierProductApi.ComplianceFactType, string>;

const FACT_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const CUSTOMER_ID_PATTERN = /^[1-9][0-9]{0,18}$/;
const SNAPSHOT_HASH_PATTERN = /^[a-f0-9]{64}$/i;
let draftSequence = 0;

function nextDraftKey() {
  draftSequence += 1;
  return `compliance-draft-${draftSequence}`;
}

export function createComplianceDraftFact(
  value?: Partial<FdmProcurementSupplierProductApi.ComplianceFactReq>,
): ComplianceDraftFact {
  const factType = value?.factType || 'CERTIFICATION';
  const customerScoped = factType === 'CUSTOMER_COMPLIANCE';
  return {
    evidenceReference: value?.evidenceReference || '',
    factCode: value?.factCode || '',
    factType,
    key: nextDraftKey(),
    scopeType: customerScoped ? 'CUSTOMER' : 'GLOBAL',
    scopeValue: customerScoped ? value?.scopeValue || '' : undefined,
    validFrom: value?.validFrom || '',
    validUntil: value?.validUntil || '',
  };
}

export function copyCurrentFactsToDraft(
  facts: FdmProcurementSupplierProductApi.ComplianceFact[],
) {
  return facts.map((fact) =>
    createComplianceDraftFact({
      evidenceReference: fact.evidenceReference,
      factCode: fact.factCode,
      factType: fact.factType,
      scopeType: fact.scopeType,
      scopeValue: fact.scopeValue || undefined,
      validFrom: fact.validFrom,
      validUntil: fact.validUntil,
    }),
  );
}

export function validateComplianceDraftFacts(
  drafts: ComplianceDraftFact[],
): ComplianceDraftValidation {
  const errors: string[] = [];
  const facts: FdmProcurementSupplierProductApi.ComplianceFactReq[] = [];
  const identities = new Set<string>();
  if (drafts.length === 0) errors.push('完整事实集合至少需要一条合规事实。');
  if (drafts.length > 500) errors.push('单个版本最多发布 500 条合规事实。');

  drafts.forEach((draft, index) => {
    const row = index + 1;
    const factCode = draft.factCode.trim().toUpperCase();
    const evidenceReference = draft.evidenceReference.trim();
    const customerScoped = draft.factType === 'CUSTOMER_COMPLIANCE';
    const scopeType = customerScoped ? 'CUSTOMER' : 'GLOBAL';
    const scopeValue = customerScoped ? draft.scopeValue?.trim() : undefined;

    if (!FACT_CODE_PATTERN.test(factCode)) {
      errors.push(
        `第 ${row} 条事实编码格式不正确，只允许字母、数字及 . _ : / -，最长 128 位。`,
      );
    }
    if (!evidenceReference || evidenceReference.length > 500) {
      errors.push(`第 ${row} 条证据引用必填，且不能超过 500 个字符。`);
    }
    if (customerScoped && !CUSTOMER_ID_PATTERN.test(scopeValue || '')) {
      errors.push(`第 ${row} 条客户专属事实必须填写有效的客户 Long ID。`);
    }
    if (!draft.validFrom || !draft.validUntil) {
      errors.push(`第 ${row} 条必须填写有效开始和有效结束日期。`);
    } else if (draft.validUntil < draft.validFrom) {
      errors.push(`第 ${row} 条有效结束日期不能早于有效开始日期。`);
    }

    const identity = [
      draft.factType,
      factCode,
      scopeType,
      scopeValue || '',
    ].join('|');
    if (identities.has(identity)) {
      errors.push(`第 ${row} 条与同版本中的另一条事实重复。`);
    }
    identities.add(identity);
    facts.push({
      evidenceReference,
      factCode,
      factType: draft.factType,
      scopeType,
      scopeValue,
      validFrom: draft.validFrom,
      validUntil: draft.validUntil,
    });
  });
  return { errors, facts, valid: errors.length === 0 };
}

function todayIso() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function evaluateComplianceFactSet(
  product: FdmProcurementSupplierProductApi.SupplierProduct,
  facts: FdmProcurementSupplierProductApi.ComplianceFact[],
  options: { loaded: boolean; loadError?: boolean },
): ComplianceFactSetHealth {
  if (options.loadError) {
    return {
      detail:
        '当前事实无法从服务端读取，界面不会把未知状态当作已合规；AI 采购选品将按缺少权威证据处理。',
      failClosed: true,
      level: 'error',
      title: '合规事实读取失败（Fail-closed）',
    };
  }
  if (
    !Number.isInteger(product.complianceVersion) ||
    product.complianceVersion <= 0
  ) {
    return {
      detail:
        '尚未发布任何合规事实版本。需要发布完整、可验证的事实集合后，AI 才能把该映射作为具备合规证据的候选。',
      failClosed: true,
      level: 'warning',
      title: '未建立合规权威版本（Fail-closed）',
    };
  }
  if (!SNAPSHOT_HASH_PATTERN.test(product.complianceSnapshotHash || '')) {
    return {
      detail:
        '映射已有合规版本号，但缺少有效的 64 位快照哈希。版本证据链不完整，不能视为可核验。',
      failClosed: true,
      level: 'error',
      title: '合规快照不完整（Fail-closed）',
    };
  }
  if (!options.loaded) {
    return {
      detail: '正在从服务端读取当前不可变事实集合，读取完成前保持未知状态。',
      failClosed: true,
      level: 'warning',
      title: '合规事实待核验',
    };
  }
  if (
    facts.length === 0 ||
    facts.some(
      (fact) =>
        fact.supplierProductId !== product.id ||
        fact.companyId !== product.companyId ||
        fact.factSetVersion !== product.complianceVersion ||
        fact.evidenceStatus !== 'VERIFIED' ||
        !SNAPSHOT_HASH_PATTERN.test(fact.factHash),
    )
  ) {
    return {
      detail:
        '版本号、事实明细或事实哈希不一致。界面不会推断缺失数据，请联系管理员核对数据库补丁与发布事务。',
      failClosed: true,
      level: 'error',
      title: '合规版本与明细不一致（Fail-closed）',
    };
  }
  const today = todayIso();
  const expiredCount = facts.filter((fact) => fact.validUntil < today).length;
  const pendingCount = facts.filter((fact) => fact.validFrom > today).length;
  if (expiredCount > 0 || pendingCount > 0) {
    const validityIssues = [
      expiredCount > 0 ? `${expiredCount} 条已过期` : '',
      pendingCount > 0 ? `${pendingCount} 条尚未生效` : '',
    ]
      .filter(Boolean)
      .join('、');
    return {
      detail: `当前版本中有${validityIssues}；涉及这些事实的采购要求会按缺少有效证据处理。请核验后发布新版本。`,
      failClosed: true,
      level: 'warning',
      title: '当前版本包含非生效事实（Fail-closed）',
    };
  }
  return {
    detail:
      '当前版本、快照哈希和事实明细一致。AI 仍会按照具体事实类型、编码、客户作用域和业务日期逐项匹配。',
    failClosed: false,
    level: 'success',
    title: `合规事实版本 v${product.complianceVersion} 已核验`,
  };
}
