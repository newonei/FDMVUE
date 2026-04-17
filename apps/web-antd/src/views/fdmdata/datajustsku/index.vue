<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmdataDataJustSkuApi } from '#/api/fdmdata/datajustsku';
import type { FdmdataDataJustPatternApi } from '#/api/fdmdata/datajustpattern';

import { computed, nextTick, ref } from 'vue';

import { confirm, Page, useVbenModal } from '@vben/common-ui';
import { downloadFileFromBlobPart, isEmpty } from '@vben/utils';

import { message, Tabs, Tag } from 'ant-design-vue';

import { ACTION_ICON, TableAction, useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  deleteDataJustPattern,
  deleteDataJustPatternList,
  exportDataJustPatternExcel,
  getDataJustPatternPage,
  syncDataJustPatternToJushuitan,
} from '#/api/fdmdata/datajustpattern';
import {
  deleteDataJustSku,
  deleteDataJustSkuList,
  exportDataJustSku,
  getDataJustSkuPage,
  getCustomComboPage,
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

/** 与后端列表 Tab 一致：blank=排除其它 Tab 的款式前缀 */
type SkuListTab = 'blank' | 'pattern' | 'finished' | 'combo' | 'custom_combo';

const LIST_TAB_META: { key: SkuListTab; label: string; exportName: string }[] = [
  { key: 'blank', label: '空白版列表', exportName: '空白版SKU.xls' },
  { key: 'pattern', label: '图案列表', exportName: '图案SKU.xls' },
  { key: 'finished', label: '成品编码列表', exportName: '成品编码SKU.xls' },
  { key: 'combo', label: '组合编码列表', exportName: '组合编码SKU.xls' },
  { key: 'custom_combo', label: '定制组合编码列表', exportName: '定制组合编码SKU.xls' },
];

const activeListTab = ref<SkuListTab>('blank');

const gridTableTitle = computed(() => {
  const row = LIST_TAB_META.find((m) => m.key === activeListTab.value);
  return row ? `聚水潭 SKU · ${row.label}` : '聚水潭 SKU';
});

async function onListTabChange(key: SkuListTab) {
  checkedIds.value = [];
  gridApi.setGridOptions({
    columns: buildDataJustSkuGridColumns({
      listTab: key,
      patternPicPreview: key === 'pattern',
      blankPicPreview: key === 'blank',
      finishedPicPreview: key === 'finished',
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

const [CustomComboChildrenModal, customComboChildrenModalApi] = useVbenModal({
  connectedComponent: CustomComboChildrenModalComp,
  destroyOnClose: true,
});

function handleOpenCustomComboChildren(
  row: FdmdataDataJustSkuApi.DataJustSku | FdmdataDataJustPatternApi.Pattern,
) {
  customComboChildrenModalApi
    .setData({
      comboId: row.id,
      itemCode: (row as FdmdataDataJustSkuApi.DataJustSku).itemCode,
    })
    .open();
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

function handleFinishedCostMaintain() {
  finishedCostModalApi.setData(null).open();
}

/** 编辑（SKU 主表或图案表，由表单根据 listTab 分支） */
function handleEdit(
  row: FdmdataDataJustSkuApi.DataJustSku | FdmdataDataJustPatternApi.Pattern,
) {
  formModalApi.setData({ row, listTab: activeListTab.value }).open();
}

/** 同步到聚水潭 */
async function handleSyncJushuitan(
  row: FdmdataDataJustSkuApi.DataJustSku | FdmdataDataJustPatternApi.Pattern,
) {
  const hideLoading = message.loading({ content: '正在同步到聚水潭…', duration: 0 });
  try {
    if (activeListTab.value === 'pattern') {
      const res = await syncDataJustPatternToJushuitan(row.id!);
      message.success(
        res?.jstSkuId
          ? `同步成功，聚水潭 SKU ID：${res.jstSkuId}`
          : '同步成功',
      );
    } else if (activeListTab.value === 'custom_combo') {
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
        res?.jstSkuId
          ? `同步成功，聚水潭 SKU ID：${res.jstSkuId}`
          : '同步成功',
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

/** 定制组合：勾选后批量同步组合装到聚水潭（一次接口多条 items） */
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
  row: FdmdataDataJustSkuApi.DataJustSku | FdmdataDataJustPatternApi.Pattern,
) {
  const hideLoading = message.loading({
    content: $t('ui.actionMessage.deleting', [row.id]),
    duration: 0,
  });
  try {
    if (activeListTab.value === 'pattern') {
      await deleteDataJustPattern(row.id!);
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

const checkedIds = ref<number[]>([]);
function handleRowCheckboxChange({
  records,
}: {
  records: (FdmdataDataJustSkuApi.DataJustSku | FdmdataDataJustPatternApi.Pattern)[];
}) {
  checkedIds.value = records.map((item) => item.id!);
}

/** 导出表格 */
async function handleExport() {
  const meta = LIST_TAB_META.find((m) => m.key === activeListTab.value);
  const formValues = await gridApi.formApi.getValues();
  const data =
    activeListTab.value === 'pattern'
      ? await exportDataJustPatternExcel(formValues)
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
  },
  gridOptions: {
    columns: buildDataJustSkuGridColumns({
      listTab: activeListTab.value,
      patternPicPreview: activeListTab.value === 'pattern',
      blankPicPreview: activeListTab.value === 'blank',
    }),
    height: 'auto',
    keepSource: true,
    proxyConfig: {
      ajax: {
        query: async ({ page }, formValues) => {
          if (activeListTab.value === 'custom_combo') {
            return await getCustomComboPage({
              pageNo: page.currentPage,
              pageSize: page.pageSize,
              ...formValues,
            } as any);
          }
          if (activeListTab.value === 'pattern') {
            return await getDataJustPatternPage({
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
    FdmdataDataJustSkuApi.DataJustSku | FdmdataDataJustPatternApi.Pattern
  >,
  gridEvents: {
    checkboxAll: handleRowCheckboxChange,
    checkboxChange: handleRowCheckboxChange,
  },
});
</script>

<template>
  <Page auto-content-height>
    <FormModal @success="handleRefresh" />
    <YogaBlankGenModal @success="handleRefresh" />
    <BlankBatchPicModalComp @success="handleRefresh" />
    <BlankImportModalComp @success="handleRefresh" />
    <BlankSkuImportModalComp @success="handleRefresh" />
    <FinishedBatchPicModalComp @success="handleRefresh" />
    <CostMaintainModal />
    <PatternCostMaintainModal />
    <FinishedCostMaintainModal />
    <PatternProductMaintainModal @success="handleRefresh" />
    <PatternGenerateModal />
    <FinishedGenerateModal @success="handleRefresh" />
    <CustomComboGenerateModal @success="handleRefresh" />
    <CustomComboChildrenModal />
    <Tabs
      v-model:active-key="activeListTab"
      class="mb-3 shrink-0"
      @change="onListTabChange"
    >
      <Tabs.TabPane
        v-for="tab in LIST_TAB_META"
        :key="tab.key"
        :tab="tab.label"
      />
    </Tabs>
    <Grid :table-title="gridTableTitle">
      <template #colSyncStatus="{ row }">
        <Tag v-if="row.status === 1" color="warning">未同步</Tag>
        <Tag v-else-if="row.status === 2" color="success">已同步</Tag>
        <Tag v-else-if="row.status === 3" color="error">同步失败</Tag>
        <span v-else>-</span>
      </template>
      <template #colCustomComboChildren="{ row }">
        <TableAction
          :actions="[
            {
              label: '查看',
              type: 'link',
              auth: ['fdmdata:data-just-sku:query'],
              onClick: handleOpenCustomComboChildren.bind(null, row),
            },
          ]"
        />
      </template>
      <template #toolbar-tools>
        <TableAction
          :actions="[
            {
              label: '空白版生成',
              type: 'primary',
              auth: ['fdmdata:data-just-sku:query'],
              ifShow: activeListTab === 'blank',
              onClick: handleYogaBlankGen,
            },
            {
              label: '成本对照维护',
              type: 'default',
              auth: ['fdmdata:data-just-sku:update'],
              ifShow: activeListTab === 'blank',
              onClick: handleCostMaintain,
            },
            {
              label: '批量设置图片',
              type: 'default',
              auth: ['fdmdata:data-just-sku:update'],
              ifShow: activeListTab === 'blank',
              disabled: isEmpty(checkedIds),
              onClick: handleBlankBatchSetPic,
            },
            {
              label: '批量同步聚水潭',
              type: 'default',
              auth: ['fdmdata:data-just-sku:update'],
              ifShow: activeListTab === 'blank',
              disabled: isEmpty(checkedIds),
              onClick: handleSyncJushuitanBatch,
            },
            {
              label: '导入（成本对照）',
              type: 'default',
              auth: ['fdmdata:data-just-sku:update'],
              ifShow: activeListTab === 'blank',
              onClick: handleBlankImportExcel,
            },
            {
              label: '导入（空白版列表）',
              type: 'default',
              auth: ['fdmdata:data-just-sku:update'],
              ifShow: activeListTab === 'blank',
              onClick: handleBlankSkuImportExcel,
            },
            {
              label: '定制组合编码生成',
              type: 'primary',
              auth: ['fdmdata:data-just-sku:update'],
              ifShow: activeListTab === 'custom_combo',
              onClick: handleCustomComboGenerate,
            },
            {
              label: '批量同步组合装',
              type: 'default',
              auth: ['fdmdata:data-just-sku:update'],
              ifShow: activeListTab === 'custom_combo',
              disabled: isEmpty(checkedIds),
              onClick: handleSyncCustomComboBatch,
            },
            {
              label: '维护图案编码',
              type: 'default',
              auth: ['fdmdata:data-just-sku:update'],
              ifShow: activeListTab === 'pattern',
              onClick: handlePatternProductMaintain,
            },
            {
              label: '图案成本对照维护',
              type: 'default',
              auth: ['fdmdata:data-just-sku:update'],
              ifShow: activeListTab === 'pattern',
              onClick: handlePatternCostMaintain,
            },
            {
              label: '图案编码生成',
              type: 'primary',
              auth: ['fdmdata:data-just-sku:update'],
              ifShow: activeListTab === 'pattern',
              onClick: handlePatternGenerate,
            },
            {
              label: '成品编码生成',
              type: 'primary',
              auth: ['fdmdata:data-just-sku:update'],
              ifShow: activeListTab === 'finished',
              onClick: handleFinishedGenerate,
            },
            {
              label: '成品成本对照维护',
              type: 'default',
              auth: ['fdmdata:data-just-sku:update'],
              ifShow: activeListTab === 'finished',
              onClick: handleFinishedCostMaintain,
            },
            {
              label: '批量设置图片',
              type: 'default',
              auth: ['fdmdata:data-just-sku:update'],
              ifShow: activeListTab === 'finished',
              disabled: isEmpty(checkedIds),
              onClick: handleFinishedBatchSetPic,
            },
            {
              label: $t('ui.actionTitle.export'),
              type: 'primary',
              icon: ACTION_ICON.DOWNLOAD,
              auth: ['fdmdata:data-just-sku:export'],
              onClick: handleExport,
            },
            {
              label: $t('ui.actionTitle.deleteBatch'),
              type: 'primary',
              danger: true,
              icon: ACTION_ICON.DELETE,
              auth: ['fdmdata:data-just-sku:delete'],
              disabled: isEmpty(checkedIds),
              onClick: handleDeleteBatch,
            },
          ]"
        />
      </template>
      <template #actions="{ row }">
        <TableAction
          :actions="[
            {
              label: $t('common.edit'),
              type: 'link',
              icon: ACTION_ICON.EDIT,
              auth: ['fdmdata:data-just-sku:update'],
              onClick: handleEdit.bind(null, row),
            },
            {
              label: '同步到聚水潭',
              type: 'link',
              auth: ['fdmdata:data-just-sku:update'],
              ifShow: row.status === 1 || row.status === 3,
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
      </template>
    </Grid>
  </Page>
</template>