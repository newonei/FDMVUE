import type { InjectionKey } from 'vue';

import type { InputLine, OutputDraft } from '../stage-stock/model';

import type { FdmgongchangStageStockApi as StockApi } from '#/api/fdmgongchang/stage-stock';
import type { FdmgongchangWorkbenchApi as Api } from '#/api/fdmgongchang/workbench';

import { inject, provide, reactive } from 'vue';

import { dimensionToDisplay } from '../shared/dimensions';
import { normalizeForStage, toNumber } from '../stage-stock/model';

export type Step = 'confirm' | 'done' | 'home' | 'pick' | 'piece' | 'report';

export interface Pick {
  qty: number;
  side?: StockApi.LaminationSide;
  stock: StockApi.Stock;
}

export interface AuxPick {
  name: string;
  qty: number;
  stock: StockApi.Stock;
  unit: string;
}

export interface PieceLine {
  itemId?: number;
  key: number;
  quantity: null | number;
  userId?: number;
}

/**
 * 工人这一单的全部状态：从首页选活开始，经过领料、报数量、计件，到完成页。
 * 每一步只改自己那部分，index.vue 负责切换步骤和加载数据。
 */
export function createJob() {
  return reactive({
    /** 领料同时报数量（新建工序单时直接报完）。 */
    createFinish: false,
    finish: true,
    inputs: [] as InputLine[],
    my: undefined as Api.My | undefined,
    options: undefined as StockApi.Options | undefined,
    order: undefined as StockApi.Order | undefined,
    outputs: [] as OutputDraft[],
    picks: [] as Pick[],
    pieces: [] as PieceLine[],
    process: undefined as Api.Process | undefined,
    /** 不按排单开工时，这批是做哪张工厂订单（明细编号），记进订单的工序进度。 */
    productionItem: undefined as undefined | { id: number; label: string; orderNo: string },
    /** 密炼按配方领料时选的配方和锅数，开单时一起提交。 */
    recipe: undefined as undefined | { batches: number; code: string },
    result: { action: 'issue' as 'issue' | 'report' | 'supplement', amount: 0, good: 0, unit: '' },
    returns: {} as Record<number, null | number>,
    sourceStage: '',
    step: 'home' as Step,
    /** 给手上在做的单补领（或给 3 天内完工的单补登领料）：领料、确认两步走完就结束，不新开单。 */
    supplement: false,
    /** 补领原因；已完工的单补登必填。 */
    supplementRemark: '',
    task: undefined as Api.My['tasks'][number] | undefined,
    /**
     * 任务的计划产出、建议领料；正式领料后保留作实际报工的对照。
     */
    prepare: undefined as Api.TaskPrepare | undefined,
    /** 按任务报工时同时领的辅料。 */
    auxPicks: [] as AuxPick[],
    /** 领料凭证照片，正式领料时提交。 */
    sheets: [] as string[],
    requestKey: '',
  });
}

export type Job = ReturnType<typeof createJob>;

const KEY: InjectionKey<Job> = Symbol('fdmgongchang-workbench-job');

export function provideJob(job: Job) {
  provide(KEY, job);
}

export function useJob(): Job {
  const job = inject(KEY);
  if (!job) throw new Error('workbench job not provided');
  return job;
}

export function stageOf(job: Job, code?: string) {
  return job.options?.stages.find((s) => s.code === code);
}

/** 历史任务可能留有自定义薄片厚度，不能覆盖实际板材或继续按错误计划报工。 */
export function slicePlanThicknessError(job: Job, inputs = job.inputs) {
  if (job.process?.code !== 'SLICE' || !job.task) return '';
  const planned = toNumber((job.prepare?.outputAttrs ?? job.task.output?.attrs)?.thickness);
  if (!(planned && planned > 0)) return '';
  const actual = [...new Set(inputs.filter((input) => input.quantity > 0)
    .map((input) => toNumber(input.stock.item?.thickness)))];
  if (!actual.some((thickness) => thickness === undefined || Math.abs(thickness - planned) > 1e-6)) return '';
  const actualText = actual.map((thickness) => thickness === undefined ? '未填写' : `${dimensionToDisplay(thickness, 'mm')} mm`).join('、');
  return `开片计划厚度（${dimensionToDisplay(planned, 'mm')} mm）与实际领料（${actualText}）不一致，请联系排单人员核对并处理原任务。`;
}

/** 有数量的产出行，按产出阶段只保留用到的属性。 */
export function outputPayload(job: Job): StockApi.OrderOutput[] {
  const stage = job.process?.outputStage ?? '';
  return job.outputs
    .filter(
      (o) =>
        (toNumber(o.goodQuantity) ?? 0) + (toNumber(o.defectQuantity) ?? 0) > 0,
    )
    .map((o) => ({
      attrs: normalizeForStage(stage, o.attrs),
      batchNo: o.batchNo.trim() || undefined,
      defectQuantity: toNumber(o.defectQuantity) ?? 0,
      goodQuantity: toNumber(o.goodQuantity) ?? 0,
    }));
}

export function goodTotal(job: Job) {
  return job.outputs.reduce((t, o) => t + (toNumber(o.goodQuantity) ?? 0), 0);
}

export function defectTotal(job: Job) {
  return job.outputs.reduce((t, o) => t + (toNumber(o.defectQuantity) ?? 0), 0);
}

/** 按实际领取后的账面余额提示待补录数量，不限制如实登记的领料量。 */
export function issueShortages(job: Job) {
  return [
    ...job.picks.map((pick) => ({
      name: pick.stock.itemCode,
      quantity: pick.qty,
      stock: pick.stock,
      unit: stageOf(job, pick.stock.stage)?.unit ?? '',
    })),
    ...job.auxPicks.map((pick) => ({
      name: pick.name,
      quantity: pick.qty,
      stock: pick.stock,
      unit: pick.unit,
    })),
  ].filter((line) => line.quantity > 0)
    .map((line) => ({
      ...line,
      amount: Math.max(0, line.quantity - (toNumber(line.stock.quantity) ?? 0)),
      action: line.stock.stage === 'RAW' ? '补录原材料入库' : line.stock.stage === 'AUX' ? '补录辅料入库' : '补录上工序产出',
    }))
    .filter((line) => line.amount > 0);
}
