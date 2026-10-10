import { requestClient } from '#/api/request';

export namespace FdmgongchangFactoryApi {
  export interface Factory {
    code: string;
    deptId: number;
    id: number;
    name: string;
  }

  export interface MyFactories {
    canSeeAll: boolean;
    /** 自己所在的工厂优先；不属于任何工厂且没有全部权限时为空。 */
    defaultFactoryId?: null | number;
    factories: Factory[];
  }

  export interface PostOption {
    code: string;
    label: string;
    /** 工序岗位对应的工序编码；管理岗位为空。 */
    process?: null | string;
  }

  export interface WorkerOptions {
    depts: Array<{ id: number; name: string; parentId?: null | number }>;
    posts: PostOption[];
    wageModes: Array<{ code: string; label: string }>;
  }

  export interface Worker {
    assigned: boolean;
    deptId?: null | number;
    deptName?: null | string;
    mobile?: null | string;
    nickname: string;
    posts: string[];
    remark?: null | string;
    /** 0 在岗 / 1 停用；待分配时为空。 */
    status?: null | number;
    team?: null | string;
    updateTime?: null | number | string;
    userId: number;
    wageMode?: null | string;
  }

  export interface WorkerListReq {
    assigned?: boolean;
    deptId?: number;
    keyword?: string;
    post?: string;
    status?: number;
  }

  export interface WorkerSaveReq {
    posts: string[];
    remark?: string;
    status: number;
    team?: string;
    userIds: number[];
    wageMode?: string;
  }

  export interface Operator {
    deptName?: null | string;
    nickname: string;
    team?: null | string;
    userId: number;
  }
}

/** 后端按请求头 factory-id 区分工厂；页面切换工厂时更新这里，工厂相关接口都会带上。 */
export const FACTORY_HEADER = 'factory-id';
let currentFactoryId: null | number = null;

export function setCurrentFactoryId(id: null | number | undefined) {
  currentFactoryId = id ?? null;
}

export function getCurrentFactoryId() {
  return currentFactoryId;
}

export function factoryHeaders(): Record<string, string> {
  return currentFactoryId === null
    ? {}
    : { [FACTORY_HEADER]: String(currentFactoryId) };
}

export function getMyFactories() {
  return requestClient.get<FdmgongchangFactoryApi.MyFactories>(
    '/fdmgongchang/factory/my',
  );
}

export function getFactoryList() {
  return requestClient.get<FdmgongchangFactoryApi.Factory[]>(
    '/fdmgongchang/factory/list',
  );
}

export function getWorkerOptions() {
  return requestClient.get<FdmgongchangFactoryApi.WorkerOptions>(
    '/fdmgongchang/worker/options',
    { headers: factoryHeaders() },
  );
}

export function getWorkerList(params: FdmgongchangFactoryApi.WorkerListReq) {
  return requestClient.get<FdmgongchangFactoryApi.Worker[]>(
    '/fdmgongchang/worker/list',
    { headers: factoryHeaders(), params },
  );
}

export function saveWorkers(data: FdmgongchangFactoryApi.WorkerSaveReq) {
  return requestClient.put<boolean>('/fdmgongchang/worker/save', data, {
    headers: factoryHeaders(),
  });
}

export namespace FdmgongchangFactorySettingApi {
  export interface ProcessToggle {
    code: string;
    enabled: boolean;
    label: string;
    outputStage: string;
    outputStageLabel: string;
    outputUnit?: string;
    /** 日产能（产出单位 / 天），AI 排单参考。 */
    dailyCapacity?: null | number | string;
  }

  export interface Setting {
    processes: ProcessToggle[];
  }

  export interface SaveReq {
    /** 各工序日产能（工序编码 → 产出单位 / 天）。 */
    dailyCapacities?: Record<string, null | number>;
    /** 本厂有哪些工序，至少一道。 */
    enabledProcesses: string[];
  }
}

/** 工厂设置：本厂工序等各厂自己的配置。 */
export function getFactorySetting() {
  return requestClient.get<FdmgongchangFactorySettingApi.Setting>(
    '/fdmgongchang/factory-setting/get',
    { headers: factoryHeaders() },
  );
}

export function saveFactorySetting(
  data: FdmgongchangFactorySettingApi.SaveReq,
) {
  return requestClient.put<boolean>(
    '/fdmgongchang/factory-setting/save',
    data,
    {
      headers: factoryHeaders(),
    },
  );
}
