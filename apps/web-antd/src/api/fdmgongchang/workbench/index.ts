import type { PageResult } from '@vben/request';

import type { FdmgongchangFactoryApi } from '#/api/fdmgongchang/factory';
import type { FdmgongchangProductionOrderApi } from '#/api/fdmgongchang/production-order';
import type { FdmgongchangScheduleApi } from '#/api/fdmgongchang/schedule';
import type { FdmgongchangStageStockApi } from '#/api/fdmgongchang/stage-stock';
import type { FdmgongchangWageApi } from '#/api/fdmgongchang/wage';

import { factoryHeaders } from '#/api/fdmgongchang/factory';
import { requestClient } from '#/api/request';

const BASE = '/fdmgongchang/workbench';
const headers = () => ({ headers: factoryHeaders() });

export namespace FdmgongchangWorkbenchApi {
  export type Decimal = number | string;

  export interface Process {
    code: string;
    label: string;
    outputLabel: string;
    outputStage: string;
    outputUnit: string;
    /** 领料来源，第一个是常规上道。 */
    sources: string[];
  }

  export interface Order {
    completedAt?: null | number | string;
    contractCode?: null | string;
    goodQuantity: Decimal;
    id: number;
    inputQuantity: Decimal;
    inputSummary?: null | string;
    inputUnit: string;
    issuedAt?: null | number | string;
    orderNo: string;
    outputStage: string;
    process: string;
    reportCount?: null | number;
    returnedQuantity?: Decimal | null;
    scheduleTaskId?: null | number;
    sourceStage: string;
  }

  /** 任务的建议领料：按订单规格从上道库存先进先出带出要领哪些料、各领多少。 */
  export interface TaskPrepare {
    aux: FdmgongchangStageStockApi.AuxPlan[];
    hint?: null | string;
    picks: Array<{ quantity: Decimal; stock: FdmgongchangStageStockApi.Stock }>;
    productionOrderItemId?: null | number;
    /** 本人已经领料开工的工序单，报工时复用，避免重复扣料。 */
    inProgressOrderId?: null | number;
    outputStage?: null | string;
    outputLabel?: null | string;
    outputUnit?: null | string;
    /** 本工序计划产出规格，与订单成品 targetAttrs 分开。 */
    outputAttrs?: FdmgongchangStageStockApi.ItemAttrs | null;
    sourceStages?: string[];
    /** 按任务数量算出要领多少（来源阶段单位）。 */
    required?: Decimal | null;
    /** 库存不够时还差多少（任务单位）。 */
    shortfall?: Decimal | null;
    sourceStage?: null | string;
    /** 订单的产品规格。 */
    target?: null | string;
    /** 关联订单成品规格，仅作需求参考；报工使用本工序 outputAttrs。 */
    targetAttrs?: FdmgongchangStageStockApi.ItemAttrs | null;
    task: FdmgongchangScheduleApi.Task;
  }

  /** 正式领料开工：扣减选定批次库存，建立在制工序单。 */
  export interface TaskIssueReq {
    auxInputs?: FdmgongchangStageStockApi.OrderInput[];
    inputs: FdmgongchangStageStockApi.OrderInput[];
    issueSheetUrls: string[];
    recipeBatches?: Decimal;
    recipeCode?: string;
    remark?: string;
    requestKey?: string;
    sourceStage: string;
    taskId: number;
  }

  /** 报工：有 orderId 时只登记已有工序单的实际产出，不再扣领料库存。 */
  export interface TaskReportReq {
    auxInputs?: FdmgongchangStageStockApi.OrderInput[];
    inputs?: FdmgongchangStageStockApi.OrderInput[];
    issueSheetUrls?: string[];
    orderId?: number;
    expectedReportCount?: number;
    requestKey?: string;
    finish?: boolean;
    /** 已领任务单报工时同步退回余料，和产出登记在同一事务内提交。 */
    returns?: FdmgongchangStageStockApi.OrderReturnReq['lines'];
    outputs: FdmgongchangStageStockApi.OrderOutput[];
    pieceworks?: FdmgongchangStageStockApi.Piecework[];
    recipeBatches?: Decimal;
    recipeCode?: string;
    remark?: string;
    sourceStage?: string;
    taskId: number;
  }

  export interface My {
    factoryName: string;
    inProgress: Order[];
    processes: Process[];
    /** 我最近完工的单（完工 3 天内，还能补登领料）。 */
    recentDone?: Order[];
    /** 我的任务：派给我或我接的、还没报工的。 */
    tasks: FdmgongchangScheduleApi.Task[];
    /** 任务大厅：我有岗位的工序里没人接的任务；lockReason 不为空时要等上道报工。 */
    hall?: FdmgongchangScheduleApi.Task[];
    team?: null | string;
    today: FdmgongchangScheduleApi.DateValue;
    todayAmount: Decimal;
    userId: number;
    userName?: null | string;
  }
}

export function getWorkbench() {
  return requestClient.get<FdmgongchangWorkbenchApi.My>(
    `${BASE}/my`,
    headers(),
  );
}

export function getWorkbenchOptions() {
  return requestClient.get<FdmgongchangStageStockApi.Options>(
    `${BASE}/options`,
    headers(),
  );
}

export async function getWorkbenchStock(stage: string, taskId?: number) {
  const config = headers();
  const getPage = (pageNo: number) => requestClient.get<PageResult<FdmgongchangStageStockApi.Stock>>(
    `${BASE}/stock`,
    { ...config, params: { pageNo, stage, taskId } },
  );
  const first = await getPage(1);
  // 任务批次由后端按计划筛选；独立领料需要让工人能查找全部上工序批次。
  if (taskId !== undefined || first.list.length === 0) return first;
  const list = [...first.list];
  const pageCount = Math.ceil(first.total / 100);
  for (let pageNo = 2; pageNo <= pageCount && list.length < first.total; pageNo++) {
    const page = await getPage(pageNo);
    // 库存在翻页期间可能变化，空页时停止，避免持续请求无数据页面。
    if (page.list.length === 0) break;
    list.push(...page.list);
  }
  return { ...first, list };
}

/** 本厂正在生产的工厂订单：包装开工时选这批是做哪张单。 */
export function getWorkbenchProductionOrders() {
  return requestClient.get<FdmgongchangProductionOrderApi.Order[]>(
    `${BASE}/production-orders`,
    headers(),
  );
}

/** 领料（可同时报数量和计件），操作人固定是自己。 */
export function createWorkbenchOrder(
  data: FdmgongchangStageStockApi.OrderCreateReq,
) {
  return requestClient.post<number>(`${BASE}/order/create`, data, headers());
}

export function getWorkbenchOrder(id: number) {
  return requestClient.get<FdmgongchangStageStockApi.Order>(
    `${BASE}/order/get`,
    { ...headers(), params: { id } },
  );
}

export function reportWorkbenchOrder(
  data: FdmgongchangStageStockApi.OrderReportReq,
) {
  return requestClient.post<boolean>(`${BASE}/order/report`, data, headers());
}

export function returnWorkbenchMaterial(
  data: FdmgongchangStageStockApi.OrderReturnReq,
) {
  return requestClient.post<boolean>(`${BASE}/order/return`, data, headers());
}

/** 我的单补领：领少了再领，一次可以补多种。 */
export function supplementWorkbenchOrder(
  data: FdmgongchangStageStockApi.OrderSupplementReq,
) {
  return requestClient.post<boolean>(
    `${BASE}/order/supplement`,
    data,
    headers(),
  );
}

export function getWorkbenchRecipePlan(
  params: FdmgongchangStageStockApi.RecipePlanReq,
) {
  return requestClient.get<FdmgongchangStageStockApi.RecipePlan>(
    `${BASE}/recipe-plan`,
    { ...headers(), params },
  );
}

export function getWorkbenchMates(process: string) {
  return requestClient.get<FdmgongchangFactoryApi.Operator[]>(`${BASE}/mates`, {
    ...headers(),
    params: { process },
  });
}

export function matchWorkbenchWage(params: {
  length?: FdmgongchangWorkbenchApi.Decimal | null;
  process: string;
  thickness?: FdmgongchangWorkbenchApi.Decimal | null;
  width?: FdmgongchangWorkbenchApi.Decimal | null;
}) {
  return requestClient.get<FdmgongchangWageApi.Match[]>(`${BASE}/wage-match`, {
    ...headers(),
    params,
  });
}

/** 抢单：接任务大厅里没人接的任务。 */
export function claimWorkbenchTask(id: number) {
  return requestClient.post<boolean>(`${BASE}/task/claim`, undefined, {
    ...headers(),
    params: { id },
  });
}

/** 退单：还没报工的任务放回任务大厅。 */
export function releaseWorkbenchTask(id: number) {
  return requestClient.post<boolean>(`${BASE}/task/release`, undefined, {
    ...headers(),
    params: { id },
  });
}

/** 报工前带出这个任务的建议领料。 */
export function prepareWorkbenchTask(id: number) {
  return requestClient.get<FdmgongchangWorkbenchApi.TaskPrepare>(
    `${BASE}/task/prepare`,
    {
      ...headers(),
      params: { id },
    },
  );
}

/** 领料清单：我手上所有任务合起来要领哪些料。 */
export function getWorkbenchPickList() {
  return requestClient.get<FdmgongchangWorkbenchApi.TaskPrepare[]>(
    `${BASE}/task/pick-list`,
    headers(),
  );
}

/** 报工：已有工序单仅登记产出与计件；无 orderId 的旧补录模式仍兼容。 */
export function reportWorkbenchTask(
  data: FdmgongchangWorkbenchApi.TaskReportReq,
) {
  return requestClient.post<number>(`${BASE}/task/report`, data, headers());
}

export function issueWorkbenchTask(data: FdmgongchangWorkbenchApi.TaskIssueReq) {
  return requestClient.post<number>(`${BASE}/task/issue`, data, headers());
}
