import type { ProductStructure } from '#/api/fdmplatform/products';

const fields = [
  'colorMode',
  'constructionType',
  'productStage',
  'productStageLabel',
  'colorCode',
  'colorCodeLabel',
  'frontColor',
  'frontColorLabel',
  'backColor',
  'backColorLabel',
  'textureFront',
  'textureFrontLabel',
  'textureBack',
  'textureBackLabel',
  'matType',
  'matTypeLabel',
  'material',
  'size',
  'color',
  'shape',
  'weight',
  'printing',
  'packaging',
] as const satisfies readonly (keyof ProductStructure)[];

/** 整份来源决定结构；不把当前档案或非结构化颜色拼进旧单快照。 */
export function productStructure(
  source: null | object | undefined,
): ProductStructure {
  const record = (source ?? {}) as Record<string, unknown>;
  return {
    ...Object.fromEntries(
      fields.map((field) => [
        field,
        typeof record[field] === 'string' ? record[field] : undefined,
      ]),
    ),
    ...Object.fromEntries(
      ['finishedThicknessMm', 'frontThicknessMm', 'backThicknessMm'].map(
        (field) => [
          field,
          typeof record[field] === 'number' ? record[field] : undefined,
        ],
      ),
    ),
  };
}

export function structureValue(
  value: ProductStructure,
  field: keyof ProductStructure,
  labelField?: keyof ProductStructure,
) {
  const text = (raw: unknown) => (typeof raw === 'string' ? raw.trim() : '');
  return (
    (labelField && text(value[labelField])) || text(value[field]) || '未维护'
  );
}

export function structureDetails(value: ProductStructure) {
  return [
    { label: '材质', value: structureValue(value, 'material') },
    { label: '尺寸', value: structureValue(value, 'size') },
    {
      label: '生产分类',
      value: structureValue(value, 'productStage', 'productStageLabel'),
    },
    {
      label: '垫子类型',
      value: structureValue(value, 'matType', 'matTypeLabel'),
    },
    {
      label: '单色',
      value: structureValue(value, 'colorCode', 'colorCodeLabel'),
    },
    {
      label: '正面压花',
      value: structureValue(value, 'textureFront', 'textureFrontLabel'),
    },
    {
      label: '反面压花',
      value: structureValue(value, 'textureBack', 'textureBackLabel'),
    },
    ...(
      [
        ['color', '颜色说明'],
        ['shape', '形状'],
        ['weight', '克重'],
        ['printing', '定制说明'],
        ['packaging', '包装要求'],
      ] as const
    )
      .filter(([field]) => value[field]?.trim())
      .map(([field, label]) => ({
        label,
        value: value[field]!,
      })),
  ];
}
