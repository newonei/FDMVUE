<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { ErpPurchaseReturnApi } from '#/api/erp/purchase/return';

import { ref } from 'vue';

import { DocAlert, Page, useVbenModal } from '@vben/common-ui';
import { downloadFileFromBlobPart, isEmpty } from '@vben/utils';

import { Alert, Input, message, Modal } from 'ant-design-vue';

import { ACTION_ICON, TableAction, useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  deletePurchaseReturn,
  exportPurchaseReturn,
  getPurchaseReturnPage,
  updatePurchaseReturnStatus,
} from '#/api/erp/purchase/return';
import { $t } from '#/locales';

import { useGridColumns, useGridFormSchema } from './data';
import Form from './modules/form.vue';
import { validatePurchaseReturnReverseReason } from './status-policy';

/** ERP 采购退货列表 */
defineOptions({ name: 'ErpPurchaseReturn' });

const [FormModal, formModalApi] = useVbenModal({
  connectedComponent: Form,
  destroyOnClose: true,
});

const reverseOpen = ref(false);
const reverseReason = ref('');
const reverseReasonError = ref('');
const reverseRow = ref<ErpPurchaseReturnApi.PurchaseReturn>();
const statusUpdating = ref(false);

/** 刷新表格 */
function handleRefresh() {
  gridApi.query();
}

const checkedIds = ref<number[]>([]);
function handleRowCheckboxChange({
  records,
}: {
  records: ErpPurchaseReturnApi.PurchaseReturn[];
}) {
  checkedIds.value = records.map((item) => item.id!);
}

/** 新增采购退货 */
function handleCreate() {
  formModalApi.setData({ formType: 'create' }).open();
}

/** 编辑采购退货 */
function handleEdit(row: ErpPurchaseReturnApi.PurchaseReturn) {
  formModalApi.setData({ formType: 'edit', id: row.id }).open();
}

/** 查看详情 */
function handleDetail(row: ErpPurchaseReturnApi.PurchaseReturn) {
  formModalApi.setData({ formType: 'detail', id: row.id }).open();
}

/** 删除采购退货 */
async function handleDelete(ids: number[]) {
  const hideLoading = message.loading({
    content: $t('ui.actionMessage.deleting'),
    duration: 0,
  });
  try {
    await deletePurchaseReturn(ids);
    message.success($t('ui.actionMessage.deleteSuccess'));
    handleRefresh();
  } finally {
    hideLoading();
  }
}

/** 过账/反过账操作。reason 只允许在反过账 PROCESS/10 时发送。 */
async function handleUpdateStatus(
  row: ErpPurchaseReturnApi.PurchaseReturn,
  status: number,
  reason?: string,
) {
  if (row.id === undefined || statusUpdating.value) return;
  const action = status === 20 ? '过账' : '反过账';
  statusUpdating.value = true;
  const hideLoading = message.loading({
    content: `正在${action}采购退货单…`,
    duration: 0,
  });
  try {
    await updatePurchaseReturnStatus(row.id, status, reason);
    message.success(`${action}成功`);
    handleRefresh();
  } finally {
    hideLoading();
    statusUpdating.value = false;
  }
}

function openReverse(row: ErpPurchaseReturnApi.PurchaseReturn) {
  if (statusUpdating.value || row.id === undefined || row.status !== 20) return;
  reverseRow.value = row;
  reverseReason.value = '';
  reverseReasonError.value = '';
  reverseOpen.value = true;
}

function closeReverse() {
  if (statusUpdating.value) return;
  reverseOpen.value = false;
  reverseRow.value = undefined;
  reverseReason.value = '';
  reverseReasonError.value = '';
}

async function confirmReverse() {
  const row = reverseRow.value;
  if (statusUpdating.value || !row || row.status !== 20) return;
  const validated = validatePurchaseReturnReverseReason(reverseReason.value);
  if (!validated.valid) {
    reverseReasonError.value = validated.error;
    return;
  }
  reverseReasonError.value = '';
  await handleUpdateStatus(row, 10, validated.reason);
  reverseOpen.value = false;
  reverseRow.value = undefined;
  reverseReason.value = '';
}

/** 导出表格 */
async function handleExport() {
  const data = await exportPurchaseReturn(await gridApi.formApi.getValues());
  downloadFileFromBlobPart({ fileName: '采购退货.xls', source: data });
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
          return await getPurchaseReturnPage({
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
    toolbarConfig: {
      refresh: true,
      search: true,
    },
  } as VxeTableGridOptions<ErpPurchaseReturnApi.PurchaseReturn>,
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
        title="【采购】采购订单、入库、退货"
        url="https://doc.iocoder.cn/erp/purchase/"
      />
    </template>
    <FormModal @success="handleRefresh" />

    <Grid table-title="采购退货列表">
      <template #toolbar-tools>
        <TableAction
          :actions="[
            {
              label: $t('ui.actionTitle.create', ['采购退货']),
              type: 'primary',
              icon: ACTION_ICON.ADD,
              auth: ['erp:purchase-return:create'],
              onClick: handleCreate,
            },
            {
              label: $t('ui.actionTitle.export'),
              type: 'primary',
              icon: ACTION_ICON.DOWNLOAD,
              auth: ['erp:purchase-return:export'],
              onClick: handleExport,
            },
            {
              label: '批量删除',
              type: 'primary',
              danger: true,
              disabled: isEmpty(checkedIds),
              icon: ACTION_ICON.DELETE,
              auth: ['erp:purchase-return:delete'],
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
              auth: ['erp:purchase-return:query'],
              onClick: handleDetail.bind(null, row),
            },
            {
              label: $t('common.edit'),
              type: 'link',
              icon: ACTION_ICON.EDIT,
              auth: ['erp:purchase-return:update'],
              ifShow: () => row.status !== 20,
              onClick: handleEdit.bind(null, row),
            },
            {
              label: row.status === 10 ? '过账' : '反过账',
              type: 'link',
              icon: ACTION_ICON.AUDIT,
              auth: ['erp:purchase-return:update-status'],
              ifShow: () => row.status === 10 || row.status === 20,
              onClick:
                row.status === 20 ? openReverse.bind(null, row) : undefined,
              popConfirm:
                row.status === 10
                  ? {
                      title: `确认过账${row.no}吗？`,
                      confirm: handleUpdateStatus.bind(null, row, 20),
                    }
                  : undefined,
            },
            {
              label: $t('common.delete'),
              type: 'link',
              danger: true,
              icon: ACTION_ICON.DELETE,
              auth: ['erp:purchase-return:delete'],
              popConfirm: {
                title: $t('ui.actionMessage.deleteConfirm', [row.no]),
                confirm: () => handleDelete([row.id!]),
              },
            },
          ]"
        />
      </template>
    </Grid>

    <Modal
      v-model:open="reverseOpen"
      :cancel-button-props="{ disabled: statusUpdating }"
      :closable="!statusUpdating"
      :confirm-loading="statusUpdating"
      destroy-on-close
      :mask-closable="false"
      ok-text="确认反过账"
      title="采购退货反过账"
      @cancel="closeReverse"
      @ok="confirmReverse"
    >
      <Alert
        message="反过账会把当前采购退货单恢复为 DRAFT，并向 FDM 回传可审计的反过账事实；已入库净数量将据此重新计算。请填写真实业务原因。"
        show-icon
        type="warning"
      />
      <p class="purchase-return-reverse-context">
        退货单 {{ reverseRow?.no || '—' }} · ID {{ reverseRow?.id || '—' }}
      </p>
      <Input.TextArea
        v-model:value="reverseReason"
        :auto-size="{ minRows: 3, maxRows: 7 }"
        placeholder="请输入反过账原因（trim 后 1–500 个字符，不得包含控制字符）"
        show-count
        @input="reverseReasonError = ''"
      />
      <p v-if="reverseReasonError" class="purchase-return-reverse-error">
        {{ reverseReasonError }}
      </p>
    </Modal>
  </Page>
</template>

<style scoped>
.purchase-return-reverse-context {
  margin: 14px 0 8px;
  color: hsl(var(--muted-foreground));
}

.purchase-return-reverse-error {
  margin: 6px 0 0;
  font-size: 12px;
  color: rgb(220 38 38);
}
</style>
