<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmdataEcInvoiceApplyApi } from '#/api/fdmdata/ecinvoiceapply';

import { computed, ref } from 'vue';

import { confirm, Page, useVbenModal } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { downloadFileFromBlobPart } from '@vben/utils';

import { Button, message } from 'ant-design-vue';
import dayjs from 'dayjs';

import { ACTION_ICON, TableAction, useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  deleteEcInvoiceApply,
  downloadEcInvoiceApplyPdfZip,
  exportEcInvoiceApplyEtaxExcel,
  getEcInvoiceApplyPage,
  uploadEcInvoiceApplyPdf,
} from '#/api/fdmdata/ecinvoiceapply';
import { $t } from '#/locales';

import { useGridColumns, useGridFormSchema } from './data';
import Form from './modules/form.vue';

defineOptions({ name: 'EcInvoiceApply' });

const [FormModal, formModalApi] = useVbenModal({ connectedComponent: Form });
const selectedRows = ref<FdmdataEcInvoiceApplyApi.EcInvoiceApply[]>([]);
const exportLoading = ref(false);
const attachmentDownloadLoading = ref(false);
const uploadingInvoiceIds = ref<Set<number>>(new Set());

const MAX_INVOICE_PDF_SIZE = 20 * 1024 * 1024;
const MAX_BATCH_ATTACHMENT_COUNT = 100;

const selectedAttachmentRows = computed(() =>
  selectedRows.value.filter(
    (row) => typeof row.id === 'number' && Boolean(row.invoiceFileUrl?.trim()),
  ),
);

const selectedCompanyNames = computed(() =>
  selectedRows.value.map((row) => row.shopCompanyName?.trim() ?? ''),
);
const selectedCompanyName = computed(() => {
  if (!selectedCompanyNames.value.every(Boolean)) return '';
  const companyNames = new Set(selectedCompanyNames.value);
  return companyNames.size === 1 ? ([...companyNames][0] ?? '') : '';
});
const canExport = computed(
  () => selectedRows.value.length > 0 && Boolean(selectedCompanyName.value),
);

function clearSelectedRows() {
  selectedRows.value = [];
}

function validateSelectedRows(showMessage = false) {
  if (selectedRows.value.length === 0) {
    if (showMessage) message.warning('请选择需要批量开票的申请记录');
    return false;
  }
  if (selectedCompanyNames.value.some((companyName) => !companyName)) {
    if (showMessage) {
      message.warning('所选记录存在店铺主体公司为空的数据，请先完善公司配置');
    }
    return false;
  }
  if (new Set(selectedCompanyNames.value).size > 1) {
    if (showMessage) {
      message.warning('一次只能选择同一店铺主体公司的开票申请，请重新选择');
    }
    return false;
  }
  return true;
}

function handleRowCheckboxChange({
  records,
}: {
  records: FdmdataEcInvoiceApplyApi.EcInvoiceApply[];
}) {
  selectedRows.value = [...records];
}

function handleCreate() {
  formModalApi.setData(null).open();
}

function handleEdit(row: FdmdataEcInvoiceApplyApi.EcInvoiceApply) {
  formModalApi.setData(row).open();
}

function isInvoicePdfUploading(id?: number) {
  return typeof id === 'number' && uploadingInvoiceIds.value.has(id);
}

function setInvoicePdfUploading(id: number, uploading: boolean) {
  const next = new Set(uploadingInvoiceIds.value);
  if (uploading) {
    next.add(id);
  } else {
    next.delete(id);
  }
  uploadingInvoiceIds.value = next;
}

function handleUploadInvoicePdf(row: FdmdataEcInvoiceApplyApi.EcInvoiceApply) {
  if (!row.id || isInvoicePdfUploading(row.id)) return;

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.pdf,application/pdf';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      message.error('请选择 PDF 格式的发票文件');
      return;
    }
    if (file.size > MAX_INVOICE_PDF_SIZE) {
      message.error('发票 PDF 不能超过 20 MB');
      return;
    }

    setInvoicePdfUploading(row.id!, true);
    const hideLoading = message.loading({
      content: `正在上传 ${file.name}`,
      duration: 0,
    });
    try {
      await uploadEcInvoiceApplyPdf(row.id!, file);
      message.success('发票 PDF 上传成功，已标记为已开票');
      await gridApi.query();
    } finally {
      hideLoading();
      setInvoicePdfUploading(row.id!, false);
    }
  });
  input.click();
}

function sanitizeAttachmentFileName(value: string) {
  return value.replaceAll(/[\\/:*?"<>|]/g, '_');
}

function buildAttachmentDownloadUrl(url: string, fileName: string) {
  try {
    const parsed = new URL(url, window.location.origin);
    parsed.searchParams.set('attname', fileName);
    return parsed.toString();
  } catch {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}attname=${encodeURIComponent(fileName)}`;
  }
}

function handleDownloadInvoicePdf(
  row: FdmdataEcInvoiceApplyApi.EcInvoiceApply,
) {
  const url = row.invoiceFileUrl?.trim();
  if (!url) {
    message.warning('当前记录还没有上传发票附件');
    return;
  }
  const fallbackName = `发票-${row.tid || row.id || '附件'}.pdf`;
  const fileName = sanitizeAttachmentFileName(
    row.invoiceFileName?.trim() || fallbackName,
  );
  const link = document.createElement('a');
  link.href = buildAttachmentDownloadUrl(url, fileName);
  link.download = fileName;
  link.rel = 'noopener noreferrer';
  link.target = '_blank';
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
}

async function handleBatchDownloadInvoicePdfs() {
  if (selectedRows.value.length === 0) {
    message.warning('请先勾选需要下载附件的申请记录');
    return;
  }
  if (selectedAttachmentRows.value.length === 0) {
    message.warning('所选记录均未上传发票附件');
    return;
  }
  if (selectedAttachmentRows.value.length > MAX_BATCH_ATTACHMENT_COUNT) {
    message.warning(`单次最多下载 ${MAX_BATCH_ATTACHMENT_COUNT} 个发票附件`);
    return;
  }

  const ids = selectedAttachmentRows.value.map((row) => row.id as number);
  const skippedCount = selectedRows.value.length - ids.length;
  attachmentDownloadLoading.value = true;
  try {
    const data = await downloadEcInvoiceApplyPdfZip(ids);
    downloadFileFromBlobPart({
      fileName: `电商发票附件-${dayjs().format('YYYYMMDDHHmmss')}.zip`,
      source: data,
    });
    if (skippedCount > 0) {
      message.warning(
        `已下载 ${ids.length} 个附件，另有 ${skippedCount} 条记录尚未上传附件，已跳过`,
      );
    } else {
      message.success(`已打包下载 ${ids.length} 个发票附件`);
    }
  } finally {
    attachmentDownloadLoading.value = false;
  }
}

async function handleDelete(row: FdmdataEcInvoiceApplyApi.EcInvoiceApply) {
  if (!row.id) return;
  try {
    await confirm($t('ui.actionMessage.deleteConfirm', [row.id]));
  } catch {
    return;
  }

  const hideLoading = message.loading({
    content: $t('ui.actionMessage.deleting', [row.id]),
    duration: 0,
  });
  try {
    await deleteEcInvoiceApply(row.id);
    message.success($t('ui.actionMessage.deleteSuccess', [row.id]));
    gridApi.query();
  } finally {
    hideLoading();
  }
}

async function handleExport() {
  if (!validateSelectedRows(true)) return;

  const ids = selectedRows.value
    .map((row) => row.id)
    .filter((id): id is number => typeof id === 'number');
  if (ids.length !== selectedRows.value.length) {
    message.warning('所选申请数据无效，请刷新列表后重试');
    return;
  }

  const companyName = selectedCompanyName.value;
  exportLoading.value = true;
  try {
    const data = await exportEcInvoiceApplyEtaxExcel(ids);
    downloadFileFromBlobPart({
      fileName: `${companyName}-电子税务局批量开票模板.xlsx`,
      source: data,
    });
  } finally {
    exportLoading.value = false;
  }
}

const [Grid, gridApi] = useVbenVxeGrid({
  formOptions: { schema: useGridFormSchema() },
  gridOptions: {
    autoResize: true,
    columns: useGridColumns(),
    height: '100%',
    keepSource: false,
    stripe: true,
    proxyConfig: {
      ajax: {
        query: async ({ page }, formValues) => {
          clearSelectedRows();
          return getEcInvoiceApplyPage({
            pageNo: page.currentPage,
            pageSize: page.pageSize,
            ...formValues,
          });
        },
      },
    },
    rowConfig: { keyField: 'id', isHover: true },
    toolbarConfig: { refresh: true, search: true },
  } as VxeTableGridOptions<FdmdataEcInvoiceApplyApi.EcInvoiceApply>,
  gridEvents: {
    checkboxAll: handleRowCheckboxChange,
    checkboxChange: handleRowCheckboxChange,
  },
});
</script>

<template>
  <Page auto-content-height content-class="flex min-h-0 flex-1 flex-col !p-0">
    <FormModal @success="gridApi.query()" />

    <div class="invoice-page flex h-full min-h-0 flex-1 flex-col px-4 pb-4">
      <header
        class="flex flex-shrink-0 flex-wrap items-start justify-between gap-3 pt-3 pb-2"
      >
        <div class="min-w-0 flex-1">
          <h2 class="mb-1 text-lg font-semibold text-foreground">
            电商发票申请
          </h2>
          <p class="mb-0 text-xs text-muted-foreground">
            管理电商平台发票申请、开票状态和付款方开票信息。
          </p>
        </div>
        <div class="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            :disabled="selectedRows.length === 0"
            :loading="attachmentDownloadLoading"
            @click="handleBatchDownloadInvoicePdfs"
          >
            <template #icon>
              <IconifyIcon icon="lucide:files" />
            </template>
            批量下载附件（{{ selectedAttachmentRows.length }}）
          </Button>
          <Button
            :disabled="!canExport"
            :loading="exportLoading"
            @click="handleExport"
          >
            <template #icon>
              <IconifyIcon icon="lucide:download" />
            </template>
            导出电子税务局模板（{{ selectedRows.length }}）
          </Button>
          <Button type="primary" @click="handleCreate">
            <template #icon>
              <IconifyIcon icon="lucide:plus" />
            </template>
            新增
          </Button>
        </div>
      </header>

      <div class="invoice-grid min-h-0 flex-1 overflow-hidden">
        <Grid
          class="invoice-vxe-wrapper"
          grid-class="invoice-vxe-grid"
          table-title="电商发票申请"
        >
          <template #attachment="{ row }">
            <Button
              v-if="row.invoiceFileUrl"
              size="small"
              type="link"
              @click="handleDownloadInvoicePdf(row)"
            >
              <template #icon>
                <IconifyIcon icon="lucide:paperclip" />
              </template>
              下载
            </Button>
            <span v-else class="text-muted-foreground">-</span>
          </template>
          <template #actions="{ row }">
            <TableAction
              :actions="[
                {
                  label: '上传',
                  type: 'link',
                  icon: ACTION_ICON.UPLOAD,
                  loading: isInvoicePdfUploading(row.id),
                  disabled: isInvoicePdfUploading(row.id),
                  auth: ['fdmdata:ecinvoiceapply:update'],
                  onClick: handleUploadInvoicePdf.bind(null, row),
                },
                {
                  label: $t('common.edit'),
                  type: 'link',
                  icon: ACTION_ICON.EDIT,
                  auth: ['fdmdata:ecinvoiceapply:update'],
                  onClick: handleEdit.bind(null, row),
                },
                {
                  label: $t('common.delete'),
                  type: 'link',
                  danger: true,
                  icon: ACTION_ICON.DELETE,
                  auth: ['fdmdata:ecinvoiceapply:delete'],
                  onClick: handleDelete.bind(null, row),
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
.invoice-page,
.invoice-grid {
  min-height: 0;
}

.invoice-page {
  height: 100%;
}

.invoice-grid {
  display: flex;
  flex-direction: column;
  min-height: 420px;
}

.invoice-grid :deep(.invoice-vxe-wrapper) {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.invoice-grid :deep(.invoice-vxe-grid) {
  flex: 1 1 auto;
  height: 100% !important;
  min-height: 0;
}

.invoice-grid :deep(.vxe-grid) {
  height: 100%;
}

@media (max-width: 768px) {
  .invoice-grid {
    min-height: 520px;
  }
}
</style>
