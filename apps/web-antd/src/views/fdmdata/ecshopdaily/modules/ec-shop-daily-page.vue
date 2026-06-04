<script lang="ts" setup>
import type { PageParam } from '@vben/request';

import type { EcShopDailyOption } from '../data';

import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type {
  EcShopDailyPlatformDetailPageParams,
  FdmdataEcShopDailyApi,
} from '#/api/fdmdata/ecshopdaily';

import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
} from 'vue';

import { Page, useVbenModal } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { downloadFileFromBlobPart } from '@vben/utils';

import { Button, message, Segmented } from 'ant-design-vue';

import { ACTION_ICON, TableAction, useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  deleteEcShopDaily,
  deleteEcShopDailyList,
  exportEcShopDaily,
  getEcShopDailyPage,
  getEcShopDailyPageSummary,
  getEcShopDailyPlatformDetailPage,
  getEcShopDailyShopNameOptions,
} from '#/api/fdmdata/ecshopdaily';
import { $t } from '#/locales';

import {
  DETAIL_FIELD_PREFIX,
  formatEcPlatformLabel,
  getEcShopDailyImportPlaceholder,
  getDisplayMarketingCost,
  normalizeEcPlatformCode,
  useGridColumns,
  useGridFormSchema,
} from '../data';
import BrushForm from './brush-form.vue';
import DetailModal from './detail-modal.vue';
import DouyinImportModal from './douyin-import-modal.vue';
import EcShopDailyDashboard from './ec-shop-daily-dashboard.vue';
import EcShopDailyDouyinDashboard from './ec-shop-daily-douyin-dashboard.vue';
import EcShopDailySphDashboard from './ec-shop-daily-sph-dashboard.vue';
import EcShopDailyTaobaoDashboard from './ec-shop-daily-taobao-dashboard.vue';
import EcShopDailyXhsDashboard from './ec-shop-daily-xhs-dashboard.vue';
import Form from './form.vue';
import JdImportModal from './jd-import-modal.vue';

defineOptions({ name: 'EcShopDailyPage' });

const props = defineProps<{
  platformCode?: string;
}>();

const [FormModal, formModalApi] = useVbenModal({ connectedComponent: Form });
const [BrushModal, brushModalApi] = useVbenModal({
  connectedComponent: BrushForm,
});
const [Detail, detailModalApi] = useVbenModal({
  connectedComponent: DetailModal,
});
const [DouyinImportModalComp, douyinImportModalApi] = useVbenModal({
  connectedComponent: DouyinImportModal,
});
const [JdImportModalComp, jdImportModalApi] = useVbenModal({
  connectedComponent: JdImportModal,
});

const fixedPlatformCode = computed(() =>
  normalizeEcPlatformCode(props.platformCode),
);
const isFixedPlatformPage = computed(() => !!fixedPlatformCode.value);
const fixedPlatformLabel = computed(() =>
  fixedPlatformCode.value ? formatEcPlatformLabel(fixedPlatformCode.value) : '',
);
const usePlatformAnalysisDashboard = computed(() =>
  ['JD', 'PDD', 'TAOBAO', 'TMALL'].includes(fixedPlatformCode.value ?? ''),
);

function usesGmvCalculationBase(platformCode: string | undefined): boolean {
  return ['DOUYIN', 'TAOBAO', 'TMALL', 'XHS'].includes(platformCode ?? '');
}

const pageTitle = computed(() =>
  fixedPlatformCode.value
    ? `${fixedPlatformLabel.value}店铺后台日汇总`
    : '全部平台汇总',
);
const tableTitle = computed(() =>
  fixedPlatformCode.value
    ? `${fixedPlatformLabel.value}店铺日汇总`
    : '全部平台日汇总',
);
const createButtonText = computed(() =>
  fixedPlatformCode.value ? `新增${fixedPlatformLabel.value}` : '新增',
);
const importButtonText = computed(() =>
  fixedPlatformCode.value ? `${fixedPlatformLabel.value}导入` : '导入',
);
const importPlaceholderText = computed(() =>
  getEcShopDailyImportPlaceholder(fixedPlatformCode.value),
);

const dashboardRef = ref<null | { reload?: () => Promise<void> | void }>(null);

const viewModeOptions = [
  { label: '数据看板', value: 'dashboard' },
  { label: '数据表格', value: 'table' },
] as const;

const activeTab = ref<'dashboard' | 'table'>('dashboard');
const exporting = ref(false);
const summaryLoading = ref(false);
const summaryRow = ref<FdmdataEcShopDailyApi.EcShopDaily | null>(null);
const jdSummaryMarketingCost = ref<number | undefined>();

const checkedIds = shallowRef<number[]>([]);
const checkedCount = computed(() => checkedIds.value.length);

function sameIdList(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  if (a.length === 0) return true;
  const sa = [...a].toSorted((x, y) => x - y);
  const sb = [...b].toSorted((x, y) => x - y);
  return sa.every((v, i) => v === sb[i]);
}

const checkedIdsMemoKey = computed(() =>
  [...checkedIds.value].toSorted((a, b) => a - b).join(','),
);

function handleRowCheckboxChange({
  records,
}: {
  records: FdmdataEcShopDailyApi.EcShopDaily[];
}) {
  const next = records.map((item) => item.id!);
  if (sameIdList(checkedIds.value, next)) return;
  checkedIds.value = next;
}

function handleCreate() {
  formModalApi.setData({ platformCode: fixedPlatformCode.value }).open();
}

function handleImport() {
  if (fixedPlatformCode.value === 'DOUYIN') {
    douyinImportModalApi.open();
    return;
  }
  if (fixedPlatformCode.value === 'JD') {
    jdImportModalApi.open();
    return;
  }
  message.info(importPlaceholderText.value);
}

function handleEdit(row: FdmdataEcShopDailyApi.EcShopDaily) {
  formModalApi.setData(row).open();
}

function handleBrush(row: FdmdataEcShopDailyApi.EcShopDaily) {
  brushModalApi.setData(row).open();
}

function handleDetail(row: FdmdataEcShopDailyApi.EcShopDaily) {
  detailModalApi.setData(row).open();
}

async function handleDelete(row: FdmdataEcShopDailyApi.EcShopDaily) {
  const hideLoading = message.loading({
    content: $t('ui.actionMessage.deleting', [row.id]),
    duration: 0,
  });
  try {
    await deleteEcShopDaily(row.id!);
    message.success($t('ui.actionMessage.deleteSuccess', [row.id]));
    handleRefresh();
  } finally {
    hideLoading();
  }
}

async function handleDeleteBatch() {
  if (checkedIds.value.length === 0) return;
  const hideLoading = message.loading({
    content: $t('ui.actionMessage.deletingBatch'),
    duration: 0,
  });
  try {
    await deleteEcShopDailyList(checkedIds.value);
    checkedIds.value = [];
    message.success($t('ui.actionMessage.deleteSuccess'));
    handleRefresh();
  } finally {
    hideLoading();
  }
}

function buildTableQueryParams(
  formValues: Record<string, any> = {},
  page?: { pageNo: number; pageSize: number },
) {
  return {
    ...page,
    ...formValues,
    ...(fixedPlatformCode.value
      ? { platformCode: fixedPlatformCode.value }
      : {}),
  };
}

function normalizeKeyPart(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeDateKey(value: unknown): string {
  if (Array.isArray(value) && value.length >= 3) {
    const [year, month, day] = value;
    return [
      String(year).padStart(4, '0'),
      String(month).padStart(2, '0'),
      String(day).padStart(2, '0'),
    ].join('-');
  }
  return normalizeKeyPart(value).slice(0, 10);
}

function detailMergeKey(row: Record<string, any>) {
  return [
    normalizeDateKey(row.statDate ?? row.stat_date),
    normalizeKeyPart(row.platformCode ?? row.platform_code).toUpperCase(),
    normalizeKeyPart(row.shopId ?? row.shop_id),
    normalizeKeyPart(row.shopName ?? row.shop_name),
  ].join('|');
}

function mergePlatformDetailRows(
  rows: FdmdataEcShopDailyApi.EcShopDaily[],
  details: Record<string, any>[],
) {
  if (rows.length === 0 || details.length === 0) return rows;
  const byDailyId = new Map<string, Record<string, any>>();
  const byBizKey = new Map<string, Record<string, any>>();

  for (const detail of details) {
    if (detail.daily_id !== null && detail.daily_id !== undefined) {
      byDailyId.set(String(detail.daily_id), detail);
    }
    byBizKey.set(detailMergeKey(detail), detail);
  }

  return rows.map((row) => {
    const detail =
      byDailyId.get(String(row.id)) ?? byBizKey.get(detailMergeKey(row as any));
    if (!detail) return row;
    const merged: Record<string, any> = { ...row };
    for (const [key, value] of Object.entries(detail)) {
      merged[`${DETAIL_FIELD_PREFIX}${key}`] = value;
    }
    return merged as FdmdataEcShopDailyApi.EcShopDaily;
  });
}

async function handleExport() {
  exporting.value = true;
  try {
    const formValues = await gridApi.formApi.getValues();
    const data = await exportEcShopDaily(buildTableQueryParams(formValues));
    downloadFileFromBlobPart({
      fileName: `${fixedPlatformCode.value ? fixedPlatformLabel.value : '全部平台'}店铺后台日汇总.xls`,
      source: data,
    });
  } finally {
    exporting.value = false;
  }
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatAmountValue(value: unknown): string {
  const n = toNumber(value);
  return n.toFixed(2);
}

function formatIntegerValue(value: unknown): string {
  return String(Math.trunc(toNumber(value)));
}

function formatPercentValue(numerator: unknown, denominator: unknown): string {
  const n = toNumber(numerator);
  const d = toNumber(denominator);
  return d === 0 ? '' : `${((n / d) * 100).toFixed(2)}%`;
}

function formatRoiValue(numerator: unknown, denominator: unknown): string {
  const n = toNumber(numerator);
  const d = toNumber(denominator);
  return d === 0 ? '' : (n / d).toFixed(2);
}

function getSummaryMarketingCost() {
  if (fixedPlatformCode.value === 'JD') return jdSummaryMarketingCost.value;
  return summaryRow.value?.marketingCost;
}

function getSummaryFieldValue(field: string): string {
  const row = summaryRow.value;
  if (summaryLoading.value && field === 'statDate') return '汇总中...';
  if (!row) return field === 'statDate' ? '合计' : '';
  if (field === 'statDate') return '合计';
  if (field === 'platformCode') {
    return fixedPlatformCode.value ? fixedPlatformLabel.value : '全部平台';
  }
  if (field === 'shopName') return '当前筛选';
  if (field === 'refundRate') {
    const refundBase = usesGmvCalculationBase(fixedPlatformCode.value)
      ? row.gmvAmount
      : row.paidAmount;
    return formatPercentValue(row.refundAmount, refundBase);
  }
  if (field === 'roi') {
    return formatRoiValue(row.realNetSalesAmount, getSummaryMarketingCost());
  }
  if (field === 'marketingCost') {
    return formatAmountValue(getSummaryMarketingCost());
  }
  if (
    [
      'brushPrincipal',
      'gmvAmount',
      'netSalesAmount',
      'paidAmount',
      'realNetSalesAmount',
      'realPaidAmount',
      'refundAmount',
    ].includes(field)
  ) {
    return formatAmountValue(row[field as keyof typeof row]);
  }
  if (
    [
      'brushOrderCount',
      'buyerCount',
      'orderCount',
      'paidOrderCount',
      'realBuyerCount',
      'realPaidOrderCount',
      'refundOrderCount',
    ].includes(field)
  ) {
    return formatIntegerValue(row[field as keyof typeof row]);
  }
  return '';
}

function footerMethod({ columns }: { columns: any[] }) {
  return [
    columns.map((column) => {
      if (column.type === 'checkbox') return '';
      return getSummaryFieldValue(column.field);
    }),
  ];
}

const shopNameOptions = ref<EcShopDailyOption[]>([]);
let shopNameFetchSeq = 0;
let shopNameSearchTimer: ReturnType<typeof setTimeout> | undefined;

async function fetchShopNameOptions(keyword = '') {
  const seq = ++shopNameFetchSeq;
  let platformCode: string | undefined;
  try {
    const formValues = await gridApi.formApi.getValues();
    platformCode =
      fixedPlatformCode.value ??
      (String(formValues.platformCode ?? '').trim() || undefined);
  } catch {
    platformCode = fixedPlatformCode.value;
  }

  try {
    const list = await getEcShopDailyShopNameOptions({
      keyword: keyword.trim() || undefined,
      limit: 50,
      platformCode,
    });
    if (seq !== shopNameFetchSeq) return;
    shopNameOptions.value = list.map((name) => ({
      label: name,
      value: name,
    }));
  } catch (error) {
    if (seq !== shopNameFetchSeq) return;
    console.error('Load ec shop daily shop name options failed', error);
    shopNameOptions.value = [];
  }
}

function handleShopNameSearch(keyword = '') {
  if (shopNameSearchTimer) {
    clearTimeout(shopNameSearchTimer);
  }
  shopNameSearchTimer = setTimeout(() => {
    void fetchShopNameOptions(keyword);
  }, 250);
}

const [Grid, gridApi] = useVbenVxeGrid({
  formOptions: {
    schema: useGridFormSchema(shopNameOptions, handleShopNameSearch, {
      hidePlatform: isFixedPlatformPage.value,
    }),
  },
  gridOptions: {
    columns: useGridColumns({
      hidePlatform: isFixedPlatformPage.value,
      platformCode: fixedPlatformCode.value,
    }),
    height: 'auto',
    autoResize: true,
    keepSource: false,
    showFooter: true,
    stripe: true,
    footerMethod,
    proxyConfig: {
      ajax: {
        query: async ({ page }, formValues) => {
          const params = buildTableQueryParams(formValues, {
            pageNo: page.currentPage,
            pageSize: page.pageSize,
          }) as PageParam & Record<string, any>;
          summaryLoading.value = true;
          try {
            const detailPromise = fixedPlatformCode.value
              ? getEcShopDailyPlatformDetailPage({
                  ...params,
                  pageNo: 1,
                  pageSize: -1,
                  platformCode: fixedPlatformCode.value,
                } as EcShopDailyPlatformDetailPageParams)
              : Promise.resolve(null);
            const [pageResult, summary, detailResult] = await Promise.all([
              getEcShopDailyPage(params),
              getEcShopDailyPageSummary(params),
              detailPromise,
            ]);
            summaryRow.value = summary;
            jdSummaryMarketingCost.value =
              fixedPlatformCode.value === 'JD' && detailResult?.list
                ? detailResult.list.reduce(
                    (sum, detail) => sum + getDisplayMarketingCost(detail),
                    0,
                  )
                : undefined;
            if (detailResult?.list) {
              pageResult.list = mergePlatformDetailRows(
                pageResult.list,
                detailResult.list,
              );
            }
            return pageResult;
          } finally {
            summaryLoading.value = false;
          }
        },
      },
    },
    rowConfig: { keyField: 'id', isHover: true },
    toolbarConfig: { refresh: true, search: true },
  } as VxeTableGridOptions<FdmdataEcShopDailyApi.EcShopDaily>,
  gridEvents: {
    checkboxAll: handleRowCheckboxChange,
    checkboxChange: handleRowCheckboxChange,
  },
});

function handleRefresh() {
  gridApi.query();
  if (activeTab.value === 'dashboard' && dashboardRef.value) {
    void dashboardRef.value.reload?.();
  }
}

onMounted(() => {
  void fetchShopNameOptions();
});

watch(fixedPlatformCode, (platformCode) => {
  checkedIds.value = [];
  void Promise.resolve(
    gridApi.formApi.setValues({ platformCode }, false),
  ).catch(() => {});
  void fetchShopNameOptions();
  gridApi.query();
});

onBeforeUnmount(() => {
  if (shopNameSearchTimer) {
    clearTimeout(shopNameSearchTimer);
  }
});
</script>

<template>
  <Page auto-content-height>
    <FormModal @success="handleRefresh" />
    <BrushModal @success="handleRefresh" />
    <DouyinImportModalComp @success="handleRefresh" />
    <JdImportModalComp @success="handleRefresh" />
    <Detail />

    <div class="mb-3 flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0 flex-1">
        <h2 class="mb-1 text-lg font-semibold text-foreground">
          {{ pageTitle }}
        </h2>
        <p class="mb-0 text-xs text-muted-foreground">
          按店铺统计每日成交、退款、流量与营销投放数据
        </p>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <Button
          v-if="activeTab === 'table' && fixedPlatformCode"
          @click="handleImport"
        >
          <template #icon>
            <IconifyIcon icon="lucide:upload" />
          </template>
          {{ importButtonText }}
        </Button>
        <Button
          v-if="activeTab === 'table'"
          type="primary"
          @click="handleCreate"
        >
          <template #icon>
            <IconifyIcon icon="lucide:plus" />
          </template>
          {{ createButtonText }}
        </Button>
        <Segmented
          v-model:value="activeTab"
          :options="[...viewModeOptions]"
          class="ec-shop-daily-segmented"
        />
      </div>
    </div>

    <div v-show="activeTab === 'dashboard'">
      <EcShopDailyDouyinDashboard
        v-if="fixedPlatformCode === 'DOUYIN'"
        ref="dashboardRef"
      />
      <EcShopDailyXhsDashboard
        v-else-if="fixedPlatformCode === 'XHS'"
        ref="dashboardRef"
      />
      <EcShopDailySphDashboard
        v-else-if="fixedPlatformCode === 'SPH'"
        ref="dashboardRef"
      />
      <EcShopDailyTaobaoDashboard
        v-else-if="usePlatformAnalysisDashboard"
        ref="dashboardRef"
        :platform-code="fixedPlatformCode"
        :platform-label="fixedPlatformLabel"
      />
      <EcShopDailyDashboard
        v-else
        ref="dashboardRef"
        :platform-code="fixedPlatformCode"
      />
    </div>

    <Grid v-show="activeTab === 'table'" :table-title="tableTitle">
      <template #toolbar-tools>
        <Button
          :loading="exporting"
          class="mr-2"
          size="small"
          @click="handleExport"
        >
          <template #icon>
            <IconifyIcon icon="lucide:download" />
          </template>
          导出 Excel
        </Button>
        <div
          v-memo="[checkedIdsMemoKey]"
          class="inline-flex flex-wrap items-center gap-2"
        >
          <span
            v-if="checkedCount > 0"
            class="mr-1 text-xs text-muted-foreground"
          >
            已选 {{ checkedCount }} 条
          </span>
          <Button
            v-if="checkedCount > 0"
            danger
            size="small"
            @click="handleDeleteBatch"
          >
            批量删除
          </Button>
        </div>
      </template>

      <template #actions="{ row }">
        <div v-memo="[row.id]">
          <TableAction
            :actions="[
              {
                label: '详情',
                type: 'link',
                icon: ACTION_ICON.VIEW,
                onClick: handleDetail.bind(null, row),
              },
              {
                label: '刷单',
                type: 'link',
                icon: ACTION_ICON.EDIT,
                onClick: handleBrush.bind(null, row),
              },
            ]"
            :drop-down-actions="[
              {
                label: $t('common.edit'),
                type: 'link',
                icon: ACTION_ICON.EDIT,
                auth: ['fdmdata:ec-shop-daily:update'],
                onClick: handleEdit.bind(null, row),
              },
              {
                label: $t('common.delete'),
                type: 'link',
                danger: true,
                icon: ACTION_ICON.DELETE,
                auth: ['fdmdata:ec-shop-daily:delete'],
                popConfirm: {
                  title: $t('ui.actionMessage.deleteConfirm', [row.id]),
                  confirm: handleDelete.bind(null, row),
                },
              },
            ]"
          />
        </div>
      </template>
    </Grid>
  </Page>
</template>

<style scoped>
.ec-shop-daily-segmented :deep(.ant-segmented) {
  background: hsl(var(--muted) / 45%);
}
</style>
