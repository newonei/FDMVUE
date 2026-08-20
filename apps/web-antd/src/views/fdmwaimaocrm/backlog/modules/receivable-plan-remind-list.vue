<!-- 待回款提醒 -->
<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmWaimaoCrmReceivablePlanApi } from '#/api/fdmwaimaocrm/receivable/plan';

import { useRouter } from 'vue-router';

import { useVbenModal } from '@vben/common-ui';

import { Button } from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { getReceivablePlanPage } from '#/api/fdmwaimaocrm/receivable/plan';
import Form from '#/views/fdmwaimaocrm/receivable/modules/form.vue';
import { useGridColumns } from '#/views/fdmwaimaocrm/receivable/plan/data';

import { RECEIVABLE_REMIND_TYPE } from '../data';

const { push } = useRouter();

const [FormModal, formModalApi] = useVbenModal({
  connectedComponent: Form,
  destroyOnClose: true,
});

/** 打开回款详情 */
function handleDetail(row: FdmWaimaoCrmReceivablePlanApi.Plan) {
  push({ name: 'FdmWaimaoCrmReceivableDetail', params: { id: row.id } });
}

/** 打开客户详情 */
function handleCustomerDetail(row: FdmWaimaoCrmReceivablePlanApi.Plan) {
  push({ name: 'FdmWaimaoCrmCustomerDetail', params: { id: row.customerId } });
}

/** 创建回款 */
function handleCreateReceivable(row: FdmWaimaoCrmReceivablePlanApi.Plan) {
  formModalApi.setData({ plan: row }).open();
}

const [Grid] = useVbenVxeGrid({
  formOptions: {
    schema: [
      {
        fieldName: 'remindType',
        label: '合同状态',
        component: 'Select',
        componentProps: {
          allowClear: true,
          options: RECEIVABLE_REMIND_TYPE,
        },
        defaultValue: RECEIVABLE_REMIND_TYPE[0]!.value,
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
          return await getReceivablePlanPage({
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
  } as VxeTableGridOptions<FdmWaimaoCrmReceivablePlanApi.Plan>,
});
</script>

<template>
  <div>
    <FormModal />
    <Grid>
      <template #customerName="{ row }">
        <Button type="link" @click="handleCustomerDetail(row)">
          {{ row.customerName }}
        </Button>
      </template>
      <template #period="{ row }">
        <Button type="link" @click="handleDetail(row)">{{ row.period }}</Button>
      </template>
      <template #actions="{ row }">
        <Button type="link" @click="handleCreateReceivable(row)">
          创建回款
        </Button>
      </template>
    </Grid>
  </div>
</template>
