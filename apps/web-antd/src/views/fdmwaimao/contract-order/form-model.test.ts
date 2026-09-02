import dayjs from 'dayjs';
import { describe, expect, it } from 'vitest';

import {
  buildAmountPreviewPayload,
  buildContactOptionsParams,
  buildContractFulfillmentContext,
  buildContractSavePayload,
  buildContractUpdatePayload,
  contactSelectPlaceholder,
  createContractItemFromProductSelection,
  createEmptyContractForm,
  hydrateContractForm,
  normalizeContractDate,
  validateContractForm,
  validateContractFulfillmentConstraints,
} from './form-model';

function validModel() {
  const model = createEmptyContractForm();
  Object.assign(model, {
    additionalFeeAmount: '2.50',
    additionalFeeCategory: '运费',
    alibabaTradeAssuranceNo: ' 不报关 ',
    certificationRequirements: [' ce ', 'FDA'],
    companyId: '9007199254740997',
    contactId: '9007199254740998',
    countryComplianceRequirements: [' eu.reach '],
    customerComplianceRequirements: [],
    customerId: '9007199254740996',
    deliveryLocation: ' us:lax ',
    directShipRequired: true,
    fulfillmentMode: 'MIXED',
    incoterm: ' FOB ',
    ownerUserId: '9007199254740999',
    packagingRequirements: [' carton:5ply ', 'CARTON:5PLY'],
    paymentTerms: ' 30% 定金 ',
    remark: ' 备注 ',
    roundingDiscountAmount: '0.10',
    signDate: '2026-08-28',
    subject: ' 真实合同 ',
  });
  Object.assign(model.items[0]!, {
    category: ' 垫类 ',
    code: ' SKU-1 ',
    customizationText: ' 红色包装 ',
    discountRate: '100.0000',
    entrySource: 'PRODUCT_CENTER',
    gift: true,
    id: '9007199254741000',
    imageUrl: ' https://example.test/product.png ',
    name: ' 手工产品 ',
    productId: 'forged-product-id',
    quantity: '2.500000',
    remark: ' 行备注 ',
    retailPrice: '12.340000',
    skuId: 'forged-sku-id',
    unit: ' PCS ',
    unitPrice: '0',
    versionToken: 'forged-version',
  });
  return model;
}

describe('contract order payload and validation', () => {
  it('fills an editable product-center deal row and keeps its trusted identity', () => {
    const { item, priceCurrencyMatches } =
      createContractItemFromProductSelection(
        {
          category: '瑜伽垫',
          code: 'SKU-001',
          companyId: '20',
          currency: 'USD',
          imageUrl: 'https://example.test/sku.png',
          name: '蓝色 6mm',
          productCode: 'SPU-001',
          productId: '9007199254740995',
          productName: '瑜伽垫',
          referencePrice: '12.50',
          skuCode: 'SKU-001',
          skuId: '9007199254740996',
          skuName: '蓝色 6mm',
          unit: 'PCS',
          versionToken: 'PC1.1.2.3.4',
        },
        'usd',
      );

    expect(priceCurrencyMatches).toBe(true);
    expect(item).toMatchObject({
      category: '瑜伽垫',
      code: 'SKU-001',
      entrySource: 'PRODUCT_CENTER',
      name: '蓝色 6mm',
      productId: '9007199254740995',
      retailPrice: '12.50',
      skuId: '9007199254740996',
      unitPrice: '12.50',
      versionToken: 'PC1.1.2.3.4',
    });

    item.name = '合同专用可编辑名称';
    item.unitPrice = '11.80';
    expect(
      buildContractSavePayload({
        ...validModel(),
        items: [item],
      }).items[0],
    ).toMatchObject({
      name: '合同专用可编辑名称',
      productId: '9007199254740995',
      unitPrice: '11.8',
    });
  });

  it('does not copy a reference price from a different currency', () => {
    const { item, priceCurrencyMatches } =
      createContractItemFromProductSelection(
        {
          code: 'SKU-EUR',
          companyId: '20',
          currency: 'EUR',
          name: '欧元报价 SKU',
          productCode: 'SPU-EUR',
          productId: '30',
          productName: '产品',
          referencePrice: '9.99',
          skuCode: 'SKU-EUR',
          skuId: '31',
          skuName: '欧元报价 SKU',
          versionToken: 'PC1.1.1.1.1',
        },
        'USD',
      );

    expect(priceCurrencyMatches).toBe(false);
    expect(item.retailPrice).toBe('');
    expect(item.unitPrice).toBe('');
  });

  it('normalizes LocalDate strings, Java arrays, Dayjs and Date values', () => {
    expect(normalizeContractDate('2026-08-28')).toBe('2026-08-28');
    expect(normalizeContractDate(' 2026-08-28 ')).toBe('2026-08-28');
    expect(normalizeContractDate([2026, 8, 28])).toBe('2026-08-28');
    expect(normalizeContractDate([2026, 1, 2])).toBe('2026-01-02');
    expect(normalizeContractDate(dayjs('2026-08-28'))).toBe('2026-08-28');
    expect(normalizeContractDate(new Date(2026, 7, 28))).toBe('2026-08-28');
  });

  it('rejects invalid contract dates and normalizes dates again on save', () => {
    expect(normalizeContractDate('2026-02-30')).toBeUndefined();
    expect(normalizeContractDate('2026,8,28')).toBeUndefined();
    expect(normalizeContractDate([2026, 0, 28])).toBeUndefined();
    expect(normalizeContractDate([2026, 8])).toBeUndefined();
    expect(normalizeContractDate(new Date('invalid'))).toBeUndefined();
    expect(normalizeContractDate(undefined)).toBeUndefined();

    const model = validModel();
    Object.assign(model, {
      requiredDeliveryDate: [2026, 12, 5],
      signDate: [2026, 8, 28],
    });
    expect(buildContractSavePayload(model)).toMatchObject({
      requiredDeliveryDate: '2026-12-05',
      signDate: '2026-08-28',
    });
  });

  it('matches the backend confirmation rules for fulfillment constraints', () => {
    const model = validModel();
    expect(validateContractFulfillmentConstraints(model, true)).toEqual([]);

    model.fulfillmentMode = 'STANDARD';
    expect(validateContractFulfillmentConstraints(model, true)).toContainEqual(
      expect.objectContaining({ path: 'directShipRequired' }),
    );

    model.directShipRequired = undefined;
    model.deliveryLocation = '';
    model.packagingRequirements = undefined as unknown as string[];
    const paths = validateContractFulfillmentConstraints(model, true).map(
      (issue) => issue.path,
    );
    expect(paths).toContain('deliveryLocation');
    expect(paths).toContain('directShipRequired');
    expect(paths).toContain('packagingRequirements');
  });

  it('keeps empty requirement lists distinct from legacy missing lists', () => {
    const complete = buildContractFulfillmentContext(validModel());
    expect(complete).toMatchObject({
      certificationRequirements: ['CE', 'FDA'],
      confirmationReady: true,
      countryComplianceRequirements: ['EU.REACH'],
      customerComplianceRequirements: [],
      deliveryLocation: 'US:LAX',
      directShipRequired: true,
      fulfillmentMode: 'MIXED',
      incoterm: 'FOB',
      packagingRequirements: ['CARTON:5PLY'],
    });

    const legacyMissing = buildContractFulfillmentContext({
      deliveryLocation: 'US:LAX',
      directShipRequired: false,
      fulfillmentMode: 'STANDARD',
      incoterm: 'FOB',
    });
    expect(legacyMissing.packagingRequirements).toBeNull();
    expect(legacyMissing.confirmationReady).toBe(false);
    expect(legacyMissing.confirmationIssues).toContainEqual(
      expect.objectContaining({ path: 'packagingRequirements' }),
    );
  });

  it('hydrates editable fulfillment and compliance fields from contract detail', () => {
    const hydrated = hydrateContractForm({
      certificationRequirements: ['CE'],
      countryComplianceRequirements: [],
      customerComplianceRequirements: ['CUSTOMER:LABEL'],
      deliveryLocation: 'DE-HAM',
      directShipRequired: false,
      fulfillmentMode: 'STANDARD',
      incoterm: 'CIF',
      items: [],
      packagingRequirements: ['PALLET'],
    } as unknown as Parameters<typeof hydrateContractForm>[0]);

    expect(hydrated).toMatchObject({
      certificationRequirements: ['CE'],
      countryComplianceRequirements: [],
      customerComplianceRequirements: ['CUSTOMER:LABEL'],
      deliveryLocation: 'DE-HAM',
      directShipRequired: false,
      fulfillmentMode: 'STANDARD',
      incoterm: 'CIF',
      packagingRequirements: ['PALLET'],
    });
  });

  it('accepts zero unit price but still requires positive quantity', () => {
    const model = validModel();
    expect(validateContractForm(model)).toEqual([]);

    model.items[0]!.quantity = '0';
    expect(validateContractForm(model)).toContainEqual(
      expect.objectContaining({ path: 'items.0.quantity' }),
    );
  });

  it('requires assurance number and fee category when a fee is charged', () => {
    const model = validModel();
    model.alibabaTradeAssuranceNo = '';
    model.additionalFeeCategory = '';

    const paths = validateContractForm(model).map((item) => item.path);
    expect(paths).toContain('alibabaTradeAssuranceNo');
    expect(paths).toContain('additionalFeeCategory');
  });

  it('serializes IDs, decimals and a verified product-center identity as strings', () => {
    const payload = buildContractSavePayload(validModel());

    expect(payload).toMatchObject({
      alibabaTradeAssuranceNo: '不报关',
      certificationRequirements: ['CE', 'FDA'],
      companyId: '9007199254740997',
      countryComplianceRequirements: ['EU.REACH'],
      customerComplianceRequirements: [],
      customerId: '9007199254740996',
      deliveryLocation: 'US:LAX',
      directShipRequired: true,
      fulfillmentMode: 'MIXED',
      incoterm: 'FOB',
      orderDiscountRate: '100',
      packagingRequirements: ['CARTON:5PLY'],
      roundingDiscountAmount: '0.1',
      subject: '真实合同',
    });
    expect(payload.items[0]).toMatchObject({
      code: 'SKU-1',
      discountRate: '100',
      entrySource: 'PRODUCT_CENTER',
      name: '手工产品',
      productId: 'forged-product-id',
      quantity: '2.5',
      retailPrice: '12.34',
      skuId: 'forged-sku-id',
      unitPrice: '0',
      versionToken: 'forged-version',
    });
    expect(payload.items[0]).not.toHaveProperty('id');
  });

  it('does not submit stale source identity after a row is converted to manual', () => {
    const model = validModel();
    model.items[0]!.entrySource = 'MANUAL';
    const [item] = buildContractSavePayload(model).items;

    expect(item).not.toHaveProperty('entrySource');
    expect(item).not.toHaveProperty('productId');
    expect(item).not.toHaveProperty('skuId');
    expect(item).not.toHaveProperty('versionToken');
  });

  it('safely normalizes numeric Select IDs without touching large string IDs', () => {
    const model = validModel();
    Object.assign(model, {
      companyId: 123,
      contactId: 321,
      customerId: 456,
      ownerUserId: 789,
    });

    expect(() => validateContractForm(model)).not.toThrow();
    expect(validateContractForm(model)).toEqual([]);
    expect(() => buildContractSavePayload(model)).not.toThrow();
    expect(() => buildAmountPreviewPayload(model)).not.toThrow();
    expect(buildContractSavePayload(model)).toMatchObject({
      companyId: '123',
      contactId: '321',
      customerId: '456',
      ownerUserId: '789',
    });
    Object.assign(model, { id: 654, version: 1 });
    expect(buildContractUpdatePayload(model).id).toBe('654');

    Object.assign(model, {
      companyId: '9223372036854775806',
      contactId: '9223372036854775803',
      customerId: '9223372036854775805',
      ownerUserId: '9223372036854775804',
    });
    expect(buildContractSavePayload(model)).toMatchObject({
      companyId: '9223372036854775806',
      contactId: '9223372036854775803',
      customerId: '9223372036854775805',
      ownerUserId: '9223372036854775804',
    });
  });

  it('normalizes bigint IDs directly to decimal strings', () => {
    const model = validModel();
    Object.assign(model, {
      companyId: 9_223_372_036_854_775_806n,
      contactId: 9_223_372_036_854_775_803n,
      customerId: 9_223_372_036_854_775_805n,
      ownerUserId: 9_223_372_036_854_775_804n,
    });

    expect(buildContractSavePayload(model)).toMatchObject({
      companyId: '9223372036854775806',
      contactId: '9223372036854775803',
      customerId: '9223372036854775805',
      ownerUserId: '9223372036854775804',
    });
  });

  it('uses the exact amount-preview and optimistic-update contracts', () => {
    const model = validModel();
    const preview = buildAmountPreviewPayload(model);
    expect(preview.additionalFeeCategory).toBe('运费');
    expect(preview.roundingDiscountAmount).toBe('0.1');
    expect(preview).not.toHaveProperty('customerId');
    expect(preview).not.toHaveProperty('companyId');

    Object.assign(model, { id: '9223372036854775806', version: 7 });
    expect(buildContractUpdatePayload(model)).toMatchObject({
      expectedVersion: 7,
      id: '9223372036854775806',
    });
  });

  it('adds orderId to contact lookup only for an existing contract', () => {
    expect(buildContactOptionsParams({}, 'customer-new')).toEqual({
      customerId: 'customer-new',
    });
    expect(
      buildContactOptionsParams(
        { id: '9223372036854775806' },
        'customer-edited',
      ),
    ).toEqual({
      customerId: 'customer-edited',
      orderId: '9223372036854775806',
    });

    expect(
      buildContactOptionsParams(
        { id: 9_223_372_036_854_775_806n } as unknown as { id: string },
        '9223372036854775805',
      ),
    ).toEqual({
      customerId: '9223372036854775805',
      orderId: '9223372036854775806',
    });
  });

  it('updates the contact placeholder after a customer is selected', () => {
    expect(contactSelectPlaceholder(undefined)).toBe('请先选择客户');
    expect(contactSelectPlaceholder('9007199254740993')).toBe(
      '请选择联系人（可选）',
    );
    expect(contactSelectPlaceholder(123)).toBe('请选择联系人（可选）');
  });
});
