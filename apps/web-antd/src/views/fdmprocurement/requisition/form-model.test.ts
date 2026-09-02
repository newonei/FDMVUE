import type { FdmProcurementRequisitionApi } from '#/api/fdmprocurement/requisition';
import type { AiFieldStateMap } from '#/views/fdm-trade-shared/ai-document-generation';

import { describe, expect, it } from 'vitest';

import {
  buildRequisitionMaterializeReq,
  buildRequisitionUpdateReq,
  detailToRequisitionForm,
  mergeRequisitionProposalIntoForm,
  proposalToRequisitionForm,
  requisitionLineFieldKey,
  setRequisitionDraftFieldValue,
  validateRequisitionDraft,
} from './form-model';

function source(): FdmProcurementRequisitionApi.GenerationSource {
  return {
    companyId: '9223372036854775801',
    fulfillmentPlanId: '9223372036854775802',
    fulfillmentPlanNo: 'FP-001',
    lines: [
      {
        customizationSnapshot: '客户定制包装',
        externalPurchaseQuantity: '9007199254740993.25',
        lineNo: 1,
        productCode: 'SKU-001',
        productId: '9223372036854775803',
        productMappingStatus: 'MAPPED',
        productName: '瑜伽垫',
        productVersionToken: 'product-v3',
        requiredDate: '2026-09-20',
        skuId: '9223372036854775804',
        sourceContractLineId: '9223372036854775805',
        sourcePlanLineId: '9223372036854775806',
        specification: '183x61cm',
        unit: 'PCS',
      },
    ],
    orderId: '9223372036854775807',
    orderNo: 'DD-001',
    requiredDate: '2026-09-20',
    sourceSnapshotHash: 'a'.repeat(64),
    status: 'CONFIRMED',
    version: 7,
  };
}

function generatedForm() {
  return proposalToRequisitionForm(
    {
      lineSuggestions: [
        {
          note: '关注包装与交期',
          riskCodes: ['CUSTOMIZATION_REQUIRED'],
          sourcePlanLineId: '9223372036854775806',
        },
      ],
      summary: 'AI 采购申请摘要',
    },
    source(),
    {
      id: '9223372036854775808',
      proposalVersion: 3,
      sourceSnapshotHash: 'a'.repeat(64),
      sourceVersion: 7,
      version: 5,
    },
  );
}

describe('requisition AI draft form model', () => {
  it('keeps source identities and authoritative quantities as strings', () => {
    const form = generatedForm();
    expect(form.sourcePlanId).toBe('9223372036854775802');
    expect(form.generationRunId).toBe('9223372036854775808');
    expect(form.lines[0]?.requestedQty).toBe('9007199254740993.25');
    expect(form.lines[0]?.sourcePlanLineId).toBe('9223372036854775806');
  });

  it('allows only the explicit editable whitelist', () => {
    const form = generatedForm();
    expect(
      setRequisitionDraftFieldValue(
        form,
        requisitionLineFieldKey('9223372036854775806', 'procurementNote'),
        '人工修改',
      ),
    ).toBe(true);
    expect(
      setRequisitionDraftFieldValue(
        form,
        requisitionLineFieldKey('9223372036854775806', 'requestedQty'),
        '1',
      ),
    ).toBe(false);
    expect(
      setRequisitionDraftFieldValue(
        form,
        requisitionLineFieldKey('9223372036854775806', 'purchaseUnit'),
        'BOX',
      ),
    ).toBe(false);
    expect(
      setRequisitionDraftFieldValue(
        form,
        requisitionLineFieldKey('9223372036854775806', 'unitConversionFactor'),
        '12',
      ),
    ).toBe(false);
    expect(form.lines[0]?.requestedQty).toBe('9007199254740993.25');
    expect(form.lines[0]?.purchaseUnit).toBe('PCS');
    expect(form.lines[0]?.unitConversionFactor).toBe('1');
    expect(form.lines[0]?.customizationSnapshot).toBe('客户定制包装');
  });

  it('materializes the edited draft while sending locked source facts for server comparison', () => {
    const form = generatedForm();
    form.lines[0]!.procurementNote = '人工核实采购注意事项';
    form.remark = '人工确认后的草稿备注';
    const request = buildRequisitionMaterializeReq(form, 'command-1');
    expect(request).toMatchObject({
      expectedPlanVersion: 7,
      expectedRunVersion: 5,
      fulfillmentPlanId: '9223372036854775802',
      generationRunId: '9223372036854775808',
      proposalVersion: 3,
    });
    expect(request.draft.items[0]).toEqual({
      procurementNote: '人工核实采购注意事项',
      productId: '9223372036854775803',
      productVersionToken: 'product-v3',
      purchaseUnit: 'PCS',
      requestedQty: '9007199254740993.25',
      requiredDate: '2026-09-20',
      skuId: '9223372036854775804',
      sourceContractLineId: '9223372036854775805',
      sourcePlanLineId: '9223372036854775806',
      unitConversionFactor: '1',
    });
    expect(request.draft.remark).toBe('人工确认后的草稿备注');
    expect(request).not.toHaveProperty('remark');
    expect(JSON.stringify(request)).not.toContain('customizationSnapshot');
    expect(JSON.stringify(request)).not.toContain('riskCodes');
  });

  it('sends explicit empty strings when the user clears AI text fields', () => {
    const form = generatedForm();
    form.remark = '   ';
    form.lines[0]!.procurementNote = '';

    const request = buildRequisitionMaterializeReq(form, 'clear-ai-text');

    expect(request.draft.remark).toBe('');
    expect(request.draft.items[0]?.procurementNote).toBe('');
  });

  it('preserves human edits when a new proposal arrives', () => {
    const current = generatedForm();
    current.lines[0]!.procurementNote = '人工说明';
    const incoming = generatedForm();
    incoming.expectedRunVersion = 6;
    incoming.lines[0]!.procurementNote = '新 AI 说明';
    const key = requisitionLineFieldKey(
      '9223372036854775806',
      'procurementNote',
    );
    const fields: AiFieldStateMap = {
      [key]: {
        currentValue: '人工说明',
        fieldKey: key,
        label: '采购说明',
        origin: 'HUMAN_EDIT',
        originalOrigin: 'AI_INFERRED',
        proposedValue: '新 AI 说明',
      },
    };
    const merged = mergeRequisitionProposalIntoForm(current, incoming, fields);
    expect(merged.lines[0]?.procurementNote).toBe('人工说明');
    expect(merged.expectedRunVersion).toBe(6);
  });

  it('updates DRAFT and DATA_INCOMPLETE rows with head and item CAS versions', () => {
    const detail: FdmProcurementRequisitionApi.Requisition = {
      companyId: '1',
      id: '101',
      items: [
        {
          customizationSnapshot: '只读',
          id: '201',
          lineNo: 1,
          productId: '301',
          productMappingStatus: 'MAPPED',
          productName: '产品',
          productVersionToken: 'v1',
          procurementNote: '说明',
          purchaseUnit: 'PCS',
          requestedQty: '10',
          requiredDate: '2026-09-20',
          riskCodes: ['RISK'],
          skuId: '401',
          sourceContractLineId: '501',
          sourcePlanLineId: '601',
          unitConversionFactor: '1',
          version: 4,
        },
      ],
      ownerUserId: '164',
      requisitionNo: 'PR-001',
      sourceOrderId: '701',
      sourceOrderVersion: 1,
      sourcePlanId: '801',
      sourcePlanVersion: 2,
      sourceSnapshotHash: 'b'.repeat(64),
      status: 'DATA_INCOMPLETE',
      validationStatus: 'BLOCKED',
      version: 9,
    };
    const form = detailToRequisitionForm(detail);
    form.editReason = '调整采购日期';
    const update = buildRequisitionUpdateReq(form);
    expect(update.expectedVersion).toBe(9);
    expect(update.editReason).toBe('调整采购日期');
    expect(update.remark).toBe('');
    expect(update.items[0]).toMatchObject({
      id: '201',
      itemExpectedVersion: 4,
    });
    expect(validateRequisitionDraft(form)).not.toContainEqual(
      expect.objectContaining({ severity: 'BLOCKER' }),
    );
  });
});
