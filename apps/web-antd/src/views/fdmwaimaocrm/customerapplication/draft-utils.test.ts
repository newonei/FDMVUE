import { describe, expect, it } from 'vitest';

import {
  buildCustomerApplicationDraftCreateRequest,
  buildCustomerApplicationDraftPageRequest,
  buildCustomerApplicationDraftUpdateRequest,
  createEmptyCustomerApplicationDraftFormValues,
  isCustomerApplicationVersionConflict,
  mapCustomerApplicationDraftToFormValues,
} from './draft-utils';

describe('customer application draft utilities', () => {
  it('builds a trimmed create request without edit metadata', () => {
    const values = {
      ...createEmptyCustomerApplicationDraftFormValues(),
      customerName: '  Acme Trading  ',
      id: 9,
      sourceText: '  展会  ',
      version: 4,
      vipFlag: true,
    };

    const request = buildCustomerApplicationDraftCreateRequest(values);

    expect(request.customerName).toBe('Acme Trading');
    expect(request.sourceText).toBe('展会');
    expect(request.vipFlag).toBe(true);
    expect(request).not.toHaveProperty('id');
    expect(request).not.toHaveProperty('version');
  });

  it('requires and preserves id plus version for updates', () => {
    const values = {
      ...createEmptyCustomerApplicationDraftFormValues(),
      customerName: 'Acme Trading',
      id: 9,
      version: 4,
    };

    expect(buildCustomerApplicationDraftUpdateRequest(values)).toMatchObject({
      contactEmail: null,
      customerName: 'Acme Trading',
      id: 9,
      remark: null,
      version: 4,
    });
    expect(() =>
      buildCustomerApplicationDraftUpdateRequest({
        ...values,
        version: undefined,
      }),
    ).toThrow('草稿缺少版本信息');
  });

  it('normalizes search text and a complete time range', () => {
    expect(
      buildCustomerApplicationDraftPageRequest(2, 20, {
        createTime: ['2026-08-01 00:00:00', '2026-08-15 23:59:59'],
        keyword: '  Acme  ',
        sourceText: '   ',
      }),
    ).toMatchObject({
      createTime: ['2026-08-01 00:00:00', '2026-08-15 23:59:59'],
      keyword: 'Acme',
      pageNo: 2,
      pageSize: 20,
      sourceText: undefined,
    });
  });

  it('maps nullable response text to editable strings', () => {
    const formValues = mapCustomerApplicationDraftToFormValues({
      alibabaLevelText: null,
      contactEmail: null,
      contactName: 'Alice',
      contactPhone: null,
      countryAddressText: null,
      createTime: '2026-08-15 10:00:00',
      customerName: 'Acme Trading',
      dealEvidenceText: null,
      id: 9,
      productCategoryText: null,
      remark: null,
      sourceText: null,
      status: 'DRAFT',
      updateTime: '2026-08-15 10:00:00',
      version: 4,
      vipFlag: false,
    });

    expect(formValues.contactEmail).toBe('');
    expect(formValues.contactName).toBe('Alice');
    expect(formValues.id).toBe(9);
    expect(formValues.version).toBe(4);
  });

  it('recognizes numeric, transport, symbolic and message-based conflicts', () => {
    expect(
      isCustomerApplicationVersionConflict({
        response: { data: { code: 1_205_001_002 } },
      }),
    ).toBe(true);
    expect(
      isCustomerApplicationVersionConflict({ response: { status: 409 } }),
    ).toBe(true);
    expect(
      isCustomerApplicationVersionConflict({
        data: { code: 'CUSTOMER_APPLICATION_VERSION_CONFLICT' },
      }),
    ).toBe(true);
    expect(
      isCustomerApplicationVersionConflict({
        response: { data: { msg: '草稿版本冲突，请刷新后重试' } },
      }),
    ).toBe(true);
    expect(
      isCustomerApplicationVersionConflict({
        response: { data: { msg: '参数错误' }, status: 400 },
      }),
    ).toBe(false);
  });
});
