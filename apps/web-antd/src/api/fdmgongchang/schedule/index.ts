import type { FdmgongchangProductionOrderApi } from '#/api/fdmgongchang/production-order';
import type { FdmgongchangStageStockApi } from '#/api/fdmgongchang/stage-stock';
import type {
  ProductAttributeOptions,
  ProductCategoryView,
} from '#/api/fdmplatform/products';

import { factoryHeaders } from '#/api/fdmgongchang/factory';
import { requestClient } from '#/api/request';

export namespace FdmgongchangScheduleApi {
  export type Product = FdmgongchangProductionOrderApi.Product;
  export interface ProductFilters {
    /** 具体阶段编码，或仅用于筛选的大类值，如 group:半成品。 */
    productStage?: string;
    color?: string;
    keyword?: string;
    material?: string;
    shape?: string;
    size?: string;
  }
  export interface ProductQuery extends ProductFilters {
    /** undefined 为全部分类，空字符串为未分类。 */
    categoryId?: string;
    pageNo: number;
    pageSize: number;
  }
  export type Decimal = number | string;
  export type Status =
    | 'CONFIRMED'
    | 'DISCARDED'
    | 'DRAFT'
    | 'FAILED'
    | 'GENERATING';
  /** 后端 LocalDate 可能是 "2026-10-08" 或 [2026, 10, 8]。 */
  export type DateValue = null | number[] | string;

  /** 任务约定的领料或产出，attrs 用于精确匹配规格、颜色及配方。 */
  export interface Material {
    attrs?: FdmgongchangStageStockApi.ItemAttrs | null;
    code?: null | string;
    name?: null | string;
    newItem?: boolean | null;
    note?: null | string;
    productCode?: null | string;
    /** 明确选定的产品中心领料档案，工序物料由后端解析。 */
    productId?: null | string;
    quantity?: Decimal | null;
    /** 发泡任务预估锅数，仅供工作台实际领料预填，不参与物料规格编码。 */
    recipeBatches?: Decimal | null;
    stage: string;
    unit?: null | string;
  }

  export interface PlanTask {
    assignmentId?: null | string;
    contractCode?: null | string;
    covers?: Array<{ assignmentId: string; quantity: Decimal }>;
    /** yyyy-MM-dd */
    date: string;
    process: string;
    inputs?: Material[] | null;
    output?: Material | null;
    product?: null | string;
    quantity: Decimal;
    reason?: null | string;
    sequence?: null | number;
    spec?: null | string;
    unit?: null | string;
    workerIds: number[];
    workerNames?: string[];
  }

  export interface MaterialPreviewRequest {
    assignmentId?: null | string;
    inputProductId?: null | string;
    inputCode?: null | string;
    outputAttrs?: FdmgongchangStageStockApi.ItemAttrs;
    process: string;
    quantity: number;
  }

  /** 只读预计领料，不创建物料、不占用或扣减库存。 */
  export interface MaterialPreview {
    basis?: null | string;
    estimated: boolean;
    inputs: Array<
      Material & {
        available?: Decimal | null;
        perBatch?: Decimal | null;
        shortage?: Decimal | null;
      }
    >;
    recipeBatches?: Decimal | null;
    sourceStages: string[];
    warnings: string[];
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
    /** 只提醒、不拦下发的：产能超了、一台机一天的量超了、人员分组和机台数对不上。 */
    notices?: string[];
  }

  export interface Task {
    actualQuantity: Decimal;
    assignmentId?: null | string;
    contractCode?: null | string;
    covers?: Array<{ assignmentId: string; quantity: Decimal }>;
    id: number;
    orderCount: number;
    process: string;
    inputs?: Material[] | null;
    output?: Material | null;
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
    /** 工作台用：上道还没报工或报的不够的提示，不拦接单（各工序下班时才报工）。 */
    upstreamNote?: null | string;
    /** 工作台用：按上道已报工的良品，现在最多能做多少。 */
    available?: Decimal | null;
    /** 任务包：不定日期（workDate 是下发日期）；发泡按 sequence 排先后。 */
    undated?: boolean | null;
    /** 工作台用：上道状态，只做标记不拦：NONE 没有上道 / WAITING 还没人接 / WORKING 在做 / PARTIAL 报了一部分 / DONE 报完了。 */
    upstreamState?: null | string;
  }

  /** 待领取 / 已接单 / 已报工 / 已关闭。 */
  export type TaskStatus = 'CLAIMED' | 'CLOSED' | 'DONE' | 'OPEN';

  /** 手动加任务时的选项：本厂启用的工序（带产出单位）、可以选的订单。 */
  export interface FormOptions {
    demand: Array<{
      assignmentId?: null | string;
      boardAttrs?: FdmgongchangStageStockApi.ItemAttrs | null;
      boards?: null | number;
      /** 发泡产出的板材规格和还要几张（用料逆推选的板材）；算不出时为空。 */
      boardSpec?: null | string;
      contractCode: string;
      product?: null | string;
      productCode?: null | string;
      /** 产品中心的产品编号。 */
      productId?: null | string;
      /** 还要做几条成品；不是工厂订单时为空。 */
      remaining?: null | number | string;
      sheetAttrs?: FdmgongchangStageStockApi.ItemAttrs | null;
      sheets?: null | number;
      /** 开片产出的板材规格和还要几片。 */
      sheetSpec?: null | string;
      /** 按这条订单工艺路线解析的各工序领料阶段，支持跳过中间工序。 */
      sourceStagesByProcess?: Record<string, string[]>;
      /** 规格：尺寸 · 材质 · 颜色。 */
      spec?: null | string;
      targetAttrs?: FdmgongchangStageStockApi.ItemAttrs | null;
    }>;
    materialOptions?: FdmgongchangStageStockApi.Options;
    processes: Array<{
      code: string;
      label: string;
      outputStage?: string;
      sourceStages?: string[];
      unit: string;
    }>;
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

/** 生成方案之后数据变了什么（确认前提示，不拦确认）。 */
export function getScheduleChanges(id: number) {
  return requestClient.get<string[]>('/fdmgongchang/schedule/changes', {
    ...headers(),
    params: { id },
  });
}

export function confirmSchedule(data: {
  id: number;
  tasks: FdmgongchangScheduleApi.PlanTask[];
}) {
  /** 返回只提醒、不拦下发的：产能、机台超了 */
  return requestClient.post<string[]>(
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

export function previewScheduleTaskMaterials(
  data: FdmgongchangScheduleApi.MaterialPreviewRequest,
) {
  return requestClient.post<FdmgongchangScheduleApi.MaterialPreview>(
    '/fdmgongchang/schedule/task/material-preview',
    data,
    headers(),
  );
}

/** 只读解析上工序领料档案及其权威物料属性，不建立库存。 */
export function getScheduleTaskInputProduct(params: {
  assignmentId?: null | string;
  inputCode?: null | string;
  process: string;
  productId?: null | string;
}) {
  return requestClient.get<FdmgongchangScheduleApi.Material>(
    '/fdmgongchang/schedule/task/input-product',
    { ...headers(), params },
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

/** 工厂权限下的产品中心选品，只包含启用且资料齐全的共享产品。 */
export function getScheduleProductPage(
  params: FdmgongchangScheduleApi.ProductQuery,
) {
  return requestClient.get<{
    list: FdmgongchangScheduleApi.Product[];
    total: number;
  }>('/fdmgongchang/schedule/product-page', { ...headers(), params });
}

export function getScheduleProductCategories(
  params: FdmgongchangScheduleApi.ProductFilters,
) {
  return requestClient.get<ProductCategoryView>(
    '/fdmgongchang/schedule/product-categories',
    { ...headers(), params },
  );
}

/** 与产品档案共用属性选项，通过工厂排产权限访问。 */
export function getScheduleProductAttributeOptions() {
  return requestClient.get<ProductAttributeOptions>(
    '/fdmgongchang/schedule/product-attribute-options',
    headers(),
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

/** 下发任务包的结果：下发了几个（其中发泡几个），以及没下发或要注意的。 */
export interface FdmgongchangPackageRelease {
  mixTasks: number;
  scheduleId: number;
  scheduleNo: string;
  tasks: number;
  warnings: string[];
}

/** 下发任务包：不经过 AI，发泡只排先后，其他工序按工序分包，都不定日期。 */
export function releaseTaskPackages(data: {
  note?: string;
  productionOrderIds?: number[];
}) {
  return requestClient.post<FdmgongchangPackageRelease>(
    '/fdmgongchang/schedule/package/release',
    data,
    headers(),
  );
}

/** 发泡任务包的先后（还没报完的）。 */
export function getMixQueue() {
  return requestClient.get<FdmgongchangScheduleApi.Task[]>(
    '/fdmgongchang/schedule/package/mix-queue',
    headers(),
  );
}

/** 发泡任务包挪到第几个。 */
export function moveMixPackage(id: number, position: number) {
  return requestClient.post<boolean>(
    '/fdmgongchang/schedule/package/mix-move',
    undefined,
    { ...headers(), params: { id, position } },
  );
}
