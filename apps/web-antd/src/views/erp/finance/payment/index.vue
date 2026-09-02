<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { ErpFinancePaymentApi } from '#/api/erp/finance/payment';

import { ref } from 'vue';

import { useAccess } from '@vben/access';
import { DocAlert, Page, useVbenModal } from '@vben/common-ui';
import { downloadFileFromBlobPart, isEmpty } from '@vben/utils';

import { message } from 'ant-design-vue';

import { ACTION_ICON, TableAction, useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  deleteFinancePayment,
  exportFinancePayment,
  getAllocatedV2Payment,
  getFinancePaymentPage,
  postAllocatedV2Payment,
  updateFinancePaymentStatus,
} from '#/api/erp/finance/payment';
import { $t } from '#/locales';

import {
  canEditAllocatedV2,
  canPostAllocatedV2,
  canReverseAllocatedV2,
  isAllocatedV2,
} from './allocated-v2-policy';
import { useGridColumns, useGridFormSchema } from './data';
import AllocatedV2Form from './modules/allocated-v2-form.vue';
import AllocatedV2ReverseModal from './modules/allocated-v2-reverse-modal.vue';
import Form from './modules/form.vue';

/** ERP 付款单列表 */
defineOptions({ name: 'ErpFinancePayment' });

const { hasAccessByCodes } = useAccess();

function hasAllPermissions(codes: string[]) {
  return codes.every((code) => hasAccessByCodes([code]));
}

function canEditAllocatedV2ForCurrentUser(
  row: ErpFinancePaymentApi.FinancePaymentPageItem,
) {
  return (
    canEditAllocatedV2(row) &&
    hasAllPermissions([
      'erp:finance-payment:create', // allocation-preview 当前使用 create 权限
      'erp:finance-payment:query', // allocated-v2/get
      'erp:finance-payment:update',
    ])
  );
}

const [FormModal, formModalApi] = useVbenModal({
  connectedComponent: Form,
  destroyOnClose: true,
});

const [AllocatedV2FormModal, allocatedV2FormModalApi] = useVbenModal({
  connectedComponent: AllocatedV2Form,
  destroyOnClose: true,
});

const [AllocatedV2Reverse, allocatedV2ReverseApi] = useVbenModal({
  connectedComponent: AllocatedV2ReverseModal,
  destroyOnClose: true,
});

/** 刷新表格 */
function handleRefresh() {
  gridApi.query();
}

/** 导出表格 */
async function handleExport() {
  const data = await exportFinancePayment(await gridApi.formApi.getValues());
  downloadFileFromBlobPart({ fileName: '付款单.xls', source: data });
}

/** 新增付款单 */
function handleCreate() {
  formModalApi.setData({ formType: 'create' }).open();
}

/** 新建与旧付款明细完全隔离的 V2 供应商结算草稿。 */
function handleCreateAllocatedV2() {
  allocatedV2FormModalApi.setData({ formType: 'create' }).open();
}

/** 编辑付款单 */
function handleEdit(row: ErpFinancePaymentApi.FinancePaymentPageItem) {
  if (isAllocatedV2(row)) {
    if (!canEditAllocatedV2ForCurrentUser(row)) {
      message.warning('当前 V2 结算已过账或版本状态不完整，不能编辑');
      return;
    }
    allocatedV2FormModalApi.setData({ formType: 'edit', payment: row }).open();
    return;
  }
  formModalApi.setData({ formType: 'edit', id: Number(row.id) }).open();
}

/** 删除付款单 */
async function handleDelete(ids: number[]) {
  const hideLoading = message.loading({
    content: $t('ui.actionMessage.deleting'),
    duration: 0,
  });
  try {
    await deleteFinancePayment(ids);
    message.success($t('ui.actionMessage.deleteSuccess'));
    handleRefresh();
  } finally {
    hideLoading();
  }
}

/** 审批/反审批操作 */
async function handleUpdateStatus(
  row: ErpFinancePaymentApi.FinancePaymentPageItem,
  status: number,
) {
  const hideLoading = message.loading({
    content: `确定${status === 20 ? '审批' : '反审批'}该付款单吗？`,
    duration: 0,
  });
  try {
    await updateFinancePaymentStatus(Number(row.id), status);
    message.success(`${status === 20 ? '审批' : '反审批'}成功`);
    handleRefresh();
  } finally {
    hideLoading();
  }
}

const checkedIds = ref<number[]>([]);
function handleRowCheckboxChange({
  records,
}: {
  records: ErpFinancePaymentApi.FinancePaymentPageItem[];
}) {
  checkedIds.value = records
    .filter((item) => !isAllocatedV2(item))
    .map((item) => Number(item.id));
}

/** 查看详情 */
function handleDetail(row: ErpFinancePaymentApi.FinancePaymentPageItem) {
  if (isAllocatedV2(row)) {
    allocatedV2FormModalApi
      .setData({ formType: 'detail', payment: row })
      .open();
    return;
  }
  formModalApi.setData({ formType: 'detail', id: Number(row.id) }).open();
}

/** 过账是 V2 唯一可改变义务余额的正向动作。 */
async function handlePostAllocatedV2(
  row: ErpFinancePaymentApi.FinancePaymentPageItem,
) {
  if (!row.id || !canPostAllocatedV2(row)) {
    message.warning('当前结算状态或并发版本不允许过账');
    return;
  }
  const hideLoading = message.loading({
    content: '正在锁定义务余额并过账…',
    duration: 0,
  });
  try {
    const payment = await getAllocatedV2Payment(String(row.id));
    if (!canPostAllocatedV2(payment)) {
      message.warning('服务端最新结算状态已变更，请刷新后再操作');
      handleRefresh();
      return;
    }
    await postAllocatedV2Payment({
      expectedVersion: payment.version,
      id: payment.id,
    });
    message.success('V2 结算已过账，供应商义务余额已更新');
    handleRefresh();
  } finally {
    hideLoading();
  }
}

async function handleReverseAllocatedV2(
  row: ErpFinancePaymentApi.FinancePaymentPageItem,
) {
  if (!row.id || !canReverseAllocatedV2(row)) {
    message.warning('当前结算状态或并发版本不允许冲销');
    return;
  }
  const hideLoading = message.loading({
    content: '正在读取最新过账版本…',
    duration: 0,
  });
  try {
    const payment = await getAllocatedV2Payment(String(row.id));
    if (!canReverseAllocatedV2(payment)) {
      message.warning('服务端最新结算状态已变更，请刷新后再操作');
      handleRefresh();
      return;
    }
    allocatedV2ReverseApi
      .setData({
        expectedVersion: payment.version,
        id: payment.id,
        no: payment.no,
      })
      .open();
  } finally {
    hideLoading();
  }
}

const [Grid, gridApi] = useVbenVxeGrid({
  formOptions: {
    schema: useGridFormSchema(),
  },
  gridOptions: {
    columns: useGridColumns(),
    height: 'auto',
    keepSource: true,
    proxyConfig: {
      ajax: {
        query: async ({ page }, formValues) => {
          return await getFinancePaymentPage({
            pageNo: page.currentPage,
            pageSize: page.pageSize,
            ...formValues,
          });
        },
      },
    },
    rowConfig: {
      keyField: 'id',
      isHover: true,
    },
    checkboxConfig: {
      checkMethod: ({ row }) => !isAllocatedV2(row),
    },
    toolbarConfig: {
      refresh: true,
      search: true,
    },
  } as VxeTableGridOptions<ErpFinancePaymentApi.FinancePaymentPageItem>,
  gridEvents: {
    checkboxAll: handleRowCheckboxChange,
    checkboxChange: handleRowCheckboxChange,
  },
});
</script>

<template>
  <Page auto-content-height>
    <template #doc>
      <DocAlert
        title="【财务】采购付款、销售收款"
        url="https://doc.iocoder.cn/sale/finance-payment-receipt/"
      />
    </template>

    <FormModal @success="handleRefresh" />
    <AllocatedV2FormModal @success="handleRefresh" />
    <AllocatedV2Reverse @success="handleRefresh" />
    <Grid table-title="付款单列表">
      <template #toolbar-tools>
        <TableAction
          :actions="[
            {
              label: $t('ui.actionTitle.create', ['付款单']),
              type: 'primary',
              icon: ACTION_ICON.ADD,
              auth: ['erp:finance-payment:create'],
              onClick: handleCreate,
            },
            {
              label: '新建供应商结算 V2',
              type: 'primary',
              icon: ACTION_ICON.ADD,
              auth: ['erp:finance-payment:create'],
              onClick: handleCreateAllocatedV2,
            },
            {
              label: $t('ui.actionTitle.export'),
              type: 'primary',
              icon: ACTION_ICON.DOWNLOAD,
              auth: ['erp:finance-payment:export'],
              onClick: handleExport,
            },
            {
              label: '批量删除',
              type: 'primary',
              danger: true,
              disabled: isEmpty(checkedIds),
              icon: ACTION_ICON.DELETE,
              auth: ['erp:finance-payment:delete'],
              popConfirm: {
                title: `是否删除所选中数据？`,
                confirm: handleDelete.bind(null, checkedIds),
              },
            },
          ]"
        />
      </template>
      <template #actions="{ row }">
        <TableAction
          :actions="[
            {
              label: $t('common.detail'),
              type: 'link',
              icon: ACTION_ICON.VIEW,
              auth: ['erp:finance-payment:query'],
              onClick: handleDetail.bind(null, row),
            },
            {
              label: $t('common.edit'),
              type: 'link',
              icon: ACTION_ICON.EDIT,
              auth: ['erp:finance-payment:update'],
              ifShow: () =>
                isAllocatedV2(row)
                  ? canEditAllocatedV2ForCurrentUser(row)
                  : row.status !== 20,
              onClick: handleEdit.bind(null, row),
            },
            {
              label: row.status === 10 ? '审批' : '反审批',
              type: 'link',
              icon: ACTION_ICON.AUDIT,
              auth: ['erp:finance-payment:update-status'],
              ifShow: () => !isAllocatedV2(row),
              popConfirm: {
                title: `确认${row.status === 10 ? '审批' : '反审批'}${row.no}吗？`,
                confirm: handleUpdateStatus.bind(
                  null,
                  row,
                  row.status === 10 ? 20 : 10,
                ),
              },
            },
            {
              label: '过账',
              type: 'link',
              icon: ACTION_ICON.AUDIT,
              auth: ['erp:finance-payment:update-status'],
              ifShow: () =>
                canPostAllocatedV2(row) &&
                hasAllPermissions(['erp:finance-payment:query']),
              popConfirm: {
                title: `确认过账 ${row.no} 并核销对应供应商义务余额吗？`,
                confirm: handlePostAllocatedV2.bind(null, row),
              },
            },
            {
              label: '冲销',
              type: 'link',
              danger: true,
              icon: ACTION_ICON.AUDIT,
              auth: ['erp:finance-payment:update-status'],
              ifShow: () =>
                canReverseAllocatedV2(row) &&
                hasAllPermissions(['erp:finance-payment:query']),
              onClick: handleReverseAllocatedV2.bind(null, row),
            },
            {
              label: $t('common.delete'),
              type: 'link',
              danger: true,
              icon: ACTION_ICON.DELETE,
              auth: ['erp:finance-payment:delete'],
              ifShow: () => !isAllocatedV2(row),
              popConfirm: {
                title: $t('ui.actionMessage.deleteConfirm', [row.no]),
                confirm: handleDelete.bind(null, [Number(row.id)]),
              },
            },
          ]"
        />
      </template>
    </Grid>
  </Page>
</template>
