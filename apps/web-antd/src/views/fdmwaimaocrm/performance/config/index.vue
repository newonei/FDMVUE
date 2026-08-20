<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmWaimaoCrmPerformanceConfigApi } from '#/api/fdmwaimaocrm/performance/config';

import { Page, useVbenModal } from '@vben/common-ui';

import { message } from 'ant-design-vue';

import { ACTION_ICON, TableAction, useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  deletePerformanceConfig,
  getPerformanceConfigPage,
  PerformanceConfigObjectTypeEnum,
} from '#/api/fdmwaimaocrm/performance/config';
import { $t } from '#/locales';

import {
  getBizTypeLabel,
  getObjectTypeLabel,
  useGridColumns,
  useGridFormSchema,
} from './data';
import Form from './modules/form.vue';

const [FormModal, formModalApi] = useVbenModal({
  connectedComponent: Form,
  destroyOnClose: true,
});

/** 刷新表格 */
function handleRefresh() {
  gridApi.query();
}

/** 创建业绩目标 */
function handleCreate() {
  formModalApi.setData(null).open();
}

/** 编辑业绩目标 */
function handleEdit(row: FdmWaimaoCrmPerformanceConfigApi.PerformanceConfig) {
  formModalApi.setData(row).open();
}

/** 删除业绩目标 */
async function handleDelete(
  row: FdmWaimaoCrmPerformanceConfigApi.PerformanceConfig,
) {
  const hideLoading = message.loading({
    content: $t('ui.actionMessage.deleting', ['业绩目标']),
    duration: 0,
  });
  try {
    await deletePerformanceConfig(row.id!);
    message.success($t('ui.actionMessage.deleteSuccess', ['业绩目标']));
    handleRefresh();
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
          let objectId: number | undefined;
          if (formValues.objectType === PerformanceConfigObjectTypeEnum.DEPT) {
            objectId = formValues.deptObjectId;
          } else if (
            formValues.objectType === PerformanceConfigObjectTypeEnum.USER
          ) {
            objectId = formValues.userObjectId;
          }
          return await getPerformanceConfigPage({
            pageNo: page.currentPage,
            pageSize: page.pageSize,
            ...formValues,
            deptObjectId: undefined,
            objectId,
            userObjectId: undefined,
            year: formValues.year ? Number(formValues.year) : undefined,
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
  } as VxeTableGridOptions<FdmWaimaoCrmPerformanceConfigApi.PerformanceConfig>,
});
</script>

<template>
  <Page auto-content-height>
    <FormModal @success="handleRefresh" />
    <Grid table-title="业绩目标设置">
      <template #toolbar-tools>
        <TableAction
          :actions="[
            {
              label: $t('ui.actionTitle.create', ['业绩目标']),
              type: 'primary',
              icon: ACTION_ICON.ADD,
              auth: ['fdmwaimaocrm:performance-config:create'],
              onClick: handleCreate,
            },
          ]"
        />
      </template>
      <template #objectType="{ row }">
        {{ getObjectTypeLabel(row.objectType) }}
      </template>
      <template #bizType="{ row }">
        {{ getBizTypeLabel(row.bizType) }}
      </template>
      <template #actions="{ row }">
        <TableAction
          :actions="[
            {
              label: $t('common.edit'),
              type: 'link',
              icon: ACTION_ICON.EDIT,
              auth: ['fdmwaimaocrm:performance-config:update'],
              onClick: handleEdit.bind(null, row),
            },
            {
              label: $t('common.delete'),
              type: 'link',
              danger: true,
              icon: ACTION_ICON.DELETE,
              auth: ['fdmwaimaocrm:performance-config:delete'],
              popConfirm: {
                title: $t('ui.actionMessage.deleteConfirm', ['业绩目标']),
                confirm: handleDelete.bind(null, row),
              },
            },
          ]"
        />
      </template>
    </Grid>
  </Page>
</template>
