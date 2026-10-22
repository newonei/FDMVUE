import type { FdmgongchangProductionOrderApi } from '#/api/fdmgongchang/production-order';

import { factoryHeaders } from '#/api/fdmgongchang/factory';
import { requestClient } from '#/api/request';

export namespace FdmgongchangScheduleApi {
  export type Decimal = number | string;
  export type Status =
    | 'CONFIRMED'
    | 'DISCARDED'
    | 'DRAFT'
    | 'FAILED'
    | 'GENERATING';
  /** 后端 LocalDate 可能是 "2026-10-08" 或 [2026, 10, 8]。 */
  export type DateValue = null | number[] | string;

  export interface PlanTask {
    assignmentId?: null | string;
    contractCode?: null | string;
    /** yyyy-MM-dd */
    date: string;
    process: string;
    product?: null | string;
    quantity: Decimal;
    reason?: null | string;
    sequence?: null | number;
    spec?: null | string;
    unit?: null | string;
    workerIds: number[];
    workerNames?: string[];
  }

  export interface Plan {
    risks: Array<{
      detail: string;
      level: 'HIGH' | 'LOW' | 'MEDIUM';
      title: string;
    }>;
    summary?: null | string;
    tasks: PlanTask[];
    /** 系统校验时调整或剔除的内容。 */
    warnings: string[];
  }

  export interface Task {
    actualQuantity: Decimal;
    contractCode?: null | string;
    id: number;
    orderCount: number;
    process: string;
    product?: null | string;
    quantity: Decimal;
    reason?: null | string;
    scheduleId: number;
    sequence?: null | number;
    spec?: null | string;
    unit?: null | string;
    workDate: DateValue;
    /** 人员编号，逗号分隔。 */
    workerIds?: null | string;
    /** 来自哪份排单（任务管理列表返回）。 */
    scheduleNo?: null | string;
    workerNames?: null | string;
    /** 关联工序单的残次合计。 */
    defectQuantity?: Decimal | null;
    /** 排单时的数量；接单时按上道良品改小了数量才有。 */
    plannedQuantity?: Decimal | null;
    status?: null | TaskStatus;
    claimedAt?: DateValue | null;
    doneAt?: DateValue | null;
    closedReason?: null | string;
    /** 报工良品少于任务数量、还没处理的差额。 */
    shortage?: Decimal | null;
    shortageNote?: null | string;
    shortageHandledAt?: DateValue | null;
    /** 工作台用：上道还没报工，暂时不能接单的原因。 */
    lockReason?: null | string;
    /** 工作台用：按上道已报工的良品，现在最多能做多少。 */
    available?: Decimal | null;
  }

  /** 待领取 / 已接单 / 已报工 / 已关闭。 */
  export type TaskStatus = 'CLAIMED' | 'CLOSED' | 'DONE' | 'OPEN';

  /** 手动加任务时的选项：本厂启用的工序（带产出单位）、可以选的订单。 */
  export interface FormOptions {
    demand: Array<{
      boards?: null | number;
      /** 密炼产出的板材规格和还要几张（用料逆推选的板材）；算不出时为空。 */
      boardSpec?: null | string;
      contractCode: string;
      product?: null | string;
      productCode?: null | string;
      /** 产品中心的产品编号；外贸自制任务可能为空。 */
      productId?: null | string;
      /** 还要做几条成品；不是工厂订单时为空。 */
      remaining?: null | number | string;
      sheets?: null | number;
      /** 开片产出的片材规格和还要几片。 */
      sheetSpec?: null | string;
      /** 规格：尺寸 · 材质 · 颜色。 */
      spec?: null | string;
    }>;
    processes: Array<{ code: string; label: string; unit: string }>;
  }

  export interface Schedule {
    confirmedAt?: null | number | string;
    confirmedBy?: null | string;
    createTime?: null | number | string;
    days: number;
    errorMessage?: null | string;
    feedback?: null | string;
    id: number;
    /** 手动派工（没经过 AI）。 */
    manual?: boolean | null;
    note?: null | string;
    operatorName?: null | string;
    parentId?: null | number;
    plan?: null | Plan;
    revision: number;
    scheduleNo: string;
    /** 只排了这些工厂订单；为空是全部待生产订单。 */
    scopeOrderIds?: null | number[];
    scopeOrderNos?: null | string[];
    startDate: DateValue;
    status: Status;
    tasks?: null | Task[];
  }
}

const headers = () => ({ headers: factoryHeaders() });

export function getSchedules() {
  return requestClient.get<FdmgongchangScheduleApi.Schedule[]>(
    '/fdmgongchang/schedule/list',
    headers(),
  );
}

/** 详情；AI 还在生成时后端会顺便取结果，页面轮询这个接口。 */
export function getSchedule(id: number) {
  return requestClient.get<FdmgongchangScheduleApi.Schedule>(
    '/fdmgongchang/schedule/get',
    { ...headers(), params: { id } },
  );
}

export function generateSchedule(data: {
  days: number;
  note?: string;
  /** 只排这些工厂订单（已接单）；不传是排全部待生产订单。 */
  productionOrderIds?: number[];
  startDate: string;
}) {
  return requestClient.post<number>(
    '/fdmgongchang/schedule/generate',
    data,
    headers(),
  );
}

export function regenerateSchedule(data: { feedback: string; id: number }) {
  return requestClient.post<number>(
    '/fdmgongchang/schedule/regenerate',
    data,
    headers(),
  );
}

export function confirmSchedule(data: {
  id: number;
  tasks: FdmgongchangScheduleApi.PlanTask[];
}) {
  return requestClient.post<boolean>(
    '/fdmgongchang/schedule/confirm',
    data,
    headers(),
  );
}

export function discardSchedule(id: number) {
  return requestClient.post<boolean>('/fdmgongchang/schedule/discard', null, {
    ...headers(),
    params: { id },
  });
}

/** 开工序单时可关联的排单任务（这道工序前 3 天到明天）。 */
export function getScheduleTasks(process: string) {
  return requestClient.get<FdmgongchangScheduleApi.Task[]>(
    '/fdmgongchang/schedule/tasks',
    { ...headers(), params: { process } },
  );
}

/** 手动派工：不经过 AI 新建一份空的待确认排单，返回编号。 */
export function createManualSchedule(data: {
  days: number;
  note?: string;
  startDate: string;
}) {
  return requestClient.post<number>(
    '/fdmgongchang/schedule/manual',
    data,
    headers(),
  );
}

export function getScheduleFormOptions(id: number) {
  return requestClient.get<FdmgongchangScheduleApi.FormOptions>(
    '/fdmgongchang/schedule/form-options',
    { ...headers(), params: { id } },
  );
}

/** 已下发的排单追加（不传 id）或修改一个任务。 */
export function saveScheduleTask(data: {
  id?: number;
  scheduleId: number;
  task: FdmgongchangScheduleApi.PlanTask;
}) {
  return requestClient.post<number>(
    '/fdmgongchang/schedule/task/save',
    data,
    headers(),
  );
}

export function deleteScheduleTask(scheduleId: number, id: number) {
  return requestClient.post<boolean>(
    '/fdmgongchang/schedule/task/delete',
    null,
    {
      ...headers(),
      params: { id, scheduleId },
    },
  );
}

/** 加任务时从产品中心搜产品（名称、编码或规格）。 */
export function searchScheduleProducts(keyword: string) {
  return requestClient.get<FdmgongchangProductionOrderApi.Product[]>(
    '/fdmgongchang/schedule/products',
    { ...headers(), params: { keyword } },
  );
}

/** 关闭还没报工的任务（不做了、排错了），要写原因。 */
export function closeScheduleTask(data: { id: number; note: string }) {
  return requestClient.post<boolean>(
    '/fdmgongchang/schedule/task/close',
    data,
    headers(),
  );
}

/** 处理报工少于任务数量的差额：记下再派或不补了。 */
export function handleScheduleTaskShortage(data: {
  id: number;
  note?: string;
}) {
  return requestClient.post<boolean>(
    '/fdmgongchang/schedule/task/shortage',
    data,
    headers(),
  );
}

/** 任务管理：跨排单按日期查已下发的任务（默认今天起 7 天，最多 31 天）。 */
export function listScheduleTasks(params: {
  from?: string;
  keyword?: string;
  process?: string;
  status?: FdmgongchangScheduleApi.TaskStatus;
  to?: string;
  workerId?: number;
}) {
  return requestClient.get<FdmgongchangScheduleApi.Task[]>(
    '/fdmgongchang/schedule/task/list',
    { ...headers(), params },
  );
}

/** 改派待领取、已接单的任务（改派即派单）：传 fromWorkerId 只换这个人，不传把人员整个换成 toWorkerIds；返回改了几个。 */
export function reassignScheduleTasks(data: {
  fromWorkerId?: number;
  taskIds: number[];
  toWorkerIds: number[];
}) {
  return requestClient.post<number>(
    '/fdmgongchang/schedule/task/reassign',
    data,
    headers(),
  );
}

/** 已接单还没报工的任务退回任务大厅；返回改了几个。 */
export function returnScheduleTasksToHall(taskIds: number[]) {
  return requestClient.post<number>(
    '/fdmgongchang/schedule/task/return-to-hall',
    { taskIds },
    headers(),
  );
}
