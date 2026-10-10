import type { InjectionKey } from 'vue';

import type { InputLine, OutputDraft } from '../stage-stock/model';

import type { FdmgongchangStageStockApi as StockApi } from '#/api/fdmgongchang/stage-stock';
import type { FdmgongchangWorkbenchApi as Api } from '#/api/fdmgongchang/workbench';

import { inject, provide, reactive } from 'vue';

import { normalizeForStage, toNumber } from '../stage-stock/model';

export type Step = 'confirm' | 'done' | 'home' | 'pick' | 'piece' | 'report';

export interface Pick {
  qty: number;
  side?: StockApi.LaminationSide;
  stock: StockApi.Stock;
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
    result: { amount: 0, good: 0, unit: '' },
    returns: {} as Record<number, null | number>,
    sourceStage: '',
    step: 'home' as Step,
    task: undefined as Api.My['tasks'][number] | undefined,
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
