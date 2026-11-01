<script lang="ts" setup>
import { onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { resetAllStores, useAccessStore, useTabbarStore } from '@vben/stores';

import { Spin } from 'ant-design-vue';

import { resetRoutes } from '#/router';
import { useAuthStore } from '#/store';
import {
  completeWorkbenchLogin,
  exchangeWorkbenchTicket,
  getWorkbenchPermissions,
  takeWorkbenchCredentials,
  WORKBENCH_LOGIN_ERROR,
} from '#/utils/workbench-login';

defineOptions({ name: 'WorkbenchLogin' });

const router = useRouter();
const accessStore = useAccessStore();
const authStore = useAuthStore();
const failed = ref(false);
const controller = new AbortController();
let timeout: ReturnType<typeof setTimeout> | undefined;

onMounted(async () => {
  timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    await completeWorkbenchLogin({
      clearIdentity() {
        // Tabs hydrate lazily in BasicLayout; include their persisted state in the reset.
        useTabbarStore();
        resetAllStores();
        resetRoutes();
      },
      credentials: takeWorkbenchCredentials,
      exchange: (credentials) =>
        exchangeWorkbenchTicket(credentials, controller.signal),
      async applySession(session) {
        accessStore.setTenantId(session.tenantId);
        accessStore.setAccessToken(session.accessToken);
        accessStore.setRefreshToken(session.refreshToken);
        await authStore.fetchUserInfo(() =>
          getWorkbenchPermissions(session, controller.signal),
        );
      },
      goHome: () => router.replace('/'),
      signal: controller.signal,
    });
  } catch {
    failed.value = true;
  } finally {
    clearTimeout(timeout);
  }
});

onUnmounted(() => {
  controller.abort();
  clearTimeout(timeout);
});
</script>

<template>
  <main class="workbench-login" aria-live="polite">
    <section class="workbench-login-panel">
      <h1>飞德慕工作台</h1>
      <p v-if="failed" role="alert">{{ WORKBENCH_LOGIN_ERROR }}</p>
      <template v-else>
        <Spin size="large" />
        <p>正在连接当前员工账号…</p>
      </template>
    </section>
  </main>
</template>

<style scoped>
.workbench-login {
  display: grid;
  place-items: center;
  min-height: 100vh;
  padding: 24px;
  color: #303133;
  background: #f8f9fb;
}

.workbench-login-panel {
  width: min(100%, 480px);
  padding: 40px 32px;
  text-align: center;
  background: #fff;
  border: 1px solid #e8eaed;
  border-radius: 12px;
}

h1 {
  margin-bottom: 24px;
  font-size: 24px;
  font-weight: 600;
}

p {
  margin-top: 20px;
  line-height: 1.7;
}
</style>
