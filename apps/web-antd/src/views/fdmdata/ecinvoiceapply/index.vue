<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmdataEcInvoiceApplyApi } from '#/api/fdmdata/ecinvoiceapply';

import { computed, ref } from 'vue';

import { confirm, Page, useVbenModal } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { downloadFileFromBlobPart } from '@vben/utils';

import { Button, message, Tag } from 'ant-design-vue';
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

import { formatInvoiceStatus, useGridColumns, useGridFormSchema } from './data';
import { isInvoiceApplyLocked } from './invoice-lock';
import Form from './modules/form.vue';

defineOptions({ name: 'EcInvoiceApply' });

type StatusTab = 'ALL' | 'DONE' | 'SOON' | 'TODO';
const SOON_DAYS = 3;
const statusTabs: { key: StatusTab; label: string; hint: string }[] = [
  { key: 'TODO', label: '待开票', hint: '还没开票，按截止时间从早到晚排' },
  { key: 'SOON', label: `${SOON_DAYS} 天内截止`, hint: `未开票且 ${SOON_DAYS} 天内到开票截止时间` },
  { key: 'DONE', label: '已开票', hint: '已开票或已上传发票附件' },
  { key: 'ALL', label: '全部', hint: '' },
];
const statusTab = ref<StatusTab>('TODO');
const tabCounts = ref<Partial<Record<StatusTab, number>>>({});
/** 页签条件覆盖查询表单里的开票状态 */
function tabFilter(tab: StatusTab) {
  const now = dayjs();
  switch (tab) {
    case 'DONE': {
      return { invoiceStatus: 1 };
    }
    case 'SOON': {
      return {
        invoiceStatus: 0,
        invoiceDueTime: [
          now.format('YYYY-MM-DD HH:mm:ss'),
          now.add(SOON_DAYS, 'day').format('YYYY-MM-DD HH:mm:ss'),
        ],
        sort: 'DUE',
      };
    }
    case 'TODO': {
      return { invoiceStatus: 0, sort: 'DUE' };
    }
    default: {
      return {};
    }
  }
}
async function loadTabCounts() {
  const results = await Promise.allSettled(
    statusTabs.map((tab) =>
      getEcInvoiceApplyPage({ pageNo: 1, pageSize: 1, ...tabFilter(tab.key) }),
    ),
  );
  const counts: Partial<Record<StatusTab, number>> = {};
  results.forEach((result, index) => {
    if (result.status === 'fulfilled')
      counts[statusTabs[index]!.key] = result.value.total;
  });
  tabCounts.value = counts;
}
function selectTab(tab: StatusTab) {
  if (statusTab.value === tab) return;
  statusTab.value = tab;
  gridApi.query();
}
/** 截止时间倒计时：已过红色，3 天内橙色 */
function dueInfo(row: FdmdataEcInvoiceApplyApi.EcInvoiceApply) {
  const value = row.invoiceDueTime;
  if (value === null || value === undefined || value === '' || value === 0)
    return { text: '—', note: '', tone: '' };
  const due = dayjs(typeof value === 'number' ? value : String(value));
  if (!due.isValid()) return { text: String(value), note: '', tone: '' };
  const text = due.format('MM-DD HH:mm');
  if (isInvoiceApplyLocked(row)) return { text, note: '', tone: 'muted' };
  const hours = due.diff(dayjs(), 'hour');
  if (hours < 0) return { text, note: `已过 ${Math.ceil(-hours / 24)} 天`, tone: 'late' };
  if (hours < 24) return { text, note: `剩 ${Math.max(hours, 0)} 小时`, tone: 'late' };
  const days = Math.floor(hours / 24);
  return { text, note: `剩 ${days} 天`, tone: days < SOON_DAYS ? 'soon' : '' };
}

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

function buildOrderKey(row: FdmdataEcInvoiceApplyApi.EcInvoiceApply) {
  const tid = row.tid?.trim();
  if (!tid) return undefined;
  const platform = (row.platformCode?.trim() || 'MANUAL').toUpperCase();
  let normalizedPlatform = platform;
  if (['TAOBAO', 'TB', 'TM', 'TMALL'].includes(platform)) {
    normalizedPlatform = 'TAOBAO';
  } else if (['DOUYIN', 'DY'].includes(platform)) {
    normalizedPlatform = 'DY';
  } else if (['SPH', 'VIDEO_CHANNEL', 'WECHAT', 'WX'].includes(platform)) {
    normalizedPlatform = 'SPH';
  }
  return `${normalizedPlatform}|${tid.toLocaleLowerCase()}`;
}

function validateSelectedRows(showMessage = false) {
  if (selectedRows.value.length === 0) {
    if (showMessage) message.warning('请选择需要批量开票的申请记录');
    return false;
  }
  const orderKeys = selectedRows.value
    .map(buildOrderKey)
    .filter((key): key is string => Boolean(key));
  if (new Set(orderKeys).size !== orderKeys.length) {
    if (showMessage) {
      message.warning('同一订单只能选择一条，避免重复开票');
    }
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
  if (isInvoiceApplyLocked(row)) {
    message.warning('该订单已开票，不允许修改');
    return;
  }
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
  if (isInvoiceApplyLocked(row)) {
    message.warning('该订单已开票，不允许删除');
    return;
  }
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
  formOptions: {
    collapsed: true,
    collapsedRows: 2,
    schema: useGridFormSchema(),
    showCollapseButton: true,
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
          clearSelectedRows();
          void loadTabCounts();
          return getEcInvoiceApplyPage({
            pageNo: page.currentPage,
            pageSize: page.pageSize,
            ...formValues,
            ...tabFilter(statusTab.value),
          });
        },
      },
    },
    rowConfig: { keyField: 'id', isHover: true },
    toolbarConfig: { custom: true, refresh: true, search: true },
  } as VxeTableGridOptions<FdmdataEcInvoiceApplyApi.EcInvoiceApply>,
  gridEvents: {
    checkboxAll: handleRowCheckboxChange,
    checkboxChange: handleRowCheckboxChange,
  },
});
</script>

<template>
  <Page auto-content-height>
    <FormModal @success="gridApi.query()" />

    <div>
      <Grid
        table-title="电商发票申请"
        table-title-help="管理电商平台发票申请、开票状态和付款方开票信息。其余字段可在右上角列设置里勾选显示。"
      >
        <template #toolbar-actions>
          <div class="status-tabs" role="tablist" aria-label="开票状态">
            <button
              v-for="tab in statusTabs"
              :key="tab.key"
              type="button"
              role="tab"
              :title="tab.hint"
              :aria-selected="statusTab === tab.key"
              :class="{ on: statusTab === tab.key, hot: tab.key === 'SOON' && (tabCounts.SOON ?? 0) > 0 }"
              @click="selectTab(tab.key)"
            >
              {{ tab.label }}<em>{{ tabCounts[tab.key]?.toLocaleString('en-US') ?? '' }}</em>
            </button>
          </div>
        </template>

        <template #status="{ row }">
          <Tag :color="isInvoiceApplyLocked(row) ? 'green' : 'orange'" class="status-tag">
            {{ formatInvoiceStatus({ cellValue: row.invoiceStatus, row }) }}
          </Tag>
        </template>
        <template #due="{ row }">
          <span class="due" :class="dueInfo(row).tone">
            {{ dueInfo(row).text
            }}<small v-if="dueInfo(row).note">{{ dueInfo(row).note }}</small>
          </span>
        </template>
        <template #toolbar-tools>
          <div class="flex flex-wrap items-center gap-2">
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
        </template>
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
                disabled: isInvoiceApplyLocked(row),
                tooltip: isInvoiceApplyLocked(row)
                  ? '已开票记录不能修改'
                  : undefined,
                auth: ['fdmdata:ecinvoiceapply:update'],
                onClick: handleEdit.bind(null, row),
              },
              {
                label: $t('common.delete'),
                type: 'link',
                danger: true,
                icon: ACTION_ICON.DELETE,
                disabled: isInvoiceApplyLocked(row),
                tooltip: isInvoiceApplyLocked(row)
                  ? '已开票记录不能删除'
                  : undefined,
                auth: ['fdmdata:ecinvoiceapply:delete'],
                onClick: handleDelete.bind(null, row),
              },
            ]"
          />
        </template>
      </Grid>
    </div>
  </Page>
</template>

<style scoped>
.status-tabs {
  display: inline-flex;
  gap: 4px;
  padding: 3px;
  background: hsl(var(--muted));
  border-radius: 8px;
}

.status-tabs button {
  padding: 3px 12px;
  font: inherit;
  font-size: 13px;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 6px;
}

.status-tabs button.on {
  font-weight: 600;
  color: hsl(var(--primary));
  background: hsl(var(--card));
}

.status-tabs button.hot em {
  color: hsl(var(--destructive));
}

.status-tabs button:focus-visible {
  outline: 2px solid hsl(var(--primary));
  outline-offset: 1px;
}

.status-tabs em {
  margin-left: 4px;
  font-style: normal;
  font-variant-numeric: tabular-nums;
}

.status-tag {
  margin: 0;
}

.due {
  display: inline-flex;
  gap: 6px;
  align-items: baseline;
  font-variant-numeric: tabular-nums;
}

.due small {
  font-size: 12px;
}

.due.late {
  color: hsl(var(--destructive));
}

.due.soon small {
  font-weight: 600;
  color: color-mix(in srgb, hsl(var(--warning)) 55%, hsl(var(--foreground)));
}

.due.muted {
  color: hsl(var(--muted-foreground));
}
</style>
