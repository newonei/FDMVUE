import type { FdmProcurementSourcingApi } from '#/api/fdmprocurement/sourcing';

import BigNumber from 'bignumber.js';

export type KnownEligibilityStatus =
  | 'ELIGIBLE'
  | 'INELIGIBLE'
  | 'NEEDS_CONFIRMATION'
  | 'UNKNOWN';

export interface EligibilityPresentation {
  color: string;
  description: string;
  label: string;
  status: KnownEligibilityStatus;
}

export interface ScoreDimension {
  key: string;
  label: string;
  value?: number;
}

/** Shared presentation surface for persisted and not-yet-materialized candidates. */
export interface CandidatePresentationFacts {
  capacityScore?: FdmProcurementSourcingApi.DecimalValue | null;
  costScore?: FdmProcurementSourcingApi.DecimalValue | null;
  deliveryScore?: FdmProcurementSourcingApi.DecimalValue | null;
  eligibilityStatus?: null | string;
  evidenceHash?: null | string;
  performanceSnapshotId?: null | string;
  qualityScore?: FdmProcurementSourcingApi.DecimalValue | null;
  resilienceScore?: FdmProcurementSourcingApi.DecimalValue | null;
  termsScore?: FdmProcurementSourcingApi.DecimalValue | null;
  totalScore?: FdmProcurementSourcingApi.DecimalValue | null;
}

const ELIGIBILITY_PRESENTATIONS: Record<
  KnownEligibilityStatus,
  Omit<EligibilityPresentation, 'status'>
> = {
  ELIGIBLE: {
    color: 'green',
    description: '硬规则和评分证据均完整，可直接参与人工分配。',
    label: '可直接选择',
  },
  INELIGIBLE: {
    color: 'red',
    description: '存在明确的硬规则不合格项，禁止选择。',
    label: '不合格',
  },
  NEEDS_CONFIRMATION: {
    color: 'gold',
    description:
      '硬规则未明确失败，但证据需要人工确认；选择时必须填写例外理由。',
    label: '需人工确认',
  },
  UNKNOWN: {
    color: 'orange',
    description: '关键证据缺失或不可验证，当前禁止选择。',
    label: '证据未知',
  },
};

const REASON_TEXT: Record<string, string> = {
  CAPACITY_MISSING: '未提供可验证的供应容量',
  CAPACITY_STALE: '供应容量证据已过有效期',
  COMPARABLE_COST_MISSING: '缺少可比较的人民币成本证据',
  DELIVERY_LATE: '承诺交期晚于需求日期',
  ERP_SUPPLIER_MAPPING_REQUIRED: '供应商尚未完成 ERP 映射',
  EVIDENCE_UNREADABLE: '冻结证据无法读取',
  EXCHANGE_RATE_MISSING: '缺少可信的有效汇率',
  LEAD_TIME_MISSING: '缺少交期或提前期证据',
  MAPPING_TYPE_NOT_ALLOWED: '当前产品映射类型不允许寻源',
  MOQ_NOT_MET: '申请数量未达到最小起订量',
  PACKAGE_MULTIPLE_NOT_MET: '申请数量不满足包装倍数',
  PAYMENT_TERMS_UNMAPPED: '付款条件尚未映射为受控评分',
  PRODUCT_VERSION_MISMATCH: '供应商产品版本与冻结输入不一致',
  QUOTE_MISSING: '没有有效报价',
  QUOTE_NOT_EFFECTIVE: '报价在证据日期未生效或已失效',
  QUOTE_TIER_MISSING: '没有覆盖本次数量的报价阶梯',
  REQUIRED_DATE_MISSING: '采购申请未提供需求日期',
  SUPPLIER_COMPANY_NOT_ADMITTED: '供应商未获当前公司准入',
  SUPPLIER_DISABLED: '供应商已停用',
  SUPPLIER_NOT_APPROVED: '供应商未通过审批',
  SUPPLIER_PRODUCT_CODE_MISSING: '供应商产品缺少受控编码',
  SUPPLIER_PRODUCT_NOT_APPROVED: '供应商产品未通过审批',
  SUPPLIER_PRODUCT_VERIFICATION: '供应商产品资料需要人工核验',
  TAX_BASIS_UNKNOWN: '税务计价基础尚未确认',
  UNIT_CONVERSION_INVALID: '采购单位换算系数无效',
};

const SCORE_DIMENSIONS: Array<[keyof CandidatePresentationFacts, string]> = [
  ['costScore', '成本'],
  ['deliveryScore', '交期'],
  ['qualityScore', '质量'],
  ['capacityScore', '产能'],
  ['termsScore', '账期'],
  ['resilienceScore', '韧性'],
];

function decimalNumber(value?: null | number | string) {
  const decimal = new BigNumber(value ?? Number.NaN);
  return decimal.isFinite() ? decimal.toNumber() : undefined;
}

export function eligibilityPresentation(
  status?: null | string,
): EligibilityPresentation {
  const normalized = (
    ['ELIGIBLE', 'INELIGIBLE', 'NEEDS_CONFIRMATION', 'UNKNOWN'].includes(
      status || '',
    )
      ? status
      : 'UNKNOWN'
  ) as KnownEligibilityStatus;
  const presentation = ELIGIBILITY_PRESENTATIONS[normalized];
  if (normalized === 'UNKNOWN' && status && status !== 'UNKNOWN') {
    return {
      ...presentation,
      description: `后端返回了无法识别的资格状态 ${status}，已按证据未知处理并禁止选择。`,
      label: `未知状态（${status}）`,
      status: normalized,
    };
  }
  return { ...presentation, status: normalized };
}

export function evidenceCompleteness(candidate: CandidatePresentationFacts) {
  const status = eligibilityPresentation(candidate.eligibilityStatus).status;
  if (status === 'INELIGIBLE') {
    return {
      color: 'red',
      label: '硬规则不通过',
      note: '该候选不进入评分和分配。',
    };
  }
  if (status === 'UNKNOWN') {
    return {
      color: 'orange',
      label: '证据未知',
      note: '关键证据缺失或无法验证，不能用 0 分代替。',
    };
  }
  if (status === 'NEEDS_CONFIRMATION') {
    return {
      color: 'gold',
      label: '证据待确认',
      note: '总分不可用；仅在公司策略允许且填写例外理由后才能选择。',
    };
  }

  const completeScores = [
    candidate.costScore,
    candidate.deliveryScore,
    candidate.qualityScore,
    candidate.capacityScore,
    candidate.termsScore,
    candidate.resilienceScore,
    candidate.totalScore,
  ].every((value) => scorePercent(value) !== undefined);
  const frozenEvidence = Boolean(
    candidate.evidenceHash && candidate.performanceSnapshotId,
  );
  return completeScores && frozenEvidence
    ? {
        color: 'green',
        label: '证据完整',
        note: '评分维度和冻结证据均由后端返回。',
      }
    : {
        color: 'blue',
        label: '兼容历史证据',
        note: '资格为可选，但当前响应未包含全部新版冻结证据；页面不会补造缺失值。',
      };
}

export function isCandidateSelectable(status?: null | string) {
  const normalized = eligibilityPresentation(status).status;
  return normalized === 'ELIGIBLE' || normalized === 'NEEDS_CONFIRMATION';
}

export function reasonText(code: string) {
  return REASON_TEXT[code] || '后端返回的受控原因，请联系管理员核对规则字典';
}

/** Returns undefined for absent or invalid values; a real numeric zero remains zero. */
export function scorePercent(value?: null | number | string) {
  const score = decimalNumber(value);
  // A value outside the contractual 0..100 range is corrupted evidence, not a
  // value the presentation layer may silently "repair" by clamping it.
  return score === undefined || score < 0 || score > 100 ? undefined : score;
}

export function scoreDimensions(
  candidate: CandidatePresentationFacts,
): ScoreDimension[] {
  return SCORE_DIMENSIONS.map(([key, label]) => ({
    key,
    label,
    value: scorePercent(
      candidate[key] as
        | FdmProcurementSourcingApi.DecimalValue
        | null
        | undefined,
    ),
  }));
}

export function usesNeedsConfirmation(status?: null | string) {
  return eligibilityPresentation(status).status === 'NEEDS_CONFIRMATION';
}
