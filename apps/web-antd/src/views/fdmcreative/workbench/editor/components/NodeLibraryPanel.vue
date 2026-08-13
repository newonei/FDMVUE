<script lang="ts" setup>
import { computed, ref } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Collapse, Input, Popover } from 'ant-design-vue';

import { CREATIVE_NODE_CATALOG, NODE_GROUPS } from '../graph/catalog';
import { getNodeLibraryHelp } from './node-library-help';

defineOptions({ name: 'FdmCreativeNodeLibraryPanel' });

const props = withDefaults(defineProps<{ readonly?: boolean }>(), {
  readonly: false,
});

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
      .map((node) => ({ ...node, help: getNodeLibraryHelp(node) }))
      .filter((node) => {
        if (!keyword) return true;
        return [
          node.label,
          node.description,
          node.help.purpose,
          node.help.tip,
          ...node.help.inputs,
          ...node.help.outputs,
          ...node.help.scenarios,
        ].some((text) => text.toLowerCase().includes(keyword));
      }),
  })).filter((group) => group.nodes.length > 0);
});

function handleDoubleClick(type: string) {
  if (!props.readonly) emit('nodeAdd', type);
}

function handleMouseDown(type: string, event: MouseEvent) {
  if (!props.readonly) emit('nodeDragStart', type, event);
}

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
    <p class="panel-hint">
      <IconifyIcon icon="lucide:circle-help" />
      悬浮查看说明 · 双击添加
    </p>
    <Collapse :default-active-key="NODE_GROUPS.map((group) => group.key)" ghost>
      <Collapse.Panel
        v-for="group in filteredGroups"
        :key="group.key"
        :header="group.label"
      >
        <Popover
          v-for="node in group.nodes"
          :key="node.type"
          :mouse-enter-delay="0.25"
          overlay-class-name="node-library-help-overlay"
          placement="rightTop"
          :trigger="['hover', 'focus']"
        >
          <template #content>
            <article
              :id="`node-help-${node.type}`"
              class="node-help"
              :style="{ '--help-accent': node.color }"
            >
              <header class="node-help__header">
                <span><IconifyIcon :icon="node.icon" /></span>
                <div>
                  <strong>{{ node.label }}</strong>
                  <small>{{ node.type }}</small>
                </div>
              </header>

              <section>
                <b>用途</b>
                <p>{{ node.help.purpose }}</p>
              </section>

              <div class="node-help__io">
                <section>
                  <b><IconifyIcon icon="lucide:log-in" /> 输入</b>
                  <ul>
                    <li v-for="item in node.help.inputs" :key="item">
                      {{ item }}
                    </li>
                  </ul>
                </section>
                <section>
                  <b><IconifyIcon icon="lucide:log-out" /> 输出</b>
                  <ul>
                    <li v-for="item in node.help.outputs" :key="item">
                      {{ item }}
                    </li>
                  </ul>
                </section>
              </div>

              <section>
                <b>适用场景</b>
                <div class="node-help__tags">
                  <span v-for="item in node.help.scenarios" :key="item">
                    {{ item }}
                  </span>
                </div>
              </section>

              <aside class="node-help__tip">
                <IconifyIcon icon="lucide:lightbulb" />
                <span><b>小提示</b>{{ node.help.tip }}</span>
              </aside>
              <footer>双击添加 · 按住拖到画布</footer>
            </article>
          </template>

          <button
            :aria-describedby="`node-help-${node.type}`"
            :aria-disabled="readonly"
            class="library-node"
            :class="{ 'is-readonly': readonly }"
            :style="{ '--accent': node.color }"
            type="button"
            @dblclick="handleDoubleClick(node.type)"
            @mousedown="handleMouseDown(node.type, $event)"
          >
            <span><IconifyIcon :icon="node.icon" /></span>
            <strong>{{ node.label }}</strong>
            <IconifyIcon class="library-chevron" icon="lucide:info" />
          </button>
        </Popover>
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

.panel-hint {
  display: flex;
  gap: 5px;
  align-items: center;
  margin: 6px 1px 1px;
  font-size: 10px;
  color: hsl(var(--muted-foreground));
}

.panel-hint > * {
  width: 12px;
  height: 12px;
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

.library-node:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent) 68%, transparent);
  outline-offset: 2px;
}

.library-node.is-readonly {
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

.node-help {
  --help-accent: hsl(var(--primary));

  display: grid;
  gap: 12px;
  width: min(350px, calc(100vw - 40px));
  color: hsl(var(--foreground));
}

.node-help__header {
  display: flex;
  gap: 10px;
  align-items: center;
  padding-bottom: 10px;
  border-bottom: 1px solid hsl(var(--border));
}

.node-help__header > span {
  display: grid;
  flex: none;
  place-items: center;
  width: 34px;
  height: 34px;
  color: var(--help-accent);
  background: color-mix(in srgb, var(--help-accent) 12%, hsl(var(--card)));
  border-radius: 9px;
}

.node-help__header > span > * {
  width: 18px;
  height: 18px;
}

.node-help__header div {
  display: grid;
  min-width: 0;
}

.node-help__header strong {
  font-size: 14px;
}

.node-help__header small {
  overflow: hidden;
  text-overflow: ellipsis;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
}

.node-help section {
  display: grid;
  gap: 5px;
}

.node-help section b {
  display: flex;
  gap: 5px;
  align-items: center;
  font-size: 12px;
}

.node-help section b > * {
  width: 13px;
  height: 13px;
}

.node-help p,
.node-help ul {
  padding: 0;
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: hsl(var(--muted-foreground));
}

.node-help ul {
  padding-left: 16px;
}

.node-help__io {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.node-help__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.node-help__tags span {
  padding: 2px 7px;
  font-size: 11px;
  color: hsl(var(--foreground));
  background: hsl(var(--muted) / 76%);
  border: 1px solid hsl(var(--border));
  border-radius: 999px;
}

.node-help__tip {
  display: flex;
  gap: 8px;
  padding: 9px 10px;
  font-size: 12px;
  line-height: 1.5;
  color: hsl(var(--muted-foreground));
  background: color-mix(in srgb, var(--help-accent) 7%, hsl(var(--muted)));
  border: 1px solid
    color-mix(in srgb, var(--help-accent) 18%, hsl(var(--border)));
  border-radius: 8px;
}

.node-help__tip > :first-child {
  flex: none;
  width: 14px;
  height: 14px;
  margin-top: 2px;
  color: var(--help-accent);
}

.node-help__tip span {
  display: grid;
  gap: 2px;
}

.node-help__tip b {
  color: hsl(var(--foreground));
}

.node-help footer {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  text-align: right;
}

:global(.node-library-help-overlay .ant-popover-inner) {
  max-height: min(620px, calc(100vh - 24px));
  padding: 14px;
  overflow: auto;
  background: hsl(var(--popover));
  border: 1px solid hsl(var(--border));
  box-shadow: 0 16px 42px hsl(var(--foreground) / 16%);
}

:global(.node-library-help-overlay .ant-popover-arrow::before) {
  background: hsl(var(--popover));
}

@media (max-width: 700px) {
  .node-help {
    width: min(310px, calc(100vw - 28px));
  }

  .node-help__io {
    grid-template-columns: 1fr;
    gap: 8px;
  }
}
</style>
