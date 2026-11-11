import type {
  InputLine,
  OutputDraft,
} from '../../views/fdmgongchang/stage-stock/model';

import type { FdmgongchangWageApi } from '#/api/fdmgongchang/wage';
import type { FdmgongchangWorkbenchApi as Api } from '#/api/fdmgongchang/workbench';

import {
  applyTaskTarget,
  deriveOutputs,
  normalizeForStage,
  toNumber,
  validateOutputs,
} from '../../views/fdmgongchang/stage-stock/model';

export interface ReportQuery {
  factoryId: number;
  taskId: number;
}

export interface AuxLine {
  name: string;
  qty: number;
  stockId: number;
  unit: string;
}

/** 一屏报工要填的全部内容：料按建议带出（可改数量），规格按订单带出，工人只报好的、坏的数量。 */
export interface ReportDraft {
  aux: AuxLine[];
  inputs: InputLine[];
  output: OutputDraft;
  process: Api.Process;
}

function positiveId(params: URLSearchParams, key: string) {
  const raw = params.get(key);
  if (!raw || !/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw))) {
    throw new Error('报工链接无效，请从钉钉卡片重新打开');
  }
  return Number(raw);
}

export function parseReportQuery(search: string): ReportQuery {
  const params = new URLSearchParams(search);
  return {
    factoryId: positiveId(params, 'factoryId'),
    taskId: positiveId(params, 'taskId'),
  };
}

export function workbenchUrl(query: ReportQuery) {
  const params = new URLSearchParams({
    factoryId: String(query.factoryId),
    taskId: String(query.taskId),
  });
  return `/gongchang/workbench?${params}`;
}

export function createDraft(
  prepare: Api.TaskPrepare,
  process: Api.Process,
  defaultMaterial?: string,
): { draft?: ReportDraft; outputs: OutputDraft[] } {
  const inputs: InputLine[] = prepare.picks.map((p) => ({
    quantity: toNumber(p.quantity) ?? 0,
    stock: p.stock,
  }));
  const outputs = deriveOutputs(process.code, inputs, defaultMaterial);
  applyTaskTarget(
    process.code,
    prepare.outputAttrs ?? prepare.task.output?.attrs ?? prepare.targetAttrs,
    inputs,
    outputs,
  );
  const taskQty = toNumber(prepare.task.quantity) ?? 0;
  const aux = prepare.aux.flatMap((a) => {
    const stock = a.stocks[0];
    if (!stock) return [];
    return [
      {
        name: a.productName ?? a.productCode ?? '',
        qty: Math.round((toNumber(a.perUnit) ?? 0) * taskQty * 1000) / 1000,
        stockId: stock.id,
        unit: a.unit ?? '',
      },
    ];
  });
  return {
    draft: outputs[0]
      ? { aux, inputs, output: outputs[0], process }
      : undefined,
    outputs,
  };
}

/**
 * 这个任务能不能在一屏里报完。发泡要选配方、贴合要选正反面、压花要选纹路这些活要人来选，
 * 带不出料或规格不全的，返回原因，页面引导去完整工作台。
 */
export function blockReason(
  prepare: Api.TaskPrepare,
  process: Api.Process,
  outputs: OutputDraft[],
) {
  if (prepare.inProgressOrderId)
    return '这个任务已经领料，请到工作台继续原工序单报工';
  if (process.code === 'SLICE')
    return '开片按本次良品体积计薪，请到工作台确认规格和参与人员';
  if (prepare.picks.length === 0) {
    return prepare.hint || '这个任务要自己选料';
  }
  if (outputs.length !== 1) return '这批料要分几种规格报';
  const missing = validateOutputs(process.code, process.outputStage, [
    { ...outputs[0]!, defectQuantity: 0, goodQuantity: 1 },
  ]);
  return missing.length > 0 ? `规格要自己选：${missing.join('')}` : undefined;
}

/** 计价项目按规格自动选，算给报工的人；和工作台默认选的一样。 */
export function bestWage(matches: FdmgongchangWageApi.Match[]) {
  return matches.find((m) => m.matched) ?? matches[0];
}

export function reportErrors(draft: ReportDraft, sheets: string[]) {
  const errors: string[] = [];
  const good = toNumber(draft.output.goodQuantity) ?? 0;
  const bad = toNumber(draft.output.defectQuantity) ?? 0;
  if (good + bad <= 0) errors.push('请填好的或坏的数量');
  if (draft.inputs.every((line) => line.quantity <= 0)) {
    errors.push('请填用了多少料');
  }
  if (sheets.length === 0) errors.push('请拍领料单');
  return errors;
}

export function buildPayload(
  taskId: number,
  sourceStage: string,
  draft: ReportDraft,
  sheets: string[],
  wage: FdmgongchangWageApi.Match | undefined,
  userId: number,
): Api.TaskReportReq {
  const good = toNumber(draft.output.goodQuantity) ?? 0;
  return {
    auxInputs: draft.aux
      .filter((a) => a.qty > 0)
      .map((a) => ({ quantity: a.qty, stockId: a.stockId })),
    inputs: draft.inputs
      .filter((line) => line.quantity > 0)
      .map((line) => ({ quantity: line.quantity, stockId: line.stock.id })),
    issueSheetUrls: sheets,
    outputs: [
      {
        attrs: normalizeForStage(draft.process.outputStage, draft.output.attrs),
        batchNo: draft.output.batchNo.trim() || undefined,
        defectQuantity: toNumber(draft.output.defectQuantity) ?? 0,
        goodQuantity: good,
      },
    ],
    pieceworks:
      wage && good > 0 ? [{ itemId: wage.itemId, quantity: good, userId }] : [],
    sourceStage,
    taskId,
  };
}
