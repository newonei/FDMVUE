<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmMcpApi } from '#/api/fdmmcp';

import { message, Tag } from 'ant-design-vue';

import { TableAction, useVbenVxeGrid } from '#/adapter/vxe-table';
import { getMcpConnectionPage, revokeMcpConnection } from '#/api/fdmmcp';

import { useConnectionColumns, useConnectionFormSchema } from '../data';

async function handleRevoke(row: FdmMcpApi.Connection) {
  await revokeMcpConnection(row.id);
  message.success(
    `已撤销 ${row.userNickname ?? row.userId} 的 ${row.clientName} 授权`,
  );
  gridApi.query();
}

const [Grid, gridApi] = useVbenVxeGrid({
  formOptions: { schema: useConnectionFormSchema() },
  gridOptions: {
    columns: useConnectionColumns(),
    height: 'auto',
    keepSource: true,
    proxyConfig: {
      ajax: {
        query: async ({ page }, formValues) =>
          getMcpConnectionPage({
            pageNo: page.currentPage,
            pageSize: page.pageSize,
            ...formValues,
          }),
      },
    },
    rowConfig: { keyField: 'id', isHover: true },
    toolbarConfig: { refresh: true, search: true },
  } as VxeTableGridOptions<FdmMcpApi.Connection>,
});
</script>

<template>
  <Grid>
    <template #status="{ row }">
      <Tag :color="row.revokedTime ? 'default' : 'green'">
        {{ row.revokedTime ? '已撤销' : '有效' }}
      </Tag>
    </template>
    <template #actions="{ row }">
      <TableAction
        v-if="!row.revokedTime"
        :actions="[
          {
            label: '撤销',
            type: 'link',
            danger: true,
            auth: ['fdmmcp:connection:revoke'],
            popConfirm: {
              title: '撤销后该用户的 AI 客户端将立即无法访问，确认？',
              confirm: handleRevoke.bind(null, row),
            },
          },
        ]"
      />
    </template>
  </Grid>
</template>
