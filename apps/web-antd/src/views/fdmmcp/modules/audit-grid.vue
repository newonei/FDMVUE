<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmMcpApi } from '#/api/fdmmcp';

import { Tag } from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { getMcpAuditLogPage } from '#/api/fdmmcp';

import { useAuditColumns, useAuditFormSchema } from '../data';

const [Grid] = useVbenVxeGrid({
  formOptions: { schema: useAuditFormSchema() },
  gridOptions: {
    columns: useAuditColumns(),
    height: 'auto',
    keepSource: true,
    proxyConfig: {
      ajax: {
        query: async ({ page }, formValues) =>
          getMcpAuditLogPage({
            pageNo: page.currentPage,
            pageSize: page.pageSize,
            ...formValues,
          }),
      },
    },
    rowConfig: { keyField: 'id', isHover: true },
    toolbarConfig: { refresh: true, search: true },
  } as VxeTableGridOptions<FdmMcpApi.AuditLog>,
});
</script>

<template>
  <Grid>
    <template #result="{ row }">
      <Tag :color="row.resultCode === 'SUCCESS' ? 'green' : 'red'">
        {{ row.resultCode }}
      </Tag>
    </template>
  </Grid>
</template>
