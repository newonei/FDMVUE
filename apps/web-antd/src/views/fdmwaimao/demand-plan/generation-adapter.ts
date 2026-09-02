import type { FdmWaimaoDemandPlanApi } from '#/api/fdmwaimao/demand-plan';
import type {
  AiFieldConfidence,
  AiFieldMeta,
  AiFieldOrigin,
  AiGenerationJob,
  AiGenerationStage,
  AiValidationIssue,
} from '#/views/fdm-trade-shared/ai-document-generation';

import {
  allocationTypeLabel,
  DEMAND_PLAN_ALLOCATION_TYPES,
  demandPlanAllocationFieldKey,
  demandPlanLineFieldKey,
} from './form-model';

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

function origin(value: unknown, proposedValue: unknown): AiFieldOrigin {
  const raw = String(value || '').toUpperCase();
  if (raw === 'WAREHOUSE_FACTORY_ATP') return 'MASTER_DATA';
  const normalized = raw as AiFieldOrigin;
  if (ORIGINS.has(normalized)) return normalized;
  return proposedValue === undefined ||
    proposedValue === null ||
    proposedValue === ''
    ? 'MISSING'
    : 'AI_INFERRED';
}

function confidence(value: unknown): AiFieldConfidence | undefined {
  const normalized = String(value || '').toUpperCase() as AiFieldConfidence;
  return CONFIDENCES.has(normalized) ? normalized : undefined;
}

function defaultField(
  fieldKey: string,
  label: string,
  proposedValue: unknown,
): AiFieldMeta {
  return {
    alternatives: [],
    evidence: [],
    fieldKey,
    label,
    origin: origin(undefined, proposedValue),
    proposedValue,
  };
}

function rawFieldEntries(
  raw: FdmWaimaoDemandPlanApi.GenerationJob['fieldMetas'],
) {
  if (Array.isArray(raw)) {
    return raw.map(
      (field, index) =>
        [field.fieldKey || field.fieldPath || `field-${index}`, field] as const,
    );
  }
  return Object.entries(raw || {});
}

function adaptFieldConfidence(
  field: FdmWaimaoDemandPlanApi.GenerationFieldMeta,
  fallback?: AiFieldMeta,
): AiFieldConfidence | undefined {
  const explicitConfidence = confidence(field.confidence);
  if (explicitConfidence) return explicitConfidence;
  if (field.status === 'EVIDENCE_AVAILABLE') return 'HIGH';
  if (field.status === 'UNKNOWN') return 'LOW';
  return fallback?.confidence;
}

function adaptRawField(
  key: string,
  field: FdmWaimaoDemandPlanApi.GenerationFieldMeta,
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
  return {
    alternatives: (field.alternatives || []).map((item) => ({
      ...item,
      confidence: confidence(item.confidence),
    })),
    confidence: adaptFieldConfidence(field, fallback),
    evidence: evidence.length > 0 ? evidence : fallback?.evidence || [],
    fieldKey: key,
    label: field.label || fallback?.label || key,
    origin: origin(field.origin, proposedValue),
    proposedValue,
    sourceValue: field.sourceValue ?? fallback?.sourceValue,
  };
}

function normalizeDemandPlanFieldPath(
  rawPath: string,
  proposal: FdmWaimaoDemandPlanApi.GenerationProposal,
) {
  const allocation = rawPath.match(
    /^\$?\.?lines\[(\d+)]\.allocations\[([A-Z_]+)]\.(quantity|recommendationReason|evidenceNote)$/,
  );
  if (allocation) {
    const line = proposal.lines[Number(allocation[1])];
    const type = allocation[2] as FdmWaimaoDemandPlanApi.AllocationType;
    const field = allocation[3] as
      | 'evidenceNote'
      | 'quantity'
      | 'recommendationReason';
    if (line && DEMAND_PLAN_ALLOCATION_TYPES.includes(type)) {
      return demandPlanAllocationFieldKey(
        String(line.sourceContractOrderItemId),
        type,
        field,
      );
    }
  }
  const lineField = rawPath.match(
    /^\$?\.?lines\[(\d+)]\.(decisionNote|requiredDate)$/,
  );
  if (lineField) {
    const line = proposal.lines[Number(lineField[1])];
    if (line) {
      return demandPlanLineFieldKey(
        String(line.sourceContractOrderItemId),
        lineField[2] as 'decisionNote' | 'requiredDate',
      );
    }
  }
  return rawPath;
}

export function completeDemandPlanFieldMetas(
  job: FdmWaimaoDemandPlanApi.GenerationJob,
  sourceOrder: FdmWaimaoDemandPlanApi.SourceOrder,
): AiFieldMeta[] {
  const proposal = job.proposal;
  if (!proposal) return [];
  const proposalLines = new Map(
    (proposal.lines || []).map(
      (line) => [String(line.sourceContractOrderItemId), line] as const,
    ),
  );
  const expected: AiFieldMeta[] = [
    defaultField('remark', '计划备注', proposal.remark),
  ];
  for (const sourceItem of sourceOrder.items) {
    const sourceId = String(sourceItem.id);
    const line: FdmWaimaoDemandPlanApi.GenerationLineProposal =
      proposalLines.get(sourceId) || {
        allocations: DEMAND_PLAN_ALLOCATION_TYPES.map((type) => ({
          quantity: null,
          type,
        })),
        sourceContractOrderItemId: sourceId,
      };
    const productName = sourceItem.name || `产品行 ${sourceId}`;
    expected.push(
      defaultField(
        demandPlanLineFieldKey(line.sourceContractOrderItemId, 'requiredDate'),
        `${productName} · 要求日期`,
        line.requiredDate,
      ),
      defaultField(
        demandPlanLineFieldKey(line.sourceContractOrderItemId, 'decisionNote'),
        `${productName} · 拆分说明`,
        line.decisionNote,
      ),
    );
    for (const type of DEMAND_PLAN_ALLOCATION_TYPES) {
      const allocation: FdmWaimaoDemandPlanApi.GenerationAllocationProposal = (
        line.allocations || []
      ).find((item) => item.type === type) || {
        quantity: null,
        type,
      };
      const label = `${productName} · ${allocationTypeLabel(allocation.type)}`;
      expected.push(
        defaultField(
          demandPlanAllocationFieldKey(
            line.sourceContractOrderItemId,
            allocation.type,
            'quantity',
          ),
          `${label}数量`,
          allocation.quantity,
        ),
        defaultField(
          demandPlanAllocationFieldKey(
            line.sourceContractOrderItemId,
            allocation.type,
            'evidenceNote',
          ),
          `${label}核实说明`,
          allocation.evidenceNote,
        ),
        defaultField(
          demandPlanAllocationFieldKey(
            line.sourceContractOrderItemId,
            allocation.type,
            'recommendationReason',
          ),
          `${label}建议依据`,
          allocation.recommendationReason,
        ),
        defaultField(
          demandPlanAllocationFieldKey(
            line.sourceContractOrderItemId,
            allocation.type,
            'evidenceSourceSystem',
          ),
          `${label}证据来源系统`,
          undefined,
        ),
        defaultField(
          demandPlanAllocationFieldKey(
            line.sourceContractOrderItemId,
            allocation.type,
            'evidenceSourceRefId',
          ),
          `${label}证据引用`,
          undefined,
        ),
        defaultField(
          demandPlanAllocationFieldKey(
            line.sourceContractOrderItemId,
            allocation.type,
            'evidenceSourceVersion',
          ),
          `${label}证据版本`,
          undefined,
        ),
        defaultField(
          demandPlanAllocationFieldKey(
            line.sourceContractOrderItemId,
            allocation.type,
            'evidenceValidUntil',
          ),
          `${label}证据有效期`,
          undefined,
        ),
        defaultField(
          demandPlanAllocationFieldKey(
            line.sourceContractOrderItemId,
            allocation.type,
            'changeReason',
          ),
          `${label}人工修改原因`,
          undefined,
        ),
      );
    }
  }
  const expectedByKey = new Map(
    expected.map((field) => [field.fieldKey, field] as const),
  );
  const incoming = new Map(
    rawFieldEntries(job.fieldMetas).map(([rawKey, field]) => {
      const sourceKey = field.fieldKey || field.fieldPath || rawKey;
      const fieldKey = normalizeDemandPlanFieldPath(sourceKey, proposal);
      const adapted = adaptRawField(
        fieldKey,
        field,
        expectedByKey.get(fieldKey),
      );
      return [adapted.fieldKey, adapted] as const;
    }),
  );
  for (const field of expected) {
    if (!incoming.has(field.fieldKey)) incoming.set(field.fieldKey, field);
  }
  return [...incoming.values()];
}

function generationStage(
  status: FdmWaimaoDemandPlanApi.GenerationJobStatus,
): AiGenerationStage | undefined {
  if (['CONTEXT_BUILDING', 'CREATED', 'QUEUED'].includes(status)) {
    return 'CONTEXT';
  }
  if (status === 'GENERATING') return 'MODEL';
  if (status === 'PARSING') return 'PARSING';
  if (['READY', 'RULE_BLOCKED', 'VALIDATING'].includes(status)) {
    return 'VALIDATION';
  }
  return undefined;
}

export function adaptDemandPlanGenerationJob(
  job: FdmWaimaoDemandPlanApi.GenerationJob,
): AiGenerationJob<FdmWaimaoDemandPlanApi.GenerationProposal> {
  return {
    errorMessage: job.errorMessage,
    generatedAt: job.generatedAt ?? undefined,
    id: job.id,
    invocationId: job.invocationId,
    modelId: job.modelId,
    modelName: job.modelName,
    proposal: job.proposal || undefined,
    proposalVersion: job.proposalVersion ?? undefined,
    sourceVersion: job.sourceVersion,
    stage: generationStage(job.status),
    status: job.status,
    version: job.version,
  };
}

export function adaptDemandPlanRules(
  rules: readonly FdmWaimaoDemandPlanApi.Rule[] = [],
  lines: readonly { sourceContractOrderItemId: string }[] = [],
): AiValidationIssue[] {
  return rules
    .filter((rule) => !rule.passed)
    .map((rule) => ({
      code: rule.ruleCode,
      fieldKey: normalizeRuleFieldPath(rule.fieldPath, lines),
      message: rule.message,
      severity:
        rule.severity === 'BLOCKER' ||
        rule.severity === 'INFO' ||
        rule.severity === 'WARNING'
          ? rule.severity
          : 'WARNING',
    }));
}

function normalizeRuleFieldPath(
  rawPath: null | string | undefined,
  lines: readonly { sourceContractOrderItemId: string }[],
) {
  if (!rawPath) return undefined;
  const match = rawPath.match(/^\$?\.?lines\[(\d+)](.*)$/);
  if (!match) return rawPath;
  const line = lines[Number(match[1])];
  if (!line) return rawPath;
  const suffix = match[2] || '';
  const allocation = suffix.match(
    /^\.allocations\[([A-Z_]+)]\.(evidenceNote|quantity|recommendationReason)$/,
  );
  if (allocation) {
    const type = allocation[1] as FdmWaimaoDemandPlanApi.AllocationType;
    if (DEMAND_PLAN_ALLOCATION_TYPES.includes(type)) {
      return demandPlanAllocationFieldKey(
        String(line.sourceContractOrderItemId),
        type,
        allocation[2] as 'evidenceNote' | 'quantity' | 'recommendationReason',
      );
    }
  }
  if (suffix === '.requiredDate') {
    return demandPlanLineFieldKey(
      String(line.sourceContractOrderItemId),
      'requiredDate',
    );
  }
  return demandPlanLineFieldKey(
    String(line.sourceContractOrderItemId),
    'decisionNote',
  );
}

export function demandPlanDetailFieldMetas(
  detail: FdmWaimaoDemandPlanApi.Detail,
): AiFieldMeta[] {
  const fields: AiFieldMeta[] = [
    {
      ...defaultField('remark', '计划备注', detail.remark),
      origin: 'HUMAN_EDIT',
    },
  ];
  for (const line of detail.lines) {
    fields.push(
      {
        ...defaultField(
          demandPlanLineFieldKey(
            line.sourceContractOrderItemId,
            'requiredDate',
          ),
          `${line.productName} · 要求日期`,
          line.requiredDate,
        ),
        origin: 'HUMAN_EDIT',
      },
      {
        ...defaultField(
          demandPlanLineFieldKey(
            line.sourceContractOrderItemId,
            'decisionNote',
          ),
          `${line.productName} · 拆分说明`,
          line.decisionNote,
        ),
        origin: 'HUMAN_EDIT',
      },
    );
    for (const allocation of line.allocations || []) {
      const label = `${line.productName} · ${allocationTypeLabel(allocation.type)}`;
      fields.push(
        {
          ...defaultField(
            demandPlanAllocationFieldKey(
              line.sourceContractOrderItemId,
              allocation.type,
              'quantity',
            ),
            `${label}数量`,
            allocation.quantity,
          ),
          confidence: confidence(allocation.confidence),
          evidence: allocation.evidenceNote
            ? [
                {
                  detail: allocation.evidenceNote,
                  id: `${allocation.id}-evidence`,
                  label: allocation.sourceName || '核实说明',
                  value: allocation.quantity,
                },
              ]
            : [],
          origin: origin(allocation.fieldOrigin, allocation.quantity),
          sourceValue: allocation.quantity,
        },
        {
          ...defaultField(
            demandPlanAllocationFieldKey(
              line.sourceContractOrderItemId,
              allocation.type,
              'evidenceNote',
            ),
            `${label}核实说明`,
            allocation.evidenceNote,
          ),
          origin:
            allocation.fieldOrigin === 'HUMAN_EDIT'
              ? 'HUMAN_EDIT'
              : origin(undefined, allocation.evidenceNote),
        },
        defaultField(
          demandPlanAllocationFieldKey(
            line.sourceContractOrderItemId,
            allocation.type,
            'recommendationReason',
          ),
          `${label}建议依据`,
          allocation.recommendationReason,
        ),
        ...(
          [
            ['evidenceSourceSystem', '证据来源系统', allocation.sourceSystem],
            ['evidenceSourceRefId', '证据引用', allocation.sourceRefId],
            ['evidenceSourceVersion', '证据版本', allocation.sourceVersion],
            ['evidenceValidUntil', '证据有效期', allocation.evidenceValidUntil],
          ] as const
        ).map(([field, fieldLabel, value]) => ({
          ...defaultField(
            demandPlanAllocationFieldKey(
              line.sourceContractOrderItemId,
              allocation.type,
              field,
            ),
            `${label}${fieldLabel}`,
            value,
          ),
          origin:
            allocation.fieldOrigin === 'HUMAN_EDIT'
              ? ('HUMAN_EDIT' as const)
              : origin(undefined, value),
        })),
        defaultField(
          demandPlanAllocationFieldKey(
            line.sourceContractOrderItemId,
            allocation.type,
            'changeReason',
          ),
          `${label}人工修改原因`,
          undefined,
        ),
      );
    }
  }
  return fields;
}
