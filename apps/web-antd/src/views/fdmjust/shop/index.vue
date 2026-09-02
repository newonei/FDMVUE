<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmjustShopApi } from '#/api/fdmjust/shop';

import { ref } from 'vue';

import { confirm, Page, useVbenModal } from '@vben/common-ui';

import { message, Tag } from 'ant-design-vue';

import { ACTION_ICON, TableAction, useVbenVxeGrid } from '#/adapter/vxe-table';
import { getShopPage, syncShop } from '#/api/fdmjust/shop';
import { $t } from '#/locales';

import {
  getSessionStatusMeta,
  useGridColumns,
  useGridFormSchema,
} from './data';
import Form from './modules/form.vue';

defineOptions({ name: 'FdmJustShop' });

const syncBusy = ref(false);
const syncing = ref(false);

const [FormModal, formModalApi] = useVbenModal({
  connectedComponent: Form,
  destroyOnClose: true,
});

function handleRefresh() {
  gridApi.query();
}

function handleEdit(row: FdmjustShopApi.Shop) {
  formModalApi.setData(row).open();
}

function getSafeShopUrl(value?: string) {
  const candidate = value?.trim();
  if (!candidate) {
    return undefined;
  }
  try {
    const url = new URL(candidate);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function getSyncResultMessage(result: FdmjustShopApi.ShopSyncResult) {
  return [
    `获取 ${result.totalCount} 家`,
    `新增 ${result.createdCount} 家`,
    `更新 ${result.updatedCount} 家`,
    `无变化 ${result.unchangedCount} 家`,
  ].join('，');
}

/** 从聚水潭拉取店铺，并防止重复提交 */
async function handleSync() {
  if (syncBusy.value) {
    return;
  }
  syncBusy.value = true;
  try {
    await confirm(
      '确认从聚水潭同步全部店铺？同步会新增店铺并更新已有店铺的基础信息。',
    );
  } catch {
    syncBusy.value = false;
    return;
  }

  syncing.value = true;
  const hideLoading = message.loading({
    content: '正在同步聚水潭店铺，请稍候...',
    duration: 0,
  });
  try {
    const result = await syncShop();
    message.success(`同步完成：${getSyncResultMessage(result)}`);
    await gridApi.query();
  } finally {
    hideLoading();
    syncing.value = false;
    syncBusy.value = false;
  }
}

const [Grid, gridApi] = useVbenVxeGrid({
  formOptions: {
    schema: useGridFormSchema(),
  },
  gridOptions: {
    autoResize: true,
    columns: useGridColumns(),
    height: 'auto',
    keepSource: true,
    proxyConfig: {
      ajax: {
        query: async ({ page }, formValues) => {
          return await getShopPage({
            pageNo: page.currentPage,
            pageSize: page.pageSize,
            ...formValues,
          });
        },
      },
    },
    rowConfig: {
      isHover: true,
      keyField: 'id',
    },
    showOverflow: true,
    stripe: true,
    toolbarConfig: {
      refresh: true,
      search: true,
    },
  } as VxeTableGridOptions<FdmjustShopApi.Shop>,
});
</script>

<template>
  <Page auto-content-height>
    <FormModal @success="handleRefresh" />

    <Grid
      table-title="店铺列表"
      table-title-help="店铺基础资料来自聚水潭；启用状态和备注由本系统维护，不会在同步时被覆盖。"
    >
      <template #toolbar-tools>
        <TableAction
          :actions="[
            {
              label: '同步聚水潭店铺',
              type: 'primary',
              icon: ACTION_ICON.REFRESH,
              auth: ['fdmjust:shop:sync'],
              disabled: syncBusy,
              loading: syncing,
              onClick: handleSync,
            },
          ]"
        />
      </template>

      <template #enabled="{ row }">
        <Tag :color="Number(row.enabled) === 1 ? 'success' : 'default'">
          {{ Number(row.enabled) === 1 ? '启用' : '停用' }}
        </Tag>
      </template>

      <template #sessionStatus="{ row }">
        <Tag :color="getSessionStatusMeta(row.sessionStatus).color">
          {{ getSessionStatusMeta(row.sessionStatus).label }}
        </Tag>
      </template>

      <template #shopUrl="{ row }">
        <a
          v-if="getSafeShopUrl(row.shopUrl)"
          :href="getSafeShopUrl(row.shopUrl)"
          class="text-primary hover:underline"
          rel="noopener noreferrer"
          target="_blank"
          :title="row.shopUrl"
        >
          访问店铺
        </a>
        <span v-else class="text-muted-foreground">-</span>
      </template>

      <template #actions="{ row }">
        <TableAction
          :actions="[
            {
              label: $t('common.edit'),
              type: 'link',
              icon: ACTION_ICON.EDIT,
              auth: ['fdmjust:shop:update'],
              onClick: handleEdit.bind(null, row),
            },
          ]"
        />
      </template>
    </Grid>
  </Page>
</template>
