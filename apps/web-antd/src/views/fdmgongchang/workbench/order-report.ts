import type { InputLine } from '../stage-stock/model';
import type { Job } from './use-job';

import type { FdmgongchangStageStockApi as StockApi } from '#/api/fdmgongchang/stage-stock';
import type { FdmgongchangWorkbenchApi as Api } from '#/api/fdmgongchang/workbench';

import { getWorkbenchOrder, prepareWorkbenchTask } from '#/api/fdmgongchang/workbench';

import { deriveOutputs, toNumber } from '../stage-stock/model';
import { prefillReportQuantity } from './report-quantity';
import { applyJobTarget } from './use-job';

export type OrderDraft = Pick<Job, 'inputs' | 'outputs' | 'prepare' | 'recipe' | 'sourceStage' | 'task'> & {
  order: StockApi.Order;
  process: Api.Process;
};

export function defaultReportMaterial(options: Job['options']) {
  return options?.materials.find((m) => m.value.toUpperCase() === 'TPE')?.value ?? options?.materials[0]?.value;
}

/** 从原工序单生成各规格产出，保留关联任务和报工次数供提交时核对。 */
export async function loadOrderDraft(
  job: Pick<Job, 'my' | 'options'>,
  id: number,
  supplement = false,
  context?: Pick<Job, 'prepare' | 'task'>,
): Promise<OrderDraft> {
  const order = await getWorkbenchOrder(id);
  const process = job.my?.processes.find((p) => p.code === order.process)
    ?? job.my?.teamProcesses?.find((p) => p.code === order.process);
  if (!process) throw new Error('当前账号没有这道工序岗位');
  const existing = job.my?.inProgress.find((o) => o.id === id) ?? job.my?.recentDone?.find((o) => o.id === id);
  const taskId = order.scheduleTaskId ?? existing?.scheduleTaskId ?? context?.task?.id;
  let task = job.my?.tasks.find((t) => t.id === taskId) ?? (context?.task?.id === taskId ? context?.task : undefined);
  let prepare = context?.prepare?.task.id === taskId ? context?.prepare : undefined;
  if (taskId && !prepare && (!supplement || !task)) prepare = await prepareWorkbenchTask(taskId);
  task ??= prepare?.task;
  const recipe = process.code === 'MIX' && order.recipeCode
    ? { code: order.recipeCode, batches: toNumber(order.recipeBatches) ?? 1 }
    : undefined;
  const inputs: InputLine[] = supplement ? [] : (order.inputs ?? []).filter((line) => line.stage !== 'AUX').map((line) => ({
    quantity: Math.max(0, (toNumber(line.quantity) ?? 0) - (toNumber(line.returnedQuantity) ?? 0)),
    side: line.laminationSide ?? undefined,
    stock: {
      batchNo: line.batchNo,
      id: line.stockId ?? line.id,
      item: line.item,
      itemCode: line.itemCode,
      itemId: line.itemId ?? 0,
      location: line.location,
      quantity: line.quantity ?? 0,
      stage: line.stage,
    },
  }));
  const outputs = deriveOutputs(process.code, inputs, defaultReportMaterial(job.options), recipe?.code);
  const draft = { inputs, order, outputs, prepare, process, recipe, sourceStage: order.sourceStage, task };
  applyJobTarget(draft);
  prefillReportQuantity(draft);
  return draft;
}
