import type { OutputDraft } from '../stage-stock/model';
import type { Job } from './use-job';

import { quantityPrecision } from '../shared/quantity';
import { toNumber } from '../stage-stock/model';

const quantity = (value: unknown) => Math.max(0, toNumber(value) ?? 0);
const round = (value: number) => Math.round(value * 1000) / 1000;

/** 只预填本次尚未报出的计划量；不能把同一计划总量重复分给多种产出。 */
export function prefillReportQuantity(job: Job) {
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

/** 手改良品表示调整本次实际产量，后续瑕疵在这次实际总量内增减。 */
export function changeReportGood(line: OutputDraft, value: null | number | undefined) {
  line.goodQuantity = value === null || value === undefined ? undefined : quantity(value);
  line.reportTotal = round(quantity(value) + quantity(line.defectQuantity));
}

export function changeReportDefect(line: OutputDraft, value: null | number | undefined) {
  const total = line.reportTotal ?? (line.goodQuantity === null || line.goodQuantity === undefined
    ? undefined : round(quantity(line.goodQuantity) + quantity(line.defectQuantity)));
  line.defectQuantity = value === null || value === undefined ? undefined : quantity(value);
  if (total === undefined) return;
  line.reportTotal = total;
  line.goodQuantity = round(Math.max(0, total - quantity(value)));
}
