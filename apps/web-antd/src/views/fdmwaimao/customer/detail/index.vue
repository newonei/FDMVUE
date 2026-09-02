<script lang="ts" setup>
import type { FdmWaimaoCustomerApi } from '#/api/fdmwaimao/customer';

import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import { Button, message, Spin } from 'ant-design-vue';

import {
  formatOkkiError,
  getCustomer,
  refreshCustomerFromOkki,
} from '#/api/fdmwaimao/customer';
import { useFdmWaimaoAiContext } from '#/views/fdm-trade-shared/ai-assistant/context';

import CustomerDetail from '../components/CustomerDetail.vue';

defineOptions({ name: 'FdmWaimaoCustomerDetail' });

const route = useRoute();
const router = useRouter();
const { hasAccessByCodes } = useAccess();

const customer = ref<FdmWaimaoCustomerApi.CustomerDetail>();
const loading = ref(false);
const refreshing = ref(false);
let loadRequestId = 0;
const customerId = computed(() => String(route.params.id || ''));
const canRefresh = computed(() =>
  hasAccessByCodes(['fdmwaimao:customer:refresh']),
);

useFdmWaimaoAiContext(() => ({
  businessId: customerId.value,
  context: {
    loading: loading.value,
    record: customer.value,
  },
  contextMode: 'detail',
  entityLabel: customer.value?.name,
  surfaceKey: 'customer',
}));

async function load() {
  const id = customerId.value;
  if (!id) return;
  const requestId = ++loadRequestId;
  customer.value = undefined;
  loading.value = true;
  try {
    const result = await getCustomer(id);
    if (requestId === loadRequestId && customerId.value === id) {
      customer.value = result;
    }
  } finally {
    if (requestId === loadRequestId) loading.value = false;
  }
}

async function refresh() {
  const id = customerId.value;
  if (!id) return;
  refreshing.value = true;
  try {
    await refreshCustomerFromOkki(id);
    if (customerId.value === id) await load();
    message.success('已从 OKKI 刷新客户资料');
  } catch (error) {
    message.error(formatOkkiError(error));
  } finally {
    refreshing.value = false;
  }
}

watch(customerId, load, { immediate: true });
</script>

<template>
  <Page
    :description="customer?.customerCode || '交易客户详情'"
    :title="customer?.name || '交易客户详情'"
  >
    <template #extra>
      <Button @click="router.push('/fdmwaimao/customer')">
        <template #icon>
          <IconifyIcon icon="lucide:arrow-left" aria-hidden="true" />
        </template>
        返回列表
      </Button>
      <Button
        v-if="canRefresh"
        :loading="refreshing"
        type="primary"
        @click="refresh"
      >
        从 OKKI 刷新
      </Button>
    </template>

    <Spin :spinning="loading">
      <CustomerDetail :customer="customer" />
    </Spin>
  </Page>
</template>
