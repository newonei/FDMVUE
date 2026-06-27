<script lang="ts" setup>
import type { PatternDesignItemShopOption } from './data';

import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmdataPatternDesignItemApi } from '#/api/fdmdata/pattern/design-item';

import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';

import { Page, useVbenModal } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { downloadFileFromBlobPart } from '@vben/utils';

import { Button, message } from 'ant-design-vue';

import { ACTION_ICON, TableAction, useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  deleteFdmdataPatternDesignItem,
  exportFdmdataPatternDesignItemExcel,
  getFdmdataPatternDesignItemPage,
  getFdmdataPatternDesignItemShopNameOptions,
  markFdmdataPatternDesignItemDownloaded,
} from '#/api/fdmdata/pattern/design-item';
import { $t } from '#/locales';

import { useGridColumns, useGridFormSchema } from './data';
import CreateForm from './modules/create-form.vue';
import EditForm from './modules/edit-form.vue';

defineOptions({ name: 'FdmdataPatternDesignItem' });

const [CreateFormModal, createFormModalApi] = useVbenModal({
  connectedComponent: CreateForm,
  destroyOnClose: true,
});
const [EditFormModal, editFormModalApi] = useVbenModal({
  connectedComponent: EditForm,
  destroyOnClose: true,
});
const checkedRows = shallowRef<FdmdataPatternDesignItemApi.PatternDesignItem[]>(
  [],
);
const checkedCount = computed(() => checkedRows.value.length);

const FILENAME_INVALID_CHARS = /[<>:"/\\|?*]/g;

function handleCreate() {
  createFormModalApi.open();
}

function handleEdit(row: FdmdataPatternDesignItemApi.PatternDesignItem) {
  editFormModalApi.setData(row).open();
}

async function handleDelete(row: FdmdataPatternDesignItemApi.PatternDesignItem) {
  if (!row.id) return;
  const hideLoading = message.loading({
    content: $t('ui.actionMessage.deleting', [row.id]),
    duration: 0,
  });
  try {
    await deleteFdmdataPatternDesignItem(row.id);
    message.success($t('ui.actionMessage.deleteSuccess', [row.id]));
    gridApi.query();
  } finally {
    hideLoading();
  }
}

async function handleExport() {
  const formValues = await gridApi.formApi.getValues();
  const data = await exportFdmdataPatternDesignItemExcel(formValues);
  downloadFileFromBlobPart({
    fileName: '图案识别订单设计图.xls',
    source: data,
  });
}

function handleRowCheckboxChange({
  records,
}: {
  records: FdmdataPatternDesignItemApi.PatternDesignItem[];
}) {
  checkedRows.value = records;
}

function sanitizeFileName(value: string) {
  return (
    value
      .replaceAll(
        /./g,
        (char) => ((char.codePointAt(0) ?? 0) < 32 ? '_' : char),
      )
      .replaceAll(FILENAME_INVALID_CHARS, '_')
      .replaceAll(/\s+/g, '_')
      .replaceAll(/_+/g, '_')
      .replaceAll(/^\.+|\.+$/g, '')
      .slice(0, 160) || 'design-image'
  );
}

function getFileExtension(url?: string) {
  const value = String(url ?? '').trim();
  if (!value) return '.jpg';

  try {
    const pathname = new URL(value, window.location.origin).pathname;
    const ext = pathname.match(/\.([a-z0-9]{1,10})$/i)?.[0];
    return ext || '.jpg';
  } catch {
    const path = value.split('?')[0] || '';
    const ext = path.match(/\.([a-z0-9]{1,10})$/i)?.[0];
    return ext || '.jpg';
  }
}

function getOriginalImageFileName(
  row: FdmdataPatternDesignItemApi.PatternDesignItem,
  index = 0,
) {
  const base = sanitizeFileName(
    [row.orderNo, row.itemNo, row.productSpec]
      .map((item) => String(item ?? '').trim())
      .filter(Boolean)
      .join('-') || `design-image-${row.id ?? index + 1}`,
  );
  const extension = getFileExtension(row.designImageUrl);
  return base.toLowerCase().endsWith(extension.toLowerCase())
    ? base
    : `${base}${extension}`;
}

function buildDownloadUrl(url: string, fileName: string) {
  const value = url.trim();
  try {
    const parsed = new URL(value, window.location.origin);
    parsed.searchParams.set('attname', fileName);
    return parsed.toString();
  } catch {
    const separator = value.includes('?') ? '&' : '?';
    return `${value}${separator}attname=${encodeURIComponent(fileName)}`;
  }
}

function triggerOriginalImageDownload(url: string, fileName: string) {
  const link = document.createElement('a');
  link.href = buildDownloadUrl(url, fileName);
  link.download = fileName;
  link.rel = 'noopener noreferrer';
  link.target = '_blank';
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
}

async function markRowsDownloaded(
  rows: FdmdataPatternDesignItemApi.PatternDesignItem[],
) {
  const ids = rows
    .map((row) => row.id)
    .filter((id): id is number => typeof id === 'number');
  if (ids.length === 0) return;

  await markFdmdataPatternDesignItemDownloaded(ids);
  rows.forEach((row) => {
    row.downloaded = 1;
  });
}

async function handleDownloadOriginal(
  row: FdmdataPatternDesignItemApi.PatternDesignItem,
  index = 0,
) {
  const url = String(row.designImageUrl ?? '').trim();
  if (!url) {
    message.warning('当前记录没有原图 URL');
    return;
  }

  triggerOriginalImageDownload(url, getOriginalImageFileName(row, index));
  try {
    await markRowsDownloaded([row]);
  } catch (error) {
    console.error('Mark pattern design item downloaded failed', error);
    message.warning('原图已开始下载，但标记已下载失败');
  }
}

async function handleBatchDownloadOriginal() {
  if (checkedRows.value.length === 0) {
    message.warning('请先勾选要下载的图案明细');
    return;
  }

  const downloadableRows = checkedRows.value.filter((row) =>
    String(row.designImageUrl ?? '').trim(),
  );
  if (downloadableRows.length === 0) {
    message.warning('勾选的记录没有原图 URL');
    return;
  }

  downloadableRows.forEach((row, index) => {
    triggerOriginalImageDownload(
      String(row.designImageUrl).trim(),
      getOriginalImageFileName(row, index),
    );
  });

  let markSuccess = true;
  try {
    await markRowsDownloaded(downloadableRows);
  } catch (error) {
    markSuccess = false;
    console.error('Mark pattern design items downloaded failed', error);
    message.warning('原图已开始下载，但标记已下载失败');
  }

  const skippedCount = checkedRows.value.length - downloadableRows.length;
  message.success(
    `已开始下载 ${downloadableRows.length} 张原图${
      markSuccess ? '，并标记为已下载' : ''
    }${
      skippedCount > 0 ? `，${skippedCount} 条没有原图 URL` : ''
    }`,
  );
}

const shopNameOptions = ref<PatternDesignItemShopOption[]>([]);
const shopNameOptionsLoading = ref(false);
let shopNameFetchSeq = 0;
let shopNameSearchTimer: ReturnType<typeof setTimeout> | undefined;

function toShopNameOptions(names: string[]): PatternDesignItemShopOption[] {
  return names
    .map((name) => String(name ?? '').trim())
    .filter(Boolean)
    .map((name) => ({ label: name, value: name }));
}

async function fetchShopNameOptions(keyword = '') {
  const seq = ++shopNameFetchSeq;
  shopNameOptionsLoading.value = true;
  try {
    const names = await getFdmdataPatternDesignItemShopNameOptions({
      keyword: keyword.trim() || undefined,
      limit: 50,
    });
    if (seq !== shopNameFetchSeq) return;
    shopNameOptions.value = toShopNameOptions(names);
  } catch (error) {
    if (seq !== shopNameFetchSeq) return;
    console.error('Load pattern design item shop options failed', error);
    shopNameOptions.value = [];
  } finally {
    if (seq === shopNameFetchSeq) {
      shopNameOptionsLoading.value = false;
    }
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
    schema: useGridFormSchema({
      onShopNameSearch: handleShopNameSearch,
      shopNameOptions,
      shopNameOptionsLoading,
    }),
  },
  gridOptions: {
    autoResize: true,
    columns: useGridColumns(),
    height: '100%',
    keepSource: false,
    stripe: true,
    proxyConfig: {
      ajax: {
        query: async ({ page }, formValues) => {
          checkedRows.value = [];
          return getFdmdataPatternDesignItemPage({
            pageNo: page.currentPage,
            pageSize: page.pageSize,
            ...formValues,
          });
        },
      },
    },
    rowConfig: { keyField: 'id', isHover: true },
    toolbarConfig: { refresh: true, search: true },
  } as VxeTableGridOptions<FdmdataPatternDesignItemApi.PatternDesignItem>,
  gridEvents: {
    checkboxAll: handleRowCheckboxChange,
    checkboxChange: handleRowCheckboxChange,
  },
});

onMounted(() => {
  void fetchShopNameOptions();
});

onBeforeUnmount(() => {
  if (shopNameSearchTimer) {
    clearTimeout(shopNameSearchTimer);
  }
});
</script>

<template>
  <Page auto-content-height content-class="flex min-h-0 flex-1 flex-col !p-0">
    <CreateFormModal @success="gridApi.query()" />
    <EditFormModal @success="gridApi.query()" />

    <div class="pattern-design-item-page flex h-full min-h-0 flex-1 flex-col px-4 pb-4">
      <header
        class="flex flex-shrink-0 flex-wrap items-start justify-between gap-3 pt-3 pb-2"
      >
        <div class="min-w-0 flex-1">
          <h2 class="mb-1 text-lg font-semibold text-foreground">
            图案识别订单设计图
          </h2>
          <p class="mb-0 text-xs text-muted-foreground">
            管理订单号、图案明细、设计图 URL 和识别排队顺序，作为图案识别系统索引数据源。
          </p>
        </div>
        <div class="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            :disabled="checkedCount === 0"
            @click="handleBatchDownloadOriginal"
          >
            <template #icon>
              <IconifyIcon icon="lucide:download" />
            </template>
            批量下载原图
          </Button>
          <Button @click="handleExport">
            <template #icon>
              <IconifyIcon icon="lucide:download" />
            </template>
            导出
          </Button>
          <Button type="primary" @click="handleCreate">
            <template #icon>
              <IconifyIcon icon="lucide:plus" />
            </template>
            新增
          </Button>
        </div>
      </header>

      <div class="pattern-design-item-grid min-h-0 flex-1 overflow-hidden">
        <Grid
          class="pattern-design-item-vxe-wrapper"
          grid-class="pattern-design-item-vxe-grid"
          table-title="图案识别订单设计图"
        >
          <template #toolbar-tools>
            <span
              v-if="checkedCount > 0"
              class="text-xs text-muted-foreground"
            >
              已选 {{ checkedCount }} 条
            </span>
          </template>

          <template #actions="{ row }">
            <TableAction
              :actions="[
                {
                  label: '下载原图',
                  type: 'link',
                  icon: ACTION_ICON.DOWNLOAD,
                  disabled: !row.designImageUrl,
                  onClick: handleDownloadOriginal.bind(null, row),
                },
                {
                  label: $t('common.edit'),
                  type: 'link',
                  icon: ACTION_ICON.EDIT,
                  auth: ['fdmdata:pattern-design-item:update'],
                  onClick: handleEdit.bind(null, row),
                },
                {
                  label: $t('common.delete'),
                  type: 'link',
                  danger: true,
                  icon: ACTION_ICON.DELETE,
                  auth: ['fdmdata:pattern-design-item:delete'],
                  popConfirm: {
                    title: $t('ui.actionMessage.deleteConfirm', [row.id]),
                    confirm: handleDelete.bind(null, row),
                  },
                },
              ]"
            />
          </template>
        </Grid>
      </div>
    </div>
  </Page>
</template>

<style scoped>
.pattern-design-item-page,
.pattern-design-item-grid {
  min-height: 0;
}

.pattern-design-item-page {
  height: 100%;
}

.pattern-design-item-grid {
  display: flex;
  flex-direction: column;
  min-height: 420px;
}

.pattern-design-item-grid :deep(.pattern-design-item-vxe-wrapper) {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.pattern-design-item-grid :deep(.pattern-design-item-vxe-grid) {
  flex: 1 1 auto;
  height: 100% !important;
  min-height: 0;
}

.pattern-design-item-grid :deep(.vxe-grid) {
  height: 100%;
}

@media (max-width: 768px) {
  .pattern-design-item-grid {
    min-height: 520px;
  }
}
</style>
