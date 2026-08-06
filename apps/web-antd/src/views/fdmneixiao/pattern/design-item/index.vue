<script lang="ts" setup>
import type { PatternDesignItemShopOption } from './data';

import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmNeixiaoPatternDesignItemApi } from '#/api/fdmneixiao/pattern/design-item';

import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';

import { Page, useVbenModal } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { downloadFileFromBlobPart } from '@vben/utils';

import { Button, message } from 'ant-design-vue';

import { ACTION_ICON, TableAction, useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  deleteFdmNeixiaoPatternDesignItem,
  exportFdmNeixiaoPatternDesignItemExcel,
  getFdmNeixiaoPatternDesignItemPage,
  getFdmNeixiaoPatternDesignItemShopNameOptions,
  markFdmNeixiaoPatternDesignItemDownloaded,
} from '#/api/fdmneixiao/pattern/design-item';
import { $t } from '#/locales';

import { useGridColumns, useGridFormSchema } from './data';
import CreateForm from './modules/create-form.vue';
import EditForm from './modules/edit-form.vue';

defineOptions({ name: 'FdmNeixiaoPatternDesignItem' });

const [CreateFormModal, createFormModalApi] = useVbenModal({
  connectedComponent: CreateForm,
  destroyOnClose: true,
});
const [EditFormModal, editFormModalApi] = useVbenModal({
  connectedComponent: EditForm,
  destroyOnClose: true,
});
const checkedRows = shallowRef<FdmNeixiaoPatternDesignItemApi.PatternDesignItem[]>(
  [],
);
const checkedCount = computed(() => checkedRows.value.length);

const FILENAME_INVALID_CHARS = /[<>:"/\\|?*]/g;

function handleCreate() {
  createFormModalApi.open();
}

function handleEdit(row: FdmNeixiaoPatternDesignItemApi.PatternDesignItem) {
  editFormModalApi.setData(row).open();
}

async function handleDelete(row: FdmNeixiaoPatternDesignItemApi.PatternDesignItem) {
  if (!row.id) return;
  const hideLoading = message.loading({
    content: $t('ui.actionMessage.deleting', [row.id]),
    duration: 0,
  });
  try {
    await deleteFdmNeixiaoPatternDesignItem(row.id);
    message.success($t('ui.actionMessage.deleteSuccess', [row.id]));
    gridApi.query();
  } finally {
    hideLoading();
  }
}

async function handleExport() {
  const formValues = await gridApi.formApi.getValues();
  const data = await exportFdmNeixiaoPatternDesignItemExcel(formValues);
  downloadFileFromBlobPart({
    fileName: '内销定制订单.xls',
    source: data,
  });
}

function handleRowCheckboxChange({
  records,
}: {
  records: FdmNeixiaoPatternDesignItemApi.PatternDesignItem[];
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
  row: FdmNeixiaoPatternDesignItemApi.PatternDesignItem,
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
  rows: FdmNeixiaoPatternDesignItemApi.PatternDesignItem[],
) {
  const ids = rows
    .map((row) => row.id)
    .filter((id): id is number => typeof id === 'number');
  if (ids.length === 0) return;

  await markFdmNeixiaoPatternDesignItemDownloaded(ids);
  rows.forEach((row) => {
    row.downloaded = 1;
  });
}

async function handleDownloadOriginal(
  row: FdmNeixiaoPatternDesignItemApi.PatternDesignItem,
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
    const names = await getFdmNeixiaoPatternDesignItemShopNameOptions({
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
    height: '600px',
    keepSource: false,
    stripe: true,
    proxyConfig: {
      ajax: {
        query: async ({ page }, formValues) => {
          checkedRows.value = [];
          return getFdmNeixiaoPatternDesignItemPage({
            pageNo: page.currentPage,
            pageSize: page.pageSize,
            ...formValues,
          });
        },
      },
    },
    rowConfig: { keyField: 'id', isHover: true },
    toolbarConfig: { refresh: true, search: true },
  } as VxeTableGridOptions<FdmNeixiaoPatternDesignItemApi.PatternDesignItem>,
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
  <Page auto-content-height>
    <CreateFormModal @success="gridApi.query()" />
    <EditFormModal @success="gridApi.query()" />

    <div>
      <header
        class="flex flex-shrink-0 flex-wrap items-start justify-between gap-3 pt-3 pb-2"
      >
        <div class="min-w-0 flex-1">
          <h2 class="mb-1 text-lg font-semibold text-foreground">
            内销定制订单
          </h2>
          <p class="mb-0 text-xs text-muted-foreground">
            管理内销定制订单、图案明细、设计图和处理顺序。
          </p>
        </div>
        <div class="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            v-access:code="['fdmneixiao:pattern-design-item:update']"
            :disabled="checkedCount === 0"
            @click="handleBatchDownloadOriginal"
          >
            <template #icon>
              <IconifyIcon icon="lucide:download" />
            </template>
            批量下载原图
          </Button>
          <Button
            v-access:code="['fdmneixiao:pattern-design-item:export']"
            @click="handleExport"
          >
            <template #icon>
              <IconifyIcon icon="lucide:download" />
            </template>
            导出
          </Button>
          <Button
            v-access:code="['fdmneixiao:pattern-design-item:create']"
            type="primary"
            @click="handleCreate"
          >
            <template #icon>
              <IconifyIcon icon="lucide:plus" />
            </template>
            新增
          </Button>
        </div>
      </header>

      <Grid table-title="内销定制订单">
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
                auth: ['fdmneixiao:pattern-design-item:update'],
                onClick: handleDownloadOriginal.bind(null, row),
              },
              {
                label: $t('common.edit'),
                type: 'link',
                icon: ACTION_ICON.EDIT,
                auth: ['fdmneixiao:pattern-design-item:update'],
                onClick: handleEdit.bind(null, row),
              },
              {
                label: $t('common.delete'),
                type: 'link',
                danger: true,
                icon: ACTION_ICON.DELETE,
                auth: ['fdmneixiao:pattern-design-item:delete'],
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
  </Page>
</template>
