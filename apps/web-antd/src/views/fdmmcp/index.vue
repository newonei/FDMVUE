<script lang="ts" setup>
import { ref } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';

import { Card, Tabs } from 'ant-design-vue';

import AuditGrid from './modules/audit-grid.vue';
import ClientGrid from './modules/client-grid.vue';
import ConnectionGrid from './modules/connection-grid.vue';
import ToolCatalog from './modules/tool-catalog.vue';

defineOptions({ name: 'FdmMcpManage' });

const { hasAccessByCodes } = useAccess();
const activeKey = ref('connection');
</script>

<template>
  <Page auto-content-height>
    <Card class="h-full" :body-style="{ height: '100%' }">
      <Tabs
        v-model:active-key="activeKey"
        class="h-full"
        destroy-inactive-tab-pane
      >
        <Tabs.TabPane key="connection" tab="连接授权">
          <div class="h-[calc(100vh-260px)]">
            <ConnectionGrid />
          </div>
        </Tabs.TabPane>
        <Tabs.TabPane
          v-if="hasAccessByCodes(['fdmmcp:client:query'])"
          key="client"
          tab="AI 客户端"
        >
          <div class="h-[calc(100vh-260px)]">
            <ClientGrid />
          </div>
        </Tabs.TabPane>
        <Tabs.TabPane
          v-if="hasAccessByCodes(['fdmmcp:audit-log:query'])"
          key="audit"
          tab="调用审计"
        >
          <div class="h-[calc(100vh-260px)]">
            <AuditGrid />
          </div>
        </Tabs.TabPane>
        <Tabs.TabPane
          v-if="hasAccessByCodes(['fdmmcp:tool:query'])"
          key="tool"
          tab="工具目录"
        >
          <ToolCatalog />
        </Tabs.TabPane>
      </Tabs>
    </Card>
  </Page>
</template>
