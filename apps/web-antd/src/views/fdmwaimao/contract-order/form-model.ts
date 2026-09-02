import type { FdmWaimaoContractOrderApi } from '#/api/fdmwaimao/contract-order';
import type { ProductSelectionValue } from '#/views/fdmproduct/shared';

import BigNumber from 'bignumber.js';
import dayjs from 'dayjs';

import {
  calculateContractAmount,
  canonicalDecimal,
  isDecimalInRange,
} from './amount';

let draftSequence = 0;

export interface ContractFormItem {
  _key: string;
  category: string;
  code: string;
  customizationText: string;
  discountRate: string;
  entrySource?: FdmWaimaoContractOrderApi.ProductEntrySource | null;
  gift: boolean;
  id?: string;
  imageUrl: string;
  name: string;
  productId?: null | string;
  quantity: string;
  remark: string;
  retailPrice: string;
  skuId?: null | string;
  unit: string;
  unitPrice: string;
  versionToken?: null | string;
}

export interface ContractFulfillmentConstraintSource {
  certificationRequirements?: null | string[];
  countryComplianceRequirements?: null | string[];
  customerComplianceRequirements?: null | string[];
  deliveryLocation?: null | string;
  directShipRequired?: boolean | null;
  fulfillmentMode?: FdmWaimaoContractOrderApi.FulfillmentMode | null;
  incoterm?: null | string;
  packagingRequirements?: null | string[];
  requiredDeliveryDate?: null | string;
}

export interface ContractFormModel {
  additionalFeeAmount: string;
  additionalFeeCategory: string;
  alibabaTradeAssuranceNo: string;
  certificationRequirements: string[];
  companyId?: string;
  contactId?: string;
  countryComplianceRequirements: string[];
  orderNo?: string;
  currency: string;
  customerComplianceRequirements: string[];
  customerId?: string;
  customerName?: string;
  deliveryLocation: string;
  directShipRequired?: boolean;
  fulfillmentMode?: FdmWaimaoContractOrderApi.FulfillmentMode;
  id?: string;
  incoterm: string;
  items: ContractFormItem[];
  orderDiscountRate: string;
  orderType: FdmWaimaoContractOrderApi.OrderType;
  ownerUserId?: string;
  packagingRequirements: string[];
  paymentTerms: string;
  remark: string;
  requiredDeliveryDate?: string;
  roundingDiscountAmount: string;
  signDate?: string;
  subject: string;
  version?: number;
}

export interface ValidationIssue {
  message: string;
  path: string;
}

function rowKey() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  draftSequence += 1;
  return `contract-item-${draftSequence}`;
}

export function createEmptyContractItem(): ContractFormItem {
  return {
    _key: rowKey(),
    category: '',
    code: '',
    customizationText: '',
    discountRate: '100',
    entrySource: 'MANUAL',
    gift: false,
    imageUrl: '',
    name: '',
    quantity: '1',
    remark: '',
    retailPrice: '',
    unit: '',
    unitPrice: '',
  };
}

export function createContractItemFromProductSelection(
  value: ProductSelectionValue,
  contractCurrency: string,
) {
  const priceCurrencyMatches =
    !value.currency ||
    value.currency.toUpperCase() === contractCurrency.toUpperCase();
  const referencePrice = priceCurrencyMatches ? value.referencePrice || '' : '';
  const item = createEmptyContractItem();
  Object.assign(item, {
    category: value.category || '',
    code: value.code,
    entrySource: 'PRODUCT_CENTER',
    imageUrl: value.imageUrl || '',
    name: value.name,
    productId: value.productId,
    retailPrice: referencePrice,
    skuId: value.skuId,
    unit: value.unit || '',
    unitPrice: referencePrice,
    versionToken: value.versionToken,
  } satisfies Partial<ContractFormItem>);
  return { item, priceCurrencyMatches };
}

export function cloneContractItem(item: ContractFormItem): ContractFormItem {
  return {
    ...item,
    _key: rowKey(),
    id: undefined,
  };
}

export function createEmptyContractForm(): ContractFormModel {
  return {
    additionalFeeAmount: '0',
    additionalFeeCategory: '',
    alibabaTradeAssuranceNo: '',
    certificationRequirements: [],
    countryComplianceRequirements: [],
    currency: 'USD',
    customerComplianceRequirements: [],
    deliveryLocation: '',
    incoterm: '',
    items: [createEmptyContractItem()],
    orderDiscountRate: '100',
    orderType: 'BULK',
    packagingRequirements: [],
    paymentTerms: '',
    remark: '',
    roundingDiscountAmount: '0',
    subject: '',
  };
}

function text(value: unknown) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function optionalText(value: unknown) {
  const normalized = text(value);
  return normalized || undefined;
}

const DELIVERY_LOCATION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const REQUIREMENT_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const FULFILLMENT_MODES = new Set<FdmWaimaoContractOrderApi.FulfillmentMode>([
  'DIRECT_SHIP',
  'MIXED',
  'STANDARD',
]);

export function normalizeContractRequirementCodes(
  values: null | readonly string[] | undefined,
) {
  if (!Array.isArray(values)) return [];
  return [
    ...new Set(
      values.map((value) => text(value).toUpperCase()).filter(Boolean),
    ),
  ].toSorted((left, right) => left.localeCompare(right));
}

export function validateContractFulfillmentConstraints(
  source: ContractFulfillmentConstraintSource,
  requireComplete = false,
) {
  const issues: ValidationIssue[] = [];
  const incoterm = text(source.incoterm);
  const deliveryLocation = text(source.deliveryLocation);
  const fulfillmentMode = text(source.fulfillmentMode);

  if (requireComplete && !incoterm) {
    issues.push({ message: '确认合同前必须填写贸易术语', path: 'incoterm' });
  } else if (incoterm.length > 64) {
    issues.push({ message: '贸易术语不能超过 64 个字符', path: 'incoterm' });
  }

  if (requireComplete && !deliveryLocation) {
    issues.push({
      message: '确认合同前必须填写交付地点代码',
      path: 'deliveryLocation',
    });
  } else if (
    deliveryLocation &&
    !DELIVERY_LOCATION_PATTERN.test(deliveryLocation)
  ) {
    issues.push({
      message: '交付地点必须是字母或数字开头的结构化代码，可包含 . _ : / -',
      path: 'deliveryLocation',
    });
  }

  if (
    requireComplete &&
    !FULFILLMENT_MODES.has(
      fulfillmentMode as FdmWaimaoContractOrderApi.FulfillmentMode,
    )
  ) {
    issues.push({
      message: '确认合同前必须选择有效的履约方式',
      path: 'fulfillmentMode',
    });
  } else if (
    fulfillmentMode &&
    !FULFILLMENT_MODES.has(
      fulfillmentMode as FdmWaimaoContractOrderApi.FulfillmentMode,
    )
  ) {
    issues.push({ message: '履约方式无效', path: 'fulfillmentMode' });
  }

  if (requireComplete && typeof source.directShipRequired !== 'boolean') {
    issues.push({
      message: '确认合同前必须明确是否必须直发',
      path: 'directShipRequired',
    });
  }
  if (
    source.directShipRequired === true &&
    fulfillmentMode !== 'DIRECT_SHIP' &&
    fulfillmentMode !== 'MIXED'
  ) {
    issues.push({
      message: '选择“必须直发”时，履约方式只能是直发或混合履约',
      path: 'directShipRequired',
    });
  }

  const requirementLists: Array<{
    label: string;
    path:
      | 'certificationRequirements'
      | 'countryComplianceRequirements'
      | 'customerComplianceRequirements'
      | 'packagingRequirements';
    value: null | string[] | undefined;
  }> = [
    {
      label: '包装要求清单',
      path: 'packagingRequirements',
      value: source.packagingRequirements,
    },
    {
      label: '认证要求清单',
      path: 'certificationRequirements',
      value: source.certificationRequirements,
    },
    {
      label: '国家合规要求清单',
      path: 'countryComplianceRequirements',
      value: source.countryComplianceRequirements,
    },
    {
      label: '客户合规要求清单',
      path: 'customerComplianceRequirements',
      value: source.customerComplianceRequirements,
    },
  ];
  requirementLists.forEach(({ label, path, value }) => {
    if (!Array.isArray(value)) {
      if (requireComplete) {
        issues.push({ message: `确认合同前必须明确${label}`, path });
      }
      return;
    }
    if (value.length > 50) {
      issues.push({ message: `${label}不能超过 50 项`, path });
    }
    value.forEach((code, index) => {
      if (!REQUIREMENT_CODE_PATTERN.test(text(code))) {
        issues.push({
          message: `${label}第 ${index + 1} 项不是有效代码`,
          path: `${path}.${index}`,
        });
      }
    });
  });

  return issues;
}

export function buildContractFulfillmentContext(
  source: ContractFulfillmentConstraintSource,
) {
  const confirmationIssues = validateContractFulfillmentConstraints(
    source,
    true,
  );
  const requirementList = (value: null | string[] | undefined) =>
    Array.isArray(value) ? normalizeContractRequirementCodes(value) : null;
  return {
    certificationRequirements: requirementList(
      source.certificationRequirements,
    ),
    confirmationIssues: confirmationIssues.map((issue) => ({ ...issue })),
    confirmationReady: confirmationIssues.length === 0,
    countryComplianceRequirements: requirementList(
      source.countryComplianceRequirements,
    ),
    customerComplianceRequirements: requirementList(
      source.customerComplianceRequirements,
    ),
    deliveryLocation:
      optionalText(source.deliveryLocation)?.toUpperCase() ?? null,
    directShipRequired:
      typeof source.directShipRequired === 'boolean'
        ? source.directShipRequired
        : null,
    fulfillmentMode:
      optionalText(source.fulfillmentMode)?.toUpperCase() ?? null,
    incoterm: optionalText(source.incoterm)?.toUpperCase() ?? null,
    packagingRequirements: requirementList(source.packagingRequirements),
    requiredDeliveryDate:
      normalizeContractDate(source.requiredDeliveryDate) ?? null,
  };
}

function normalizeDateParts(year: number, month: number, day: number) {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    year < 1 ||
    year > 9999 ||
    month < 1 ||
    month > 12
  ) {
    return undefined;
  }

  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  if (day < 1 || day > daysInMonth[month - 1]!) return undefined;

  return [year, month, day]
    .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, '0'))
    .join('-');
}

/**
 * Normalize Java LocalDate JSON, date-picker values and API strings without
 * relying on timezone conversion. Java's LocalDate array month is 1-based.
 */
export function normalizeContractDate(value: unknown) {
  if (typeof value === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (!match) return undefined;
    return normalizeDateParts(
      Number(match[1]),
      Number(match[2]),
      Number(match[3]),
    );
  }

  if (Array.isArray(value)) {
    if (value.length !== 3 || value.some((part) => typeof part !== 'number')) {
      return undefined;
    }
    return normalizeDateParts(value[0], value[1], value[2]);
  }

  if (dayjs.isDayjs(value)) {
    if (!value.isValid()) return undefined;
    return normalizeDateParts(value.year(), value.month() + 1, value.date());
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return undefined;
    return normalizeDateParts(
      value.getFullYear(),
      value.getMonth() + 1,
      value.getDate(),
    );
  }

  return undefined;
}

function positive(value: null | string | undefined) {
  if (!isDecimalInRange(value, 0)) return false;
  return new BigNumber(value!).gt(0);
}

export function hydrateContractForm(
  detail: FdmWaimaoContractOrderApi.ContractDetail,
): ContractFormModel {
  return {
    additionalFeeAmount: detail.additionalFeeAmount ?? '0',
    additionalFeeCategory: detail.additionalFeeCategory ?? '',
    alibabaTradeAssuranceNo: detail.alibabaTradeAssuranceNo ?? '',
    certificationRequirements: normalizeContractRequirementCodes(
      detail.certificationRequirements,
    ),
    companyId: detail.companyId,
    contactId: detail.contactId ?? undefined,
    countryComplianceRequirements: normalizeContractRequirementCodes(
      detail.countryComplianceRequirements,
    ),
    orderNo: detail.orderNo,
    currency: detail.currency || 'USD',
    customerComplianceRequirements: normalizeContractRequirementCodes(
      detail.customerComplianceRequirements,
    ),
    customerId: detail.customerId,
    customerName: detail.customerName,
    deliveryLocation: detail.deliveryLocation ?? '',
    directShipRequired: detail.directShipRequired ?? undefined,
    fulfillmentMode: detail.fulfillmentMode ?? undefined,
    id: detail.id,
    incoterm: detail.incoterm ?? '',
    items: (detail.items ?? []).map((item) => ({
      _key: rowKey(),
      category: item.category ?? '',
      code: item.code ?? '',
      customizationText: item.customizationText ?? '',
      discountRate: item.discountRate ?? '100',
      entrySource: item.entrySource,
      gift: item.gift ?? false,
      id: item.id,
      imageUrl: item.imageUrl ?? '',
      name: item.name ?? '',
      productId: item.productId,
      quantity: item.quantity ?? '1',
      remark: item.remark ?? '',
      retailPrice: item.retailPrice ?? '',
      skuId: item.skuId,
      unit: item.unit ?? '',
      unitPrice: item.unitPrice ?? '',
      versionToken: item.versionToken,
    })),
    orderDiscountRate: detail.orderDiscountRate ?? '100',
    orderType: detail.orderType ?? 'BULK',
    ownerUserId: detail.ownerUserId ?? undefined,
    packagingRequirements: normalizeContractRequirementCodes(
      detail.packagingRequirements,
    ),
    paymentTerms: detail.paymentTerms ?? '',
    remark: detail.remark ?? '',
    requiredDeliveryDate: normalizeContractDate(detail.requiredDeliveryDate),
    roundingDiscountAmount: detail.roundingDiscountAmount ?? '0',
    signDate: normalizeContractDate(detail.signDate),
    subject: detail.subject ?? '',
    version: detail.version,
  };
}

export function validateContractForm(model: ContractFormModel) {
  const issues: ValidationIssue[] = [];
  const required = (
    path: string,
    value: null | string | undefined,
    label: string,
  ) => {
    if (!text(value)) issues.push({ message: `${label}不能为空`, path });
  };

  required('subject', model.subject, '主题');
  required(
    'alibabaTradeAssuranceNo',
    model.alibabaTradeAssuranceNo,
    '阿里信保单号（非报关订单请填写“不报关”）',
  );
  required('customerId', model.customerId, '对应客户');
  required('companyId', model.companyId, '订单所属公司');
  required('signDate', model.signDate, '签单日期');
  required('currency', model.currency, '币种');

  issues.push(...validateContractFulfillmentConstraints(model));

  if (text(model.signDate) && !normalizeContractDate(model.signDate)) {
    issues.push({ message: '签单日期格式无效', path: 'signDate' });
  }
  if (
    text(model.requiredDeliveryDate) &&
    !normalizeContractDate(model.requiredDeliveryDate)
  ) {
    issues.push({
      message: '要求交货日期格式无效',
      path: 'requiredDeliveryDate',
    });
  }

  if (!isDecimalInRange(model.orderDiscountRate, 0, 100)) {
    issues.push({
      message: '整单折扣率必须在 0 到 100 之间',
      path: 'orderDiscountRate',
    });
  }
  if (!isDecimalInRange(model.roundingDiscountAmount, 0)) {
    issues.push({
      message: '优惠抹零必须是大于等于 0 的数字',
      path: 'roundingDiscountAmount',
    });
  }
  if (!isDecimalInRange(model.additionalFeeAmount, 0)) {
    issues.push({
      message: '附加费用必须是大于等于 0 的数字',
      path: 'additionalFeeAmount',
    });
  }
  if (
    isDecimalInRange(model.additionalFeeAmount, 0) &&
    new BigNumber(model.additionalFeeAmount).gt(0) &&
    !text(model.additionalFeeCategory)
  ) {
    issues.push({
      message: '填写附加费用时必须选择或填写费用分类',
      path: 'additionalFeeCategory',
    });
  }

  if (model.items.length === 0) {
    issues.push({ message: '至少需要一条产品明细', path: 'items' });
  }
  model.items.forEach((item, index) => {
    const prefix = `items.${index}`;
    if (!text(item.name)) {
      issues.push({
        message: `第 ${index + 1} 行产品信息不能为空`,
        path: `${prefix}.name`,
      });
    }
    if (!isDecimalInRange(item.unitPrice, 0)) {
      issues.push({
        message: `第 ${index + 1} 行单价不能小于 0`,
        path: `${prefix}.unitPrice`,
      });
    }
    if (!positive(item.quantity)) {
      issues.push({
        message: `第 ${index + 1} 行数量必须大于 0`,
        path: `${prefix}.quantity`,
      });
    }
    if (!isDecimalInRange(item.discountRate, 0, 100)) {
      issues.push({
        message: `第 ${index + 1} 行折扣率必须在 0 到 100 之间`,
        path: `${prefix}.discountRate`,
      });
    }
    if (text(item.retailPrice) && !isDecimalInRange(item.retailPrice, 0)) {
      issues.push({
        message: `第 ${index + 1} 行零售价格式不正确`,
        path: `${prefix}.retailPrice`,
      });
    }
  });

  const amountPaths = new Set([
    'additionalFeeAmount',
    'orderDiscountRate',
    'roundingDiscountAmount',
  ]);
  const amountInputsValid = !issues.some(
    (issue) =>
      amountPaths.has(issue.path) ||
      /^items\.\d+\.(discountRate|quantity|unitPrice)$/.test(issue.path),
  );
  if (amountInputsValid && model.items.length > 0) {
    const amount = calculateContractAmount({
      additionalFeeAmount: model.additionalFeeAmount,
      items: model.items,
      orderDiscountRate: model.orderDiscountRate,
      roundingDiscountAmount: model.roundingDiscountAmount,
    });
    if (new BigNumber(amount.totalAmount).lt(0)) {
      issues.push({ message: '总金额不能小于 0', path: 'totalAmount' });
    }
  }

  return issues;
}

function buildItemPayload(
  item: ContractFormItem,
): FdmWaimaoContractOrderApi.SaveItemReq {
  const payload: FdmWaimaoContractOrderApi.SaveItemReq = {
    category: optionalText(item.category),
    code: optionalText(item.code),
    customizationText: optionalText(item.customizationText),
    discountRate: canonicalDecimal(item.discountRate, '100'),
    gift: item.gift,
    imageUrl: optionalText(item.imageUrl),
    name: text(item.name),
    quantity: canonicalDecimal(item.quantity),
    remark: optionalText(item.remark),
    retailPrice: text(item.retailPrice)
      ? canonicalDecimal(item.retailPrice)
      : undefined,
    unit: optionalText(item.unit),
    unitPrice: canonicalDecimal(item.unitPrice),
  };
  if (
    item.entrySource === 'PRODUCT_CENTER' &&
    text(item.productId) &&
    text(item.skuId) &&
    text(item.versionToken)
  ) {
    payload.entrySource = 'PRODUCT_CENTER';
    payload.productId = text(item.productId);
    payload.skuId = text(item.skuId);
    payload.versionToken = text(item.versionToken);
  }
  return payload;
}

export function buildContractSavePayload(
  model: ContractFormModel,
): FdmWaimaoContractOrderApi.SaveReq {
  return {
    additionalFeeAmount: canonicalDecimal(model.additionalFeeAmount),
    additionalFeeCategory: optionalText(model.additionalFeeCategory),
    alibabaTradeAssuranceNo: text(model.alibabaTradeAssuranceNo),
    certificationRequirements: normalizeContractRequirementCodes(
      model.certificationRequirements,
    ),
    companyId: text(model.companyId),
    contactId: optionalText(model.contactId),
    countryComplianceRequirements: normalizeContractRequirementCodes(
      model.countryComplianceRequirements,
    ),
    currency: text(model.currency).toUpperCase(),
    customerComplianceRequirements: normalizeContractRequirementCodes(
      model.customerComplianceRequirements,
    ),
    customerId: text(model.customerId),
    deliveryLocation: optionalText(model.deliveryLocation)?.toUpperCase(),
    directShipRequired: model.directShipRequired,
    fulfillmentMode: model.fulfillmentMode,
    incoterm: optionalText(model.incoterm)?.toUpperCase(),
    items: model.items.map(buildItemPayload),
    orderDiscountRate: canonicalDecimal(model.orderDiscountRate, '100'),
    orderType: model.orderType,
    ownerUserId: optionalText(model.ownerUserId),
    packagingRequirements: normalizeContractRequirementCodes(
      model.packagingRequirements,
    ),
    paymentTerms: optionalText(model.paymentTerms),
    remark: optionalText(model.remark),
    requiredDeliveryDate: normalizeContractDate(model.requiredDeliveryDate),
    roundingDiscountAmount: canonicalDecimal(model.roundingDiscountAmount),
    signDate: normalizeContractDate(model.signDate) ?? '',
    subject: text(model.subject),
  };
}

export function buildContractUpdatePayload(
  model: ContractFormModel,
): FdmWaimaoContractOrderApi.UpdateReq {
  if (!model.id || model.version === undefined) {
    throw new Error('编辑合同缺少 id 或 expectedVersion');
  }
  return {
    ...buildContractSavePayload(model),
    expectedVersion: model.version,
    id: text(model.id),
  };
}

export function buildAmountPreviewPayload(
  model: ContractFormModel,
): FdmWaimaoContractOrderApi.AmountPreviewReq {
  return {
    additionalFeeAmount: canonicalDecimal(model.additionalFeeAmount),
    additionalFeeCategory: optionalText(model.additionalFeeCategory),
    items: model.items.map(buildItemPayload),
    orderDiscountRate: canonicalDecimal(model.orderDiscountRate, '100'),
    roundingDiscountAmount: canonicalDecimal(model.roundingDiscountAmount),
  };
}

export function buildContactOptionsParams(
  model: Pick<ContractFormModel, 'id'>,
  customerId: string,
) {
  const normalizedCustomerId = text(customerId);
  const orderId = optionalText(model.id);
  return orderId
    ? { customerId: normalizedCustomerId, orderId }
    : { customerId: normalizedCustomerId };
}

export function contactSelectPlaceholder(customerId: unknown) {
  return text(customerId) ? '请选择联系人（可选）' : '请先选择客户';
}
