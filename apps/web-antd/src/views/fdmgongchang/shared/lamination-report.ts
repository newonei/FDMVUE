import type { FdmgongchangStageStockApi as Api } from '#/api/fdmgongchang/stage-stock';

export interface LaminationLayerDraft {
  side: 'BACK' | 'FRONT';
  color: string;
  goodQuantity?: number;
  defectQuantity?: number;
  reportTotal?: number;
}

export interface LaminationReportDraft {
  attrs: Api.ItemAttrs;
  goodQuantity?: number;
  defectQuantity?: number;
  reportTotal?: number;
  laminateLayers?: LaminationLayerDraft[];
}

const quantity = (value: null | number | undefined) => Math.max(0, value ?? 0);

/** 两层片材分别报好坏，只有能配成一对的好片才计入贴合良品。 */
export function laminationLayers(line: LaminationReportDraft) {
  const front = line.attrs.frontColor?.trim();
  const back = line.attrs.backColor?.trim();
  if (!front || !back) {
    Reflect.deleteProperty(line, 'laminateLayers');
    return [];
  }
  if (!line.laminateLayers || line.laminateLayers[0]?.color !== front || line.laminateLayers[1]?.color !== back) {
    const good = line.goodQuantity === undefined ? undefined : Math.floor(quantity(line.goodQuantity));
    line.laminateLayers = [
      { side: 'FRONT', color: front, goodQuantity: good, defectQuantity: 0, reportTotal: good },
      { side: 'BACK', color: back, goodQuantity: good, defectQuantity: 0, reportTotal: good },
    ];
    syncLaminationQuantities(line);
  }
  return line.laminateLayers;
}

export function syncLaminationQuantities(line: LaminationReportDraft) {
  if (line.laminateLayers?.length !== 2) return;
  const layers = line.laminateLayers;
  line.goodQuantity = layers.every((layer) => layer.goodQuantity === undefined)
    ? undefined : Math.min(...layers.map((layer) => quantity(layer.goodQuantity)));
  // 任务按合片统计等效损耗；库存按各色真实残次分别扣减。
  line.defectQuantity = Math.max(...layers.map((layer) => quantity(layer.defectQuantity)));
}

export function changeLaminationGood(line: LaminationReportDraft, side: LaminationLayerDraft['side'], value: null | number | undefined) {
  const layer = laminationLayers(line).find((item) => item.side === side);
  if (!layer) return;
  layer.goodQuantity = value === null || value === undefined ? undefined : quantity(value);
  layer.reportTotal = value === null || value === undefined ? undefined : quantity(value) + quantity(layer.defectQuantity);
  syncLaminationQuantities(line);
}

export function changeLaminationDefect(line: LaminationReportDraft, side: LaminationLayerDraft['side'], value: null | number | undefined) {
  const layer = laminationLayers(line).find((item) => item.side === side);
  if (!layer) return;
  layer.defectQuantity = value === null || value === undefined ? undefined : quantity(value);
  if (layer.reportTotal !== undefined) layer.goodQuantity = Math.max(0, layer.reportTotal - quantity(value));
  syncLaminationQuantities(line);
}

export function laminationDefects(line: LaminationReportDraft): Api.LaminationDefect[] | undefined {
  if (!line.laminateLayers?.length) return undefined;
  const layers = laminationLayers(line);
  return layers.length > 0 ? layers.map(({ side, color, goodQuantity, defectQuantity }) => ({
    side, color, goodQuantity: quantity(goodQuantity), quantity: quantity(defectQuantity),
  })) : undefined;
}
