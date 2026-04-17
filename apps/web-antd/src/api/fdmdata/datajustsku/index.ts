import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace FdmdataDataJustSkuApi {
  /** fdm-data 聚水潭 SKU 主数据信息 */
  export interface DataJustSku {
    id: number; // 主键ID
    picUrl: string; // 图片（URL 或存储路径）
    productShortName: string; // 商品简称
    styleCode: string; // 款式编码（纯文本，不关联他表）
    itemCode?: string; // 商品编码（租户内业务唯一标识）
    productName: string; // 商品名称
    colorSpec: string; // 颜色及规格
    categoryName: string; // 分类（文本）
    costPrice: number; // 成本价
    attr1: string; // 其它属性1
    attr2: string; // 其它属性2
    attr3: string; // 其它属性3
    weightKg: number; // 重量（千克）
    lengthCm: number; // 长（厘米）
    widthCm: number; // 宽（厘米）
    heightCm: number; // 高（厘米）
    remark: string; // 备注
    /** 聚水潭同步：1-未同步 2-已同步 3-同步失败 */
    status?: number;
    /** 聚水潭返回的 sku id */
    jstSkuId?: string;
    /** 创建人用户编号 */
    creator?: string;
    /** 创建人昵称（后端翻译） */
    creatorName?: string;
    createTime?: string;
  }
}

/** 查询fdm-data 聚水潭 SKU 主数据分页 */
export function getDataJustSkuPage(params: PageParam) {
  return requestClient.get<PageResult<FdmdataDataJustSkuApi.DataJustSku>>(
    '/fdmdata/data-just-sku/page',
    { params },
  );
}

/** 查询fdm-data 聚水潭 SKU 主数据详情 */
export function getDataJustSku(id: number) {
  return requestClient.get<FdmdataDataJustSkuApi.DataJustSku>(
    `/fdmdata/data-just-sku/get?id=${id}`,
  );
}

/** 新增fdm-data 聚水潭 SKU 主数据 */
export function createDataJustSku(data: FdmdataDataJustSkuApi.DataJustSku) {
  return requestClient.post('/fdmdata/data-just-sku/create', data);
}

/** 修改fdm-data 聚水潭 SKU 主数据 */
export function updateDataJustSku(data: FdmdataDataJustSkuApi.DataJustSku) {
  return requestClient.put('/fdmdata/data-just-sku/update', data);
}

/** 删除fdm-data 聚水潭 SKU 主数据 */
export function deleteDataJustSku(id: number) {
  return requestClient.delete(`/fdmdata/data-just-sku/delete?id=${id}`);
}

/** 批量删除fdm-data 聚水潭 SKU 主数据 */
export function deleteDataJustSkuList(ids: number[]) {
  return requestClient.delete(
    `/fdmdata/data-just-sku/delete-list?ids=${ids.join(',')}`,
  );
}

export function batchSetBlankPic(data: { ids: number[]; picUrl: string }) {
  return requestClient.put<boolean>('/fdmdata/data-just-sku/batch-set-blank-pic', data);
}

export function batchSetFinishedPic(data: { ids: number[]; picUrl: string }) {
  return requestClient.put<boolean>(
    '/fdmdata/data-just-sku/batch-set-finished-pic',
    data,
  );
}

/** 导出fdm-data 聚水潭 SKU 主数据 */
export function exportDataJustSku(params: any) {
  return requestClient.download('/fdmdata/data-just-sku/export-excel', { params });
}

/** 同步单条 SKU 到聚水潭 itemsku/upload */
export interface JstSyncResp {
  jstSkuId?: string;
  message?: string;
}

export function syncDataJustSkuToJushuitan(id: number) {
  return requestClient.post<JstSyncResp>(
    `/fdmdata/data-just-sku/sync-jushuitan?id=${id}`,
  );
}

/** 空白版批量同步：后端一次聚水潭请求携带多条 items */
export interface JstSyncBatchResp {
  successCount: number;
  failCount: number;
  items: {
    id: number;
    itemCode?: string;
    success?: boolean;
    jstSkuId?: string;
    message?: string;
  }[];
}

export function syncDataJustSkuToJushuitanBatch(ids: number[]) {
  return requestClient.post<JstSyncBatchResp>(
    `/fdmdata/data-just-sku/sync-jushuitan-batch?ids=${ids.join(',')}`,
  );
}

/** 空白版生成 - 选项 */
export interface YogaBlankOptionItem {
  key: string;
  label: string;
  /** 商品编码用字母段：材质、类型、颜色与字典 value 一致（大写展示）（勿用 code 命名，避免与接口外层业务状态码混淆） */
  abbr?: string;
  /** @deprecated 旧字段，兼容；请使用 abbr */
  code?: string;
}

export interface YogaBlankOptions {
  materials: YogaBlankOptionItem[];
  productTypes: YogaBlankOptionItem[];
  colors: YogaBlankOptionItem[];
  /** 长度选项：字典 fdm_yoga_blank_size_length；key 为拼接用数值 */
  sizeLengths: YogaBlankOptionItem[];
  /** 宽度：fdm_yoga_blank_size_width */
  sizeWidths: YogaBlankOptionItem[];
  /** 厚度：fdm_yoga_blank_size_thickness */
  sizeThicknesses: YogaBlankOptionItem[];
}

export function getYogaBlankOptions() {
  return requestClient.get<YogaBlankOptions>(
    '/fdmdata/data-just-sku/yoga-blank/options',
  );
}

export interface YogaBlankGenReq {
  materialKey: string;
  sizeTextBlock: string;
  /** 颜色：字典 fdm_color 的字典值（如 MB），须与后台字典数据一致 */
  colors: string[];
  productType: string;
}

export interface YogaBlankPreviewRow {
  data: FdmdataDataJustSkuApi.DataJustSku;
  existsInDb?: boolean;
  duplicateInPreview?: boolean;
  costMissing?: boolean;
}

export interface YogaBlankPreviewResp {
  rows: YogaBlankPreviewRow[];
  totalCount: number;
  insertableCount: number;
}

export function previewYogaBlank(data: YogaBlankGenReq) {
  return requestClient.post<YogaBlankPreviewResp>(
    '/fdmdata/data-just-sku/yoga-blank/preview',
    data,
  );
}

export interface YogaBlankImportResp {
  inserted: number;
  skippedExists: number;
  skippedDuplicate: number;
}

export function importYogaBlank(data: YogaBlankGenReq) {
  return requestClient.post<YogaBlankImportResp>(
    '/fdmdata/data-just-sku/yoga-blank/import',
    data,
  );
}

/** 图案编码生成 */
export interface PatternOptionItem {
  key: string;
  label: string;
}

export interface PatternOptions {
  types: PatternOptionItem[];
  sizeLengths: PatternOptionItem[];
  sizeWidths: PatternOptionItem[];
}


export interface PatternGenReq {
  /** 类型 */
  type: string;
  /** 图案名称 */
  patternName: string;
  /** 对照编码（1~4位大写字母） */
  itemCodeAbbr: string;
  /** 图片（URL 或存储路径） */
  picUrl?: string;
  /** 尺寸（可换行，一行一条） */
  sizeTextBlock: string;
}

export interface PatternPreviewRow {
  type: string;
  sizeText: string;
  styleCode: string;
  itemCode: string;
  productName: string;
  categoryName: string;
  picUrl?: string;
  colorLabel?: string;
}

export interface PatternPreviewResp {
  rows: PatternPreviewRow[];
  willCreate: number;
  willSkip: number;
}

export interface PatternImportResp {
  created: number;
  skipped: number;
}



/** 成品编码生成 */
export interface FinishedGenReq {
  /** 字典 YogaMat value */
  productType: string;
  /** 字典 fdm_yoga_category（飞德慕成品分类）value（入库分类为字典 label） */
  category: string;
  /** 规格：一行一条，长*宽*厚，如 185*61*0.6cm */
  sizeTextBlock: string;
  /** 图案对照主键（fdm_data_just_pattern_cost），与图案编码生成弹窗「已维护的图案」一致 */
  patternCostId: number;
  /** 字典 fdm_color value */
  colors: string[];
}

export function previewFinished(data: FinishedGenReq) {
  return requestClient.post<PatternPreviewResp>(
    '/fdmdata/data-just-sku/finished/preview',
    data,
  );
}

export function importFinished(data: FinishedGenReq) {
  return requestClient.post<PatternImportResp>(
    '/fdmdata/data-just-sku/finished/import',
    data,
  );
}

/** 成本对照 */
export interface DataJustSkuCost {
  id?: number;
  materialKey: string;
  productType: string;
  sizeText: string;
  costPrice: number;
  /** 重量（千克） */
  weightKg?: number;
  /** 卷包长/宽/高（cm），同步聚水潭 l/w/h；与 SKU 规格尺寸不同 */
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  remark?: string;
}

/** 成本维护矩阵行键（来自已存在的空白版 SKU 去重） */
export interface BlankSkuCostMatrixKey {
  materialKey: string;
  productType: string;
  sizeText: string;
}

export function getBlankCostMatrixKeys() {
  return requestClient.get<BlankSkuCostMatrixKey[]>(
    '/fdmdata/data-just-sku-cost/blank-matrix-keys',
  );
}

export function getDataJustSkuCostPage(params: PageParam & Partial<DataJustSkuCost>) {
  return requestClient.get<PageResult<DataJustSkuCost>>(
    '/fdmdata/data-just-sku-cost/page',
    { params },
  );
}

export function createDataJustSkuCost(data: DataJustSkuCost) {
  return requestClient.post<number>('/fdmdata/data-just-sku-cost/create', data);
}

export function updateDataJustSkuCost(data: DataJustSkuCost) {
  return requestClient.put<boolean>('/fdmdata/data-just-sku-cost/update', data);
}

export function deleteDataJustSkuCost(id: number) {
  return requestClient.delete<boolean>(`/fdmdata/data-just-sku-cost/delete?id=${id}`);
}

export interface BlankCostImportResp {
  total: number;
  created: number;
  updated: number;
  skipped: number;
}

/** 空白版列表：导入 Excel，将成本价/重量/卷包长宽高写入成本对照维护 */
export function importBlankCostExcel(file: File) {
  return requestClient.upload<BlankCostImportResp>('/fdmdata/data-just-sku-cost/import-excel', {
    file,
  });
}

export interface BlankSkuImportResp {
  total: number;
  created: number;
  updated: number;
  skipped: number;
}

/** 空白版列表：导入 Excel（主表），导入行默认置为已同步 */
export function importBlankSkuExcel(file: File) {
  return requestClient.upload<BlankSkuImportResp>('/fdmdata/data-just-sku/import-blank-excel', {
    file,
  });
}

/** 定制组合编码生成 */
export interface CustomComboGenReq {
  blankSkuIds: number[];
  /** 图案 SKU 多选：每个勾选尺寸一条，与空白版长*宽匹配 */
  patternSkuIds: number[];
  qty?: number;
  salePrice?: number;
}

export interface CustomComboPreviewResp {
  rows: {
    data: FdmdataDataJustSkuApi.DataJustSku;
    existsInDb?: boolean;
  }[];
  willCreate: number;
  willSkip: number;
}

export function previewCustomCombo(data: CustomComboGenReq) {
  return requestClient.post<CustomComboPreviewResp>(
    '/fdmdata/data-just-custom-combo/preview',
    data,
  );
}

export interface PatternImportResp {
  created: number;
  skipped: number;
}

export function importCustomCombo(data: CustomComboGenReq) {
  return requestClient.post<PatternImportResp>(
    '/fdmdata/data-just-custom-combo/import',
    data,
  );
}

export function syncCustomComboToJushuitanBatch(ids: number[]) {
  return requestClient.post<JstSyncBatchResp>(
    `/fdmdata/data-just-custom-combo/sync-jushuitan-batch?ids=${ids.join(',')}`,
  );
}

export namespace FdmdataCustomComboApi {
  export interface CustomComboRow {
    id: number;
    picUrl?: string;
    productShortName?: string;
    styleCode?: string;
    itemCode?: string;
    /** 对应实体编码（成品 itemCode，用于聚水潭 enty_sku_id） */
    entyItemCode?: string;
    productName?: string;
    categoryName?: string;
    costPrice?: number;
    status?: number;
    jstSkuId?: string;
    createTime?: string;
  }

  export interface CustomComboChildRow {
    id: number;
    parentComboId?: number;
    srcSkuId: string;
    qty: number;
    salePrice?: number;
  }
}

export function getCustomComboPage(params: PageParam) {
  return requestClient.get<PageResult<FdmdataCustomComboApi.CustomComboRow>>(
    '/fdmdata/data-just-custom-combo/page',
    { params },
  );
}

/** 定制组合子商品（与聚水潭组合 childList 同源） */
export function getCustomComboChildList(comboId: number) {
  return requestClient.get<FdmdataCustomComboApi.CustomComboChildRow[]>(
    '/fdmdata/data-just-custom-combo/child-list',
    { params: { comboId } },
  );
}

/** 成品 SKU 成本对照（按类型+尺寸） */
export interface DataJustFinishedSkuCost {
  id?: number;
  materialKey: string;
  productType: string;
  sizeText: string;
  costPrice: number;
  /** 重量（千克） */
  weightKg?: number;
  /** 卷包长（厘米），同步聚水潭 l */
  lengthCm?: number;
  /** 卷包宽（厘米），同步聚水潭 w */
  widthCm?: number;
  /** 卷包高（厘米），同步聚水潭 h */
  heightCm?: number;
  remark?: string;
}

export interface FinishedSkuCostMatrixKey {
  productType: string;
  sizeText: string;
}

export function getFinishedCostMatrixKeys() {
  return requestClient.get<FinishedSkuCostMatrixKey[]>(
    '/fdmdata/data-just-finished-sku-cost/finished-matrix-keys',
  );
}

export function getDataJustFinishedSkuCostPage(
  params: PageParam & Partial<DataJustFinishedSkuCost>,
) {
  return requestClient.get<PageResult<DataJustFinishedSkuCost>>(
    '/fdmdata/data-just-finished-sku-cost/page',
    { params },
  );
}

export function createDataJustFinishedSkuCost(data: DataJustFinishedSkuCost) {
  return requestClient.post<number>(
    '/fdmdata/data-just-finished-sku-cost/create',
    data,
  );
}

export function updateDataJustFinishedSkuCost(data: DataJustFinishedSkuCost) {
  return requestClient.put<boolean>(
    '/fdmdata/data-just-finished-sku-cost/update',
    data,
  );
}

export function deleteDataJustFinishedSkuCost(id: number) {
  return requestClient.delete<boolean>(
    `/fdmdata/data-just-finished-sku-cost/delete?id=${id}`,
  );
}

/** 图案 SKU 成本对照（仅按尺寸） */
export interface PatternSkuCostMatrixKey {
  sizeText: string;
}

export interface DataJustPatternSkuCost {
  id?: number;
  sizeText: string;
  costPrice: number;
  remark?: string;
}

export function getPatternCostMatrixKeys() {
  return requestClient.get<PatternSkuCostMatrixKey[]>(
    '/fdmdata/data-just-pattern-sku-cost/pattern-matrix-keys',
  );
}

export function getDataJustPatternSkuCostPage(params: PageParam & Partial<DataJustPatternSkuCost>) {
  return requestClient.get<PageResult<DataJustPatternSkuCost>>(
    '/fdmdata/data-just-pattern-sku-cost/page',
    { params },
  );
}

export function createDataJustPatternSkuCost(data: DataJustPatternSkuCost) {
  return requestClient.post<number>('/fdmdata/data-just-pattern-sku-cost/create', data);
}

export function updateDataJustPatternSkuCost(data: DataJustPatternSkuCost) {
  return requestClient.put<boolean>('/fdmdata/data-just-pattern-sku-cost/update', data);
}

export function deleteDataJustPatternSkuCost(id: number) {
  return requestClient.delete<boolean>(
    `/fdmdata/data-just-pattern-sku-cost/delete?id=${id}`,
  );
}

