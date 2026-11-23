import type { OutputDraft } from '../stage-stock/model';
import type { Job } from './use-job';

import { quantityPrecision } from '../shared/quantity';
import { toNumber, validateOutputs } from '../stage-stock/model';
import { jobAllowsPlainEmboss, slicePlanThicknessError } from './use-job';

const quantity = (value: unknown) => Math.max(0, toNumber(value) ?? 0);
const round = (value: number) => Math.round(value * 1000) / 1000;

/** 只预填本次尚未报出的计划量；不能把同一计划总量重复分给多种产出。 */
export function prefillReportQuantity(job: Pick<Job, 'order' | 'outputs' | 'prepare' | 'process' | 'task'>) {
  if (!job.task || job.outputs.length !== 1) return;
  const planned = job.process?.code === 'MIX'
    ? job.task.output?.mixPlan?.wholeBatchBoards ?? job.task.quantity
    : job.task.quantity;
  const good = Math.max(quantity(job.task.actualQuantity), quantity(job.order?.goodQuantity));
  const defect = Math.max(quantity(job.task.defectQuantity), quantity(job.order?.defectQuantity));
  const remainder = round(Math.max(0, quantity(planned) - good - defect));
  const remaining = quantityPrecision(job.prepare?.outputUnit ?? job.process?.outputUnit ?? job.task.unit) === 0
    ? Math.floor(remainder) : remainder;
  const line = job.outputs[0]!;
  line.reportTotal = remaining;
  line.goodQuantity = remaining;
  line.defectQuantity = 0;
}

export function hasExcessDefects(line: OutputDraft) {
  return !line.laminateLayers && quantity(line.defectQuantity) > (line.reportTotal ?? line.goodQuantity ?? 0);
}

export function hasNewOutput(outputs: OutputDraft[]) {
  return outputs.some((line) => (toNumber(line.goodQuantity) ?? 0) + (toNumber(line.defectQuantity) ?? 0) > 0);
}

export function canFinishWithoutOutput(job: Pick<Job, 'order' | 'outputs'>) {
  return (job.order?.reportCount ?? 0) > 0 && !hasNewOutput(job.outputs);
}

export function reportErrors(job: Job) {
  if (job.outputs.some((line) => hasExcessDefects(line))) return ['瑕疵数量不能超过本次产量。'];
  if (job.finish && canFinishWithoutOutput(job)) return [];
  const errors = validateOutputs(job.process?.code ?? '', job.process?.outputStage ?? '', job.outputs, { allowPlainEmboss: jobAllowsPlainEmboss(job) });
  const thicknessError = slicePlanThicknessError(job);
  if (thicknessError) errors.push(thicknessError);
  return errors;
}

/** 工人填本次总产量，实际入库数量扣除瑕疵。 */
export function changeReportTotal(line: OutputDraft, value: null | number | undefined) {
  if (value === null || value === undefined) {
    line.reportTotal = undefined;
    line.goodQuantity = undefined;
    return;
  }
  const total = quantity(value);
  line.reportTotal = round(total);
  line.goodQuantity = round(Math.max(0, total - quantity(line.defectQuantity)));
}

export function changeReportDefect(line: OutputDraft, value: null | number | undefined) {
  const total = line.reportTotal ?? (line.goodQuantity === null || line.goodQuantity === undefined
    ? undefined : round(quantity(line.goodQuantity) + quantity(line.defectQuantity)));
  line.defectQuantity = value === null || value === undefined ? undefined : quantity(value);
  if (total === undefined) return;
  line.reportTotal = total;
  line.goodQuantity = round(Math.max(0, total - quantity(value)));
}
