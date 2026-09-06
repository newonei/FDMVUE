<script lang="ts" setup>
import type { JstSyncBatchResp } from '#/api/fdmdata/datajustsku';
import type { SkuDisplayRow, SkuListTab } from './display';

import { computed, nextTick, ref, shallowRef, watch } from 'vue';

import { confirm, Page, useVbenDrawer, useVbenModal } from '@vben/common-ui';
import { downloadFileFromBlobPart, formatDate } from '@vben/utils';

import { useClipboard, useElementSize } from '@vueuse/core';

import {
  Alert,
  Button,
  Dropdown,
  Image,
  Menu,
  message,
  Segmented,
  Tag,
  Tooltip,
} from 'ant-design-vue';

import { TableAction, useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  deleteDataJustPattern,
  deleteDataJustPatternList,
  exportDataJustPatternExcel,
  getDataJustPatternPage,
  syncDataJustPatternToJushuitan,
} from '#/api/fdmdata/datajustpattern';
import {
  deleteDataJustAccessory,
  deleteDataJustAccessoryList,
  exportDataJustAccessoryExcel,
  getDataJustAccessoryPage,
} from '#/api/fdmdata/datajustaccessory';
import {
  deleteCustomCombo,
  deleteCustomComboList,
  deleteDataJustSku,
  deleteDataJustSkuList,
  deleteFinishedSku,
  deleteFinishedSkuList,
  exportCustomComboExcel,
  exportDataJustSku,
  exportFinishedSkuExcel,
  getDataJustSkuPage,
  getFinishedSkuPage,
  getCustomComboPage,
  syncFinishedSkuToJushuitan,
  syncFinishedSkuToJushuitanBatchV2,
  syncDataJustSkuToJushuitan,
  syncDataJustSkuToJushuitanBatch,
  syncCustomComboToJushuitanBatch,
} from '#/api/fdmdata/datajustsku';
import { $t } from '#/locales';

import { buildDataJustSkuGridColumns, useGridFormSchema } from './data';
import CostModal from './modules/cost-modal.vue';
import BlankBatchPicModal from './modules/blank-batch-pic-modal.vue';
import BlankImportModal from './modules/blank-import-modal.vue';
import BlankSkuImportModal from './modules/blank-sku-import-modal.vue';
import AccessorySkuImportModal from './modules/accessory-sku-import-modal.vue';
import FinishedBatchPicModal from './modules/finished-batch-pic-modal.vue';
import FinishedCostModal from './modules/finished-cost-modal.vue';
import Form from './modules/form.vue';
import PatternCostModal from './modules/pattern-cost-modal.vue';
import FinishedGenerateModalComp from './modules/finished-generate-modal.vue';
import PatternGenerateModalComp from './modules/pattern-generate-modal.vue';
import PatternProductModal from './modules/pattern-product-modal.vue';
import YogaBlankModal from './modules/yoga-blank-modal.vue';
import CustomComboChildrenModalComp from './modules/custom-combo-children-modal.vue';
import CustomComboGenerateModalComp from './modules/custom-combo-generate-modal.vue';
import StandardComboGenerateModalComp from './modules/standard-combo-generate-modal.vue';
import ComboPlatformPriceModalComp from './modules/combo-platform-price-modal.vue';
import SyncResultModalComp from './modules/sync-result-modal.vue';
import DetailDrawerComp from './modules/detail-drawer.vue';
import {
  displaySkuValue,
  formatSkuMoney,
  getAccessoryKindLabel,
  getAccessoryMatchLabel,
  SKU_PLATFORM_PRICES,
} from './display';

const tableHost = ref<HTMLElement>();
const { width: tableWidth } = useElementSize(tableHost);
const compactTable = computed(
  () => tableWidth.value > 0 && tableWidth.value < 1060,
);
const failedImages = ref<Set<string>>(new Set());

function onImageError(url: string) {
  failedImages.value = new Set([...failedImages.value, url]);
}

function currentColumns() {
  return buildDataJustSkuGridColumns({
    listTab: activeListTab.value,
    compact: compactTable.value,
  });
}

watch(compactTable, async () => {
  gridApi.setGridOptions({ columns: currentColumns() });
  await nextTick();
  await gridApi.grid.recalculate(true);
});

const LIST_TAB_META: {
  key: SkuListTab;
  label: string;
  shortLabel: string;
  subtitle: string;
  exportName: string;
}[] = [
  {
    key: 'pattern',
    label: '图案列表',
    shortLabel: '图案',
    subtitle: '维护图案商品与编码，支持图案成本对照及同步聚水潭',
    exportName: '图案SKU.xls',
  },
  {
    key: 'finished',
    label: '成品编码列表',
    shortLabel: '成品',
    subtitle: '按材质与规格生成成品编码，支持成本对照与批量同步',
    exportName: '成品编码SKU.xls',
  },
  {
    key: 'combo',
    label: '组合编码列表',
    shortLabel: '组合',
    subtitle: '成品与配件规格匹配生成组合商品编码',
    exportName: '组合编码SKU.xls',
  },
  {
    key: 'accessory',
    label: '配件列表',
    shortLabel: '配件',
    subtitle: '维护纸箱、网包等配件 SKU，供组合编码匹配使用',
    exportName: '配件SKU.xls',
  },
  {
    key: 'custom_combo',
    label: '定制组合编码列表',
    shortLabel: '定制组合',
    subtitle: '空白版与图案组合生成定制组合装编码',
    exportName: '定制组合编码SKU.xls',
  },
  {
    key: 'blank',
    label: '空白版列表',
    shortLabel: '空白版',
    subtitle: '维护瑜伽垫空白版 SKU，支持生成、成本对照与同步聚水潭',
    exportName: '空白版SKU.xls',
  },
];

const segmentedOptions = LIST_TAB_META.map((m) => ({
  label: m.shortLabel,
  value: m.key,
  title: m.label,
}));

const activeTabMeta = computed(() =>
  LIST_TAB_META.find((m) => m.key === activeListTab.value),
);

const checkedCount = computed(() => checkedIds.value.length);
const loadingList = ref(false);
const listLoadFailed = ref(false);
const switchingTab = ref(false);
const exporting = ref(false);
const pendingAction = ref<'delete' | 'sync' | null>(null);
const pendingRowId = ref<number>();
const interactionBusy = computed(
  () => loadingList.value || switchingTab.value || !!pendingAction.value,
);
const appliedFilters = ref<Record<string, unknown>>({});
const tabFilters = new Map<SkuListTab, Record<string, unknown>>();
const { copy } = useClipboard({ legacy: true });
const syncFilterOptions = [
  { label: '全部状态', value: 0 },
  { label: '未同步', value: 1 },
  { label: '已同步', value: 2 },
  { label: '同步失败', value: 3 },
];
const activeSyncFilter = computed(
  () => Number(appliedFilters.value.status) || 0,
);
const hasActiveFilters = computed(() =>
  Object.values(appliedFilters.value).some((value) =>
    Array.isArray(value)
      ? value.length > 0
      : value !== undefined && value !== null && value !== '',
  ),
);

async function copyItemCode(code?: string) {
  if (!code) return;
  try {
    await copy(code);
    message.success('商品编码已复制');
  } catch {
    message.error('复制失败，请选中商品编码后手动复制');
  }
}

async function handleSyncFilter(value: number) {
  if (interactionBusy.value) return;
  await gridApi.formApi.setFieldValue('status', value || undefined);
  await gridApi.formApi.submitForm();
}

async function handleResetFilters() {
  if (interactionBusy.value) return;
  await gridApi.formApi.resetForm();
  await gridApi.formApi.setFieldValue('creator', undefined);
  await gridApi.formApi.submitForm();
}

function clearSelection() {
  checkedIds.value = [];
  void gridApi.grid?.clearCheckboxRow();
}

/** 当前 Tab 主按钮（每 Tab 仅一个 primary，减少工具栏视觉噪音） */
const primaryToolbarAction = computed(() => {
  switch (activeListTab.value) {
    case 'blank':
      return { label: '空白版生成', onClick: handleYogaBlankGen };
    case 'pattern':
      return { label: '图案编码生成', onClick: handlePatternGenerate };
    case 'finished':
      return { label: '成品编码生成', onClick: handleFinishedGenerate };
    case 'combo':
      return {
        label: '组合商品编码生成',
        onClick: handleStandardComboGenerate,
      };
    case 'custom_combo':
      return { label: '定制组合编码生成', onClick: handleCustomComboGenerate };
    case 'accessory':
      return { label: '新增', onClick: handleCreate };
    default:
      return null;
  }
});

/** 当前 Tab 次按钮（default，最多 2 个） */
const secondaryToolbarActions = computed(() => {
  const tab = activeListTab.value;
  if (tab === 'blank') {
    return [{ label: '成本对照维护', onClick: handleCostMaintain }];
  }
  if (tab === 'pattern') {
    return [
      { label: '维护图案编码', onClick: handlePatternProductMaintain },
      { label: '图案成本对照', onClick: handlePatternCostMaintain },
    ];
  }
  if (tab === 'finished') {
    return [{ label: '成品成本对照', onClick: handleFinishedCostMaintain }];
  }
  if (tab === 'combo') {
    return [
      { label: '电商平台价格对照', onClick: handleComboPlatformPriceMaintain },
    ];
  }
  return [];
});

type ToolbarMenuItem = { key: string; label: string; disabled?: boolean };

const batchToolbarMenuItems = computed((): ToolbarMenuItem[] => {
  const disabled = checkedCount.value === 0 || interactionBusy.value;
  const tab = activeListTab.value;
  if (tab === 'blank') {
    return [
      { key: 'blank-pic', label: '批量设置图片', disabled },
      { key: 'blank-sync', label: '批量同步聚水潭', disabled },
    ];
  }
  if (tab === 'finished') {
    return [
      { key: 'finished-pic', label: '批量设置图片', disabled },
      { key: 'finished-sync', label: '批量同步聚水潭', disabled },
    ];
  }
  if (tab === 'combo' || tab === 'custom_combo') {
    return [{ key: 'combo-sync', label: '批量同步组合装', disabled }];
  }
  return [];
});

const importToolbarMenuItems = computed((): ToolbarMenuItem[] => {
  const tab = activeListTab.value;
  if (tab === 'blank') {
    return [
      { key: 'import-cost', label: '导入（成本对照）' },
      { key: 'import-blank', label: '导入（空白版列表）' },
    ];
  }
  if (tab === 'accessory') {
    return [{ key: 'import-accessory', label: '导入（配件列表）' }];
  }
  return [];
});

function handleToolbarMenuClick({ key }: { key: string | number }) {
  const menuKey = String(key);
  switch (menuKey) {
    case 'blank-pic':
      handleBlankBatchSetPic();
      break;
    case 'blank-sync':
      handleSyncJushuitanBatch();
      break;
    case 'finished-pic':
      handleFinishedBatchSetPic();
      break;
    case 'finished-sync':
      handleSyncFinishedJushuitanBatch();
      break;
    case 'combo-sync':
      handleSyncCustomComboBatch();
      break;
    case 'import-cost':
      handleBlankImportExcel();
      break;
    case 'import-blank':
      handleBlankSkuImportExcel();
      break;
    case 'import-accessory':
      handleAccessorySkuImportExcel();
      break;
    case 'export':
      void handleExport();
      break;
    case 'delete-batch':
      void handleDeleteBatch();
      break;
    default:
      break;
  }
}

const activeListTab = ref<SkuListTab>('pattern');

/** 勾选 id：shallowRef + 相等跳过赋值，减轻勾选时整表+工具栏重复渲染 */
const checkedIds = shallowRef<number[]>([]);

function sameCheckedIdList(a: number[], b: number[]) {
  if (a.length !== b.length) {
    return false;
  }
  if (a.length === 0) {
    return true;
  }
  const sa = [...a].toSorted((x, y) => x - y);
  const sb = [...b].toSorted((x, y) => x - y);
  for (let i = 0; i < sa.length; i++) {
    if (sa[i] !== sb[i]) {
      return false;
    }
  }
  return true;
}

function handleRowCheckboxChange({ records }: { records: SkuDisplayRow[] }) {
  const next = records.map((item) => item.id!);
  if (sameCheckedIdList(checkedIds.value, next)) {
    return;
  }
  checkedIds.value = next;
}

const gridTableTitle = computed(() => {
  const row = LIST_TAB_META.find((m) => m.key === activeListTab.value);
  return row ? `聚水潭 SKU · ${row.label}` : '聚水潭 SKU';
});

async function onListTabChange(key: string | number) {
  const nextTab = key as SkuListTab;
  if (nextTab === activeListTab.value || interactionBusy.value) return;
  switchingTab.value = true;
  try {
    tabFilters.set(activeListTab.value, {
      ...(await gridApi.formApi.getValues()),
    });
    clearSelection();
    // 不让上一列表的行在新列表请求失败后套用新的编辑/删除接口。
    await gridApi.grid.loadData([]);
    activeListTab.value = nextTab;
    gridApi.setGridOptions({
      columns: currentColumns(),
    });
    await gridApi.formApi.resetForm();
    const savedFilters = tabFilters.get(nextTab);
    if (savedFilters) {
      await gridApi.formApi.setValues(savedFilters);
      // setValues 会忽略 undefined，单独恢复用户清空的创建人条件。
      await gridApi.formApi.setFieldValue('creator', savedFilters.creator);
    }
    await nextTick();
    await gridApi.formApi.submitForm();
  } finally {
    switchingTab.value = false;
  }
}

const [FormModal, formModalApi] = useVbenModal({
  connectedComponent: Form,
  destroyOnClose: true,
});

const [YogaBlankGenModal, yogaBlankModalApi] = useVbenModal({
  connectedComponent: YogaBlankModal,
  destroyOnClose: true,
});

const [CostMaintainModal, costModalApi] = useVbenModal({
  connectedComponent: CostModal,
  destroyOnClose: true,
});

const [BlankBatchPicModalComp, blankBatchPicModalApi] = useVbenModal({
  connectedComponent: BlankBatchPicModal,
  destroyOnClose: true,
});

const [BlankImportModalComp, blankImportModalApi] = useVbenModal({
  connectedComponent: BlankImportModal,
  destroyOnClose: true,
});

const [BlankSkuImportModalComp, blankSkuImportModalApi] = useVbenModal({
  connectedComponent: BlankSkuImportModal,
  destroyOnClose: true,
});

const [AccessorySkuImportModalComp, accessorySkuImportModalApi] = useVbenModal({
  connectedComponent: AccessorySkuImportModal,
  destroyOnClose: true,
});

const [FinishedBatchPicModalComp, finishedBatchPicModalApi] = useVbenModal({
  connectedComponent: FinishedBatchPicModal,
  destroyOnClose: true,
});

const [PatternCostMaintainModal, patternCostModalApi] = useVbenModal({
  connectedComponent: PatternCostModal,
  destroyOnClose: true,
});

const [FinishedCostMaintainModal, finishedCostModalApi] = useVbenModal({
  connectedComponent: FinishedCostModal,
  destroyOnClose: true,
});

const [PatternProductMaintainModal, patternProductModalApi] = useVbenModal({
  connectedComponent: PatternProductModal,
  destroyOnClose: true,
});

const [PatternGenerateModal, patternGenerateModalApi] = useVbenModal({
  connectedComponent: PatternGenerateModalComp,
  destroyOnClose: true,
});

const [FinishedGenerateModal, finishedGenerateModalApi] = useVbenModal({
  connectedComponent: FinishedGenerateModalComp,
  destroyOnClose: true,
});

const [CustomComboGenerateModal, customComboGenerateModalApi] = useVbenModal({
  connectedComponent: CustomComboGenerateModalComp,
  destroyOnClose: true,
});

const [StandardComboGenerateModal, standardComboGenerateModalApi] =
  useVbenModal({
    connectedComponent: StandardComboGenerateModalComp,
    destroyOnClose: true,
  });

const [ComboPlatformPriceModal, comboPlatformPriceModalApi] = useVbenModal({
  connectedComponent: ComboPlatformPriceModalComp,
  destroyOnClose: true,
});

const [CustomComboChildrenModal, customComboChildrenModalApi] = useVbenModal({
  connectedComponent: CustomComboChildrenModalComp,
  destroyOnClose: true,
});

const [SyncResultModal, syncResultModalApi] = useVbenModal({
  connectedComponent: SyncResultModalComp,
  destroyOnClose: true,
});

const [DetailDrawer, detailDrawerApi] = useVbenDrawer({
  connectedComponent: DetailDrawerComp,
  destroyOnClose: true,
});

function handleView(row: SkuDisplayRow) {
  detailDrawerApi
    .setData({
      row: { ...row },
      listTab: activeListTab.value,
      listLabel: activeTabMeta.value?.label,
    })
    .open();
}

function handleDetailEdit(payload: {
  row: SkuDisplayRow;
  listTab: SkuListTab;
}) {
  if (interactionBusy.value) {
    message.info('请等待当前操作完成后再编辑');
    return;
  }
  formModalApi.setData(payload).open();
}

function handleOpenComboChildren(data: { comboId: number; itemCode?: string }) {
  customComboChildrenModalApi.setData(data).open();
}

/** 刷新表格 */
function handleRefresh() {
  return gridApi.query();
}

function handleYogaBlankGen() {
  yogaBlankModalApi.setData(null).open();
}

function handleCostMaintain() {
  costModalApi.setData(null).open();
}

function handleBlankBatchSetPic() {
  if (checkedCount.value === 0 || interactionBusy.value) return;
  blankBatchPicModalApi.setData([...checkedIds.value]).open();
}

function handleBlankImportExcel() {
  blankImportModalApi.setData(null).open();
}

function handleBlankSkuImportExcel() {
  blankSkuImportModalApi.setData(null).open();
}

function handleAccessorySkuImportExcel() {
  accessorySkuImportModalApi.setData(null).open();
}

function handleCreate() {
  formModalApi.setData({ listTab: activeListTab.value }).open();
}

function handleFinishedBatchSetPic() {
  if (checkedCount.value === 0 || interactionBusy.value) return;
  finishedBatchPicModalApi.setData([...checkedIds.value]).open();
}

function handlePatternCostMaintain() {
  patternCostModalApi.setData(null).open();
}

function handlePatternProductMaintain() {
  patternProductModalApi.setData(null).open();
}

function handlePatternGenerate() {
  patternGenerateModalApi.setData(null).open();
}

function handleFinishedGenerate() {
  finishedGenerateModalApi.setData(null).open();
}

function handleCustomComboGenerate() {
  customComboGenerateModalApi.setData(null).open();
}

function handleStandardComboGenerate() {
  standardComboGenerateModalApi.setData(null).open();
}

function handleComboPlatformPriceMaintain() {
  comboPlatformPriceModalApi.setData(null).open();
}

function handleFinishedCostMaintain() {
  finishedCostModalApi.setData(null).open();
}

/** 编辑（SKU 主表或图案表，由表单根据 listTab 分支） */
function handleEdit(row: SkuDisplayRow) {
  formModalApi.setData({ row, listTab: activeListTab.value }).open();
}

/** 同步到聚水潭 */
async function handleSyncJushuitan(row: SkuDisplayRow) {
  if (interactionBusy.value) return;
  pendingAction.value = 'sync';
  pendingRowId.value = row.id;
  const hideLoading = message.loading({
    content: '正在同步到聚水潭…',
    duration: 0,
  });
  try {
    if (activeListTab.value === 'pattern') {
      const res = await syncDataJustPatternToJushuitan(row.id!);
      message.success(
        res?.jstSkuId ? `同步成功，聚水潭 SKU ID：${res.jstSkuId}` : '同步成功',
      );
    } else if (activeListTab.value === 'finished') {
      const res = await syncFinishedSkuToJushuitan(row.id!);
      message.success(
        res?.jstSkuId ? `同步成功，聚水潭 SKU ID：${res.jstSkuId}` : '同步成功',
      );
    } else if (
      activeListTab.value === 'custom_combo' ||
      activeListTab.value === 'combo'
    ) {
      const res = await syncCustomComboToJushuitanBatch([row.id!]);
      const item = res.items?.[0];
      if (item?.success) {
        message.success(
          item.jstSkuId
            ? `同步成功，聚水潭 SKU ID：${item.jstSkuId}`
            : '同步成功',
        );
      } else {
        message.error(item?.message ?? '同步失败');
      }
    } else {
      const res = await syncDataJustSkuToJushuitan(row.id!);
      message.success(
        res?.jstSkuId ? `同步成功，聚水潭 SKU ID：${res.jstSkuId}` : '同步成功',
      );
    }
    await handleRefresh();
  } finally {
    hideLoading();
    pendingAction.value = null;
    pendingRowId.value = undefined;
  }
}

/** 捕获本次同步接口，结果窗口重试时仍使用原列表。 */
async function runBatchSync(
  sync: (ids: number[]) => Promise<JstSyncBatchResp>,
) {
  if (checkedCount.value === 0 || interactionBusy.value) return;
  const ids = [...checkedIds.value];
  const listLabel = activeTabMeta.value?.label ?? 'SKU';
  pendingAction.value = 'sync';
  const hideLoading = message.loading({
    content: `正在同步选中的 ${ids.length} 条记录…`,
    duration: 0,
  });
  try {
    const result = await sync(ids);
    syncResultModalApi.setData({ result, listLabel, retry: sync }).open();
    await handleRefresh();
  } finally {
    hideLoading();
    pendingAction.value = null;
  }
}

function handleSyncJushuitanBatch() {
  return runBatchSync(syncDataJustSkuToJushuitanBatch);
}

function handleSyncFinishedJushuitanBatch() {
  return runBatchSync(syncFinishedSkuToJushuitanBatchV2);
}

function handleSyncCustomComboBatch() {
  return runBatchSync(syncCustomComboToJushuitanBatch);
}

/** 删除（SKU 主表或图案表） */
async function handleDelete(row: SkuDisplayRow) {
  if (interactionBusy.value) return;
  pendingAction.value = 'delete';
  pendingRowId.value = row.id;
  const hideLoading = message.loading({
    content: $t('ui.actionMessage.deleting', [row.id]),
    duration: 0,
  });
  try {
    if (activeListTab.value === 'pattern') {
      await deleteDataJustPattern(row.id!);
    } else if (activeListTab.value === 'accessory') {
      await deleteDataJustAccessory(row.id!);
    } else if (activeListTab.value === 'finished') {
      await deleteFinishedSku(row.id!);
    } else if (
      activeListTab.value === 'custom_combo' ||
      activeListTab.value === 'combo'
    ) {
      await deleteCustomCombo(row.id!);
    } else {
      await deleteDataJustSku(row.id!);
    }
    message.success($t('ui.actionMessage.deleteSuccess', [row.id]));
    await handleRefresh();
  } finally {
    hideLoading();
    pendingAction.value = null;
    pendingRowId.value = undefined;
  }
}

/** 批量删除 */
async function handleDeleteBatch() {
  if (checkedCount.value === 0 || interactionBusy.value) return;
  const ids = [...checkedIds.value];
  const tab = activeListTab.value;
  pendingAction.value = 'delete';
  try {
    await confirm(
      `确定删除「${activeTabMeta.value?.shortLabel}」中选中的 ${ids.length} 条记录吗？删除后无法恢复。`,
    );
  } catch {
    pendingAction.value = null;
    return;
  }
  const hideLoading = message.loading({
    content: $t('ui.actionMessage.deletingBatch'),
    duration: 0,
  });
  try {
    if (tab === 'pattern') {
      await deleteDataJustPatternList(ids);
    } else if (tab === 'accessory') {
      await deleteDataJustAccessoryList(ids);
    } else if (tab === 'finished') {
      await deleteFinishedSkuList(ids);
    } else if (tab === 'custom_combo' || tab === 'combo') {
      await deleteCustomComboList(ids);
    } else {
      await deleteDataJustSkuList(ids);
    }
    clearSelection();
    message.success($t('ui.actionMessage.deleteSuccess'));
    await handleRefresh();
  } finally {
    hideLoading();
    pendingAction.value = null;
  }
}

/** 导出表格 */
async function handleExport() {
  if (exporting.value || interactionBusy.value || listLoadFailed.value) return;
  exporting.value = true;
  try {
    const meta = LIST_TAB_META.find((m) => m.key === activeListTab.value);
    const formValues = { ...appliedFilters.value };
    const data =
      activeListTab.value === 'pattern'
        ? await exportDataJustPatternExcel(formValues)
        : activeListTab.value === 'accessory'
          ? await exportDataJustAccessoryExcel(
              formValues as Record<string, unknown>,
            )
          : activeListTab.value === 'finished'
            ? await exportFinishedSkuExcel(formValues)
            : activeListTab.value === 'custom_combo' ||
                activeListTab.value === 'combo'
              ? await exportCustomComboExcel({
                  ...formValues,
                  categoryName:
                    activeListTab.value === 'combo' ? '组合' : '定制组合',
                })
              : await exportDataJustSku({
                  ...formValues,
                  listTab: activeListTab.value,
                });
    downloadFileFromBlobPart({
      fileName: meta?.exportName ?? '聚水潭SKU.xls',
      source: data,
    });
    message.success('导出成功');
  } finally {
    exporting.value = false;
  }
}

const [Grid, gridApi] = useVbenVxeGrid<SkuDisplayRow>({
  formOptions: {
    schema: useGridFormSchema(),
    collapsed: true,
    submitOnEnter: true,
    wrapperClass: 'grid-cols-1 md:grid-cols-2 xl:grid-cols-4',
  },
  gridOptions: {
    columns: currentColumns(),
    height: 'auto',
    align: 'left',
    showOverflow: false,
    stripe: true,
    /** 关闭行源快照：勾选时 Vxe 不必维护全量 original 数据，减轻大列表交互卡顿 */
    keepSource: false,
    proxyConfig: {
      ajax: {
        query: async (
          { page }: { page: { currentPage: number; pageSize: number } },
          formValues: Record<string, unknown>,
        ) => {
          loadingList.value = true;
          listLoadFailed.value = false;
          clearSelection();
          appliedFilters.value = { ...formValues };
          try {
            if (
              activeListTab.value === 'custom_combo' ||
              activeListTab.value === 'combo'
            ) {
              return await getCustomComboPage({
                pageNo: page.currentPage,
                pageSize: page.pageSize,
                ...formValues,
                categoryName:
                  activeListTab.value === 'combo' ? '组合' : '定制组合',
              } as any);
            }
            if (activeListTab.value === 'pattern') {
              return await getDataJustPatternPage({
                pageNo: page.currentPage,
                pageSize: page.pageSize,
                ...formValues,
              } as any);
            }
            if (activeListTab.value === 'accessory') {
              return await getDataJustAccessoryPage({
                pageNo: page.currentPage,
                pageSize: page.pageSize,
                ...formValues,
              } as any);
            }
            if (activeListTab.value === 'finished') {
              return await getFinishedSkuPage({
                pageNo: page.currentPage,
                pageSize: page.pageSize,
                ...formValues,
              } as any);
            }
            return await getDataJustSkuPage({
              pageNo: page.currentPage,
              pageSize: page.pageSize,
              listTab: activeListTab.value,
              ...formValues,
            });
          } catch {
            listLoadFailed.value = true;
            return { list: [], total: 0 };
          } finally {
            loadingList.value = false;
          }
        },
      },
    },
    checkboxConfig: {
      highlight: true,
      checkMethod: () => !interactionBusy.value,
    },
    rowConfig: {
      keyField: 'id',
      isHover: true,
    },
    toolbarConfig: {
      refresh: true,
      search: true,
      custom: false,
    },
  },
  gridEvents: {
    checkboxAll: handleRowCheckboxChange,
    checkboxChange: handleRowCheckboxChange,
  },
});
</script>

<template>
  <Page
    class="sku-page-layout"
    auto-content-height
    content-class="flex min-h-0 flex-1 flex-col !p-0"
  >
    <FormModal @success="handleRefresh" />
    <YogaBlankGenModal @success="handleRefresh" />
    <BlankBatchPicModalComp @success="handleRefresh" />
    <BlankImportModalComp @success="handleRefresh" />
    <BlankSkuImportModalComp @success="handleRefresh" />
    <AccessorySkuImportModalComp @success="handleRefresh" />
    <FinishedBatchPicModalComp @success="handleRefresh" />
    <CostMaintainModal />
    <PatternCostMaintainModal />
    <FinishedCostMaintainModal />
    <PatternProductMaintainModal @success="handleRefresh" />
    <PatternGenerateModal @success="handleRefresh" />
    <SyncResultModal @success="handleRefresh" />
    <DetailDrawer
      @edit="handleDetailEdit"
      @children="handleOpenComboChildren"
    />
    <FinishedGenerateModal @success="handleRefresh" />
    <CustomComboGenerateModal @success="handleRefresh" />
    <StandardComboGenerateModal @success="handleRefresh" />
    <ComboPlatformPriceModal />
    <CustomComboChildrenModal />

    <div
      class="data-just-sku-page flex min-h-0 flex-1 flex-col gap-3 px-4 pb-4"
    >
      <header
        class="flex flex-shrink-0 flex-wrap items-start justify-between gap-3 pt-3"
      >
        <div class="min-w-0 basis-full lg:flex-1">
          <h2 class="mb-1 text-lg font-semibold text-foreground">
            聚水潭 SKU 编码管理
          </h2>
          <p class="mb-0 text-xs text-muted-foreground">
            {{ activeTabMeta?.subtitle ?? '' }}
          </p>
        </div>
        <Segmented
          :value="activeListTab"
          :options="segmentedOptions"
          :disabled="interactionBusy"
          class="data-just-sku-segmented shrink-0"
          @change="onListTabChange"
        />
      </header>

      <div
        class="sku-filter-bar flex flex-wrap items-center gap-2 rounded-md bg-card px-3 py-2"
      >
        <span class="text-xs text-muted-foreground">聚水潭同步</span>
        <Button
          v-for="option in syncFilterOptions"
          :key="option.value"
          size="small"
          :type="activeSyncFilter === option.value ? 'primary' : 'text'"
          :aria-pressed="activeSyncFilter === option.value"
          :disabled="interactionBusy"
          @click="handleSyncFilter(option.value)"
          >{{ option.label }}</Button
        >
        <Button
          v-if="hasActiveFilters"
          type="link"
          size="small"
          :disabled="interactionBusy"
          @click="handleResetFilters"
        >
          清空全部筛选
        </Button>
        <span class="ml-auto text-xs text-muted-foreground"
          >输入后按 Enter 查询 · 各列表独立保留筛选</span
        >
      </div>

      <div
        class="sku-selection-bar flex flex-wrap items-center gap-2 rounded-md border px-3 py-2"
        :class="
          checkedCount > 0
            ? 'border-primary/30 bg-primary/5'
            : 'border-transparent bg-card'
        "
        aria-live="polite"
      >
        <template v-if="checkedCount > 0">
          <span class="mr-1 text-sm"
            >已选
            <strong class="text-primary">{{ checkedCount }}</strong> 条<span
              class="ml-1 text-xs text-muted-foreground"
              >（当前页）</span
            ></span
          >
          <Button
            size="small"
            :disabled="interactionBusy"
            @click="clearSelection"
            >取消选择</Button
          >
          <Button
            v-for="item in batchToolbarMenuItems"
            :key="item.key"
            v-access:code="['fdmdata:data-just-sku:update']"
            size="small"
            :disabled="item.disabled"
            :loading="pendingAction === 'sync' && item.key.endsWith('sync')"
            @click="handleToolbarMenuClick({ key: item.key })"
            >{{ item.label }}</Button
          >
          <Button
            v-access:code="['fdmdata:data-just-sku:delete']"
            size="small"
            danger
            :disabled="interactionBusy"
            :loading="pendingAction === 'delete' && pendingRowId === undefined"
            @click="handleDeleteBatch"
            >删除所选</Button
          >
        </template>
        <span v-else class="text-xs text-muted-foreground"
          >勾选左侧复选框进行批量操作，翻页或重新查询会清空选择。</span
        >
      </div>

      <Alert
        v-if="listLoadFailed"
        type="error"
        message="列表加载失败，请重试。"
        show-icon
        class="shrink-0"
      >
        <template #action>
          <Button
            size="small"
            :disabled="interactionBusy"
            @click="handleRefresh"
            >重新加载</Button
          >
        </template>
      </Alert>

      <div ref="tableHost" class="sku-table-host">
        <Grid
          class="data-just-sku-grid min-h-0 flex-1"
          :class="{ 'sku-grid-compact': compactTable }"
          :table-title="gridTableTitle"
        >
          <template #table-title>
            <div class="min-w-0">
              <span class="font-medium">{{ activeTabMeta?.label }}</span>
              <span
                v-if="compactTable"
                class="ml-2 text-xs font-normal text-muted-foreground"
                >点击详情查看完整资料</span
              >
            </div>
          </template>
          <template #colProduct="{ row }">
            <div class="sku-product">
              <div class="sku-product-image">
                <Image
                  v-if="row.picUrl && !failedImages.has(row.picUrl)"
                  :src="row.picUrl"
                  :width="52"
                  :height="52"
                  :alt="row.productName || row.itemCode || '商品图片'"
                  @error="onImageError(row.picUrl)"
                />
                <span v-else>{{ row.picUrl ? '加载失败' : '暂无图片' }}</span>
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1">
                  <Tooltip :title="row.itemCode">
                    <button
                      type="button"
                      class="sku-product-code min-w-0 flex-1 text-left font-mono text-xs"
                      @click="handleView(row)"
                    >
                      {{ row.itemCode || '—' }}
                    </button>
                  </Tooltip>
                  <Tooltip title="复制商品编码">
                    <Button
                      v-if="row.itemCode"
                      type="text"
                      size="small"
                      aria-label="复制商品编码"
                      class="shrink-0 !px-1 text-muted-foreground"
                      @click.stop="copyItemCode(row.itemCode)"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.7"
                        aria-hidden="true"
                      >
                        <rect x="8" y="8" width="12" height="12" rx="2" />
                        <path
                          d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"
                        />
                      </svg>
                    </Button>
                  </Tooltip>
                </div>
                <Tooltip :title="row.productName">
                  <div class="sku-product-name text-xs text-muted-foreground">
                    {{ displaySkuValue(row.productName) }}
                  </div>
                </Tooltip>
              </div>
            </div>
          </template>
          <template #colSpecifications="{ row }">
            <div class="sku-cell-stack">
              <template v-if="activeListTab === 'accessory'">
                <span class="sku-cell-line">{{
                  getAccessoryKindLabel(row.accessoryKind)
                }}</span>
                <span class="sku-cell-line text-muted-foreground">{{
                  getAccessoryMatchLabel(row.matchType)
                }}</span>
                <span
                  class="sku-cell-line text-muted-foreground"
                  :title="row.colorSpec"
                  >{{ displaySkuValue(row.colorSpec) }}</span
                >
              </template>
              <template v-else>
                <span
                  class="sku-cell-line"
                  :title="row.colorSpec || row.styleCode"
                  >{{ displaySkuValue(row.colorSpec || row.styleCode) }}</span
                >
                <span
                  class="sku-cell-line text-muted-foreground"
                  :title="row.categoryName"
                  >{{ displaySkuValue(row.categoryName)
                  }}<template v-if="row.materialKey">
                    · {{ row.materialKey }}</template
                  ></span
                >
                <Button
                  v-if="
                    activeListTab === 'combo' ||
                    activeListTab === 'custom_combo'
                  "
                  type="link"
                  size="small"
                  v-access:code="['fdmdata:data-just-sku:query']"
                  class="!h-5 !p-0 self-start"
                  @click="
                    handleOpenComboChildren({
                      comboId: row.id,
                      itemCode: row.itemCode,
                    })
                  "
                  >查看子商品</Button
                >
              </template>
            </div>
          </template>
          <template #colPrice="{ row }">
            <div v-if="activeListTab === 'combo'" class="sku-platform-prices">
              <div
                v-for="platform in SKU_PLATFORM_PRICES"
                :key="platform.key"
                class="flex min-w-0 items-center justify-between gap-1"
              >
                <span class="shrink-0 text-muted-foreground">{{
                  platform.label
                }}</span>
                <span
                  class="truncate tabular-nums"
                  :title="formatSkuMoney(row[platform.key])"
                  >{{ formatSkuMoney(row[platform.key]) }}</span
                >
              </div>
            </div>
            <span v-else class="tabular-nums">{{
              formatSkuMoney(row.costPrice)
            }}</span>
          </template>
          <template #colSyncStatus="{ row }">
            <div class="sku-cell-stack">
              <Tag v-if="row.status === 1" color="warning">未同步</Tag>
              <Tag v-else-if="row.status === 2" color="success">已同步</Tag>
              <Tag v-else-if="row.status === 3" color="error">同步失败</Tag>
              <span v-else>—</span>
              <span
                v-if="row.jstSkuId"
                class="sku-cell-line font-mono text-muted-foreground"
                :title="`聚水潭 SKU ID：${row.jstSkuId}`"
                >ID {{ row.jstSkuId }}</span
              >
            </div>
          </template>
          <template #colCreated="{ row }">
            <div class="sku-cell-stack">
              <span
                class="sku-cell-line"
                :title="row.creatorName || row.creator"
                >{{ displaySkuValue(row.creatorName || row.creator) }}</span
              >
              <span class="text-muted-foreground">{{
                row.createTime ? formatDate(row.createTime, 'YYYY-MM-DD') : '—'
              }}</span>
              <span v-if="row.createTime" class="text-muted-foreground">{{
                formatDate(row.createTime, 'HH:mm:ss')
              }}</span>
            </div>
          </template>
          <template #toolbar-tools>
            <div class="inline-flex max-w-full flex-wrap items-center gap-2">
              <Button
                v-if="primaryToolbarAction"
                type="primary"
                :disabled="interactionBusy"
                @click="primaryToolbarAction.onClick"
              >
                {{ primaryToolbarAction.label }}
              </Button>
              <template v-if="!compactTable">
                <Button
                  v-for="(act, idx) in secondaryToolbarActions"
                  :key="`${activeListTab}-sec-${idx}`"
                  :disabled="interactionBusy"
                  @click="act.onClick"
                >
                  {{ act.label }}
                </Button>
              </template>
              <Dropdown
                v-else-if="secondaryToolbarActions.length"
                :trigger="['click']"
                :disabled="interactionBusy"
              >
                <Button :disabled="interactionBusy">维护 ▾</Button>
                <template #overlay>
                  <Menu>
                    <Menu.Item
                      v-for="(act, idx) in secondaryToolbarActions"
                      :key="idx"
                      :disabled="interactionBusy"
                      @click="act.onClick"
                      >{{ act.label }}</Menu.Item
                    >
                  </Menu>
                </template>
              </Dropdown>
              <Dropdown
                v-if="importToolbarMenuItems.length > 0"
                :trigger="['click']"
                :disabled="interactionBusy"
              >
                <Button :disabled="interactionBusy">导入 ▾</Button>
                <template #overlay>
                  <Menu @click="handleToolbarMenuClick">
                    <Menu.Item
                      v-for="item in importToolbarMenuItems"
                      :key="item.key"
                    >
                      {{ item.label }}
                    </Menu.Item>
                  </Menu>
                </template>
              </Dropdown>
              <Tooltip title="导出当前列表中符合已查询条件的全部记录">
                <Button
                  :loading="exporting"
                  :disabled="interactionBusy || listLoadFailed"
                  @click="handleExport"
                  >{{ compactTable ? '导出' : '导出筛选结果' }}</Button
                >
              </Tooltip>
            </div>
          </template>
          <template #actions="{ row }">
            <div class="sku-row-actions">
              <TableAction
                :actions="[
                  {
                    label: '详情',
                    type: 'link',
                    onClick: () => handleView(row),
                  },
                  {
                    label: $t('common.edit'),
                    type: 'link',
                    disabled: interactionBusy,
                    auth: ['fdmdata:data-just-sku:update'],
                    ifShow:
                      activeListTab !== 'combo' &&
                      activeListTab !== 'custom_combo',
                    onClick: handleEdit.bind(null, row),
                  },
                ]"
              />
              <TableAction
                :actions="[
                  {
                    label: row.status === 3 ? '重试' : '同步',
                    tooltip:
                      row.status === 3 ? '重试同步到聚水潭' : '同步到聚水潭',
                    type: 'link',
                    disabled: interactionBusy,
                    loading:
                      pendingAction === 'sync' && pendingRowId === row.id,
                    auth: ['fdmdata:data-just-sku:update'],
                    ifShow:
                      (row.status === 1 || row.status === 3) &&
                      activeListTab !== 'accessory',
                    onClick: handleSyncJushuitan.bind(null, row),
                  },
                  {
                    label: $t('common.delete'),
                    type: 'link',
                    danger: true,
                    disabled: interactionBusy,
                    loading:
                      pendingAction === 'delete' && pendingRowId === row.id,
                    auth: ['fdmdata:data-just-sku:delete'],
                    popConfirm: {
                      title: `确定删除商品「${row.itemCode || row.productName || row.id}」吗？`,
                      confirm: handleDelete.bind(null, row),
                    },
                  },
                ]"
              />
            </div>
          </template>
        </Grid>
      </div>
    </div>
  </Page>
</template>

<style scoped>
.sku-page-layout {
  /* 表格内容不参与外层最小高度计算，避免缩小窗口后仍被旧高度撑住。 */
  contain: size;
  min-height: 0;
}

.data-just-sku-page {
  overflow: hidden;
  min-height: 0;
}

.data-just-sku-segmented {
  max-width: 100%;
  overflow-x: auto;
}

.sku-filter-bar,
.sku-selection-bar {
  flex-shrink: 0;
}

.data-just-sku-segmented :deep(.ant-segmented) {
  background: hsl(var(--muted) / 45%);
}

.sku-table-host,
.data-just-sku-grid {
  display: flex;
  flex: 1 1 0%;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.data-just-sku-grid :deep(.vxe-grid:not(.is--maximize)) {
  flex: 1 1 0%;
  min-height: 0;
  height: 100% !important;
}

.data-just-sku-grid :deep(.vxe-grid--layout-body-wrapper),
.data-just-sku-grid :deep(.vxe-grid--layout-body-content-wrapper) {
  min-height: 0;
}

.data-just-sku-grid :deep(.vxe-toolbar) {
  height: auto;
  min-height: 52px;
  flex-wrap: wrap;
  gap: 8px;
}

.sku-grid-compact :deep(.vxe-buttons--wrapper) {
  flex-basis: 100%;
  padding: 0;
}

.sku-grid-compact :deep(.vxe-tools--wrapper) {
  flex: 1 1 0%;
  min-width: 0;
}

.sku-grid-compact :deep(.vxe-tool--item-wrapper) {
  display: flex;
  align-items: center;
}

.sku-grid-compact :deep(.vxe-tools--operate) {
  margin-left: 0;
}

.sku-product {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  min-height: 64px;
}

.sku-product-image {
  display: flex;
  flex: 0 0 52px;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  overflow: hidden;
  color: hsl(var(--muted-foreground));
  font-size: 10px;
  background: hsl(var(--muted));
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
}

.sku-product-image :deep(.ant-image-img) {
  object-fit: contain;
}

.sku-product-code,
.sku-product-name {
  display: -webkit-box;
  overflow: hidden;
  line-height: 18px;
  white-space: normal;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.sku-product-code:hover {
  color: hsl(var(--primary));
}

.sku-cell-stack {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  min-width: 0;
  font-size: 12px;
  line-height: 18px;
}

.sku-cell-line {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sku-cell-stack :deep(.ant-tag) {
  margin-inline-end: 0;
}

.sku-platform-prices {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 3px 10px;
  font-size: 11px;
  line-height: 18px;
}

.sku-row-actions :deep(.ant-btn) {
  height: 28px;
  padding: 0 4px;
}
</style>
