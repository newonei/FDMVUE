import type { FdmProcurementRequisitionApi } from '#/api/fdmprocurement/requisition';
import type {
  AiFieldMeta,
  AiFieldStateMap,
  AiValidationIssue,
} from '#/views/fdm-trade-shared/ai-document-generation';

import BigNumber from 'bignumber.js';

const DECIMAL_PATTERN = /^\d{1,16}(?:\.\d{1,8})?$/;

export interface RequisitionDraftFormLine {
  customizationSnapshot: string;
  id?: string;
  itemExpectedVersion?: number;
  lineNo?: null | number;
  procurementNote: string;
  productCode: string;
  productId?: string;
  productMappingStatus: string;
  productName: string;
  productVersionToken?: string;
  purchaseUnit: string;
  requestedQty: string;
  requiredDate: string;
  riskCodes: string[];
  skuId?: string;
  sourceContractLineId?: string;
  sourcePlanLineId: string;
  specification: string;
  unitConversionFactor: string;
}

export interface RequisitionDraftFormModel {
  editReason: string;
  expectedPlanVersion: number;
  expectedRunVersion?: number;
  generationRunId?: string;
  id?: string;
  lines: RequisitionDraftFormLine[];
  proposalVersion?: number;
  remark: string;
  requiredDate: string;
  sourcePlanId: string;
  sourceSnapshotHash: string;
  version?: number;
}

export type RequisitionEditableLineField = 'procurementNote' | 'requiredDate';

export function requisitionHeaderFieldKey(field: 'remark' | 'requiredDate') {
  return field;
}

export function requisitionLineFieldKey(
  sourcePlanLineId: string,
  field:
    | 'purchaseUnit'
    | 'requestedQty'
    | 'riskCodes'
    | 'unitConversionFactor'
    | RequisitionEditableLineField,
) {
  return `lines.${sourcePlanLineId}.${field}`;
}

function decimalString(value: unknown) {
  if (value === null || value === undefined || value === '') return '';
  try {
    return new BigNumber(String(value)).toFixed();
  } catch {
    return String(value);
  }
}

function optionalId(value: null | string | undefined) {
  return value || undefined;
}

function sourceLineToForm(
  line: FdmProcurementRequisitionApi.GenerationSourceLine,
  suggestion?: FdmProcurementRequisitionApi.GenerationLineProposal,
): RequisitionDraftFormLine {
  return {
    customizationSnapshot: line.customizationSnapshot || '',
    lineNo: line.lineNo,
    procurementNote: suggestion?.procurementNote || suggestion?.note || '',
    productCode: line.productCode || '',
    productId: optionalId(line.productId),
    productMappingStatus: line.productMappingStatus || 'UNKNOWN',
    productName: line.productName,
    productVersionToken: line.productVersionToken || undefined,
    purchaseUnit: line.unit,
    requestedQty: decimalString(line.externalPurchaseQuantity),
    requiredDate: line.requiredDate || '',
    riskCodes: [...(suggestion?.riskCodes || [])],
    skuId: optionalId(line.skuId),
    sourceContractLineId: optionalId(line.sourceContractLineId),
    sourcePlanLineId: line.sourcePlanLineId,
    specification: line.specification || '',
    unitConversionFactor: '1',
  };
}

export function proposalToRequisitionForm(
  proposal: FdmProcurementRequisitionApi.GenerationProposal,
  source: FdmProcurementRequisitionApi.GenerationSource,
  job: Pick<
    FdmProcurementRequisitionApi.GenerationJob,
    | 'id'
    | 'proposalVersion'
    | 'sourceSnapshotHash'
    | 'sourceVersion'
    | 'version'
  >,
): RequisitionDraftFormModel {
  const suggestions = new Map(
    proposal.lineSuggestions.map(
      (line) => [line.sourcePlanLineId, line] as const,
    ),
  );
  return {
    editReason: '',
    expectedPlanVersion: Number(job.sourceVersion),
    expectedRunVersion: job.version,
    generationRunId: job.id,
    lines: source.lines.map((line) =>
      sourceLineToForm(line, suggestions.get(line.sourcePlanLineId)),
    ),
    proposalVersion: job.proposalVersion ?? undefined,
    remark: proposal.summary || '',
    requiredDate: source.requiredDate || '',
    sourcePlanId: source.fulfillmentPlanId,
    sourceSnapshotHash: job.sourceSnapshotHash,
  };
}

export function detailToRequisitionForm(
  detail: FdmProcurementRequisitionApi.Requisition,
): RequisitionDraftFormModel {
  return {
    editReason: '',
    expectedPlanVersion: detail.sourcePlanVersion,
    generationRunId: detail.generationRunId || undefined,
    id: detail.id,
    lines: detail.items.map((item) => ({
      customizationSnapshot:
        item.customizationSnapshot || item.customization || '',
      id: item.id,
      itemExpectedVersion: item.version,
      lineNo: item.lineNo,
      procurementNote: item.procurementNote || '',
      productCode: item.productCode || '',
      productId: optionalId(item.productId),
      productMappingStatus: item.productMappingStatus || 'UNKNOWN',
      productName: item.productName,
      productVersionToken: item.productVersionToken || undefined,
      purchaseUnit: item.purchaseUnit || '',
      requestedQty: decimalString(item.requestedQty),
      requiredDate: item.requiredDate || '',
      riskCodes: [...(item.riskCodes || [])],
      skuId: optionalId(item.skuId),
      sourceContractLineId: item.sourceContractLineId || undefined,
      sourcePlanLineId: item.sourcePlanLineId,
      specification: item.specification || '',
      unitConversionFactor: decimalString(item.unitConversionFactor),
    })),
    proposalVersion: detail.proposalVersion || undefined,
    remark: detail.remark || '',
    requiredDate: detail.requiredDate || '',
    sourcePlanId: detail.sourcePlanId,
    sourceSnapshotHash: detail.sourceSnapshotHash,
    version: detail.version,
  };
}

function preserveHumanValue(
  fields: AiFieldStateMap,
  fieldKey: string,
  previous: string,
  incoming: string,
) {
  return fields[fieldKey]?.origin === 'HUMAN_EDIT' ? previous : incoming;
}

export function mergeRequisitionProposalIntoForm(
  current: RequisitionDraftFormModel,
  incoming: RequisitionDraftFormModel,
  fields: AiFieldStateMap,
): RequisitionDraftFormModel {
  const currentLines = new Map(
    current.lines.map((line) => [line.sourcePlanLineId, line] as const),
  );
  return {
    ...incoming,
    id: current.id,
    lines: incoming.lines.map((line) => {
      const previous = currentLines.get(line.sourcePlanLineId);
      if (!previous) return line;
      const keep = (field: RequisitionEditableLineField) =>
        preserveHumanValue(
          fields,
          requisitionLineFieldKey(line.sourcePlanLineId, field),
          previous[field],
          line[field],
        );
      return {
        ...line,
        id: previous.id,
        itemExpectedVersion: previous.itemExpectedVersion,
        procurementNote: keep('procurementNote'),
        requiredDate: keep('requiredDate'),
      };
    }),
    remark: preserveHumanValue(
      fields,
      'remark',
      current.remark,
      incoming.remark,
    ),
    requiredDate: preserveHumanValue(
      fields,
      'requiredDate',
      current.requiredDate,
      incoming.requiredDate,
    ),
    version: current.version,
    editReason: current.editReason,
  };
}

function buildDraftLine(
  line: RequisitionDraftFormLine,
): FdmProcurementRequisitionApi.RequisitionDraftItemReq {
  return {
    procurementNote: line.procurementNote.trim(),
    productId: line.productId,
    productVersionToken: line.productVersionToken,
    purchaseUnit: line.purchaseUnit.trim(),
    requestedQty: line.requestedQty,
    requiredDate: line.requiredDate || undefined,
    skuId: line.skuId,
    sourceContractLineId: line.sourceContractLineId,
    sourcePlanLineId: line.sourcePlanLineId,
    unitConversionFactor: line.unitConversionFactor,
  };
}

export function buildRequisitionMaterializeReq(
  form: RequisitionDraftFormModel,
  idempotencyKey: string,
): FdmProcurementRequisitionApi.CreateFromGenerationReq {
  if (
    !form.generationRunId ||
    form.expectedRunVersion === undefined ||
    form.proposalVersion === undefined ||
    !form.sourcePlanId
  ) {
    throw new Error('生成任务版本不完整，请重新读取 AI 建议。');
  }
  return {
    draft: {
      items: form.lines.map(buildDraftLine),
      remark: form.remark.trim(),
      requiredDate: form.requiredDate || undefined,
    },
    expectedPlanVersion: form.expectedPlanVersion,
    expectedRunVersion: form.expectedRunVersion,
    fulfillmentPlanId: form.sourcePlanId,
    generationRunId: form.generationRunId,
    idempotencyKey,
    proposalVersion: form.proposalVersion,
  };
}

export function buildRequisitionUpdateReq(
  form: RequisitionDraftFormModel,
): FdmProcurementRequisitionApi.UpdateDraftReq {
  if (!form.id || form.version === undefined) {
    throw new Error('采购申请版本信息不完整，请刷新后重试。');
  }
  return {
    editReason: form.editReason.trim() || undefined,
    expectedVersion: form.version,
    id: form.id,
    items: form.lines.map((line) => {
      if (!line.id || line.itemExpectedVersion === undefined) {
        throw new Error('采购申请行版本信息不完整，请刷新后重试。');
      }
      return {
        ...buildDraftLine(line),
        id: line.id,
        itemExpectedVersion: line.itemExpectedVersion,
      };
    }),
    remark: form.remark.trim(),
    requiredDate: form.requiredDate || undefined,
  };
}

export function setRequisitionDraftFieldValue(
  form: RequisitionDraftFormModel,
  fieldKey: string,
  value: unknown,
) {
  const normalized = String(value ?? '');
  if (
    fieldKey === 'editReason' ||
    fieldKey === 'remark' ||
    fieldKey === 'requiredDate'
  ) {
    form[fieldKey] = normalized;
    return true;
  }
  const parts = fieldKey.split('.');
  if (parts[0] !== 'lines' || !parts[1] || !parts[2]) return false;
  const line = form.lines.find((item) => item.sourcePlanLineId === parts[1]);
  if (!line) return false;
  if (parts[2] === 'procurementNote' || parts[2] === 'requiredDate') {
    line[parts[2]] = normalized;
    return true;
  }
  return false;
}

export function requisitionDetailFieldMetas(
  detail: FdmProcurementRequisitionApi.Requisition,
): AiFieldMeta[] {
  const fields: AiFieldMeta[] = [
    {
      fieldKey: 'remark',
      label: '申请备注',
      origin: detail.generationRunId ? 'AI_INFERRED' : 'HUMAN_EDIT',
      proposedValue: detail.remark || '',
    },
    {
      fieldKey: 'requiredDate',
      label: '整单要求日期',
      origin: 'SOURCE_DOCUMENT',
      proposedValue: detail.requiredDate || '',
    },
  ];
  for (const item of detail.items) {
    const identity = item.productName || `申请行 ${item.lineNo}`;
    fields.push(
      {
        fieldKey: requisitionLineFieldKey(
          item.sourcePlanLineId,
          'purchaseUnit',
        ),
        label: `${identity} · 采购单位`,
        origin: 'SOURCE_DOCUMENT',
        proposedValue: item.purchaseUnit || '',
      },
      {
        fieldKey: requisitionLineFieldKey(
          item.sourcePlanLineId,
          'unitConversionFactor',
        ),
        label: `${identity} · 单位换算`,
        origin: 'RULE_DEFAULT',
        proposedValue: decimalString(item.unitConversionFactor),
      },
      {
        fieldKey: requisitionLineFieldKey(
          item.sourcePlanLineId,
          'requiredDate',
        ),
        label: `${identity} · 要求日期`,
        origin: 'SOURCE_DOCUMENT',
        proposedValue: item.requiredDate || '',
      },
      {
        fieldKey: requisitionLineFieldKey(
          item.sourcePlanLineId,
          'procurementNote',
        ),
        label: `${identity} · 采购说明`,
        origin: item.procurementNote ? 'AI_INFERRED' : 'MISSING',
        proposedValue: item.procurementNote || '',
      },
    );
  }
  return fields;
}

export function validateRequisitionDraft(
  form: RequisitionDraftFormModel,
): AiValidationIssue[] {
  const issues: AiValidationIssue[] = [];
  if (form.lines.length === 0) {
    issues.push({
      code: 'EXTERNAL_PURCHASE_LINES_REQUIRED',
      message: '已确认履约计划中没有可创建采购申请的外采行。',
      severity: 'BLOCKER',
    });
  }
  if (form.remark.length > 2000) {
    issues.push({
      code: 'REMARK_TOO_LONG',
      fieldKey: 'remark',
      message: '申请备注不能超过 2000 个字符。',
      severity: 'BLOCKER',
    });
  }
  if (form.editReason.length > 1000) {
    issues.push({
      code: 'EDIT_REASON_TOO_LONG',
      fieldKey: 'editReason',
      message: '本次修改说明不能超过 1000 个字符。',
      severity: 'BLOCKER',
    });
  }
  for (const line of form.lines) {
    const label = line.productName || `来源行 ${line.sourcePlanLineId}`;
    if (!line.sourcePlanLineId || !line.requestedQty) {
      issues.push({
        code: 'SOURCE_IDENTITY_INCOMPLETE',
        message: `${label} 缺少权威来源行或外采数量。`,
        severity: 'BLOCKER',
      });
    }
    if (!DECIMAL_PATTERN.test(line.requestedQty)) {
      issues.push({
        code: 'AUTHORITATIVE_QUANTITY_INVALID',
        fieldKey: requisitionLineFieldKey(
          line.sourcePlanLineId,
          'requestedQty',
        ),
        message: `${label} 的权威外采数量格式无效，请重新读取来源计划。`,
        severity: 'BLOCKER',
      });
    } else if (!new BigNumber(line.requestedQty).isGreaterThan(0)) {
      issues.push({
        code: 'AUTHORITATIVE_QUANTITY_NON_POSITIVE',
        message: `${label} 的权威外采数量必须大于 0。`,
        severity: 'BLOCKER',
      });
    }
    if (!line.purchaseUnit.trim() || line.purchaseUnit.trim().length > 64) {
      issues.push({
        code: 'PURCHASE_UNIT_INVALID',
        fieldKey: requisitionLineFieldKey(
          line.sourcePlanLineId,
          'purchaseUnit',
        ),
        message: `${label} 的采购单位必填且不能超过 64 个字符。`,
        severity: 'BLOCKER',
      });
    }
    if (
      !DECIMAL_PATTERN.test(line.unitConversionFactor) ||
      !new BigNumber(line.unitConversionFactor || 0).isEqualTo(1)
    ) {
      issues.push({
        code: 'UNIT_CONVERSION_FACTOR_LOCKED',
        fieldKey: requisitionLineFieldKey(
          line.sourcePlanLineId,
          'unitConversionFactor',
        ),
        message: `${label} 的单位换算系数本期固定为 1，请重新读取来源计划。`,
        severity: 'BLOCKER',
      });
    }
    if (line.procurementNote.length > 2000) {
      issues.push({
        code: 'PROCUREMENT_NOTE_TOO_LONG',
        fieldKey: requisitionLineFieldKey(
          line.sourcePlanLineId,
          'procurementNote',
        ),
        message: `${label} 的采购说明不能超过 2000 个字符。`,
        severity: 'BLOCKER',
      });
    }
    if (line.productMappingStatus !== 'MAPPED') {
      issues.push({
        code: 'PRODUCT_MAPPING_MISSING',
        message: `${label} 尚未完成产品映射，可保存为资料不完整草稿，但不能提交。`,
        severity: 'WARNING',
      });
    }
  }
  return issues;
}
