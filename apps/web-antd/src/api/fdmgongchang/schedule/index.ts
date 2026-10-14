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
    workerNames?: null | string;
  }

  /** 手动加任务时的选项：本厂启用的工序（带产出单位）、可以选的订单。 */
  export interface FormOptions {
    demand: Array<{
      contractCode: string;
      product?: null | string;
      productCode?: null | string;
      /** 产品中心的产品编号；外贸自制任务可能为空。 */
      productId?: null | string;
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
