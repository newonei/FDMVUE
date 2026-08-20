import type { PageParam, PageResult } from '@vben/request';

/** 共享产品销售方向。CRM 包装层必须将它收窄为唯一固定值。 */
export type FdmProductMarketType = 'DOMESTIC' | 'EXPORT';

/** 远程选品分页条件；更多业务筛选项须等后端契约冻结后再增加。 */
export type FdmProductSelectionPageParams = PageParam & {
  keyword?: string;
};

/** 一次选品在共享产品中心中的稳定身份。 */
export interface FdmProductSelectionIdentity<
  TMarket extends FdmProductMarketType = FdmProductMarketType,
> {
  marketType: TMarket;
  productId: number;
  skuId: number;
}

/** 后端冻结的组合版本令牌；前端不得解析或自行拼装。 */
export type FdmProductSelectionVersionToken = string;

/**
 * 选择器展示数据。
 *
 * 该结构是无业务含义的 UI adapter，不等同于产品或订单后端 DTO。
 */
export interface FdmProductSelectionPresentation {
  primaryText: string;
  secondaryText?: string;
  thumbnailUrl?: string;
}

/** 远程搜索返回给基础选择器的统一选项。 */
export interface FdmProductSelectionOption<
  TMarket extends FdmProductMarketType = FdmProductMarketType,
> extends FdmProductSelectionIdentity<TMarket> {
  presentation: FdmProductSelectionPresentation;
  selectable: boolean;
  unavailableReason?: string;
  versionToken: FdmProductSelectionVersionToken;
}

/** 页面暂存的选择引用；提交前仍必须由所属 CRM 门面重新校验。 */
export interface FdmProductSelectionRef<
  TMarket extends FdmProductMarketType = FdmProductMarketType,
> extends FdmProductSelectionIdentity<TMarket> {
  expectedVersionToken: FdmProductSelectionVersionToken;
}

/** 预览快照必须具备的最小身份；业务字段等待 API v1 冻结后扩展。 */
export interface FdmProductSelectionSnapshotRef<
  TMarket extends FdmProductMarketType = FdmProductMarketType,
> extends FdmProductSelectionIdentity<TMarket> {
  snapshotVersion: string;
  sourceVersionToken: FdmProductSelectionVersionToken;
}

/** 提交前校验的行级问题。 */
export interface FdmProductSelectionValidationIssue {
  code: string;
  message: string;
  recoverable: boolean;
  skuId: number;
}

/** 提交前校验结果。 */
export interface FdmProductSelectionValidationResult {
  issues: FdmProductSelectionValidationIssue[];
  valid: boolean;
}

/**
 * 无业务归属的选择器数据源。
 *
 * 基础组件只能依赖本接口，不得直接导入任一后端 API。外贸与内贸包装层
 * 分别注入固定 EXPORT、DOMESTIC 的实现，页面签名不暴露 marketType。
 */
export interface FdmProductSelectionDataSource<
  TMarket extends FdmProductMarketType,
  TSnapshot extends FdmProductSelectionSnapshotRef<TMarket> =
    FdmProductSelectionSnapshotRef<TMarket>,
> {
  readonly fixedMarketType: TMarket;

  getBySkuIds(
    skuIds: readonly number[],
  ): Promise<ReadonlyArray<FdmProductSelectionOption<TMarket>>>;

  previewSnapshots(
    selections: ReadonlyArray<FdmProductSelectionRef<TMarket>>,
  ): Promise<ReadonlyArray<TSnapshot>>;

  searchPage(
    params: FdmProductSelectionPageParams,
  ): Promise<PageResult<FdmProductSelectionOption<TMarket>>>;

  validateBeforeSubmit(
    selections: ReadonlyArray<FdmProductSelectionRef<TMarket>>,
  ): Promise<FdmProductSelectionValidationResult>;
}
