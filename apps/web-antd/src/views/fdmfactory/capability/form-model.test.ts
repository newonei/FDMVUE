import { describe, expect, it } from 'vitest';

import {
  buildCapabilityPayload,
  createCapabilityDraft,
  normalizeRequirementCodes,
} from './form-model';

describe('internal factory capability form model', () => {
  it('canonicalizes requirement codes before sending the authority payload', () => {
    expect(normalizeRequirementCodes([' ce ', 'CE', 'carton:v2', ''])).toEqual([
      'CE',
      'CARTON:V2',
    ]);
  });

  it('builds authoritative evidence and converts local date-times to offsets', () => {
    const now = new Date('2026-08-31T12:00:00.000Z');
    const draft = createCapabilityDraft('11', now);
    Object.assign(draft, {
      evidenceSourceName: '能力台账',
      evidenceSourceRefId: 'CAP-001',
      evidenceSourceSystem: 'FDM_FACTORY',
      evidenceSourceVersion: '2026.08',
      evidenceTime: '2026-08-31T10:00',
      evidenceValidUntil: '2026-09-30T23:59',
      factoryId: '12',
      productId: '14',
      skuId: '13',
      productVersionToken: 'SKU-V4',
      supportedPackagingRequirements: [' carton ', 'CARTON'],
    });

    const result = buildCapabilityPayload(draft, now);

    expect(result.errors).toEqual([]);
    expect(result.data).toMatchObject({
      companyId: '11',
      evidenceMode: 'AUTHORITATIVE',
      evidenceSourceRefId: 'CAP-001',
      factoryId: '12',
      productId: '14',
      skuId: '13',
      supportedPackagingRequirements: ['CARTON'],
    });
    expect(result.data?.evidenceTime).toMatch(/(Z|[+-]\d{2}:\d{2})$/);
    expect(result.data?.evidenceNote).toBeUndefined();
  });

  it('keeps only the human note for human-confirmed evidence', () => {
    const now = new Date('2026-08-31T12:00:00.000Z');
    const draft = createCapabilityDraft('11', now);
    Object.assign(draft, {
      evidenceMode: 'HUMAN_CONFIRMED',
      evidenceNote: ' 已复核产线与证书 ',
      evidenceSourceName: 'should-be-cleared',
      evidenceTime: '2026-08-31T10:00',
      evidenceValidUntil: '2026-09-30T23:59',
      factoryId: '12',
      productId: '14',
      skuId: '13',
      productVersionToken: 'SKU-V4',
    });

    const result = buildCapabilityPayload(draft, now);

    expect(result.errors).toEqual([]);
    expect(result.data?.evidenceNote).toBe('已复核产线与证书');
    expect(result.data?.evidenceSourceName).toBeUndefined();
    expect(result.data?.evidenceByUserId).toBeUndefined();
  });

  it('rejects invalid periods, identifiers, codes, and incomplete evidence', () => {
    const draft = createCapabilityDraft('', new Date('2026-08-31T02:00:00Z'));
    Object.assign(draft, {
      evidenceTime: '2026-09-01T10:00',
      evidenceValidUntil: '2026-08-31T10:00',
      factoryId: 'unsafe-id',
      productId: '0',
      skuId: '0',
      productVersionToken: '',
      supportedCertificationRequirements: ['not allowed!'],
      validFrom: '2026-09-10',
      validUntil: '2026-09-01',
    });

    const result = buildCapabilityPayload(
      draft,
      new Date('2026-08-31T02:00:00Z'),
    );

    expect(result.data).toBeUndefined();
    expect(result.errors).toEqual(
      expect.arrayContaining([
        '公司 ID 必须是正整数',
        '工厂 ID 必须是正整数',
        '产品 ID 必须是正整数',
        '产品 SKU ID 必须是正整数',
        '能力有效结束日期不能早于开始日期',
        '权威证据必须填写来源系统、版本、引用 ID 和来源名称',
      ]),
    );
  });
});
