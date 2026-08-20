<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmWaimaoCrmCustomerApplicationApi } from '#/api/fdmwaimaocrm/customer-application';

import { Page, useVbenModal } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import { Button, message } from 'ant-design-vue';

import { ACTION_ICON, TableAction, useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  deleteCustomerApplicationDraft,
  getCustomerApplicationDraftPage,
} from '#/api/fdmwaimaocrm/customer-application';

import {
  useCustomerApplicationDraftGridColumns,
  useCustomerApplicationDraftGridFormSchema,
} from './data';
import {
  buildCustomerApplicationDraftPageRequest,
  isCustomerApplicationVersionConflict,
} from './draft-utils';
import DraftForm from './modules/form.vue';

defineOptions({ name: 'FdmWaimaoCrmCustomerApplication' });

const [DraftFormModal, draftFormModalApi] = useVbenModal({
  connectedComponent: DraftForm,
  destroyOnClose: true,
});

function handleCreate() {
  draftFormModalApi.setData(null).open();
}

function handleEdit(
  row: FdmWaimaoCrmCustomerApplicationApi.CustomerApplicationDraft,
) {
  draftFormModalApi.setData({ id: row.id }).open();
}

async function handleDelete(
  row: FdmWaimaoCrmCustomerApplicationApi.CustomerApplicationDraft,
) {
  const hideLoading = message.loading({
    content: `正在删除“${row.customerName}”...`,
    duration: 0,
  });
  try {
    await deleteCustomerApplicationDraft(row.id, row.version);
    message.success('客户申请草稿已删除');
    await gridApi.query();
  } catch (error) {
    if (isCustomerApplicationVersionConflict(error)) {
      message.warning('该草稿已发生变化，列表已刷新，请重新确认后再试');
      await gridApi.query();
    }
  } finally {
    hideLoading();
  }
}

const [Grid, gridApi] = useVbenVxeGrid({
  formOptions: {
    schema: useCustomerApplicationDraftGridFormSchema(),
  },
  gridOptions: {
    autoResize: true,
    columns: useCustomerApplicationDraftGridColumns(),
    height: '600px',
    keepSource: false,
    proxyConfig: {
      ajax: {
        query: async ({ page }, formValues) =>
          getCustomerApplicationDraftPage(
            buildCustomerApplicationDraftPageRequest(
              page.currentPage,
              page.pageSize,
              formValues,
            ),
          ),
      },
    },
    rowConfig: { isHover: true, keyField: 'id' },
    stripe: true,
    toolbarConfig: { refresh: true, search: true },
  } as VxeTableGridOptions<FdmWaimaoCrmCustomerApplicationApi.CustomerApplicationDraft>,
});
</script>

<template>
  <Page auto-content-height>
    <DraftFormModal @success="gridApi.query()" />

    <div>
      <header
        class="flex flex-shrink-0 flex-wrap items-start justify-between gap-3 pt-3 pb-2"
      >
        <div class="min-w-0 flex-1">
          <h2 class="mb-1 text-lg font-semibold text-foreground">
            客户申请草稿
          </h2>
          <p class="mb-0 text-xs text-muted-foreground">
            保存和维护本人录入的客户资料草稿，除客户名称外的信息可稍后继续补充。
          </p>
        </div>
        <Button
          v-access:code="['fdmwaimaocrm:customer-application:create']"
          type="primary"
          @click="handleCreate"
        >
          <template #icon>
            <IconifyIcon icon="lucide:plus" />
          </template>
          新建草稿
        </Button>
      </header>

      <Grid table-title="我的客户申请草稿">
        <template #actions="{ row }">
          <TableAction
            :actions="[
              {
                label: '编辑',
                type: 'link',
                icon: ACTION_ICON.EDIT,
                auth: ['fdmwaimaocrm:customer-application:update'],
                onClick: handleEdit.bind(null, row),
              },
              {
                label: '删除',
                type: 'link',
                danger: true,
                icon: ACTION_ICON.DELETE,
                auth: ['fdmwaimaocrm:customer-application:delete'],
                popConfirm: {
                  title: `确认删除草稿“${row.customerName}”吗？`,
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
