<!-- 即将到期的合同 -->
<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmNeimaoCrmContractApi } from '#/api/fdmneimaocrm/contract';

import { useRouter } from 'vue-router';

import { Button } from 'ant-design-vue';

import { TableAction, useVbenVxeGrid } from '#/adapter/vxe-table';
import { getContractPage } from '#/api/fdmneimaocrm/contract';
import { useGridColumns } from '#/views/fdmneimaocrm/contract/data';

import { CONTRACT_EXPIRY_TYPE } from '../data';

const { push } = useRouter();

/** 查看审批 */
function handleProcessDetail(row: FdmNeimaoCrmContractApi.Contract) {
  push({
    name: 'BpmProcessInstanceDetail',
    query: { id: row.processInstanceId },
  });
}

/** 打开合同详情 */
function handleContractDetail(row: FdmNeimaoCrmContractApi.Contract) {
  push({ name: 'FdmNeimaoCrmContractDetail', params: { id: row.id } });
}

/** 打开客户详情 */
function handleCustomerDetail(row: FdmNeimaoCrmContractApi.Contract) {
  push({ name: 'FdmNeimaoCrmCustomerDetail', params: { id: row.id } });
}

/** 打开联系人详情 */
function handleContactDetail(row: FdmNeimaoCrmContractApi.Contract) {
  push({ name: 'FdmNeimaoCrmContactDetail', params: { id: row.id } });
}

/** 打开商机详情 */
function handleBusinessDetail(row: FdmNeimaoCrmContractApi.Contract) {
  push({ name: 'FdmNeimaoCrmBusinessDetail', params: { id: row.id } });
}

const [Grid] = useVbenVxeGrid({
  formOptions: {
    schema: [
      {
        fieldName: 'expiryType',
        label: '到期状态',
        component: 'Select',
        componentProps: {
          allowClear: true,
          options: CONTRACT_EXPIRY_TYPE,
        },
        defaultValue: CONTRACT_EXPIRY_TYPE[0]!.value,
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
          return await getContractPage({
            pageNo: page.currentPage,
            pageSize: page.pageSize,
            sceneType: 1, // 自己负责的
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
  } as VxeTableGridOptions<FdmNeimaoCrmContractApi.Contract>,
});
</script>

<template>
  <Grid>
    <template #name="{ row }">
      <Button type="link" @click="handleContractDetail(row)">
        {{ row.name }}
      </Button>
    </template>
    <template #customerName="{ row }">
      <Button type="link" @click="handleCustomerDetail(row)">
        {{ row.customerName }}
      </Button>
    </template>
    <template #businessName="{ row }">
      <Button type="link" @click="handleBusinessDetail(row)">
        {{ row.businessName }}
      </Button>
    </template>
    <template #signContactName="{ row }">
      <Button type="link" @click="handleContactDetail(row)">
        {{ row.signContactName }}
      </Button>
    </template>
    <template #actions="{ row }">
      <TableAction
        :actions="[
          {
            label: '查看审批',
            type: 'link',
            auth: ['fdmneimaocrm:contract:update'],
            onClick: handleProcessDetail.bind(null, row),
          },
        ]"
      />
    </template>
  </Grid>
</template>
