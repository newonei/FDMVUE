import type { Job } from './use-job';

import type { FdmgongchangWorkbenchApi as Api } from '#/api/fdmgongchang/workbench';

import { toNumber } from '../stage-stock/model';

export function applyIssuePlan(job: Job, prepare: Api.TaskPrepare) {
  job.prepare = prepare;
  const task = job.task!;
  const sourceStages = prepare.sourceStages?.length ? prepare.sourceStages : job.process!.sources;
  job.sourceStage = prepare.sourceStage && sourceStages.includes(prepare.sourceStage)
    ? prepare.sourceStage
    : sourceStages[0] ?? '';
  job.picks = prepare.picks.map(({ quantity, side, stock }) => ({
    qty: Math.max(0, toNumber(quantity) ?? 0),
    side,
    stock,
  }));
  const recipeCode = prepare.outputAttrs?.recipeCode ?? task.output?.attrs?.recipeCode;
  const batches = toNumber(task.output?.recipeBatches ?? prepare.task.output?.recipeBatches);
  if (job.process?.code === 'MIX' && recipeCode) {
    job.recipe = { batches: batches && batches > 0 ? batches : 1, code: recipeCode };
  }
  const qty = toNumber(task.quantity) ?? 0;
  job.auxPicks = prepare.aux.filter((a) => a.stocks.length > 0).map((a) => ({
    name: a.productName ?? a.productCode ?? '',
    qty: Math.max(0, Math.round((toNumber(a.perUnit) ?? 0) * qty * 1000) / 1000),
    stock: a.stocks[0]!,
    unit: a.unit ?? '',
  }));
}

export function issuePayload(job: Job): Api.TaskIssueReq {
  return {
    auxInputs: job.auxPicks.filter((p) => p.qty > 0).map((p) => ({ quantity: p.qty, stockId: p.stock.id })),
    inputs: job.picks.map((p) => ({ laminationSide: p.side, quantity: p.qty, stockId: p.stock.id })),
    issueSheetUrls: job.sheets,
    onBehalfOf: job.onBehalfOf?.id,
    recipeBatches: job.process?.code === 'MIX' ? job.recipe?.batches : undefined,
    recipeCode: job.process?.code === 'MIX' ? job.recipe?.code : undefined,
    requestKey: job.requestKey,
    sourceStage: job.sourceStage,
    taskId: job.task!.id,
  };
}
