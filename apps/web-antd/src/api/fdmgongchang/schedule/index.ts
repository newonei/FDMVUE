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
    workerNames?: null | string;
  }

  export interface Schedule {
    confirmedAt?: null | number | string;
    confirmedBy?: null | string;
    createTime?: null | number | string;
    days: number;
    errorMessage?: null | string;
    feedback?: null | string;
    id: number;
    note?: null | string;
    operatorName?: null | string;
    parentId?: null | number;
    plan?: null | Plan;
    revision: number;
    scheduleNo: string;
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
