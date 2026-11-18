import type { Contract, ContractItem } from '#/api/fdmplatform';
import type {
  ProductConfiguration,
  ProductConfigurationItem,
} from '#/api/fdmplatform/products';

export const contractConfigurationFields = [
  { key: 'name', label: '产品名称', type: 'text' },
  { key: 'lengthMm', label: '长（mm）', type: 'number' },
  { key: 'widthMm', label: '宽（mm）', type: 'number' },
  { key: 'finishedThicknessMm', label: '厚（mm）', type: 'number' },
  { key: 'colorMode', label: '单色 / 双色', type: 'select' },
  { key: 'frontColor', label: '正面颜色', type: 'select' },
  { key: 'backColor', label: '反面颜色', type: 'select' },
  { key: 'textureFront', label: '正面纹路', type: 'select' },
  { key: 'textureBack', label: '反面纹路', type: 'select' },
  { key: 'patternMode', label: '激光雕刻方式', type: 'select' },
  { key: 'patternCode', label: '激光雕刻图案', type: 'select' },
  { key: 'patternVersion', label: '图稿版本', type: 'text' },
] as const;
export type ContractConfigurationField =
  (typeof contractConfigurationFields)[number]['key'];

/** 兼容仍以 cm 尺寸文本保存的标准产品；不从型号猜测颜色、纹路或图案。 */
export function contractConfigurationFrom(
  item: ContractItem,
): ProductConfiguration {
  const parsed = (item.size ?? '').match(
    /^\s*(\d+(?:\.\d+)?)\s*[*x×]\s*(\d+(?:\.\d+)?)\s*[*x×]\s*(\d+(?:\.\d+)?)\s*(mm|cm)\s*$/i,
  );
  const scale = parsed?.[4]?.toLowerCase() === 'mm' ? 1 : 10;
  const dimension = (index: number) =>
    parsed ? Number(parsed[index]) * scale : null;
  const frontColor = item.frontColor ?? item.colorCode ?? '';
  return {
    name: item.configurationName || item.skuName,
    lengthMm: item.lengthMm ?? dimension(1),
    widthMm: item.widthMm ?? dimension(2),
    finishedThicknessMm: item.finishedThicknessMm ?? dimension(3),
    colorMode: item.colorMode ?? 'UNKNOWN',
    frontColor,
    backColor:
      item.colorMode === 'SINGLE'
        ? frontColor
        : (item.backColor ?? item.colorCode ?? ''),
    textureFront: item.textureFront ?? '',
    textureBack: item.textureBack ?? '',
    patternMode: item.patternMode ?? 'UNKNOWN',
    patternCode: item.patternCode ?? '',
    patternVersion: item.patternVersion ?? '',
  };
}

export function contractConfigurationLockReason(
  item: ContractItem,
  requested = false,
) {
  if (requested || Number(item.openingShippedQuantity ?? 0) > 0)
    return '已有履约申请或历史发货，产品配置已锁定；请新增明细并处理原申请';
  if (item.productVersion === null || item.productVersion === undefined)
    return '历史明细缺少产品档案版本，请从产品中心新增明细';
  return '';
}

export function requestedContractLineIds(contract?: Contract) {
  return new Set(
    (contract?.requests ?? []).flatMap((request) =>
      Array.isArray(request.items)
        ? request.items.map((item) =>
            String((item as Record<string, unknown>).contractItemId),
          )
        : [],
    ),
  );
}

export function contractConfigurationItems(
  items: ContractItem[],
  draft: ProductConfiguration,
  fields: ContractConfigurationField[],
  onlyEmpty = false,
): ProductConfigurationItem[] {
  return items.map((item) => {
    const configuration = contractConfigurationFrom(item);
    for (const field of fields) {
      const current = configuration[field];
      if (
        onlyEmpty &&
        current !== null &&
        current !== undefined &&
        current !== '' &&
        current !== 'UNKNOWN'
      )
        continue;
      Object.assign(configuration, {
        [field]: draft[field] ?? (field.endsWith('Mm') ? null : ''),
      });
    }
    if (configuration.colorMode === 'SINGLE')
      configuration.backColor = configuration.frontColor;
    if (configuration.patternMode === 'NONE') {
      configuration.patternCode = '';
      configuration.patternVersion = '';
    }
    return {
      lineId: item.id,
      sourceProductId: item.skuId,
      expectedVersion: item.productVersion!,
      configuration,
    };
  });
}

/** 身份来自服务端新 SKU 快照；交易信息和合同图稿继续归原合同明细。 */
export function applyConfiguredContractItem(
  original: ContractItem,
  snapshot: ContractItem,
): ContractItem {
  return {
    ...snapshot,
    id: original.id,
    quantity: original.quantity,
    unitPrice: original.unitPrice,
    requiredDate: original.requiredDate,
    remark: original.remark,
    taxBasis: original.taxBasis,
    printing: original.printing,
    packaging: original.packaging,
    suggestedSupplierId: original.suggestedSupplierId,
    suggestedSupplierName: original.suggestedSupplierName,
    suggestedSupplierRemark: original.suggestedSupplierRemark,
    attachmentIds: [...(original.attachmentIds ?? [])],
    attachmentPurposes: { ...original.attachmentPurposes },
    priceSourceId: undefined,
    priceSourceVersion: undefined,
  };
}

export function contractConfigurationSummary(item: ContractItem) {
  const front =
    item.frontColorLabel ||
    item.frontColor ||
    item.colorCodeLabel ||
    item.colorCode ||
    '待确认';
  const back = item.backColorLabel || item.backColor || '待确认';
  const texture = (value?: null | string, label?: null | string) =>
    value === 'NONE' ? '无纹路' : label || value || '待确认';
  let color = '颜色方式待确认';
  if (item.colorMode === 'SINGLE') color = `单色 · ${front}`;
  else if (item.colorMode === 'DUAL') color = `双色 · 正 ${front} / 反 ${back}`;
  let pattern = '雕刻要求待确认';
  if (item.patternMode === 'NONE') pattern = '不雕刻';
  else if (item.patternMode === 'LASER')
    pattern = `激光 ${item.patternCode || '待选图案'} · ${item.patternVersion || '版本待确认'}`;
  return [
    color,
    `正 ${texture(item.textureFront, item.textureFrontLabel)} / 反 ${texture(item.textureBack, item.textureBackLabel)}`,
    pattern,
  ].join(' · ');
}
