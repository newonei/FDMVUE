import type { FdmWaimaoDemandPlanApi } from '#/api/fdmwaimao/demand-plan';
import type {
  AiFieldStateMap,
  AiValidationIssue,
} from '#/views/fdm-trade-shared/ai-document-generation';

import BigNumber from 'bignumber.js';

export interface DemandPlanFormAllocation {
  changeReason: string;
  confidence?: null | string;
  evidenceNote: string;
  evidenceSourceRefId: string;
  evidenceSourceSystem: string;
  evidenceSourceVersion: string;
  evidenceStatus?: null | string;
  evidenceTime?: FdmWaimaoDemandPlanApi.DateTimeValue | null;
  evidenceValidUntil?: FdmWaimaoDemandPlanApi.DateTimeValue | null;
  fieldOrigin?: null | string;
  id?: string;
  quantity: string;
  recommendationReason: string;
  sourceName?: null | string;
  sourceRefId?: null | string;
  sourceSystem?: null | string;
  type: FdmWaimaoDemandPlanApi.AllocationType;
}

export interface DemandPlanFormLine {
  allocations: DemandPlanFormAllocation[];
  contractQuantity: string;
  decisionNote: string;
  id?: string;
  lineNo?: null | number;
  mappingStatus?: null | string;
  productCode?: null | string;
  productId?: null | string;
  productName: string;
  requiredDate: string;
  skuId?: null | string;
  sourceContractOrderItemId: string;
  unit?: null | string;
}

export interface DemandPlanFormModel {
  expectedRunVersion?: string;
  expectedSourceVersion: number;
  generationRunId?: string;
  id?: string;
  lines: DemandPlanFormLine[];
  proposalVersion?: number;
  remark: string;
  sourceSnapshotHash?: string;
  status?: FdmWaimaoDemandPlanApi.DemandPlanStatus;
  version?: number;
}

export const DEMAND_PLAN_ALLOCATION_TYPES = [
  'STOCK',
  'INTERNAL_FACTORY',
  'EXTERNAL_PURCHASE',
] as const satisfies readonly FdmWaimaoDemandPlanApi.AllocationType[];

const HUMAN_EVIDENCE_SYSTEMS = new Set([
  'ERP_SCREENSHOT',
  'FACTORY_CONFIRMATION',
  'MANUAL_CHECK',
  'SUPPLIER_CONFIRMATION',
  'WAREHOUSE_CONFIRMATION',
  'WAREHOUSE_SCREENSHOT',
]);
const EVIDENCE_SOURCE_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;

export function demandPlanLineFieldKey(
  sourceContractOrderItemId: string,
  field: 'decisionNote' | 'requiredDate',
) {
  return `lines.${sourceContractOrderItemId}.${field}`;
}

export function demandPlanAllocationFieldKey(
  sourceContractOrderItemId: string,
  type: FdmWaimaoDemandPlanApi.AllocationType,
  field:
    | 'changeReason'
    | 'evidenceNote'
    | 'evidenceSourceRefId'
    | 'evidenceSourceSystem'
    | 'evidenceSourceVersion'
    | 'evidenceValidUntil'
    | 'quantity'
    | 'recommendationReason',
) {
  return `lines.${sourceContractOrderItemId}.allocations.${type}.${field}`;
}

export function asDecimalString(value: unknown): string | undefined {
  const normalized = String(value ?? '').trim();
  if (!normalized) return undefined;
  const decimal = new BigNumber(normalized);
  if (!decimal.isFinite()) return undefined;
  return decimal.toFixed(decimal.decimalPlaces() ?? 0);
}

export function displayKnownQuantity(value: null | string | undefined) {
  const normalized = String(value ?? '').trim();
  return normalized || '未知';
}

function allocationOf<
  T extends { type: FdmWaimaoDemandPlanApi.AllocationType },
>(
  allocations: T[],
  type: FdmWaimaoDemandPlanApi.AllocationType,
): T | undefined {
  return allocations.find((item) => item.type === type);
}

function proposalLineToForm(
  line: FdmWaimaoDemandPlanApi.GenerationLineProposal,
  sourceItem: FdmWaimaoDemandPlanApi.SourceOrderItem,
  defaultRequiredDate?: null | string,
): DemandPlanFormLine {
  return {
    allocations: DEMAND_PLAN_ALLOCATION_TYPES.map((type) => {
      const allocation = allocationOf(line.allocations || [], type);
      return {
        changeReason: '',
        evidenceNote: allocation?.evidenceNote || '',
        evidenceSourceRefId: '',
        evidenceSourceSystem: '',
        evidenceSourceVersion: '',
        quantity: String(allocation?.quantity ?? '').trim(),
        recommendationReason: allocation?.recommendationReason || '',
        type,
      };
    }),
    contractQuantity: String(sourceItem.quantity),
    decisionNote: line.decisionNote || '',
    lineNo: sourceItem.lineNo,
    mappingStatus: sourceItem.mappingStatus,
    productCode: sourceItem.code,
    productId: sourceItem.productId,
    productName: sourceItem.name,
    requiredDate: line.requiredDate || defaultRequiredDate || '',
    skuId: sourceItem.skuId,
    sourceContractOrderItemId: String(line.sourceContractOrderItemId),
    unit: sourceItem.unit,
  };
}

export function proposalToForm(
  proposal: FdmWaimaoDemandPlanApi.GenerationProposal,
  sourceOrder: FdmWaimaoDemandPlanApi.SourceOrder,
  job: Pick<
    FdmWaimaoDemandPlanApi.GenerationJob,
    | 'id'
    | 'proposalVersion'
    | 'sourceSnapshotHash'
    | 'sourceVersion'
    | 'version'
  >,
): DemandPlanFormModel {
  const expectedSourceVersion = Number(job.sourceVersion);
  if (
    !Number.isSafeInteger(expectedSourceVersion) ||
    expectedSourceVersion < 0
  ) {
    throw new Error('来源合同版本无效，请重新读取生成任务。');
  }
  const proposalLines = new Map(
    (proposal.lines || []).map(
      (line) => [String(line.sourceContractOrderItemId), line] as const,
    ),
  );
  const lines = sourceOrder.items.map((sourceItem) => {
    const sourceId = String(sourceItem.id);
    const line = proposalLines.get(sourceId) || {
      allocations: DEMAND_PLAN_ALLOCATION_TYPES.map((type) => ({
        quantity: null,
        type,
      })),
      sourceContractOrderItemId: sourceId,
    };
    return proposalLineToForm(
      line,
      sourceItem,
      sourceOrder.requiredDeliveryDate,
    );
  });

  for (const [sourceId, line] of proposalLines) {
    if (sourceOrder.items.some((item) => String(item.id) === sourceId))
      continue;
    lines.push(
      proposalLineToForm(
        line,
        {
          id: sourceId,
          mappingStatus: 'UNMAPPED',
          name: `未知合同产品行 ${sourceId}`,
          quantity: '',
        },
        sourceOrder.requiredDeliveryDate,
      ),
    );
  }

  return {
    expectedRunVersion: job.version,
    expectedSourceVersion,
    generationRunId: job.id,
    lines,
    proposalVersion: job.proposalVersion ?? undefined,
    remark: proposal.remark || '',
    sourceSnapshotHash: job.sourceSnapshotHash,
  };
}

export function detailToForm(
  detail: FdmWaimaoDemandPlanApi.Detail,
): DemandPlanFormModel {
  return {
    expectedSourceVersion: detail.contractOrderVersion,
    generationRunId: detail.generationRunId || undefined,
    id: detail.id,
    lines: detail.lines.map((line) => ({
      allocations: DEMAND_PLAN_ALLOCATION_TYPES.map((type) => {
        const allocation = allocationOf(line.allocations || [], type);
        return {
          changeReason: '',
          confidence: allocation?.confidence,
          evidenceNote: allocation?.evidenceNote || '',
          evidenceSourceRefId: allocation?.sourceRefId || '',
          evidenceSourceSystem: allocation?.sourceSystem || '',
          evidenceSourceVersion: allocation?.sourceVersion || '',
          evidenceStatus: allocation?.evidenceStatus,
          evidenceTime: allocation?.evidenceTime,
          evidenceValidUntil: allocation?.evidenceValidUntil,
          fieldOrigin: allocation?.fieldOrigin,
          id: allocation?.id,
          quantity: String(allocation?.quantity ?? '').trim(),
          recommendationReason: allocation?.recommendationReason || '',
          sourceName: allocation?.sourceName,
          sourceRefId: allocation?.sourceRefId,
          sourceSystem: allocation?.sourceSystem,
          type,
        };
      }),
      contractQuantity: String(line.contractQuantity),
      decisionNote: line.decisionNote || '',
      id: line.id,
      lineNo: line.lineNo,
      mappingStatus: line.mappingStatus,
      productCode: line.productCode,
      productId: line.productId,
      productName: line.productName,
      requiredDate: line.requiredDate || '',
      skuId: line.skuId,
      sourceContractOrderItemId: line.sourceContractOrderItemId,
      unit: line.unit,
    })),
    proposalVersion: detail.generationProposalVersion ?? undefined,
    remark: detail.remark || '',
    sourceSnapshotHash: detail.sourceSnapshotHash || undefined,
    status: detail.status,
    version: detail.version,
  };
}

function preserveHumanValue(
  fields: AiFieldStateMap,
  fieldKey: string,
  current: string,
  incoming: string,
) {
  return fields[fieldKey]?.origin === 'HUMAN_EDIT' ? current : incoming;
}

/** Regeneration refreshes AI values and evidence, but never replaces edits. */
export function mergeProposalIntoForm(
  current: DemandPlanFormModel,
  incoming: DemandPlanFormModel,
  fields: AiFieldStateMap,
): DemandPlanFormModel {
  const currentLines = new Map(
    current.lines.map(
      (line) => [line.sourceContractOrderItemId, line] as const,
    ),
  );
  return {
    ...incoming,
    id: current.id,
    remark: preserveHumanValue(
      fields,
      'remark',
      current.remark,
      incoming.remark,
    ),
    status: current.status,
    version: current.version,
    lines: incoming.lines.map((line) => {
      const previous = currentLines.get(line.sourceContractOrderItemId);
      if (!previous) return line;
      const allocations = line.allocations.map((allocation) => {
        const previousAllocation = previous.allocations.find(
          (item) => item.type === allocation.type,
        );
        if (!previousAllocation) return allocation;
        return {
          ...allocation,
          id: previousAllocation.id,
          changeReason: preserveHumanValue(
            fields,
            demandPlanAllocationFieldKey(
              line.sourceContractOrderItemId,
              allocation.type,
              'changeReason',
            ),
            previousAllocation.changeReason,
            allocation.changeReason,
          ),
          evidenceNote: preserveHumanValue(
            fields,
            demandPlanAllocationFieldKey(
              line.sourceContractOrderItemId,
              allocation.type,
              'evidenceNote',
            ),
            previousAllocation.evidenceNote,
            allocation.evidenceNote,
          ),
          evidenceSourceRefId: preserveHumanValue(
            fields,
            demandPlanAllocationFieldKey(
              line.sourceContractOrderItemId,
              allocation.type,
              'evidenceSourceRefId',
            ),
            previousAllocation.evidenceSourceRefId,
            allocation.evidenceSourceRefId,
          ),
          evidenceSourceSystem: preserveHumanValue(
            fields,
            demandPlanAllocationFieldKey(
              line.sourceContractOrderItemId,
              allocation.type,
              'evidenceSourceSystem',
            ),
            previousAllocation.evidenceSourceSystem,
            allocation.evidenceSourceSystem,
          ),
          evidenceSourceVersion: preserveHumanValue(
            fields,
            demandPlanAllocationFieldKey(
              line.sourceContractOrderItemId,
              allocation.type,
              'evidenceSourceVersion',
            ),
            previousAllocation.evidenceSourceVersion,
            allocation.evidenceSourceVersion,
          ),
          evidenceValidUntil: preserveHumanValue(
            fields,
            demandPlanAllocationFieldKey(
              line.sourceContractOrderItemId,
              allocation.type,
              'evidenceValidUntil',
            ),
            String(previousAllocation.evidenceValidUntil ?? ''),
            String(allocation.evidenceValidUntil ?? ''),
          ),
          quantity: preserveHumanValue(
            fields,
            demandPlanAllocationFieldKey(
              line.sourceContractOrderItemId,
              allocation.type,
              'quantity',
            ),
            previousAllocation.quantity,
            allocation.quantity,
          ),
          recommendationReason: preserveHumanValue(
            fields,
            demandPlanAllocationFieldKey(
              line.sourceContractOrderItemId,
              allocation.type,
              'recommendationReason',
            ),
            previousAllocation.recommendationReason,
            allocation.recommendationReason,
          ),
        };
      });
      return {
        ...line,
        allocations,
        decisionNote: preserveHumanValue(
          fields,
          demandPlanLineFieldKey(
            line.sourceContractOrderItemId,
            'decisionNote',
          ),
          previous.decisionNote,
          line.decisionNote,
        ),
        id: previous.id,
        requiredDate: preserveHumanValue(
          fields,
          demandPlanLineFieldKey(
            line.sourceContractOrderItemId,
            'requiredDate',
          ),
          previous.requiredDate,
          line.requiredDate,
        ),
      };
    }),
  };
}

export function demandPlanAllocatedQuantity(line: DemandPlanFormLine) {
  const values = line.allocations.map((allocation) =>
    asDecimalString(allocation.quantity),
  );
  if (values.some((value) => value === undefined)) return undefined;
  let total = new BigNumber(0);
  for (const value of values) total = total.plus(value!);
  return total.toFixed(total.decimalPlaces() ?? 0);
}

export function isDemandPlanLineBalanced(line: DemandPlanFormLine) {
  const allocated = demandPlanAllocatedQuantity(line);
  const contract = asDecimalString(line.contractQuantity);
  return (
    allocated !== undefined &&
    contract !== undefined &&
    new BigNumber(allocated).isEqualTo(contract)
  );
}

export function clientValidateDemandPlan(
  form: DemandPlanFormModel,
  mode: 'CONFIRM' | 'DRAFT' = 'DRAFT',
  fields: AiFieldStateMap = {},
): AiValidationIssue[] {
  const issues: AiValidationIssue[] = [];
  if (form.lines.length === 0) {
    issues.push({
      code: 'PLAN_LINES_REQUIRED',
      message: '来源合同没有可生成需求的产品明细。',
      severity: 'BLOCKER',
    });
  }
  for (const line of form.lines) {
    if (mode === 'CONFIRM' && !line.requiredDate) {
      issues.push({
        code: 'REQUIRED_DATE_MISSING',
        fieldKey: demandPlanLineFieldKey(
          line.sourceContractOrderItemId,
          'requiredDate',
        ),
        message: `${line.productName} 缺少要求完成日期。`,
        severity: 'BLOCKER',
      });
    }
    if (mode === 'CONFIRM' && line.mappingStatus !== 'MAPPED') {
      issues.push({
        code: 'PRODUCT_MAPPING_INCOMPLETE',
        message: `${line.productName} 尚未完成产品映射，不能确认计划。`,
        severity: 'BLOCKER',
      });
    }
    if (line.allocations.length !== DEMAND_PLAN_ALLOCATION_TYPES.length) {
      issues.push({
        code: 'ALLOCATION_TYPES_INCOMPLETE',
        message: `${line.productName} 必须同时包含库存、内部工厂和外部采购三类分配。`,
        severity: 'BLOCKER',
      });
      continue;
    }
    for (const allocation of line.allocations) {
      const fieldKey = demandPlanAllocationFieldKey(
        line.sourceContractOrderItemId,
        allocation.type,
        'quantity',
      );
      const rawQuantity = allocation.quantity.trim();
      const quantity = asDecimalString(allocation.quantity);
      if (rawQuantity && quantity === undefined) {
        issues.push({
          code: 'ALLOCATION_FORMAT_INVALID',
          fieldKey,
          message: `${line.productName} 的${allocationTypeLabel(allocation.type)}数量格式无效。`,
          severity: 'BLOCKER',
        });
      } else if (quantity === undefined) {
        issues.push({
          code: 'ALLOCATION_UNKNOWN',
          fieldKey,
          message: `${line.productName} 的${allocationTypeLabel(allocation.type)}数量未知，确认前必须人工核实。`,
          severity: mode === 'CONFIRM' ? 'BLOCKER' : 'WARNING',
        });
      } else if (new BigNumber(quantity).isNegative()) {
        issues.push({
          code: 'ALLOCATION_NEGATIVE',
          fieldKey,
          message: `${line.productName} 的${allocationTypeLabel(allocation.type)}数量不能为负数。`,
          severity: 'BLOCKER',
        });
      } else if (!/^\d{1,18}(?:\.\d{1,6})?$/.test(quantity)) {
        issues.push({
          code: 'ALLOCATION_FORMAT_INVALID',
          fieldKey,
          message: `${line.productName} 的${allocationTypeLabel(allocation.type)}数量最多支持 18 位整数和 6 位小数。`,
          severity: 'BLOCKER',
        });
      }
      const manuallyEdited =
        fields[fieldKey]?.origin === 'HUMAN_EDIT' ||
        allocation.fieldOrigin === 'HUMAN_EDIT';
      if (
        quantity !== undefined &&
        manuallyEdited &&
        !allocation.evidenceNote.trim()
      ) {
        issues.push({
          code: 'MANUAL_EVIDENCE_REQUIRED',
          fieldKey: demandPlanAllocationFieldKey(
            line.sourceContractOrderItemId,
            allocation.type,
            'evidenceNote',
          ),
          message: `${line.productName} 的${allocationTypeLabel(allocation.type)}数量已被人工修改，请填写核实说明。`,
          severity: 'BLOCKER',
        });
      }
      if (quantity !== undefined && manuallyEdited) {
        const requiredEvidence = [
          [
            'evidenceSourceSystem',
            allocation.evidenceSourceSystem,
            '证据来源系统',
          ],
          [
            'evidenceSourceVersion',
            allocation.evidenceSourceVersion,
            '证据来源版本',
          ],
          ['evidenceValidUntil', allocation.evidenceValidUntil, '证据有效期'],
        ] as const;
        for (const [field, value, label] of requiredEvidence) {
          if (String(value ?? '').trim()) continue;
          issues.push({
            code: 'MANUAL_EVIDENCE_METADATA_REQUIRED',
            fieldKey: demandPlanAllocationFieldKey(
              line.sourceContractOrderItemId,
              allocation.type,
              field,
            ),
            message: `${line.productName} 的${allocationTypeLabel(allocation.type)}数量已被人工修改，请填写${label}。`,
            severity: mode === 'CONFIRM' ? 'BLOCKER' : 'WARNING',
          });
        }
        if (
          allocation.evidenceSourceSystem &&
          !HUMAN_EVIDENCE_SYSTEMS.has(allocation.evidenceSourceSystem)
        ) {
          issues.push({
            code: 'MANUAL_EVIDENCE_SOURCE_INVALID',
            fieldKey: demandPlanAllocationFieldKey(
              line.sourceContractOrderItemId,
              allocation.type,
              'evidenceSourceSystem',
            ),
            message: `${line.productName} 的${allocationTypeLabel(allocation.type)}证据来源无效，请从允许的核实渠道中选择。`,
            severity: mode === 'CONFIRM' ? 'BLOCKER' : 'WARNING',
          });
        }
        if (
          allocation.evidenceSourceVersion &&
          !EVIDENCE_SOURCE_VERSION_PATTERN.test(
            allocation.evidenceSourceVersion,
          )
        ) {
          issues.push({
            code: 'MANUAL_EVIDENCE_VERSION_INVALID',
            fieldKey: demandPlanAllocationFieldKey(
              line.sourceContractOrderItemId,
              allocation.type,
              'evidenceSourceVersion',
            ),
            message: `${line.productName} 的${allocationTypeLabel(allocation.type)}证据版本格式无效。`,
            severity: mode === 'CONFIRM' ? 'BLOCKER' : 'WARNING',
          });
        }
        const validUntil = Date.parse(
          String(allocation.evidenceValidUntil ?? ''),
        );
        if (
          String(allocation.evidenceValidUntil ?? '').trim() &&
          (!Number.isFinite(validUntil) || validUntil <= Date.now())
        ) {
          issues.push({
            code: 'MANUAL_EVIDENCE_EXPIRED',
            fieldKey: demandPlanAllocationFieldKey(
              line.sourceContractOrderItemId,
              allocation.type,
              'evidenceValidUntil',
            ),
            message: `${line.productName} 的${allocationTypeLabel(allocation.type)}证据有效期必须晚于当前时间。`,
            severity: mode === 'CONFIRM' ? 'BLOCKER' : 'WARNING',
          });
        }
      }
    }
    const allocated = demandPlanAllocatedQuantity(line);
    const contract = asDecimalString(line.contractQuantity);
    if (
      allocated !== undefined &&
      contract !== undefined &&
      !new BigNumber(allocated).isEqualTo(contract)
    ) {
      issues.push({
        code: 'ALLOCATION_NOT_BALANCED',
        fieldKey: demandPlanLineFieldKey(
          line.sourceContractOrderItemId,
          'decisionNote',
        ),
        message: `${line.productName} 的三类分配合计 ${allocated}，与合同数量 ${contract} 不一致。`,
        severity: mode === 'CONFIRM' ? 'BLOCKER' : 'WARNING',
      });
    }
  }
  return issues;
}

export function allocationTypeLabel(
  type: FdmWaimaoDemandPlanApi.AllocationType,
) {
  if (type === 'STOCK') return '库存分配';
  if (type === 'INTERNAL_FACTORY') return '内部生产';
  return '外部采购';
}

function buildLineReq(
  line: DemandPlanFormLine,
): FdmWaimaoDemandPlanApi.LineDraftReq {
  return {
    allocations: line.allocations.map((allocation) => ({
      changeReason: allocation.changeReason.trim() || undefined,
      evidenceNote: allocation.evidenceNote.trim() || undefined,
      evidenceSourceRefId: allocation.evidenceSourceRefId.trim() || undefined,
      evidenceSourceSystem: allocation.evidenceSourceSystem.trim() || undefined,
      evidenceSourceVersion:
        allocation.evidenceSourceVersion.trim() || undefined,
      evidenceValidUntil:
        String(allocation.evidenceValidUntil ?? '').trim() || undefined,
      id: allocation.id,
      quantity: asDecimalString(allocation.quantity) ?? null,
      recommendationReason: allocation.recommendationReason.trim() || undefined,
      type: allocation.type,
    })),
    decisionNote: line.decisionNote.trim() || undefined,
    id: line.id,
    requiredDate: line.requiredDate || undefined,
    sourceContractOrderItemId: line.sourceContractOrderItemId,
  };
}

export function buildDemandPlanMaterializeReq(
  form: DemandPlanFormModel,
): FdmWaimaoDemandPlanApi.MaterializeReq {
  if (
    !form.generationRunId ||
    form.expectedRunVersion === undefined ||
    form.proposalVersion === undefined ||
    !form.sourceSnapshotHash
  ) {
    throw new Error('生成任务上下文不完整，请重新生成需求计划建议。');
  }
  return {
    expectedRunVersion: form.expectedRunVersion,
    expectedSourceSnapshotHash: form.sourceSnapshotHash,
    expectedSourceVersion: form.expectedSourceVersion,
    generationRunId: form.generationRunId,
    lines: form.lines.map(buildLineReq),
    proposalVersion: form.proposalVersion,
    remark: form.remark.trim() || undefined,
  };
}

export function buildDemandPlanUpdateReq(
  form: DemandPlanFormModel,
): FdmWaimaoDemandPlanApi.UpdateReq {
  if (!form.id || form.version === undefined) {
    throw new Error('需求计划版本信息不完整，请刷新页面后重试。');
  }
  const generationContext: Partial<
    Pick<
      FdmWaimaoDemandPlanApi.UpdateReq,
      | 'expectedRunVersion'
      | 'expectedSourceSnapshotHash'
      | 'generationRunId'
      | 'proposalVersion'
    >
  > =
    form.expectedRunVersion === undefined
      ? {}
      : {
          expectedRunVersion: form.expectedRunVersion,
          expectedSourceSnapshotHash: form.sourceSnapshotHash,
          generationRunId: form.generationRunId,
          proposalVersion: form.proposalVersion,
        };
  if (
    form.expectedRunVersion !== undefined &&
    (!generationContext.generationRunId ||
      generationContext.proposalVersion === undefined ||
      !generationContext.expectedSourceSnapshotHash)
  ) {
    throw new Error('再生成提案上下文不完整，请重新读取生成结果。');
  }
  return {
    ...generationContext,
    expectedVersion: form.version,
    id: form.id,
    lines: form.lines.map(buildLineReq),
    remark: form.remark.trim() || undefined,
  };
}

export function setDemandPlanFieldValue(
  form: DemandPlanFormModel,
  fieldKey: string,
  value: unknown,
) {
  const normalized = String(value ?? '');
  if (fieldKey === 'remark') {
    form.remark = normalized;
    return true;
  }
  const parts = fieldKey.split('.');
  if (parts[0] !== 'lines' || !parts[1]) return false;
  const line = form.lines.find(
    (item) => item.sourceContractOrderItemId === parts[1],
  );
  if (!line) return false;
  if (parts[2] === 'requiredDate' || parts[2] === 'decisionNote') {
    line[parts[2]] = normalized;
    return true;
  }
  if (parts[2] !== 'allocations' || !parts[3] || !parts[4]) return false;
  const allocation = line.allocations.find((item) => item.type === parts[3]);
  if (!allocation) return false;
  if (
    parts[4] === 'changeReason' ||
    parts[4] === 'evidenceNote' ||
    parts[4] === 'evidenceSourceRefId' ||
    parts[4] === 'evidenceSourceSystem' ||
    parts[4] === 'evidenceSourceVersion' ||
    parts[4] === 'evidenceValidUntil' ||
    parts[4] === 'quantity' ||
    parts[4] === 'recommendationReason'
  ) {
    allocation[parts[4]] = normalized;
    return true;
  }
  return false;
}
