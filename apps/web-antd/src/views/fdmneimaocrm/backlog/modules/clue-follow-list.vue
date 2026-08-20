<!-- 分配给我的线索 -->
<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmNeimaoCrmClueApi } from '#/api/fdmneimaocrm/clue';

import { useRouter } from 'vue-router';

import { Button } from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { getCluePage } from '#/api/fdmneimaocrm/clue';
import { useGridColumns } from '#/views/fdmneimaocrm/clue/data';

import { FOLLOWUP_STATUS } from '../data';

const { push } = useRouter();

/** 打开线索详情 */
function handleDetail(row: FdmNeimaoCrmClueApi.Clue) {
  push({ name: 'FdmNeimaoCrmClueDetail', params: { id: row.id } });
}

const [Grid] = useVbenVxeGrid({
  formOptions: {
    schema: [
      {
        fieldName: 'followUpStatus',
        label: '状态',
        component: 'RadioGroup',
        componentProps: {
          allowClear: true,
          options: FOLLOWUP_STATUS,
        },
        defaultValue: false,
      },
    ],
  },
  gridOptions: {
    columns: useGridColumns(),
    height: 'auto',
    keepSource: true,
    proxyConfig: {
      ajax: {
        query: async ({ page }, formValues) => {
          return await getCluePage({
            pageNo: page.currentPage,
            pageSize: page.pageSize,
            sceneType: 1,
            transformStatus: false,
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
  } as VxeTableGridOptions<FdmNeimaoCrmClueApi.Clue>,
});
</script>

<template>
  <Grid>
    <template #name="{ row }">
      <Button type="link" @click="handleDetail(row)">{{ row.name }}</Button>
    </template>
    <template #actions="{ row }">
      <Button type="link" @click="handleDetail(row)">查看详情</Button>
    </template>
  </Grid>
</template>
