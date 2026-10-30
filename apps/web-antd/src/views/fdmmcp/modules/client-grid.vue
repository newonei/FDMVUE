<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmMcpApi } from '#/api/fdmmcp';

import { useAccess } from '@vben/access';

import { message, Switch } from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { getMcpClientPage, updateMcpClientStatus } from '#/api/fdmmcp';

import { useClientColumns, useClientFormSchema } from '../data';

const { hasAccessByCodes } = useAccess();
const canUpdate = hasAccessByCodes(['fdmmcp:client:update']);

async function handleToggle(row: FdmMcpApi.Client, enabled: boolean) {
  await updateMcpClientStatus(row.id, enabled);
  message.success(
    enabled
      ? `已启用 ${row.clientName}`
      : `已停用 ${row.clientName}，其全部连接立即失效`,
  );
  gridApi.query();
}

const [Grid, gridApi] = useVbenVxeGrid({
  formOptions: { schema: useClientFormSchema() },
  gridOptions: {
    columns: useClientColumns(),
    height: 'auto',
    keepSource: true,
    proxyConfig: {
      ajax: {
        query: async ({ page }, formValues) =>
          getMcpClientPage({
            pageNo: page.currentPage,
            pageSize: page.pageSize,
            ...formValues,
          }),
      },
    },
    rowConfig: { keyField: 'id', isHover: true },
    toolbarConfig: { refresh: true, search: true },
  } as VxeTableGridOptions<FdmMcpApi.Client>,
});
</script>

<template>
  <Grid>
    <template #enabled="{ row }">
      <Switch
        :checked="row.enabled"
        :disabled="!canUpdate"
        @change="(value) => handleToggle(row, Boolean(value))"
      />
    </template>
  </Grid>
</template>
