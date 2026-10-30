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
    /** 手动添加的（不在本厂部门下），可以移出本厂。 */
    added?: boolean;
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

  export interface Candidate {
    deptName?: null | string;
    /** 已经属于的工厂；不属于任何工厂时为空。 */
    factoryId?: null | number;
    factoryName?: null | string;
    mobile?: null | string;
    nickname: string;
    userId: number;
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

/** 按姓名搜全部系统用户，用来把不在本厂部门下的人加进来。 */
export function searchWorkerCandidates(keyword: string) {
  return requestClient.get<FdmgongchangFactoryApi.Candidate[]>(
    '/fdmgongchang/worker/candidates',
    { headers: factoryHeaders(), params: { keyword } },
  );
}

export function addWorkers(userIds: number[]) {
  return requestClient.post<boolean>(
    '/fdmgongchang/worker/add',
    { userIds },
    { headers: factoryHeaders() },
  );
}

export function removeWorkers(userIds: number[]) {
  return requestClient.post<boolean>(
    '/fdmgongchang/worker/remove',
    { userIds },
    { headers: factoryHeaders() },
  );
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

  export interface ModelOption {
    /** 是否已给本厂放行 AI 排单用途；没放行的不能选。 */
    allowed: boolean;
    code: string;
    id: number;
    name: string;
    /** 支持结构化输出；不支持时用普通对话，系统再校验格式。 */
    structured: boolean;
  }

  /** 密炼出板：板材长宽厚（cm）、每锅出几张（没填时 AI 排单按配方估算）。 */
  export interface MixBoard {
    boardsPerBatch?: null | number | string;
    length?: null | number | string;
    thickness?: null | number | string;
    width?: null | number | string;
  }

  /** 采购模块的供应商。 */
  export interface SupplierOption {
    id: string;
    name: string;
  }

  export interface Setting {
    mixBoard?: MixBoard | null;
    /** 本厂对应的供应商：采购单的供应商是这些时，自动生成工厂订单。 */
    suppliers?: SupplierOption[];
    processes: ProcessToggle[];
    /** AI 排单选的模型；为空表示自动（本厂放行的第一个）。 */
    scheduleModelId?: null | number | string;
    scheduleModels?: ModelOption[];
  }

  export interface SaveReq {
    /** 各工序日产能（工序编码 → 产出单位 / 天）。 */
    dailyCapacities?: Record<string, null | number>;
    /** 密炼出板规格；长宽厚都空表示清掉。 */
    mixBoard?: MixBoard;
    /** 本厂有哪些工序，至少一道。 */
    enabledProcesses: string[];
    /** AI 排单用的模型；为空表示自动。 */
    scheduleModelId?: null | number | string;
  }
}

/** 搜采购模块的供应商（选本厂对应的供应商）。 */
export function searchFactorySuppliers(keyword: string) {
  return requestClient.get<FdmgongchangFactorySettingApi.SupplierOption[]>(
    '/fdmgongchang/factory-setting/supplier-search',
    { headers: factoryHeaders(), params: { keyword } },
  );
}

/** 保存本厂对应的供应商（整体覆盖）。 */
export function saveFactorySuppliers(supplierIds: string[]) {
  return requestClient.put<boolean>(
    '/fdmgongchang/factory-setting/suppliers/save',
    supplierIds,
    { headers: factoryHeaders() },
  );
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

export namespace FdmgongchangRouteApi {
  /** 工艺路线：本厂常用的工序组合，下单时选一条再按需调整。 */
  export interface Route {
    id?: number;
    /** 工序里有本厂已停用的，下单时不能直接用。 */
    invalid?: boolean;
    name: string;
    remark?: null | string;
    sort?: null | number;
    /** 0 启用 / 1 停用。 */
    status?: number;
    /** 工序编码，按生产链顺序。 */
    steps: string[];
  }

  export interface ProcessOption {
    code: string;
    label: string;
    outputStage: string;
    outputStageLabel: string;
    /** 附加工序：不改变规格，从 outputStage 领、良品留在 outputStage。 */
    custom?: boolean;
    /** 可领料的库存阶段，用来判断跳过工序后能不能接上。 */
    sources: string[];
    unit: string;
  }

  export interface Options {
    processes: ProcessOption[];
    routes: Route[];
  }
}

/** 附加工序：工厂自定义的打孔、全检等工序，不改变规格；只停用不删除。 */
export interface FdmgongchangCustomProcess {
  code?: string;
  id?: number;
  name: string;
  remark?: null | string;
  sort?: null | number;
  stage: string;
  stageLabel?: string;
  /** 0 启用 / 1 停用。 */
  status?: number;
  unit?: string;
}

export function getCustomProcesses() {
  return requestClient.get<FdmgongchangCustomProcess[]>(
    '/fdmgongchang/factory-setting/custom-process/list',
    { headers: factoryHeaders() },
  );
}

export function saveCustomProcess(data: FdmgongchangCustomProcess) {
  return requestClient.post<number>(
    '/fdmgongchang/factory-setting/custom-process/save',
    data,
    { headers: factoryHeaders() },
  );
}

/** 维护路线用的工序：本厂启用的主干工序和附加工序，按生产链排好。 */
export function getSettingRouteOptions() {
  return requestClient.get<FdmgongchangRouteApi.Options>(
    '/fdmgongchang/factory-setting/route/options',
    { headers: factoryHeaders() },
  );
}

export function getFactoryRoutes() {
  return requestClient.get<FdmgongchangRouteApi.Route[]>(
    '/fdmgongchang/factory-setting/route/list',
    { headers: factoryHeaders() },
  );
}

export function saveFactoryRoute(data: FdmgongchangRouteApi.Route) {
  return requestClient.post<number>(
    '/fdmgongchang/factory-setting/route/save',
    data,
    { headers: factoryHeaders() },
  );
}

export function deleteFactoryRoute(id: number) {
  return requestClient.delete<boolean>(
    '/fdmgongchang/factory-setting/route/delete',
    { headers: factoryHeaders(), params: { id } },
  );
}
