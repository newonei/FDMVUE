import type { FdmProcurementRequisitionApi } from '#/api/fdmprocurement/requisition';
import type {
  AiFieldConfidence,
  AiFieldMeta,
  AiFieldOrigin,
  AiGenerationJob,
  AiGenerationStage,
  AiValidationIssue,
} from '#/views/fdm-trade-shared/ai-document-generation';

import { requisitionLineFieldKey } from './form-model';

const ORIGINS = new Set<AiFieldOrigin>([
  'AI_INFERRED',
  'CONFLICT',
  'HUMAN_EDIT',
  'MASTER_DATA',
  'MISSING',
  'RULE_DEFAULT',
  'SOURCE_DOCUMENT',
]);
const CONFIDENCES = new Set<AiFieldConfidence>(['HIGH', 'LOW', 'MEDIUM']);

function fieldOrigin(value: unknown, proposedValue: unknown): AiFieldOrigin {
  const normalized = String(value || '').toUpperCase() as AiFieldOrigin;
  if (ORIGINS.has(normalized)) return normalized;
  return proposedValue === null ||
    proposedValue === undefined ||
    proposedValue === ''
    ? 'MISSING'
    : 'AI_INFERRED';
}

function fieldConfidence(value: unknown) {
  const normalized = String(value || '').toUpperCase() as AiFieldConfidence;
  return CONFIDENCES.has(normalized) ? normalized : undefined;
}

function defaultField(
  fieldKey: string,
  label: string,
  proposedValue: unknown,
  origin: AiFieldOrigin,
): AiFieldMeta {
  return {
    alternatives: [],
    evidence: [],
    fieldKey,
    label,
    origin,
    proposedValue,
  };
}

function rawFieldEntries(
  raw: FdmProcurementRequisitionApi.GenerationJob['fieldMetas'],
) {
  const isFieldMeta = (
    value: unknown,
  ): value is FdmProcurementRequisitionApi.GenerationFieldMeta => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return false;
    const candidate = value as Record<string, unknown>;
    return [
      'alternatives',
      'confidence',
      'editable',
      'evidence',
      'fieldKey',
      'fieldPath',
      'label',
      'origin',
      'proposedValue',
      'reason',
      'sourceValue',
      'status',
    ].some((key) => Object.prototype.hasOwnProperty.call(candidate, key));
  };
  if (Array.isArray(raw)) {
    return raw.flatMap((field, index) =>
      isFieldMeta(field)
        ? [
            [
              field.fieldKey || field.fieldPath || `field-${index}`,
              field,
            ] as const,
          ]
        : [],
    );
  }
  return Object.entries(raw || {}).filter((entry) => isFieldMeta(entry[1]));
}

function normalizeProposalFieldPath(
  rawPath: string,
  proposal: FdmProcurementRequisitionApi.GenerationProposal,
) {
  if (/^\$?\.?summary$/.test(rawPath)) return 'remark';
  const suggestion = rawPath.match(
    /^\$?\.?lineSuggestions\[(\d+)]\.(note|procurementNote|riskCodes)$/,
  );
  if (suggestion) {
    const line = proposal.lineSuggestions[Number(suggestion[1])];
    if (line) {
      return requisitionLineFieldKey(
        line.sourcePlanLineId,
        suggestion[2] === 'riskCodes' ? 'riskCodes' : 'procurementNote',
      );
    }
  }
  const sourceLine = rawPath.match(
    /^\$?\.?lines\[(\d+)]\.(procurementNote|purchaseUnit|requiredDate|riskCodes|unitConversionFactor)$/,
  );
  if (sourceLine) {
    const line = proposal.lineSuggestions[Number(sourceLine[1])];
    if (line) {
      return requisitionLineFieldKey(
        line.sourcePlanLineId,
        sourceLine[2] as
          | 'procurementNote'
          | 'purchaseUnit'
          | 'requiredDate'
          | 'riskCodes'
          | 'unitConversionFactor',
      );
    }
  }
  return rawPath;
}

function adaptRawField(
  key: string,
  field: FdmProcurementRequisitionApi.GenerationFieldMeta,
  fallback?: AiFieldMeta,
): AiFieldMeta {
  const proposedValue = field.proposedValue ?? fallback?.proposedValue;
  const evidence = (field.evidence || []).map((item, index) => ({
    ...item,
    id: item.id || `${key}-evidence-${index}`,
  }));
  if (evidence.length === 0 && field.reason) {
    evidence.push({
      detail: field.reason,
      id: `${key}-reason`,
      label:
        field.status === 'EVIDENCE_AVAILABLE' ? '权威证据说明' : '生成规则说明',
    });
  }
  let confidence = fieldConfidence(field.confidence);
  if (!confidence) {
    if (field.status === 'EVIDENCE_AVAILABLE') confidence = 'HIGH';
    else if (field.status === 'UNKNOWN') confidence = 'LOW';
    else confidence = fallback?.confidence;
  }
  return {
    alternatives: (field.alternatives || []).map((item) => ({
      ...item,
      confidence: fieldConfidence(item.confidence),
    })),
    confidence,
    evidence: evidence.length > 0 ? evidence : fallback?.evidence || [],
    fieldKey: key,
    label: field.label || fallback?.label || key,
    origin: fieldOrigin(field.origin, proposedValue),
    proposedValue,
    sourceValue: field.sourceValue ?? fallback?.sourceValue,
  };
}

export function completeRequisitionFieldMetas(
  job: FdmProcurementRequisitionApi.GenerationJob,
  source: FdmProcurementRequisitionApi.GenerationSource,
): AiFieldMeta[] {
  const proposal = job.proposal;
  if (!proposal) return [];
  const suggestions = new Map(
    proposal.lineSuggestions.map(
      (line) => [line.sourcePlanLineId, line] as const,
    ),
  );
  const expected: AiFieldMeta[] = [
    defaultField('remark', '申请备注', proposal.summary || '', 'AI_INFERRED'),
    defaultField(
      'requiredDate',
      '整单要求日期',
      source.requiredDate || '',
      'SOURCE_DOCUMENT',
    ),
  ];
  for (const line of source.lines) {
    const suggestion = suggestions.get(line.sourcePlanLineId);
    const label = line.productName || `来源行 ${line.sourcePlanLineId}`;
    expected.push(
      defaultField(
        requisitionLineFieldKey(line.sourcePlanLineId, 'requestedQty'),
        `${label} · 权威外采数量`,
        line.externalPurchaseQuantity,
        'SOURCE_DOCUMENT',
      ),
      defaultField(
        requisitionLineFieldKey(line.sourcePlanLineId, 'purchaseUnit'),
        `${label} · 采购单位`,
        line.unit,
        'SOURCE_DOCUMENT',
      ),
      defaultField(
        requisitionLineFieldKey(line.sourcePlanLineId, 'unitConversionFactor'),
        `${label} · 单位换算`,
        '1',
        'RULE_DEFAULT',
      ),
      defaultField(
        requisitionLineFieldKey(line.sourcePlanLineId, 'requiredDate'),
        `${label} · 要求日期`,
        line.requiredDate || source.requiredDate || '',
        'SOURCE_DOCUMENT',
      ),
      defaultField(
        requisitionLineFieldKey(line.sourcePlanLineId, 'procurementNote'),
        `${label} · AI 采购说明`,
        suggestion?.procurementNote || suggestion?.note || '',
        suggestion?.procurementNote || suggestion?.note
          ? 'AI_INFERRED'
          : 'MISSING',
      ),
      defaultField(
        requisitionLineFieldKey(line.sourcePlanLineId, 'riskCodes'),
        `${label} · AI 风险代码`,
        suggestion?.riskCodes || [],
        suggestion?.riskCodes?.length ? 'AI_INFERRED' : 'MISSING',
      ),
    );
  }
  const byKey = new Map(
    expected.map((field) => [field.fieldKey, field] as const),
  );
  for (const [rawKey, rawField] of rawFieldEntries(job.fieldMetas)) {
    const key = normalizeProposalFieldPath(rawKey, proposal);
    byKey.set(key, adaptRawField(key, rawField, byKey.get(key)));
  }
  return [...byKey.values()];
}

function ruleFieldKey(
  fieldPath: null | string | undefined,
  proposal?: FdmProcurementRequisitionApi.GenerationProposal | null,
) {
  if (!fieldPath || !proposal) return undefined;
  return normalizeProposalFieldPath(fieldPath, proposal);
}

function severity(value: string): AiValidationIssue['severity'] {
  const normalized = value.toUpperCase();
  if (normalized === 'INFO' || normalized === 'WARNING') return normalized;
  return 'BLOCKER';
}

export function adaptRequisitionRules(
  rules: readonly FdmProcurementRequisitionApi.GenerationRule[],
  proposal?: FdmProcurementRequisitionApi.GenerationProposal | null,
) {
  return rules
    .filter((rule) => !rule.passed || rule.severity.toUpperCase() !== 'INFO')
    .map<AiValidationIssue>((rule) => ({
      code: rule.ruleCode,
      fieldKey: ruleFieldKey(rule.fieldPath, proposal),
      message: rule.message,
      severity: severity(rule.severity),
    }));
}

function stage(status: FdmProcurementRequisitionApi.GenerationJobStatus) {
  const stages: Partial<
    Record<FdmProcurementRequisitionApi.GenerationJobStatus, AiGenerationStage>
  > = {
    CONTEXT_BUILDING: 'CONTEXT',
    CREATED: 'CONTEXT',
    GENERATING: 'MODEL',
    PARSING: 'PARSING',
    QUEUED: 'CONTEXT',
    VALIDATING: 'VALIDATION',
  };
  return stages[status] || null;
}

export function adaptRequisitionGenerationJob(
  job: FdmProcurementRequisitionApi.GenerationJob,
): AiGenerationJob<FdmProcurementRequisitionApi.GenerationProposal> {
  return {
    errorMessage: job.errorMessage,
    generatedAt: job.generatedAt || undefined,
    id: job.id,
    invocationId: job.invocationId,
    modelId: job.modelId,
    modelName: job.modelName,
    proposal: job.proposal || undefined,
    proposalVersion: job.proposalVersion || undefined,
    sourceVersion: job.sourceVersion,
    stage: stage(job.status),
    status: job.status,
    version: job.version,
  };
}
