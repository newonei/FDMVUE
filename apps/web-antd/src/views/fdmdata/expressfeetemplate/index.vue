<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmdataExpressFeeTemplateApi } from '#/api/fdmdata/expressfeetemplate';

import { Page, useVbenModal } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import { Button, message } from 'ant-design-vue';

import { ACTION_ICON, TableAction, useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  deleteExpressFeeTemplate,
  getExpressFeeTemplatePage,
} from '#/api/fdmdata/expressfeetemplate';
import { $t } from '#/locales';

import { useGridColumns, useGridFormSchema } from './data';
import Form from './modules/form.vue';
import RuleModal from './modules/rule-modal.vue';

defineOptions({ name: 'FdmdataExpressFeeTemplate' });

const [FormModal, formModalApi] = useVbenModal({ connectedComponent: Form });
const [RuleModalComp, ruleModalApi] = useVbenModal({
  connectedComponent: RuleModal,
});

function handleCreate() {
  formModalApi.setData(null).open();
}

function handleEdit(row: FdmdataExpressFeeTemplateApi.ExpressFeeTemplate) {
  formModalApi.setData(row).open();
}

function handleRules(row: FdmdataExpressFeeTemplateApi.ExpressFeeTemplate) {
  ruleModalApi.setData(row).open();
}

async function handleDelete(row: FdmdataExpressFeeTemplateApi.ExpressFeeTemplate) {
  if (!row.id) return;
  const hideLoading = message.loading({
    content: $t('ui.actionMessage.deleting', [row.id]),
    duration: 0,
  });
  try {
    await deleteExpressFeeTemplate(row.id);
    message.success($t('ui.actionMessage.deleteSuccess', [row.id]));
    gridApi.query();
  } finally {
    hideLoading();
  }
}

const [Grid, gridApi] = useVbenVxeGrid({
  formOptions: { schema: useGridFormSchema() },
  gridOptions: {
    autoResize: true,
    columns: useGridColumns(),
    height: '100%',
    keepSource: false,
    stripe: true,
    proxyConfig: {
      ajax: {
        query: async ({ page }, formValues) =>
          getExpressFeeTemplatePage({
            pageNo: page.currentPage,
            pageSize: page.pageSize,
            ...formValues,
          }),
      },
    },
    rowConfig: { keyField: 'id', isHover: true },
    toolbarConfig: { refresh: true, search: true },
  } as VxeTableGridOptions<FdmdataExpressFeeTemplateApi.ExpressFeeTemplate>,
});
</script>

<template>
  <Page auto-content-height content-class="flex min-h-0 flex-1 flex-col !p-0">
    <FormModal @success="gridApi.query()" />
    <RuleModalComp @success="gridApi.query()" />

    <div class="express-page flex h-full min-h-0 flex-1 flex-col px-4 pb-4">
      <header
        class="flex flex-shrink-0 flex-wrap items-start justify-between gap-3 pt-3 pb-2"
      >
        <div class="min-w-0 flex-1">
          <h2 class="mb-1 text-lg font-semibold text-foreground">
            快递费计费模板
          </h2>
          <p class="mb-0 text-xs text-muted-foreground">
            维护不同快递公司和月份的省份计费规则，用于导入对账时计算预估费用。
          </p>
        </div>
        <Button type="primary" @click="handleCreate">
          <template #icon>
            <IconifyIcon icon="lucide:plus" />
          </template>
          新增模板
        </Button>
      </header>

      <div class="express-grid min-h-0 flex-1 overflow-hidden">
        <Grid
          class="express-vxe-wrapper"
          grid-class="express-vxe-grid"
          table-title="计费模板"
        >
          <template #actions="{ row }">
            <TableAction
              :actions="[
                {
                  label: '规则',
                  type: 'link',
                  icon: 'lucide:settings-2',
                  auth: ['fdmdata:express-fee-rule:query'],
                  onClick: handleRules.bind(null, row),
                },
                {
                  label: $t('common.edit'),
                  type: 'link',
                  icon: ACTION_ICON.EDIT,
                  auth: ['fdmdata:express-fee-template:update'],
                  onClick: handleEdit.bind(null, row),
                },
                {
                  label: $t('common.delete'),
                  type: 'link',
                  danger: true,
                  icon: ACTION_ICON.DELETE,
                  auth: ['fdmdata:express-fee-template:delete'],
                  popConfirm: {
                    title: $t('ui.actionMessage.deleteConfirm', [row.id]),
                    confirm: handleDelete.bind(null, row),
                  },
                },
              ]"
            />
          </template>
        </Grid>
      </div>
    </div>
  </Page>
</template>

<style scoped>
.express-page,
.express-grid {
  min-height: 0;
}

.express-page {
  height: 100%;
}

.express-grid {
  display: flex;
  flex-direction: column;
  min-height: 420px;
}

.express-grid :deep(.express-vxe-wrapper) {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.express-grid :deep(.express-vxe-grid) {
  flex: 1 1 auto;
  height: 100% !important;
  min-height: 0;
}

.express-grid :deep(.vxe-grid) {
  height: 100%;
}

@media (max-width: 768px) {
  .express-grid {
    min-height: 520px;
  }
}
</style>
