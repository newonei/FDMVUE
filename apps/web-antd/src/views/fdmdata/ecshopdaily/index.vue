<script lang="ts" setup>
import { ref } from 'vue';

import { Page } from '@vben/common-ui';

import EcShopDailyDashboard from './modules/ec-shop-daily-dashboard.vue';

const dashboardRef = ref<InstanceType<typeof EcShopDailyDashboard> | null>(
  null,
);
</script>

<template>
  <Page auto-content-height content-class="flex min-h-0 flex-1 flex-col !p-0">
    <div class="flex min-h-0 flex-1 flex-col px-4 pb-4">
      <header class="flex flex-shrink-0 items-start pb-3 pt-3">
        <div>
          <h2 class="mb-1 text-lg font-semibold text-foreground">
            店铺后台日汇总管理
          </h2>
          <p class="mb-0 text-xs text-muted-foreground">
            按店铺统计每日成交、退款、流量与营销投放数据
          </p>
        </div>
      </header>
      <div class="min-h-0 flex-1 overflow-auto">
        <EcShopDailyDashboard ref="dashboardRef" />
      </div>
    </div>
  </Page>
</template>
