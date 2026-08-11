<script lang="ts" setup>
import { computed, ref } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Collapse, Input } from 'ant-design-vue';

import { CREATIVE_NODE_CATALOG, NODE_GROUPS } from '../graph/catalog';

defineOptions({ name: 'FdmCreativeNodeLibraryPanel' });

withDefaults(defineProps<{ readonly?: boolean }>(), { readonly: false });

const emit = defineEmits<{
  nodeAdd: [type: string];
  nodeDragStart: [type: string, event: MouseEvent];
}>();

const rootElement = ref<HTMLElement>();
const search = ref('');

const filteredGroups = computed(() => {
  const keyword = search.value.trim().toLowerCase();
  return NODE_GROUPS.map((group) => ({
    ...group,
    nodes: group.types
      .map((type) => CREATIVE_NODE_CATALOG.find((item) => item.type === type)!)
      .filter(
        (node) =>
          !keyword ||
          node.label.toLowerCase().includes(keyword) ||
          node.description.toLowerCase().includes(keyword),
      ),
  })).filter((group) => group.nodes.length > 0);
});

function getElement() {
  return rootElement.value;
}

defineExpose({ getElement });
</script>

<template>
  <aside ref="rootElement" class="node-library">
    <div class="panel-title">
      <strong>节点库</strong>
      <IconifyIcon :icon="readonly ? 'lucide:lock-keyhole' : 'lucide:blocks'" />
    </div>
    <Input
      v-model:value="search"
      allow-clear
      placeholder="搜索节点"
      size="small"
    >
      <template #prefix><IconifyIcon icon="lucide:search" /></template>
    </Input>
    <Collapse :default-active-key="NODE_GROUPS.map((group) => group.key)" ghost>
      <Collapse.Panel
        v-for="group in filteredGroups"
        :key="group.key"
        :header="group.label"
      >
        <button
          v-for="node in group.nodes"
          :key="node.type"
          class="library-node"
          :disabled="readonly"
          :style="{ '--accent': node.color }"
          :title="node.description"
          type="button"
          @dblclick="emit('nodeAdd', node.type)"
          @mousedown="emit('nodeDragStart', node.type, $event)"
        >
          <span><IconifyIcon :icon="node.icon" /></span>
          <strong>{{ node.label }}</strong>
          <IconifyIcon class="library-chevron" icon="lucide:chevron-right" />
        </button>
      </Collapse.Panel>
    </Collapse>
  </aside>
</template>

<style scoped>
.node-library {
  z-index: 3;
  min-height: 0;
  padding: 14px 12px;
  overflow: auto;
  color: hsl(var(--foreground));
  background: hsl(var(--card) / 97%);
  border-right: 1px solid hsl(var(--border));
}

.panel-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 28px;
  margin-bottom: 8px;
}

.panel-title strong {
  font-size: 14px;
}

.panel-title > :last-child:not(strong) {
  width: 14px;
  height: 14px;
  color: hsl(var(--muted-foreground));
}

.node-library :deep(.ant-collapse-header) {
  min-height: 32px;
  padding: 7px 0 !important;
  font-size: 12px;
  font-weight: 600;
  color: hsl(var(--muted-foreground)) !important;
}

.node-library :deep(.ant-collapse-content-box) {
  padding: 0 0 6px !important;
}

.library-node {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
  min-height: 40px;
  padding: 6px 8px;
  margin-bottom: 6px;
  color: hsl(var(--foreground));
  text-align: left;
  cursor: grab;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-left: 2px solid var(--accent);
  border-radius: 7px;
  transition: 0.16s ease;
}

.library-node:hover {
  border-color: color-mix(in srgb, var(--accent) 32%, hsl(var(--border)));
  box-shadow: 0 3px 10px hsl(var(--primary) / 8%);
  transform: translateY(-1px);
}

.library-node:disabled {
  cursor: default;
  box-shadow: none;
  opacity: 0.58;
  transform: none;
}

.library-node > span {
  display: grid;
  flex: none;
  place-items: center;
  width: 25px;
  height: 25px;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, hsl(var(--card)));
  border-radius: 6px;
}

.library-node strong {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  white-space: nowrap;
}

.library-chevron {
  flex: none;
  width: 13px;
  height: 13px;
  color: hsl(var(--muted-foreground));
}
</style>
