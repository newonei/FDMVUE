<script lang="ts" setup>
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Page } from '@vben/common-ui';
import { Alert, Button, Tag } from 'ant-design-vue';

import { usePerformanceAccess } from './access';
import { ROLE_LABELS } from './workspace';

import './compact-table.css';

defineProps<{
  title: string;
  description?: string;
}>();
const router = useRouter();
const route = useRoute();
const { access, loadAccess } = usePerformanceAccess();
const links = computed(() =>
  [
    { path: '/fdmperformance/workbench', label: '工作台', show: true },
    { path: '/fdmperformance/my', label: '我的绩效', show: true },
    {
      path: '/fdmperformance/batches',
      label: '考核管理',
      show: access.value?.canManage,
    },
    {
      path: '/fdmperformance/dashboard',
      label: '绩效分析',
      show: access.value?.canManage,
    },
    {
      path: '/fdmperformance/configuration',
      label: '配置中心',
      show: access.value?.canConfigure,
    },
  ].filter((item) => item.show),
);
onMounted(loadAccess);
</script>

<template>
  <Page auto-content-height>
    <div class="performance-shell">
      <header class="workspace-header">
        <div>
          <h1>{{ title }}</h1>
          <p v-if="description">{{ description }}</p>
        </div>
        <Tag v-if="access">{{ ROLE_LABELS[access.role] }}</Tag>
      </header>
      <nav class="workspace-nav" aria-label="智能绩效导航">
        <Button
          v-for="link in links"
          :key="link.path"
          :type="route.path === link.path ? 'primary' : 'text'"
          @click="router.push(link.path)"
          >{{ link.label }}</Button
        >
      </nav>
      <Alert
        v-if="access && access.role !== 'ADMIN'"
        class="scope-notice"
        type="info"
        :show-icon="true"
        :message="
          access.role === 'EMPLOYEE'
            ? '仅展示本人的考核和成绩。'
            : '仅展示本人、本人发起及获授权监督的考核；评分操作以当前办理任务为准。'
        "
      />
      <div v-if="$slots.actions" class="actions-row">
        <slot name="actions"></slot>
      </div>

      <main class="content">
        <slot></slot>
      </main>
    </div>
  </Page>
</template>

<style scoped>
.performance-shell {
  min-height: calc(100vh - 96px);
}
.workspace-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}
.workspace-header h1 {
  margin: 0;
  font-size: 23px;
  font-weight: 650;
}
.workspace-header p {
  margin: 6px 0 0;
  color: hsl(var(--muted-foreground));
}
.workspace-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}
.scope-notice {
  margin-bottom: 16px;
}

.actions-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
  padding-bottom: 12px;
}

.content {
  display: grid;
  gap: 12px;
}
</style>
