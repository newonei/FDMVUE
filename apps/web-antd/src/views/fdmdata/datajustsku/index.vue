<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmdataDataJustAccessoryApi } from '#/api/fdmdata/datajustaccessory';
import type { FdmdataDataJustSkuApi } from '#/api/fdmdata/datajustsku';
import type { FdmdataDataJustPatternApi } from '#/api/fdmdata/datajustpattern';

import { computed, nextTick, ref, shallowRef } from 'vue';

import { confirm, Page, useVbenModal } from '@vben/common-ui';
import { downloadFileFromBlobPart, isEmpty } from '@vben/utils';

import {
  Button,
  Dropdown,
  Menu,
  message,
  Segmented,
  Tag,
} from 'ant-design-vue';

import { ACTION_ICON, TableAction, useVbenVxeGrid } from '#/adapter/vxe-table';
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

/** 与后端列表 Tab 一致；配件列表独立表 fdm_data_just_accessory */
type SkuListTab =
  | 'blank'
  | 'pattern'
  | 'finished'
  | 'combo'
  | 'accessory'
  | 'custom_combo';

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
  const disabled = isEmpty(checkedIds.value);
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

const moreToolbarMenuItems = computed((): ToolbarMenuItem[] => {
  const disabled = isEmpty(checkedIds.value);
  return [
    { key: 'export', label: '导出' },
    { key: 'delete-batch', label: '批量删除', disabled },
  ];
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

/** 供 v-memo：仅当选中集合变化时才重跑工具栏 TableAction */
const checkedIdsMemoKey = computed(() =>
  [...checkedIds.value].toSorted((a, b) => a - b).join(','),
);

function handleRowCheckboxChange({
  records,
}: {
  records: (
    | FdmdataDataJustSkuApi.DataJustSku
    | FdmdataDataJustPatternApi.Pattern
    | FdmdataDataJustAccessoryApi.Accessory
  )[];
}) {
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
  checkedIds.value = [];
  gridApi.setGridOptions({
    columns: buildDataJustSkuGridColumns({
      listTab: nextTab,
      patternPicPreview: nextTab === 'pattern',
      blankPicPreview: nextTab === 'blank',
      finishedPicPreview: nextTab === 'finished',
    }),
  });
  await nextTick();
  gridApi.query();
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

function handleOpenComboChildren(data: { comboId: number; itemCode?: string }) {
  customComboChildrenModalApi.setData(data).open();
}

/** 刷新表格 */
function handleRefresh() {
  gridApi.query();
}

function handleYogaBlankGen() {
  yogaBlankModalApi.setData(null).open();
}

function handleCostMaintain() {
  costModalApi.setData(null).open();
}

function handleBlankBatchSetPic() {
  blankBatchPicModalApi.setData(checkedIds.value).open();
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
  finishedBatchPicModalApi.setData(checkedIds.value).open();
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
function handleEdit(
  row:
    | FdmdataDataJustSkuApi.DataJustSku
    | FdmdataDataJustPatternApi.Pattern
    | FdmdataDataJustAccessoryApi.Accessory,
) {
  formModalApi.setData({ row, listTab: activeListTab.value }).open();
}

/** 同步到聚水潭 */
async function handleSyncJushuitan(
  row: FdmdataDataJustSkuApi.DataJustSku | FdmdataDataJustPatternApi.Pattern,
) {
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
    handleRefresh();
  } finally {
    hideLoading();
  }
}

/** 空白版列表：勾选后批量同步（后端一次聚水潭接口，items 多条） */
async function handleSyncJushuitanBatch() {
  if (isEmpty(checkedIds.value)) {
    return;
  }
  const hideLoading = message.loading({
    content: '正在批量同步到聚水潭…',
    duration: 0,
  });
  try {
    const res = await syncDataJustSkuToJushuitanBatch(checkedIds.value);
    checkedIds.value = [];
    if (res.failCount === 0) {
      message.success(`批量同步完成，共 ${res.successCount} 条`);
    } else {
      message.warning(
        `批量同步完成：成功 ${res.successCount} 条，失败 ${res.failCount} 条（失败原因见各条 message）`,
      );
    }
    handleRefresh();
  } finally {
    hideLoading();
  }
}

/** 成品编码列表：勾选后批量同步（后端一次聚水潭接口，items 多条） */
async function handleSyncFinishedJushuitanBatch() {
  if (isEmpty(checkedIds.value)) {
    return;
  }
  const hideLoading = message.loading({
    content: '正在批量同步到聚水潭…',
    duration: 0,
  });
  try {
    const res = await syncFinishedSkuToJushuitanBatchV2(checkedIds.value);
    checkedIds.value = [];
    if (res.failCount === 0) {
      message.success(`批量同步完成，共 ${res.successCount} 条`);
    } else {
      message.warning(
        `批量同步完成：成功 ${res.successCount} 条，失败 ${res.failCount} 条（失败原因见各条 message）`,
      );
    }
    handleRefresh();
  } finally {
    hideLoading();
  }
}

/** 标准组合 / 定制组合：勾选后批量同步组合装到聚水潭（一次接口多条 items） */
async function handleSyncCustomComboBatch() {
  if (isEmpty(checkedIds.value)) {
    return;
  }
  const hideLoading = message.loading({
    content: '正在批量同步组合装到聚水潭…',
    duration: 0,
  });
  try {
    const res = await syncCustomComboToJushuitanBatch(checkedIds.value);
    checkedIds.value = [];
    if (res.failCount === 0) {
      message.success(`批量同步完成，共 ${res.successCount} 条`);
    } else {
      message.warning(
        `批量同步完成：成功 ${res.successCount} 条，失败 ${res.failCount} 条（失败原因见各条 message）`,
      );
    }
    handleRefresh();
  } finally {
    hideLoading();
  }
}

/** 删除（SKU 主表或图案表） */
async function handleDelete(
  row:
    | FdmdataDataJustSkuApi.DataJustSku
    | FdmdataDataJustPatternApi.Pattern
    | FdmdataDataJustAccessoryApi.Accessory,
) {
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
    handleRefresh();
  } finally {
    hideLoading();
  }
}

/** 批量删除 */
async function handleDeleteBatch() {
  await confirm($t('ui.actionMessage.deleteBatchConfirm'));
  const hideLoading = message.loading({
    content: $t('ui.actionMessage.deletingBatch'),
    duration: 0,
  });
  try {
    if (activeListTab.value === 'pattern') {
      await deleteDataJustPatternList(checkedIds.value);
    } else if (activeListTab.value === 'accessory') {
      await deleteDataJustAccessoryList(checkedIds.value);
    } else if (activeListTab.value === 'finished') {
      await deleteFinishedSkuList(checkedIds.value);
    } else if (
      activeListTab.value === 'custom_combo' ||
      activeListTab.value === 'combo'
    ) {
      await deleteCustomComboList(checkedIds.value);
    } else {
      await deleteDataJustSkuList(checkedIds.value);
    }
    checkedIds.value = [];
    message.success($t('ui.actionMessage.deleteSuccess'));
    handleRefresh();
  } finally {
    hideLoading();
  }
}

/** 导出表格 */
async function handleExport() {
  const meta = LIST_TAB_META.find((m) => m.key === activeListTab.value);
  const formValues = await gridApi.formApi.getValues();
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
}

const [Grid, gridApi] = useVbenVxeGrid({
  formOptions: {
    schema: useGridFormSchema(),
    wrapperClass: 'grid-cols-1 md:grid-cols-2 xl:grid-cols-4',
  },
  gridOptions: {
    columns: buildDataJustSkuGridColumns({
      listTab: activeListTab.value,
      patternPicPreview: activeListTab.value === 'pattern',
      blankPicPreview: activeListTab.value === 'blank',
      finishedPicPreview: activeListTab.value === 'finished',
    }),
    height: 'auto',
    stripe: true,
    /** 关闭行源快照：勾选时 Vxe 不必维护全量 original 数据，减轻大列表交互卡顿 */
    keepSource: false,
    proxyConfig: {
      ajax: {
        query: async ({ page }, formValues) => {
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
        },
      },
    },
    rowConfig: {
      keyField: 'id',
      isHover: true,
    },
    toolbarConfig: {
      refresh: true,
      search: true,
    },
  } as VxeTableGridOptions<
    | FdmdataDataJustSkuApi.DataJustSku
    | FdmdataDataJustPatternApi.Pattern
    | FdmdataDataJustAccessoryApi.Accessory
  >,
  gridEvents: {
    checkboxAll: handleRowCheckboxChange,
    checkboxChange: handleRowCheckboxChange,
  },
});
</script>

<template>
  <Page auto-content-height content-class="flex min-h-0 flex-1 flex-col !p-0">
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
    <PatternGenerateModal />
    <FinishedGenerateModal @success="handleRefresh" />
    <CustomComboGenerateModal @success="handleRefresh" />
    <StandardComboGenerateModal @success="handleRefresh" />
    <ComboPlatformPriceModal />
    <CustomComboChildrenModal />

    <div class="data-just-sku-page flex min-h-0 flex-1 flex-col px-4 pb-4">
      <header
        class="flex flex-shrink-0 flex-wrap items-start justify-between gap-3 pt-3"
      >
        <div class="min-w-0 flex-1">
          <h2 class="mb-1 text-lg font-semibold text-foreground">
            聚水潭 SKU 编码管理
          </h2>
          <p class="mb-0 text-xs text-muted-foreground">
            {{ activeTabMeta?.subtitle ?? '' }}
          </p>
        </div>
        <Segmented
          v-model:value="activeListTab"
          :options="segmentedOptions"
          class="data-just-sku-segmented shrink-0"
          @change="onListTabChange"
        />
      </header>

      <Grid
        class="data-just-sku-grid min-h-0 flex-1"
        :table-title="gridTableTitle"
      >
        <template #colSyncStatus="{ row }">
          <Tag v-if="row.status === 1" color="warning">未同步</Tag>
          <Tag v-else-if="row.status === 2" color="success">已同步</Tag>
          <Tag v-else-if="row.status === 3" color="error">同步失败</Tag>
          <span v-else>-</span>
        </template>
        <template #colCustomComboChildren="{ row }">
          <div v-memo="[row.id, row.itemCode]">
            <TableAction
              :actions="[
                {
                  label: '查看',
                  type: 'link',
                  auth: ['fdmdata:data-just-sku:query'],
                  onClick: () =>
                    handleOpenComboChildren({
                      comboId: row.id!,
                      itemCode: row.itemCode,
                    }),
                },
              ]"
            />
          </div>
        </template>
        <template #toolbar-tools>
          <div
            v-memo="[activeListTab, checkedIdsMemoKey]"
            class="inline-flex max-w-full flex-wrap items-center gap-2"
          >
            <span
              v-if="checkedCount > 0"
              class="mr-1 text-xs text-muted-foreground"
            >
              已选 {{ checkedCount }} 条
            </span>
            <Button
              v-if="primaryToolbarAction"
              type="primary"
              @click="primaryToolbarAction.onClick"
            >
              {{ primaryToolbarAction.label }}
            </Button>
            <Button
              v-for="(act, idx) in secondaryToolbarActions"
              :key="`${activeListTab}-sec-${idx}`"
              @click="act.onClick"
            >
              {{ act.label }}
            </Button>
            <Dropdown v-if="batchToolbarMenuItems.length > 0">
              <Button>批量操作</Button>
              <template #overlay>
                <Menu @click="handleToolbarMenuClick">
                  <Menu.Item
                    v-for="item in batchToolbarMenuItems"
                    :key="item.key"
                    :disabled="item.disabled"
                  >
                    {{ item.label }}
                  </Menu.Item>
                </Menu>
              </template>
            </Dropdown>
            <Dropdown v-if="importToolbarMenuItems.length > 0">
              <Button>导入</Button>
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
            <Dropdown>
              <Button>更多</Button>
              <template #overlay>
                <Menu @click="handleToolbarMenuClick">
                  <Menu.Item
                    v-for="item in moreToolbarMenuItems"
                    :key="item.key"
                    :disabled="item.disabled"
                  >
                    <span
                      :class="
                        item.key === 'delete-batch' ? 'text-red-500' : undefined
                      "
                    >
                      {{ item.label }}
                    </span>
                  </Menu.Item>
                </Menu>
              </template>
            </Dropdown>
          </div>
        </template>
        <template #actions="{ row }">
          <div v-memo="[row.id, row.status, activeListTab]">
            <TableAction
              :actions="[
                {
                  label: $t('common.edit'),
                  type: 'link',
                  icon: ACTION_ICON.EDIT,
                  auth: ['fdmdata:data-just-sku:update'],
                  ifShow:
                    activeListTab !== 'combo' &&
                    activeListTab !== 'custom_combo',
                  onClick: handleEdit.bind(null, row),
                },
                {
                  label: '同步到聚水潭',
                  type: 'link',
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
                  icon: ACTION_ICON.DELETE,
                  auth: ['fdmdata:data-just-sku:delete'],
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
    </div>
  </Page>
</template>

<style scoped>
.data-just-sku-page {
  min-height: 0;
}

.data-just-sku-segmented {
  max-width: 100%;
}

.data-just-sku-segmented :deep(.ant-segmented) {
  background: hsl(var(--muted) / 45%);
}

.data-just-sku-grid {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.data-just-sku-grid :deep(.vben-vxe-grid) {
  flex: 1 1 0;
  min-height: 0;
}
</style>
