import type { FdmProcurementSupplierProductApi } from '#/api/fdmprocurement/supplier-product';

import { describe, expect, it } from 'vitest';

import {
  copyCurrentFactsToDraft,
  createComplianceDraftFact,
  evaluateComplianceFactSet,
  validateComplianceDraftFacts,
} from './compliance-policy';

const product = {
  companyId: '1',
  complianceSnapshotHash: 'a'.repeat(64),
  complianceVersion: 2,
  id: '10',
  version: 4,
} as FdmProcurementSupplierProductApi.SupplierProduct;

const fact = {
  companyId: '1',
  evidenceReference: 'certificate://CERT-2026-001',
  evidenceStatus: 'VERIFIED',
  factCode: 'CE',
  factHash: 'b'.repeat(64),
  factSetVersion: 2,
  factType: 'CERTIFICATION',
  id: '100',
  scopeType: 'GLOBAL',
  supplierId: '20',
  supplierProductId: '10',
  validFrom: '2026-01-01',
  validUntil: '2099-12-31',
} as FdmProcurementSupplierProductApi.ComplianceFact;

describe('supplier-product compliance policy', () => {
  it('builds a complete replacement payload and forces customer-only scope', () => {
    const drafts = [
      createComplianceDraftFact({
        evidenceReference: '  crm://customer-proof/9  ',
        factCode: ' customer.special ',
        factType: 'CUSTOMER_COMPLIANCE',
        scopeValue: '9223372036854775801',
        validFrom: '2026-01-01',
        validUntil: '2027-01-01',
      }),
      createComplianceDraftFact({
        evidenceReference: 'doc://iso9001',
        factCode: 'iso9001',
        factType: 'CERTIFICATION',
        scopeType: 'CUSTOMER',
        scopeValue: '99',
        validFrom: '2026-01-01',
        validUntil: '2027-01-01',
      }),
    ];
    const result = validateComplianceDraftFacts(drafts);
    expect(result.valid).toBe(true);
    expect(result.facts).toEqual([
      expect.objectContaining({
        evidenceReference: 'crm://customer-proof/9',
        factCode: 'CUSTOMER.SPECIAL',
        scopeType: 'CUSTOMER',
        scopeValue: '9223372036854775801',
      }),
      expect.objectContaining({
        factCode: 'ISO9001',
        scopeType: 'GLOBAL',
        scopeValue: undefined,
      }),
    ]);
  });

  it('rejects missing evidence, invalid dates, duplicate identities and invalid customer IDs', () => {
    const invalid = createComplianceDraftFact({
      evidenceReference: ' ',
      factCode: 'CE',
      factType: 'CUSTOMER_COMPLIANCE',
      scopeValue: 'not-a-long',
      validFrom: '2027-01-01',
      validUntil: '2026-01-01',
    });
    const duplicate = { ...invalid, key: 'duplicate' };
    const result = validateComplianceDraftFacts([invalid, duplicate]);
    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toContain('证据引用必填');
    expect(result.errors.join('\n')).toContain('客户 Long ID');
    expect(result.errors.join('\n')).toContain('结束日期不能早于');
    expect(result.errors.join('\n')).toContain('另一条事实重复');
  });

  it('copies only server facts into an editable new-version draft', () => {
    const drafts = copyCurrentFactsToDraft([fact]);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      evidenceReference: fact.evidenceReference,
      factCode: fact.factCode,
      factType: fact.factType,
    });
    expect(drafts[0]).not.toHaveProperty('factHash');
    expect(drafts[0]).not.toHaveProperty('factSetVersion');
  });

  it('fails closed for missing or inconsistent authority and accepts a verified set', () => {
    expect(
      evaluateComplianceFactSet({ ...product, complianceVersion: 0 }, [], {
        loaded: true,
      }).failClosed,
    ).toBe(true);
    expect(
      evaluateComplianceFactSet(product, [], { loaded: true }).title,
    ).toContain('不一致');
    expect(
      evaluateComplianceFactSet(product, [fact], { loaded: true }),
    ).toMatchObject({ failClosed: false, level: 'success' });
    expect(
      evaluateComplianceFactSet(product, [fact], {
        loadError: true,
        loaded: false,
      }).title,
    ).toContain('读取失败');
  });
});
