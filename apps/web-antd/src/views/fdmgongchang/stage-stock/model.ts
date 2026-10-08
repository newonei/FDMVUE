import type { FdmgongchangStageStockApi as Api } from '#/api/fdmgongchang/stage-stock';

/** 库存阶段按生产链排序，和后端 FactoryStage 一致。 */
export const STAGE_ORDER = [
  'RAW',
  'BOARD',
  'SHEET',
  'LAMINATED',
  'EMBOSSED',
  'PUNCHED',
  'ENGRAVED',
  'FOLDED',
  'PACKED',
] as const;

export type AttrField =
  | 'backColor'
  | 'color'
  | 'frontColor'
  | 'length'
  | 'material'
  | 'pattern'
  | 'recipeCode'
  | 'textureBack'
  | 'textureFront'
  | 'thickness'
  | 'width';

export type ColumnField =
  | 'backColor'
  | 'color'
  | 'frontColor'
  | 'material'
  | 'pattern'
  | 'rawCategory'
  | 'rawMaterial'
  | 'recipe'
  | 'size'
  | 'textureBack'
  | 'textureFront';

export const FIELD_LABELS: Record<AttrField | ColumnField, string> = {
  backColor: '反面色',
  color: '颜色',
  frontColor: '正面色',
  length: '长',
  material: '材质',
  pattern: '图案',
  rawCategory: '分类',
  rawMaterial: '原材料',
  recipe: '配方版本',
  recipeCode: '配方版本',
  size: '长×宽×厚 (cm)',
  textureBack: '反面纹路',
  textureFront: '正面纹路',
  thickness: '厚',
  width: '宽',
};

export const RAW_CATEGORY_LABELS: Record<string, string> = {
  ADDITIVE: '小料',
  COLOR_MASTER: '色母',
  MAIN: '主材料',
};

export const TXN_TYPE_LABELS: Record<string, string> = {
  COMPLETE: '完工入库',
  ISSUE: '领料出库',
  OPENING: '期初入库',
  RAW_RECEIPT: '原料入库',
  SHIP: '出货出库',
  STOCKTAKE: '盘点调整',
};

/** 报完工时各工序可以修改的产出属性，其余属性沿用领料。 */
export const EDITABLE_FIELDS: Record<string, AttrField[]> = {
  EMBOSS: ['textureFront', 'textureBack'],
  ENGRAVE: ['pattern'],
  FOLD: [],
  LAMINATE: ['frontColor', 'backColor', 'length', 'width', 'thickness'],
  MIX: ['material', 'recipeCode', 'color', 'length', 'width', 'thickness'],
  PACK: [],
  PUNCH: ['length', 'width', 'thickness'],
  SLICE: ['color', 'length', 'width', 'thickness'],
};

export function stageIndex(stage: string) {
  return STAGE_ORDER.indexOf(stage as (typeof STAGE_ORDER)[number]);
}

/** 贴合之后颜色分正面、反面。 */
export function isLayered(stage: string) {
  return stageIndex(stage) >= stageIndex('LAMINATED');
}

export function hasTexture(stage: string) {
  return stageIndex(stage) >= stageIndex('EMBOSSED');
}

export function hasPattern(stage: string) {
  return stageIndex(stage) >= stageIndex('ENGRAVED');
}

/** 库存表里每个阶段显示的属性列。 */
export function stageColumns(stage: string): ColumnField[] {
  if (stage === 'RAW') return ['rawMaterial', 'rawCategory'];
  if (stage === 'BOARD') return ['material', 'recipe', 'color', 'size'];
  if (stage === 'SHEET') return ['material', 'color', 'size'];
  const columns: ColumnField[] = [
    'material',
    'frontColor',
    'backColor',
    'size',
  ];
  if (hasTexture(stage)) columns.push('textureFront', 'textureBack');
  if (hasPattern(stage)) columns.push('pattern');
  return columns;
}

/** 期初入库时某阶段需要填写的全部属性（原材料单独选料）。 */
export function stageFields(stage: string): AttrField[] {
  if (stage === 'RAW') return [];
  const fields: AttrField[] = ['material'];
  if (stage === 'BOARD') fields.push('recipeCode');
  fields.push(
    ...(isLayered(stage)
      ? (['frontColor', 'backColor'] as const)
      : (['color'] as const)),
    'length',
    'width',
    'thickness',
  );
  if (hasTexture(stage)) fields.push('textureFront', 'textureBack');
  if (hasPattern(stage)) fields.push('pattern');
  return fields;
}

export function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** 避免 0.1 + 0.2 这类浮点误差，数量最多 3 位小数。 */
export function roundQty(value: number) {
  return Math.round(value * 1000) / 1000;
}

export function sumQty(values: unknown[]) {
  return roundQty(values.reduce<number>((t, v) => t + (toNumber(v) ?? 0), 0));
}

export function formatQty(value: unknown) {
  const n = toNumber(value);
  if (n === undefined) return '—';
  return n.toLocaleString('zh-CN', { maximumFractionDigits: 3 });
}

export function defectRate(good: unknown, defect: unknown): null | number {
  const g = toNumber(good) ?? 0;
  const d = toNumber(defect) ?? 0;
  return g + d > 0 ? d / (g + d) : null;
}

export function formatRate(rate: null | number) {
  return rate === null ? '—' : `${(rate * 100).toFixed(1)}%`;
}

export function splitBatches(batch?: null | string) {
  return (batch ?? '')
    .split('/')
    .map((b) => b.trim())
    .filter(Boolean);
}

/** 多个批次去重后用 / 连接，贴合等合并工序据此追溯来源批次。 */
export function joinBatches(batches: Array<null | string | undefined>) {
  return [...new Set(batches.flatMap((b) => splitBatches(b)))].join('/');
}

/** 单层片材跳过贴合时，正反面同色。 */
export function toLayered(attrs: Api.ItemAttrs): Api.ItemAttrs {
  if (attrs.frontColor || attrs.backColor) return { ...attrs, color: null };
  return {
    ...attrs,
    backColor: attrs.color ?? null,
    color: null,
    frontColor: attrs.color ?? null,
  };
}

/** 只保留产出阶段用到的属性，和后端规范化规则一致。 */
export function normalizeForStage(
  stage: string,
  attrs: Api.ItemAttrs,
): Api.ItemAttrs {
  if (stage === 'RAW') return { rawMaterialCode: attrs.rawMaterialCode };
  const out: Api.ItemAttrs = {
    length: toNumber(attrs.length) ?? null,
    material: attrs.material ?? null,
    thickness: toNumber(attrs.thickness) ?? null,
    width: toNumber(attrs.width) ?? null,
  };
  if (stage === 'BOARD') out.recipeCode = attrs.recipeCode ?? null;
  if (isLayered(stage)) {
    out.frontColor = attrs.frontColor || attrs.color || null;
    out.backColor = attrs.backColor || attrs.color || null;
  } else {
    out.color = attrs.color || attrs.frontColor || null;
  }
  if (hasTexture(stage)) {
    out.textureFront = attrs.textureFront || null;
    out.textureBack = attrs.textureBack || null;
  }
  if (hasPattern(stage)) out.pattern = attrs.pattern || null;
  return out;
}

export interface InputLine {
  quantity: number;
  side?: Api.LaminationSide;
  stock: Pick<
    Api.Stock,
    'batchNo' | 'id' | 'item' | 'itemCode' | 'location' | 'quantity' | 'stage'
  >;
}

export interface OutputDraft {
  attrs: Api.ItemAttrs;
  batchNo: string;
  defectQuantity?: number;
  goodQuantity?: number;
  key: string;
}

let keySeed = 0;
export function nextKey() {
  keySeed += 1;
  return `out-${keySeed}`;
}

function draft(attrs: Api.ItemAttrs, batchNo: string): OutputDraft {
  return {
    attrs,
    batchNo,
    defectQuantity: undefined,
    goodQuantity: undefined,
    key: nextKey(),
  };
}

function inputColor(line: InputLine) {
  return line.stock.item?.color || line.stock.item?.frontColor || null;
}

/**
 * 按领料生成默认产出行：
 * - 密炼：一行，材质默认 TPE，颜色、配方、尺寸由人填写，批次保存时生成；
 * - 开片：领料按 颜色+厚度 分组，每组一行（可以颜色规格混开），长宽由人填写；
 * - 贴合：正面片材的颜色作正面色、反面片材的颜色作反面色，厚度相加；
 * - 其余工序：按领料编码分组，沿用属性；压花待选纹路，雕刻待选图案，冲裁沿用尺寸待改。
 */
export function deriveOutputs(
  process: string,
  inputs: InputLine[],
  defaultMaterial = 'TPE',
): OutputDraft[] {
  if (inputs.length === 0) return [];
  if (process === 'MIX') {
    return [draft({ material: defaultMaterial }, '')];
  }
  if (process === 'SLICE') {
    const groups = new Map<
      string,
      { attrs: Api.ItemAttrs; batches: string[] }
    >();
    for (const line of inputs) {
      const item = line.stock.item ?? {};
      const key = [item.material, item.color, toNumber(item.thickness)].join(
        '|',
      );
      const group = groups.get(key) ?? {
        attrs: {
          color: item.color ?? null,
          material: item.material ?? null,
          thickness: toNumber(item.thickness) ?? null,
        },
        batches: [],
      };
      group.batches.push(line.stock.batchNo);
      groups.set(key, group);
    }
    return [...groups.values()].map((g) =>
      draft(g.attrs, joinBatches(g.batches)),
    );
  }
  if (process === 'LAMINATE') {
    const front = inputs.find((l) => l.side === 'FRONT') ?? inputs[0]!;
    const back =
      inputs.find((l) => l.side === 'BACK') ??
      inputs.find((l) => l !== front) ??
      front;
    const f = front.stock.item ?? {};
    const b = back.stock.item ?? {};
    const thickness =
      toNumber(f.thickness) !== undefined && toNumber(b.thickness) !== undefined
        ? Math.round(
            ((toNumber(f.thickness) ?? 0) + (toNumber(b.thickness) ?? 0)) * 100,
          ) / 100
        : null;
    return [
      draft(
        {
          backColor: inputColor(back),
          frontColor: inputColor(front),
          length: toNumber(f.length) ?? null,
          material: f.material ?? null,
          thickness,
          width: toNumber(f.width) ?? null,
        },
        joinBatches([front.stock.batchNo, back.stock.batchNo]),
      ),
    ];
  }
  const groups = new Map<string, { attrs: Api.ItemAttrs; batches: string[] }>();
  for (const line of inputs) {
    const group = groups.get(line.stock.itemCode) ?? {
      attrs: toLayered(line.stock.item ?? {}),
      batches: [],
    };
    group.batches.push(line.stock.batchNo);
    groups.set(line.stock.itemCode, group);
  }
  return [...groups.values()].map((g) => {
    const attrs = { ...g.attrs };
    if (process === 'EMBOSS') {
      attrs.textureFront = null;
      attrs.textureBack = null;
    }
    if (process === 'ENGRAVE') attrs.pattern = null;
    return draft(attrs, joinBatches(g.batches));
  });
}

/** 开片、贴合改颜色后，批次跟着换成对应颜色领料的批次。 */
export function lineBatch(
  process: string,
  line: OutputDraft,
  inputs: InputLine[],
): string {
  if (process === 'SLICE') {
    const matched = inputs.filter((l) => inputColor(l) === line.attrs.color);
    return matched.length > 0
      ? joinBatches(matched.map((l) => l.stock.batchNo))
      : line.batchNo;
  }
  if (process === 'LAMINATE') {
    const pick = (side: Api.LaminationSide, color?: null | string) =>
      inputs.find((l) => l.side === side && inputColor(l) === color) ??
      inputs.find((l) => inputColor(l) === color);
    const front = pick('FRONT', line.attrs.frontColor);
    const back = pick('BACK', line.attrs.backColor);
    if (front && back)
      return joinBatches([front.stock.batchNo, back.stock.batchNo]);
  }
  return line.batchNo;
}

export interface Labels {
  color: (value?: null | string) => string;
  material: (value?: null | string) => string;
  pattern: (value?: null | string) => string;
  recipe: (code?: null | string) => string;
  texture: (value?: null | string) => string;
}

function dictLabel(list: Api.DictOption[] | undefined, value?: null | string) {
  if (!value) return '';
  const upper = value.toUpperCase();
  return list?.find((d) => d.value.toUpperCase() === upper)?.label ?? value;
}

export function makeLabels(options?: Api.Options): Labels {
  return {
    color: (v) => dictLabel(options?.colors, v),
    material: (v) => dictLabel(options?.materials, v),
    pattern: (v) => dictLabel(options?.patterns, v),
    recipe: (code) =>
      code ? (options?.recipes.find((r) => r.code === code)?.name ?? code) : '',
    texture: (v) => dictLabel(options?.textures, v),
  };
}

export function sizeText(attrs?: Api.ItemAttrs | null) {
  if (!attrs) return '';
  const parts = [attrs.length, attrs.width, attrs.thickness].map((v) =>
    toNumber(v) === undefined ? '?' : String(toNumber(v)),
  );
  return parts.every((p) => p === '?') ? '' : parts.join('×');
}

/** 属性的一行摘要，例如「紫色/灰色 · 185×63×0.6 · 贝壳纹/防滑纹」。skip 里的字段不显示（表单里已有编辑框）。 */
export function attrSummary(
  stage: string,
  attrs: Api.ItemAttrs | null | undefined,
  labels: Labels,
  skip: AttrField[] = [],
) {
  if (!attrs) return '';
  if (stage === 'RAW')
    return attrs.rawMaterialName || attrs.rawMaterialCode || '';
  const parts: string[] = [];
  if (!skip.includes('material') && attrs.material)
    parts.push(labels.material(attrs.material));
  if (isLayered(stage)) {
    if (!skip.includes('frontColor') && !skip.includes('backColor')) {
      const front = labels.color(attrs.frontColor);
      const back = labels.color(attrs.backColor);
      if (front || back) {
        parts.push(
          attrs.frontColor === attrs.backColor
            ? `${front}（单层）`
            : `${front}/${back}`,
        );
      }
    }
  } else if (!skip.includes('color') && attrs.color) {
    parts.push(labels.color(attrs.color));
  }
  if (
    !(
      skip.includes('length') &&
      skip.includes('width') &&
      skip.includes('thickness')
    )
  ) {
    const size = sizeText(attrs);
    if (size) parts.push(size);
  }
  if (stage === 'BOARD' && !skip.includes('recipeCode') && attrs.recipeCode) {
    parts.push(labels.recipe(attrs.recipeCode));
  }
  if (hasTexture(stage) && !skip.includes('textureFront')) {
    parts.push(
      attrs.textureFront || attrs.textureBack
        ? `${labels.texture(attrs.textureFront) || '无'}/${labels.texture(attrs.textureBack) || '无'}`
        : '未压花',
    );
  }
  if (hasPattern(stage) && !skip.includes('pattern')) {
    parts.push(attrs.pattern ? labels.pattern(attrs.pattern) : '无图案');
  }
  return parts.join(' · ');
}

/** 报完工前的本地校验，只覆盖最常见的漏填；字典和主数据的校验以后端为准。 */
export function validateOutputs(
  process: string,
  outputStage: string,
  outputs: OutputDraft[],
): string[] {
  const errors: string[] = [];
  const filled = outputs.filter(
    (o) =>
      (toNumber(o.goodQuantity) ?? 0) + (toNumber(o.defectQuantity) ?? 0) > 0,
  );
  if (filled.length === 0) errors.push('请填写产出的良品或残次品数量。');
  outputs.forEach((o, index) => {
    const row = `第 ${index + 1} 行`;
    if (
      (toNumber(o.goodQuantity) ?? 0) < 0 ||
      (toNumber(o.defectQuantity) ?? 0) < 0
    ) {
      errors.push(`${row}数量不能是负数。`);
    }
    if (
      (toNumber(o.goodQuantity) ?? 0) + (toNumber(o.defectQuantity) ?? 0) <=
      0
    )
      return;
    const a = o.attrs;
    if (
      !(
        (toNumber(a.length) ?? 0) > 0 &&
        (toNumber(a.width) ?? 0) > 0 &&
        (toNumber(a.thickness) ?? 0) > 0
      )
    ) {
      errors.push(`${row}请填完整的长、宽、厚。`);
    }
    if (process === 'MIX' && !a.recipeCode)
      errors.push(`${row}请选择配方版本。`);
    if (isLayered(outputStage) ? !a.frontColor || !a.backColor : !a.color) {
      errors.push(`${row}请选择颜色。`);
    }
    if (outputStage === 'EMBOSSED' && !a.textureFront && !a.textureBack) {
      errors.push(`${row}请选择正面或反面纹路。`);
    }
    if (outputStage === 'ENGRAVED' && !a.pattern)
      errors.push(`${row}请选择雕刻图案。`);
  });
  return errors;
}

/** 后端 LocalDate 可能是 "2026-10-08" 或 [2026, 10, 8]。 */
export function formatDate(value: Api.DateValue | undefined) {
  if (!value) return '';
  if (Array.isArray(value)) {
    const [y, m, d] = value;
    return y ? `${y}-${String(m ?? 1).padStart(2, '0')}-${String(d ?? 1).padStart(2, '0')}` : '';
  }
  return String(value).slice(0, 10);
}

/** 合同产品的一行描述，例如「紫灰双色瑜伽垫 · 183x61x0.6cm · 丁香紫/灰」。 */
export function contractProductText(
  row: Pick<Api.ShippableItem, 'color' | 'productName' | 'size' | 'specification'>,
) {
  const { size: itemSize, specification } = row;
  return [row.productName, specification || itemSize, row.color]
    .filter(Boolean)
    .join(' · ');
}

/** 自制任务还能排产的数量：任务数量 - 已回写完工。 */
export function makeTaskRemaining(task: Api.MakeTask) {
  return Math.max(0, roundQty((toNumber(task.assignmentQuantity) ?? 0) - (toNumber(task.completedQuantity) ?? 0)));
}

export type MakeTaskState = 'done' | 'not-ready' | 'producing' | 'waiting';

export function makeTaskState(task: Api.MakeTask): MakeTaskState {
  if (!task.ready) return 'not-ready';
  if (makeTaskRemaining(task) <= 0) return 'done';
  return task.linkedOrderCount > 0 || (toNumber(task.completedQuantity) ?? 0) > 0 ? 'producing' : 'waiting';
}

export const MAKE_TASK_STATE_LABELS: Record<MakeTaskState, string> = {
  done: '已完工',
  'not-ready': '方案未生效',
  producing: '生产中',
  waiting: '待生产',
};
