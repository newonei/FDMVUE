<script lang="ts" setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

const props = withDefaults(
  defineProps<{
    compact?: boolean;
    description?: string;
    title: string;
  }>(),
  {
    compact: true,
    description: '',
  },
);

const route = useRoute();

const coreNavItems = [
  { icon: 'lucide:layout-dashboard', path: '/dashboard', title: '首页' },
  { icon: 'lucide:map', path: '/goals', title: '目标地图' },
  { icon: 'lucide:list-todo', path: '/actions', title: '行动计划' },
  { icon: 'lucide:file-check-2', path: '/templates', title: '考评表' },
  { icon: 'lucide:send', path: '/launch', title: '发起考核' },
  { icon: 'lucide:calendar-check', path: '/batches', title: '已发起考核' },
  { icon: 'lucide:database', path: '/indicators', title: '指标库' },
  { icon: 'lucide:chart-column', path: '/data-center', title: '数据中心' },
  { icon: 'lucide:user-check', path: '/my', title: '我的绩效' },
  { icon: 'lucide:settings', path: '/settings', title: '系统设置' },
];

const activePath = computed(() => route.path);
const basePath = computed(() => '/fdmperformance');
const isCompact = computed(() => props.compact);
const navItems = computed(() => coreNavItems);
</script>

<template>
  <Page auto-content-height>
    <div class="performance-shell">
      <div v-if="!isCompact" class="performance-header">
        <div>
          <div class="performance-brand">
            <span class="brand-mark">
              <IconifyIcon icon="lucide:chart-no-axes-combined" />
            </span>
            <strong>智能绩效</strong>
          </div>
          <h1>{{ props.title }}</h1>
          <p v-if="props.description">{{ props.description }}</p>
        </div>
        <div class="header-actions">
          <slot name="actions"></slot>
        </div>
      </div>

      <div
        class="performance-nav-row"
        :class="{ 'performance-nav-row--compact': isCompact }"
      >
        <div class="performance-nav">
          <RouterLink
            v-for="item in navItems"
            :key="item.path"
            class="nav-item"
            :class="{ active: activePath.startsWith(`${basePath}${item.path}`) }"
            :to="`${basePath}${item.path}`"
          >
            <IconifyIcon :icon="item.icon" />
            <span>{{ item.title }}</span>
          </RouterLink>
        </div>
        <div v-if="isCompact" class="header-actions compact-actions">
          <slot name="actions"></slot>
        </div>
      </div>

      <main class="performance-main">
        <slot></slot>
      </main>
    </div>
  </Page>
</template>

<style scoped>
.performance-shell {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  min-height: calc(100vh - 96px);
  overflow-x: hidden;
}

.performance-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding: 20px 24px 16px;
  background: #fff;
  border: 1px solid #edf0f4;
  border-radius: 8px;
}

.performance-brand {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #1d2129;
  font-size: 15px;
}

.brand-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  color: #fff;
  background: #ff7d00;
  border-radius: 7px;
}

h1 {
  margin: 16px 0 0;
  color: #111827;
  font-size: 24px;
  font-weight: 650;
  letter-spacing: 0;
}

p {
  margin: 8px 0 0;
  color: #64748b;
}

.header-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  min-width: 0;
  gap: 8px;
}

.performance-nav-row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
  min-width: 0;
  padding: 14px 0;
}

.performance-nav-row--compact {
  align-items: center;
  padding: 10px 0;
}

.performance-nav {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.nav-item {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 36px;
  padding: 0 14px;
  color: #374151;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.nav-item.active {
  color: #1677ff;
  background: #eaf3ff;
  border-color: #b8d7ff;
}

.performance-main {
  display: grid;
  gap: 14px;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow-x: hidden;
}

.compact-actions {
  flex-shrink: 0;
  align-items: center;
  min-height: 36px;
}

@media (max-width: 1200px) {
  .performance-nav-row--compact {
    align-items: flex-start;
    flex-direction: column-reverse;
  }

  .compact-actions {
    align-self: flex-end;
  }
}
</style>
