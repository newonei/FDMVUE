<script lang="ts" setup>
import type { FdmCreativeApi } from '../../src/api/fdmcreative';

import { onBeforeUnmount, onMounted, ref } from 'vue';

import NodeInlineEditor from '../../src/views/fdmcreative/workbench/editor/components/NodeInlineEditor.vue';
import { createWorkbenchGraph } from '../../src/views/fdmcreative/workbench/editor/graph/graph-adapter';
import type {
  WorkbenchBlankConnectionRequest,
  WorkbenchGraphAdapter,
} from '../../src/views/fdmcreative/workbench/editor/graph/graph-adapter';

const quickConnectScenario =
  new URLSearchParams(window.location.search).get('scenario') ===
  'quick-connect';
const canvasShellRef = ref<HTMLElement>();
const graphRef = ref<HTMLElement>();
const minimapRef = ref<HTMLElement>();
const quickConnectRequest = ref<WorkbenchBlankConnectionRequest>();
const selectedNode = ref<FdmCreativeApi.WorkflowNode>();
const summary = ref('loading');
let adapter: WorkbenchGraphAdapter | undefined;

function syncQuickConnectState() {
  if (!quickConnectScenario || !adapter) return;
  const definition = adapter.serializeDefinition();
  document.body.dataset.edgeCount = String(definition.edges.length);
  document.body.dataset.nodeCount = String(definition.nodes.length);
  document.body.dataset.quickConnectOpen = String(
    Boolean(quickConnectRequest.value),
  );
  document.body.dataset.workflowDefinition = JSON.stringify(definition);
}

function openQuickConnect(request: WorkbenchBlankConnectionRequest) {
  quickConnectRequest.value = request;
  syncQuickConnectState();
  requestAnimationFrame(() => {
    document
      .querySelector<HTMLInputElement>('[data-testid="quick-connect-search"]')
      ?.focus();
  });
}

function chooseQuickConnectNode(
  option: WorkbenchBlankConnectionRequest['options'][number],
) {
  if (!adapter || !quickConnectRequest.value) return;
  adapter.addConnectedNode(quickConnectRequest.value, option);
  quickConnectRequest.value = undefined;
  syncQuickConnectState();
}

function quickConnectMenuStyle() {
  const request = quickConnectRequest.value;
  const shell = canvasShellRef.value;
  if (!request || !shell) return undefined;
  const shellRect = shell.getBoundingClientRect();
  return {
    left: `${Math.max(12, Math.min(request.clientPoint.x - shellRect.left + 12, shellRect.width - 312))}px`,
    top: `${Math.max(12, Math.min(request.clientPoint.y - shellRect.top + 12, shellRect.height - 240))}px`,
  };
}

function selectNode(node?: FdmCreativeApi.WorkflowNode) {
  if (node) quickConnectRequest.value = undefined;
  selectedNode.value = node;
  requestAnimationFrame(() => {
    document.body.dataset.selectedCellCount = String(
      adapter?.graph.getSelectedCells().length ?? 0,
    );
    syncQuickConnectState();
  });
}

function closeEditor() {
  selectedNode.value = undefined;
  adapter?.clearSelection();
  document.body.dataset.selectedCellCount = '0';
}

function zoomBy(delta: number) {
  adapter?.zoomBy(delta);
}

function undoQuickConnect() {
  adapter?.undo();
  requestAnimationFrame(syncQuickConnectState);
}

function redoQuickConnect() {
  adapter?.redo();
  requestAnimationFrame(syncQuickConnectState);
}

function handleEscape(event: KeyboardEvent) {
  if (event.key === 'Escape' && selectedNode.value) closeEditor();
}

onMounted(async () => {
  if (!graphRef.value || !minimapRef.value)
    throw new Error('fixture container is missing');
  adapter = createWorkbenchGraph(
    { container: graphRef.value, minimapContainer: minimapRef.value },
    {
      onChange: syncQuickConnectState,
      onConnectToBlank: openQuickConnect,
      onSelectionChange: selectNode,
    },
  );
  adapter.applyPlanAsBatch({
    items: [
      {
        image: { aspectRatio: '1:1', outputCount: 1 },
        itemId: 'image-1',
        kind: 'IMAGE',
        order: 1,
        prompt: 'A clean studio product image',
        title: '主视觉',
      },
      {
        itemId: 'video-1',
        kind: 'VIDEO',
        order: 2,
        prompt: 'Slow camera orbit around the product',
        title: '环绕镜头',
        video: { durationSeconds: 5 },
      },
    ],
    mode: 'MIXED',
    title: 'Smoke plan',
  });

  const definition = adapter.serializeDefinition();
  adapter.undo();
  const afterUndo = adapter.serializeDefinition();
  adapter.redo();
  const afterRedo = adapter.serializeDefinition();
  summary.value = `${definition.nodes.length}:${definition.edges.length}|${afterUndo.nodes.length}:${afterUndo.edges.length}|${afterRedo.nodes.length}:${afterRedo.edges.length}`;

  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  const renderedNodes = [
    ...document.querySelectorAll<HTMLElement>('.creative-node'),
  ];
  document.body.dataset.nodeBoundsAligned = String(
    renderedNodes.length > 0 &&
      renderedNodes.every((element) => {
        const foreignObject = element.closest('foreignObject');
        if (!foreignObject) return false;
        const cardBounds = element.getBoundingClientRect();
        const cellBounds = foreignObject.getBoundingClientRect();
        return (
          Math.abs(cardBounds.width - cellBounds.width) <= 1 &&
          Math.abs(cardBounds.height - cellBounds.height) <= 1
        );
      }),
  );
  document.body.dataset.foreignBodyReset = String(
    renderedNodes.every((element) => {
      const foreignBody = element.parentElement?.parentElement;
      return (
        foreignBody?.tagName === 'BODY' &&
        getComputedStyle(foreignBody).minHeight === '0px'
      );
    }),
  );
  document.body.dataset.nodeHeightLimits = String(
    renderedNodes.every((element) => {
      const height = Number.parseFloat(getComputedStyle(element).height);
      const variant = element.dataset.nodeVariant;
      if (variant === 'planner') return height <= 360;
      if (variant === 'asset') return height <= 240;
      if (variant === 'compose') return height <= 300;
      return height <= 180;
    }),
  );

  if (!quickConnectScenario) {
    for (let index = afterRedo.nodes.length; index < 300; index += 1) {
      adapter.addNode('image-input', {
        x: 120 + (index % 20) * 280,
        y: 520 + Math.floor(index / 20) * 180,
      });
    }
    document.body.dataset.nodeCount = String(
      adapter.serializeDefinition().nodes.length,
    );
    document.body.dataset.nodeLimitEnforced = String(
      adapter.addNode('image-input') === undefined,
    );
    adapter.zoomBy(-0.1);
    document.body.dataset.zoomResponsive = String(
      adapter.serializeDefinition().viewport.zoom < 1,
    );
  } else {
    syncQuickConnectState();
  }
  document.body.dataset.selectedCellCount = '0';
  document.body.dataset.ready = 'true';
  document.querySelector('#__app-loading__')?.remove();

  window.addEventListener('keydown', handleEscape);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleEscape);
  adapter?.disposeWorkbenchGraph();
});
</script>

<template>
  <div class="workbench-fixture">
    <header class="fixture-toolbar">
      <strong>节点式视频图案工作台</strong>
      <div class="toolbar-actions">
        <button
          v-if="quickConnectScenario"
          data-testid="quick-connect-undo"
          type="button"
          @click="undoQuickConnect"
        >
          撤销
        </button>
        <button
          v-if="quickConnectScenario"
          data-testid="quick-connect-redo"
          type="button"
          @click="redoQuickConnect"
        >
          重做
        </button>
        <button data-testid="zoom-out" type="button" @click="zoomBy(-0.2)">
          缩小
        </button>
        <button data-testid="zoom-in" type="button" @click="zoomBy(0.2)">
          放大
        </button>
      </div>
    </header>
    <aside class="node-library">节点库</aside>
    <main ref="canvasShellRef" class="canvas-shell">
      <div ref="graphRef" class="graph-canvas"></div>
      <div ref="minimapRef" class="minimap"></div>
      <section
        v-if="quickConnectScenario && quickConnectRequest"
        class="quick-connect-menu"
        :style="quickConnectMenuStyle()"
        data-testid="quick-connect-menu"
      >
        <strong>选择下一个节点</strong>
        <input
          data-testid="quick-connect-search"
          placeholder="搜索兼容节点"
          type="search"
        />
        <button
          v-for="option in quickConnectRequest.options"
          :key="`${option.template.type}:${option.targetPortId}`"
          :data-testid="`quick-connect-option-${option.template.type}`"
          type="button"
          @click="chooseQuickConnectNode(option)"
        >
          {{ option.template.label }}
        </button>
      </section>
      <div
        v-if="selectedNode"
        class="node-inline-editor-host"
        data-placement="bottom-dock"
      >
        <NodeInlineEditor
          :node="selectedNode"
          placement="below"
          :width="700"
          @close="closeEditor"
        />
      </div>
      <section v-else class="prompt-dock" data-testid="prompt-dock">
        描述你想生成的视频或图案…
      </section>
    </main>
    <output v-if="!quickConnectScenario" id="summary">{{ summary }}</output>
  </div>
</template>

<style scoped>
.workbench-fixture {
  display: grid;
  grid-template:
    'toolbar toolbar' 56px
    'library canvas' minmax(0, 1fr) / 210px minmax(0, 1fr);
  width: 100%;
  height: 100%;
}

.fixture-toolbar {
  z-index: 30;
  display: flex;
  grid-area: toolbar;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  background: white;
  border-bottom: 1px solid #e2e8f0;
}

.toolbar-actions {
  display: flex;
  gap: 8px;
}

.toolbar-actions button {
  padding: 6px 12px;
  cursor: pointer;
  background: white;
  border: 1px solid #d7deea;
  border-radius: 8px;
}

.node-library {
  z-index: 20;
  grid-area: library;
  padding: 18px;
  background: white;
  border-right: 1px solid #e2e8f0;
}

.canvas-shell {
  position: relative;
  grid-area: canvas;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.graph-canvas {
  width: 100%;
  height: 100%;
}

.minimap {
  position: absolute;
  bottom: 12px;
  left: 12px;
  z-index: 10;
  width: 160px;
  height: 116px;
  background: white;
  border: 1px solid #dbe4ee;
}

.quick-connect-menu {
  position: absolute;
  z-index: 30;
  display: grid;
  gap: 8px;
  width: 288px;
  max-height: 220px;
  padding: 14px;
  overflow: auto;
  background: white;
  border: 1px solid #dbe4ee;
  border-radius: 12px;
  box-shadow: 0 14px 36px rgb(15 23 42 / 18%);
}

.quick-connect-menu input,
.quick-connect-menu button {
  padding: 8px 10px;
  text-align: left;
  background: white;
  border: 1px solid #dbe4ee;
  border-radius: 8px;
}

.quick-connect-menu button {
  cursor: pointer;
}

.node-inline-editor-host {
  position: absolute;
  bottom: 42px;
  left: 50%;
  z-index: 20;
  width: min(700px, calc(100% - 32px));
  pointer-events: auto;
  transform: translateX(-50%);
}

.prompt-dock {
  position: absolute;
  right: 220px;
  bottom: 20px;
  left: 220px;
  z-index: 12;
  padding: 18px 24px;
  color: #94a3b8;
  background: white;
  border: 1px solid #d9e2ef;
  border-radius: 16px;
  box-shadow: 0 10px 28px rgb(15 23 42 / 10%);
}

#summary {
  position: fixed;
  top: 18px;
  right: 190px;
  z-index: 40;
}
</style>
