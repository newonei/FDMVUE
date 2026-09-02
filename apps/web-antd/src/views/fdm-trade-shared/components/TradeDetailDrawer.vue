<script lang="ts" setup>
import type { TradeStatusTone } from './types';

import { computed, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Drawer, Space, Spin, Tag } from 'ant-design-vue';

import StatusTag from './StatusTag.vue';

import '../styles.css';

defineOptions({ name: 'FdmTradeDetailDrawer' });

const props = withDefaults(
  defineProps<{
    bodyAriaLabel?: string;
    contextInitiallyOpen?: boolean;
    contextLabel?: string;
    destroyOnClose?: boolean;
    documentType?: string;
    independentPageLabel?: string;
    loading?: boolean;
    loadingText?: string;
    maskClosable?: boolean;
    open: boolean;
    rootClassName?: string;
    showIndependentPage?: boolean;
    status?: string;
    statusTone?: TradeStatusTone;
    subtitle?: string;
    title: string;
    width?: number | string;
  }>(),
  {
    bodyAriaLabel: '单据详情',
    contextInitiallyOpen: false,
    contextLabel: '业务上下文',
    destroyOnClose: true,
    documentType: undefined,
    independentPageLabel: '独立页面打开',
    loading: false,
    loadingText: '正在读取单据详情…',
    maskClosable: true,
    rootClassName: undefined,
    showIndependentPage: false,
    status: undefined,
    statusTone: 'default',
    subtitle: undefined,
    width: 'var(--fdm-trade-detail-drawer-width)',
  },
);

const emit = defineEmits<{
  afterOpenChange: [open: boolean];
  close: [];
  contextExpandedChange: [expanded: boolean];
  independentPage: [];
  'update:open': [open: boolean];
}>();

const drawerRootClass = computed(() =>
  ['fdm-trade-detail-drawer', props.rootClassName].filter(Boolean).join(' '),
);
const contextExpanded = ref(props.contextInitiallyOpen);

watch(
  () => props.contextInitiallyOpen,
  (expanded) => {
    contextExpanded.value = expanded;
  },
);

function handleClose() {
  emit('update:open', false);
  emit('close');
}

function toggleContext() {
  contextExpanded.value = !contextExpanded.value;
  emit('contextExpandedChange', contextExpanded.value);
}
</script>

<template>
  <Drawer
    :body-style="{ padding: 0 }"
    :destroy-on-close="destroyOnClose"
    :mask-closable="maskClosable"
    :open="open"
    :root-class-name="drawerRootClass"
    :width="width"
    @after-open-change="emit('afterOpenChange', $event)"
    @close="handleClose"
  >
    <template #title>
      <div class="fdm-trade-detail-drawer__title">
        <Tag v-if="documentType" color="blue">{{ documentType }}</Tag>
        <div class="fdm-trade-detail-drawer__title-copy">
          <strong>{{ title }}</strong>
          <span v-if="subtitle">{{ subtitle }}</span>
        </div>
        <StatusTag v-if="status" :text="status" :tone="statusTone" />
      </div>
    </template>

    <template v-if="$slots['header-actions'] || showIndependentPage" #extra>
      <Space class="fdm-trade-detail-drawer__header-actions" :size="8">
        <slot name="header-actions"></slot>
        <Button
          v-if="showIndependentPage"
          size="small"
          @click="emit('independentPage')"
        >
          <template #icon>
            <IconifyIcon icon="lucide:external-link" aria-hidden="true" />
          </template>
          {{ independentPageLabel }}
        </Button>
      </Space>
    </template>

    <Spin :spinning="loading" :tip="loadingText">
      <div class="fdm-trade-detail-drawer__body">
        <section
          v-if="$slots.metrics"
          aria-label="关键指标"
          class="fdm-trade-detail-drawer__metrics"
        >
          <slot name="metrics"></slot>
        </section>

        <div
          class="fdm-trade-detail-drawer__layout"
          :class="{
            'fdm-trade-detail-drawer__layout--single': !$slots.context,
          }"
        >
          <main
            :aria-label="bodyAriaLabel"
            class="fdm-trade-detail-drawer__main"
          >
            <slot></slot>
          </main>

          <aside
            v-if="$slots.context"
            :aria-label="contextLabel"
            class="fdm-trade-detail-drawer__context"
            :data-expanded="contextExpanded"
          >
            <button
              :aria-expanded="contextExpanded"
              class="fdm-trade-detail-drawer__context-summary"
              type="button"
              @click="toggleContext"
            >
              <span>
                <IconifyIcon
                  icon="lucide:panel-right-open"
                  aria-hidden="true"
                />
                {{ contextLabel }}
              </span>
              <IconifyIcon icon="lucide:chevron-down" aria-hidden="true" />
            </button>
            <div class="fdm-trade-detail-drawer__context-content">
              <slot name="context"></slot>
            </div>
          </aside>
        </div>
      </div>
    </Spin>

    <template v-if="$slots.footer" #footer>
      <div class="fdm-trade-detail-drawer__footer">
        <slot name="footer"></slot>
      </div>
    </template>
  </Drawer>
</template>
