import type { FdmgongchangStageStockApi as Api } from '#/api/fdmgongchang/stage-stock';

/** 库存阶段按生产链排序，和后端 FactoryStage 一致；辅料（AUX）不在生产链上，排在最后。 */
export const STAGE_ORDER = [
  'RAW',
  'BOARD',
  'SHEET',
  'CUT',
  'LAMINATED',
  'EMBOSSED',
  'PUNCHED',
  'ENGRAVED',
  'FOLDED',
  'PACKED',
  'AUX',
] as const;

/** 采购单明细的物料类型：原料进原材料、辅料进辅料库存。 */
export const MATERIAL_KIND_LABELS: Record<Api.MaterialKind, string> = {
  AUX: '辅料',
  RAW: '原料',
};

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
  RETURN: '余料退回',
  SHIP: '出货出库',
  STOCKTAKE: '盘点调整',
  TRADE_RECEIPT: '外采入库',
  PURCHASE_RECEIPT: '采购收货',
  DELIVER: '交货出库',
  VOID: '作废冲销',
  EXTRA_DEFECT: '附加工序残次',
};

export const RECEIPT_SOURCE_LABELS: Record<Api.ReceiptSource, string> = {
  PURCHASE: '采购收货',
  RAW_PURCHASE: '原材料采购',
  TRADE_PURCHASE: '外采成品',
};

/** 报完工时各工序可以修改的产出属性，其余属性沿用领料。 */
export const EDITABLE_FIELDS: Record<string, AttrField[]> = {
  CUT: ['length', 'width'],
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
  return stage !== 'AUX' && stageIndex(stage) >= stageIndex('LAMINATED');
}

export function hasTexture(stage: string) {
  return stage !== 'AUX' && stageIndex(stage) >= stageIndex('EMBOSSED');
}

export function hasPattern(stage: string) {
  return stage !== 'AUX' && stageIndex(stage) >= stageIndex('ENGRAVED');
}

/** 库存表里每个阶段显示的属性列。 */
export function stageColumns(stage: string): ColumnField[] {
  if (stage === 'RAW') return ['rawMaterial', 'rawCategory'];
  if (stage === 'AUX') return [];
  if (stage === 'BOARD') return ['material', 'recipe', 'color', 'size'];
  if (stage === 'SHEET' || stage === 'CUT')
    return ['material', 'color', 'size'];
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
  if (stage === 'RAW' || stage === 'AUX') return [];
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
  if (stage === 'AUX')
    return {
      contractCode: attrs.contractCode ?? null,
      contractId: attrs.contractId ?? null,
      productCode: attrs.productCode ?? null,
      productId: attrs.productId ?? null,
      productName: attrs.productName ?? null,
      unit: attrs.unit ?? null,
    };
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
  /** 开片时按板材规格自动带入的良品数；良品还等于它时说明没手动改过，规格变了会跟着重算。 */
  autoGood?: number;
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
 * - 开片：领料按 颜色+厚度 分组，每组一行（可以颜色规格混开），长宽由人填写，厚度默认沿用板材（分层开时改薄）；
 * - 贴合：正面片材的颜色作正面色、反面片材的颜色作反面色，厚度相加；
 * - 立切：按领料编码分组，沿用单色属性，长宽待改；
 * - 其余工序：按领料编码分组，沿用属性；压花待选纹路，雕刻待选图案，冲裁沿用尺寸待改。
 */
export function deriveOutputs(
  process: string,
  inputs: InputLine[],
  defaultMaterial = 'TPE',
  /** 密炼按配方领料时，产出板材的配方版本默认用这个配方。 */
  recipeCode?: null | string,
): OutputDraft[] {
  if (inputs.length === 0) return [];
  if (process === 'MIX') {
    return [
      draft(
        recipeCode
          ? { material: defaultMaterial, recipeCode }
          : { material: defaultMaterial },
        '',
      ),
    ];
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
    const item = line.stock.item ?? {};
    const group = groups.get(line.stock.itemCode) ?? {
      // 立切产出还是单色片材；之后的工序都按正反面色
      attrs: process === 'CUT' ? { ...item } : toLayered(item),
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
  if (stage === 'AUX') return auxSpec(attrs);
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

/** 把合同上的尺寸文字（如「183x61x0.6」「183×61×0.6cm」）拆成长宽厚，拆不出来返回空对象。 */
export function parseSizeText(text?: null | string): Pick<
  Api.ItemAttrs,
  'length' | 'thickness' | 'width'
> {
  const match = (text ?? '')
    .replaceAll(/\s+/g, '')
    .match(/^(\d+(?:\.\d+)?)[x×*](\d+(?:\.\d+)?)[x×*](\d+(?:\.\d+)?)(?:cm)?$/i);
  if (!match) return {};
  return {
    length: Number(match[1]),
    thickness: Number(match[3]),
    width: Number(match[2]),
  };
}

/** 外采到货的数量规则：实收不超过待到货，可入库不超过实收，少于实收要写原因。 */
export function validateTradeReceipt(input: {
  accepted?: null | number;
  quantity?: null | number;
  reason?: string;
  remaining: unknown;
}) {
  const problems: string[] = [];
  const quantity = input.quantity ?? 0;
  const accepted = input.accepted ?? 0;
  const remaining = toNumber(input.remaining) ?? 0;
  if (quantity <= 0) problems.push('请填写大于 0 的实收数量。');
  else if (quantity > remaining)
    problems.push(`实收数量超过这行采购待到货的 ${formatQty(remaining)}。`);
  if (input.accepted === null || input.accepted === undefined || accepted < 0)
    problems.push('请填写可入库数量（良品），全部不良时填 0。');
  else if (accepted > quantity) problems.push('可入库数量不能超过实收数量。');
  else if (accepted < quantity && !input.reason?.trim())
    problems.push('可入库数量少于实收数量，请填写异常原因。');
  return problems;
}

/** 外采成品收货时按合同产品预填已包装成品的规格：材质、正反面色（「紫/灰」）、长宽厚，匹配不到的留空让人填。 */
export function guessPackedAttrs(
  line: Pick<Api.TradePurchaseLine, 'color' | 'material' | 'size' | 'specification'>,
  options: Pick<Api.Options, 'colors' | 'materials'>,
): Api.ItemAttrs {
  const find = (list: Api.DictOption[], text?: string) => {
    const t = (text ?? '').trim().toUpperCase();
    if (!t) return undefined;
    return list.find(
      (o) => o.value.toUpperCase() === t || o.label.toUpperCase() === t,
    )?.value;
  };
  const [front, back] = (line.color ?? '').split(/[/／、]/);
  const frontColor = find(options.colors, front);
  const dims = parseSizeText(line.size);
  return {
    backColor: find(options.colors, back) ?? frontColor,
    frontColor,
    material:
      find(options.materials, line.material ?? undefined) ??
      find(options.materials, 'TPE'),
    ...(dims.length === undefined ? parseSizeText(line.specification) : dims),
  };
}

/** 按配方算出的建议领料：每行库存领多少（先进先出），带上库存行信息方便直接填进领料表。 */
export function recipePicks(plan: Api.RecipePlan): InputLine[] {
  return plan.lines.flatMap((line) =>
    line.picks
      .filter((p) => (toNumber(p.quantity) ?? 0) > 0)
      .map((p) => ({
        quantity: toNumber(p.quantity) ?? 0,
        stock: {
          batchNo: p.batchNo,
          id: p.stockId,
          item: {
            rawCategory: line.rawCategory ?? null,
            rawMaterialCode: line.rawMaterialCode,
            rawMaterialName: line.rawMaterialName ?? null,
          },
          itemCode: p.itemCode,
          location: p.location,
          quantity: p.available,
          stage: 'RAW',
        },
      })),
  );
}

export interface RecipeCheck {
  code: string;
  /** 这次填的领用数量。 */
  filled: number;
  name: string;
  /** 这次应领（新开单是应领，补领是还要领）；不在配方里的料为 null。 */
  target: null | number;
}

/**
 * 对照这次填的领料和配方：每种原料填了多少、应领多少。
 * 配方里的料按配方顺序在前，另外填的料（不在配方里）排在后面。
 */
export function recipeCheck(
  plan: Api.RecipePlan | undefined,
  inputs: InputLine[],
  /** true：对照「还要领」（补领）；false：对照「应领」（开单）。 */
  remainingOnly = false,
): RecipeCheck[] {
  if (!plan) return [];
  const filled = new Map<string, { name: string; qty: number }>();
  for (const line of inputs) {
    const code = line.stock.item?.rawMaterialCode;
    if (!code) continue;
    const prev = filled.get(code);
    filled.set(code, {
      name: prev?.name ?? line.stock.item?.rawMaterialName ?? code,
      qty: roundQty((prev?.qty ?? 0) + line.quantity),
    });
  }
  const planned = plan.lines.filter((l) => l.required !== null && l.required !== undefined);
  const rows: RecipeCheck[] = planned.map((l) => ({
    code: l.rawMaterialCode,
    filled: filled.get(l.rawMaterialCode)?.qty ?? 0,
    name: l.rawMaterialName ?? l.rawMaterialCode,
    target: toNumber(remainingOnly ? l.remaining : l.required) ?? 0,
  }));
  const known = new Set(planned.map((l) => l.rawMaterialCode));
  for (const [code, f] of filled) {
    if (!known.has(code)) rows.push({ code, filled: f.qty, name: f.name, target: null });
  }
  return rows;
}

/** 领料行标签：开单领料不标，补领标「第 n 次补领」。 */
export function issueSeqLabel(seq?: null | number) {
  return seq && seq > 0 ? `第 ${seq} 次补领` : '';
}

/** 库存阶段目录的分组；后端新增、这里没登记的阶段归到「其他」。 */
export const STAGE_GROUPS: Array<{ label: string; stages: string[] }> = [
  { label: '原料与板材', stages: ['RAW', 'BOARD'] },
  { label: '半成品', stages: ['SHEET', 'CUT', 'LAMINATED', 'EMBOSSED'] },
  { label: '成品', stages: ['PUNCHED', 'ENGRAVED', 'FOLDED', 'PACKED'] },
  { label: '辅料', stages: ['AUX'] },
];

/** 按目录分组排列阶段，组内保持接口返回的顺序，空组不显示。 */
export function groupStages<T extends { code: string }>(stages: T[]) {
  const known = new Set(STAGE_GROUPS.flatMap((g) => g.stages));
  return [
    ...STAGE_GROUPS.map((g) => ({
      label: g.label,
      stages: stages.filter((s) => g.stages.includes(s.code)),
    })),
    { label: '其他', stages: stages.filter((s) => !known.has(s.code)) },
  ].filter((g) => g.stages.length > 0);
}

/** 阶段的流转关系：来源 → 当前 → 去向；去向包含允许跳过工序直接领料的下游工序。 */
export function stageFlow(stage: string, options: Api.Options) {
  const label = options.stages.find((s) => s.code === stage)?.label ?? stage;
  const incoming = options.processes.find((p) => p.outputStage === stage);
  const outgoing = options.processes.filter((p) => p.sources.includes(stage));
  let from = '采购到货';
  if (incoming)
    from = `${incoming.label}产出`;
  if (stage === 'AUX')
    return { current: `当前${label}`, from, to: '开工序单时领用' };
  return {
    current: `当前${label}`,
    from,
    to:
      outgoing.length > 0
        ? `${outgoing.map((p) => p.label).join('、')}领料`
        : '生产入库进仓库',
  };
}

/** 库存行的物料名，例如「TPE 紫色片材」；原材料用原料名称。缺属性时退回编码。 */
export function stockTitle(
  stage: string,
  stageLabel: string,
  attrs: Api.ItemAttrs | null | undefined,
  labels: Labels,
  itemCode: string,
) {
  if (!attrs) return itemCode;
  if (stage === 'RAW')
    return attrs.rawMaterialName || attrs.rawMaterialCode || itemCode;
  if (stage === 'AUX') return attrs.productName || itemCode;
  let color = labels.color(attrs.color);
  if (isLayered(stage)) {
    const front = labels.color(attrs.frontColor);
    const back = labels.color(attrs.backColor);
    color =
      attrs.frontColor === attrs.backColor
        ? front
        : [front, back].filter(Boolean).join('/');
  }
  const head = [labels.material(attrs.material), color]
    .filter(Boolean)
    .join(' ');
  return head ? `${head}${stageLabel}` : itemCode;
}

/** 物料名之外的规格摘要（尺寸、配方、纹路、图案），原材料显示分类。 */
export function stockSpec(
  stage: string,
  attrs: Api.ItemAttrs | null | undefined,
  labels: Labels,
) {
  if (stage === 'RAW') {
    const category = attrs?.rawCategory ?? '';
    return RAW_CATEGORY_LABELS[category] ?? category;
  }
  if (stage === 'AUX') return attrs ? auxSpec(attrs) : '';
  const spec = attrSummary(stage, attrs, labels, [
    'material',
    'color',
    'frontColor',
    'backColor',
  ]);
  const single =
    isLayered(stage) && attrs?.frontColor && attrs.frontColor === attrs.backColor;
  return single ? ['单层', spec].filter(Boolean).join(' · ') : spec;
}

/** 工序名称：主干工序或附加工序（含停用的附加工序），找不到时显示编码。 */
export function processLabel(options: Api.Options | undefined, code?: null | string) {
  if (!code) return '';
  return (
    options?.processes.find((p) => p.code === code)?.label ??
    options?.extraProcesses?.find((p) => p.code === code)?.label ??
    code
  );
}

/** 挂在这个库存阶段的启用中的附加工序。 */
export function extraProcessesAt(options: Api.Options | undefined, stage: string) {
  return (options?.extraProcesses ?? []).filter((p) => p.enabled && p.stage === stage);
}

/** 领料和产出一比一的工序：压花、雕刻、折叠、包装（开片、贴合、立切、冲裁的领料和产出不是一比一）。 */
const ONE_TO_ONE = new Set(['EMBOSS', 'ENGRAVE', 'FOLD', 'PACK']);

/**
 * 已完工工序单的领料差额 = 领料 − 退料 − 良品 − 残次，大于 0 说明有损耗或漏报。
 * 只对一比一的工序计算；其他工序或还没完工时返回 undefined。
 */
export function materialGap(order: {
  defectQuantity?: unknown;
  goodQuantity?: unknown;
  inputQuantity?: unknown;
  process: string;
  returnedQuantity?: unknown;
  status: string;
}) {
  if (order.status !== 'COMPLETED' || !ONE_TO_ONE.has(order.process)) return undefined;
  return roundQty(
    (toNumber(order.inputQuantity) ?? 0) -
      (toNumber(order.returnedQuantity) ?? 0) -
      (toNumber(order.goodQuantity) ?? 0) -
      (toNumber(order.defectQuantity) ?? 0),
  );
}


/** 辅料的规格摘要：产品编码、定制合同（通用辅料不写）。 */
export function auxSpec(attrs: Api.ItemAttrs) {
  return [
    attrs.productCode,
    attrs.contractCode ? `定制 · ${attrs.contractCode}` : '通用',
  ]
    .filter(Boolean)
    .join(' · ');
}

/** 库存数量的单位：辅料按产品单位，其他阶段按阶段单位。 */
export function stockUnit(
  stage: string,
  attrs: Api.ItemAttrs | null | undefined,
  stageUnit?: null | string,
) {
  return stage === 'AUX' ? (attrs?.unit ?? '') : (stageUnit ?? '');
}

/** 开工序单时按用量算的建议领用数：每件用量 × 本次数量，扣掉已经领过、超过订单总需求的部分。 */
export function suggestAuxQuantity(
  plan: Pick<Api.AuxPlan, 'issuedQuantity' | 'orderQuantity' | 'perUnit'>,
  quantity: number,
) {
  const perUnit = Number(plan.perUnit) || 0;
  let need = perUnit * Math.max(quantity, 0);
  const total =
    plan.orderQuantity === null || plan.orderQuantity === undefined
      ? null
      : Number(plan.orderQuantity) * perUnit;
  if (total !== null && Number.isFinite(total)) {
    need = Math.min(need, Math.max(total - (Number(plan.issuedQuantity) || 0), 0));
  }
  return Math.round(need * 1000) / 1000;
}

/** 把建议数按先进先出分到可领的库存行。 */
export function pickAuxStocks(
  stocks: Array<Pick<Api.Stock, 'id' | 'quantity'>>,
  need: number,
) {
  const picks: Array<{ quantity: number; stockId: number }> = [];
  let left = need;
  for (const stock of stocks) {
    if (left <= 0) break;
    const take = Math.min(Number(stock.quantity) || 0, left);
    if (take > 0) {
      picks.push({ quantity: Math.round(take * 1000) / 1000, stockId: stock.id });
      left -= take;
    }
  }
  return picks;
}

/** 浮点误差容差：例如 4.5 / 0.9 算成 4.999999 时也按 5 片。 */
const FIT_EPSILON = 1e-6;
const fit = (whole: number, part: number) => Math.floor(whole / part + FIT_EPSILON);

/**
 * 一张板材能开多少片：长、宽、厚三个方向各能放几片相乘；长宽两种摆法取多的那种。不算锯缝损耗。
 * 规格不全或片材比板材大时返回 0 / undefined。
 */
export function slicePerBoard(
  board: Pick<Api.ItemAttrs, 'length' | 'thickness' | 'width'>,
  sheet: Pick<Api.ItemAttrs, 'length' | 'thickness' | 'width'>,
) {
  const [bl, bw, bt] = [toNumber(board.length), toNumber(board.width), toNumber(board.thickness)];
  const [sl, sw, st] = [toNumber(sheet.length), toNumber(sheet.width), toNumber(sheet.thickness)];
  if (!bl || !bw || !bt || !sl || !sw || !st) return undefined;
  const layers = fit(bt, st);
  return Math.max(fit(bl, sl) * fit(bw, sw), fit(bl, sw) * fit(bw, sl)) * layers;
}

/**
 * 开片这一行产出能开多少片：同颜色的领料（没选颜色时是全部领料）每张板按 {@link slicePerBoard} 算，乘领用张数合计。
 * 同颜色开了好几种规格时不知道各用几张板，返回 undefined 让人手填。
 */
export function sliceYield(inputs: InputLine[], outputs: OutputDraft[], line: OutputDraft) {
  const color = line.attrs.color ?? null;
  const sameColor = (c?: null | string) => !color || !c || c === color;
  if (outputs.filter((o) => sameColor(o.attrs.color)).length > 1) return undefined;
  const boards = inputs.filter((l) => sameColor(inputColor(l)));
  if (boards.length === 0) return undefined;
  let total = 0;
  for (const board of boards) {
    const perBoard = slicePerBoard(board.stock.item ?? {}, line.attrs);
    if (perBoard === undefined) return undefined;
    total += perBoard * Math.floor(board.quantity + FIT_EPSILON);
  }
  return total;
}

/** 开片：按板材规格把能开的片数带进良品（没手动改过的行才带），返回每行的计算说明。 */
export function applySliceYield(inputs: InputLine[], outputs: OutputDraft[]) {
  for (const line of outputs) {
    const value = sliceYield(inputs, outputs, line);
    const untouched =
      line.goodQuantity === undefined || line.goodQuantity === null || line.goodQuantity === line.autoGood;
    if (value === undefined || !untouched) continue;
    line.goodQuantity = value;
    line.autoGood = value;
  }
}

/** 开片计算说明，例如「每张板开 6 片 × 领 10 张 = 60 片」；算不出时说明原因。 */
export function sliceHint(inputs: InputLine[], outputs: OutputDraft[], line: OutputDraft) {
  const color = line.attrs.color ?? null;
  const sameColor = (c?: null | string) => !color || !c || c === color;
  if (outputs.filter((o) => sameColor(o.attrs.color)).length > 1)
    return '同一种颜色开了几种规格，不知道各用几张板，请手填良品';
  if (line.attrs.length === 0 || !line.attrs.width || !line.attrs.thickness) return '填好片材长、宽、厚后自动算能开多少片';
  const boards = inputs.filter((l) => sameColor(inputColor(l)));
  const parts = boards.map((b) => {
    const per = slicePerBoard(b.stock.item ?? {}, line.attrs);
    return per === undefined ? '板材规格不全' : `每张开 ${per} 片 × ${Math.floor(b.quantity + FIT_EPSILON)} 张`;
  });
  const value = sliceYield(inputs, outputs, line);
  return value === undefined ? parts.join('，') : `${parts.join(' + ')} = ${value} 片（不算锯缝损耗）`;
}
