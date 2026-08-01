import type { FdmCreativeApi } from '#/api/fdmcreative';

import {
  Clipboard,
  Dnd,
  Graph,
  History,
  Keyboard,
  MiniMap,
  Scroller,
  Selection,
  Shape,
  Snapline,
} from '@antv/x6';
import { register } from '@antv/x6-vue-shape';

import WorkbenchNode from '../components/WorkbenchNode.vue';
import { CREATIVE_NODE_MAP, getCreativeNodeVisual } from './catalog';
import type { CreativeNodeTemplate } from './catalog';
import {
  EMPTY_WORKFLOW,
  isEditableTarget,
  validateWorkflowConnection,
} from './workflow-utils';

const NODE_SHAPE = 'fdm-creative-vue-node';
const DEFAULT_NODE_VISUAL = getCreativeNodeVisual('creative-brief');
export const MAX_WORKBENCH_NODES = 300;
let registered = false;

function createLocalId(prefix: string) {
  const value =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${value}`;
}

export function registerWorkbenchShapes() {
  if (registered) return;
  register({
    component: WorkbenchNode,
    height: DEFAULT_NODE_VISUAL.height,
    inherit: 'vue-shape',
    ports: {
      groups: {
        input: {
          attrs: {
            circle: {
              fill: '#ffffff',
              magnet: 'passive',
              r: 5,
              stroke: '#64748b',
              strokeWidth: 2,
            },
          },
          position: 'left',
        },
        output: {
          attrs: {
            circle: {
              fill: '#ffffff',
              magnet: true,
              r: 5,
              stroke: '#2563eb',
              strokeWidth: 2,
            },
          },
          position: 'right',
        },
      },
    },
    shape: NODE_SHAPE,
    width: DEFAULT_NODE_VISUAL.width,
  });
  registered = true;
}

function toX6Ports(ports: FdmCreativeApi.WorkflowPort[]) {
  return ports.map((port) => ({
    attrs: {
      circle: {
        stroke: portColor(port.type),
      },
    },
    group: port.direction === 'INPUT' ? 'input' : 'output',
    id: port.id,
  }));
}

function portColor(type: FdmCreativeApi.PortType) {
  if (type.includes('image')) return '#16a34a';
  if (type.includes('video') || type === 'timeline') return '#0d9488';
  if (type === 'artifact-set') return '#64748b';
  return '#1677ff';
}

function edgeColor(edge: FdmCreativeApi.WorkflowEdge) {
  if (edge.sourcePortId === 'item' || edge.sourcePortId === 'plan') {
    return '#1677ff';
  }
  if (/compose|video|timeline/.test(`${edge.id}:${edge.sourcePortId}`)) {
    return '#0d9488';
  }
  if (/image|asset/.test(`${edge.id}:${edge.sourcePortId}`)) return '#16a34a';
  return '#1677ff';
}

function templateNode(
  template: CreativeNodeTemplate,
  position?: Pick<FdmCreativeApi.WorkflowNode, 'x' | 'y'>,
  overrides: Partial<FdmCreativeApi.WorkflowNode> = {},
): FdmCreativeApi.WorkflowNode {
  const visual = getCreativeNodeVisual(template.type);
  return {
    config: { ...template.defaultConfig },
    height: visual.height,
    id:
      template.type === 'content-planner'
        ? 'content-planner'
        : createLocalId('node'),
    name: template.label,
    ports: template.ports.map((port) => ({ ...port })),
    type: template.type,
    width: visual.width,
    ...(position ?? { x: 120, y: 120 }),
    ...overrides,
  };
}

function toX6Node(node: FdmCreativeApi.WorkflowNode) {
  const visual = getCreativeNodeVisual(node.type);
  return {
    data: {
      config: node.config,
      name: node.name,
      ports: node.ports,
      status: 'IDLE',
      type: node.type,
    },
    height: visual.height,
    id: node.id,
    ports: toX6Ports(node.ports),
    shape: NODE_SHAPE,
    width: visual.width,
    x: node.x,
    y: node.y,
    zIndex: 2,
  };
}

function toX6Edge(edge: FdmCreativeApi.WorkflowEdge) {
  return {
    attrs: {
      line: {
        stroke: edgeColor(edge),
        strokeLinecap: 'round',
        strokeWidth: 2,
        targetMarker: null,
      },
    },
    connector: { name: 'smooth', args: { direction: 'H' } },
    id: edge.id,
    source: { cell: edge.sourceNodeId, port: edge.sourcePortId },
    target: { cell: edge.targetNodeId, port: edge.targetPortId },
    zIndex: 1,
  };
}

export interface WorkbenchClientRect {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
  x: number;
  y: number;
}

export interface WorkbenchGraphCallbacks {
  onChange?: () => void;
  onNodeGeometryChange?: (nodeId: string) => void;
  onSelectionChange?: (node?: FdmCreativeApi.WorkflowNode) => void;
  onViewportChange?: () => void;
  onZoom?: (zoom: number) => void;
}

export interface WorkbenchGraphElements {
  container: HTMLElement;
  dndContainer?: HTMLElement;
  minimapContainer: HTMLElement;
}

export class WorkbenchGraphAdapter {
  readonly graph: Graph;
  private readonly callbacks: WorkbenchGraphCallbacks;
  private readonly dnd: Dnd;
  private readonly scroller: Scroller;
  private suppressChange = false;
  private viewportFrame?: number;

  constructor(
    elements: WorkbenchGraphElements,
    callbacks: WorkbenchGraphCallbacks = {},
  ) {
    registerWorkbenchShapes();
    this.callbacks = callbacks;
    this.graph = new Graph({
      autoResize: true,
      background: { color: '#f8fafc' },
      connecting: {
        allowBlank: false,
        allowEdge: false,
        allowLoop: false,
        allowNode: false,
        allowPort: true,
        createEdge: () =>
          new Shape.Edge({
            attrs: {
              line: {
                stroke: '#4f7cff',
                strokeLinecap: 'round',
                strokeWidth: 2,
                targetMarker: null,
              },
            },
            connector: { name: 'smooth', args: { direction: 'H' } },
            zIndex: 1,
          }),
        highlight: true,
        snap: { radius: 28 },
        validateConnection: ({
          sourceCell,
          sourcePort,
          targetCell,
          targetPort,
        }) => {
          if (
            !sourceCell?.isNode() ||
            !targetCell?.isNode() ||
            !sourcePort ||
            !targetPort
          ) {
            return false;
          }
          return validateWorkflowConnection({
            definition: this.serializeDefinition(),
            sourceNodeId: sourceCell.id,
            sourcePortId: sourcePort,
            targetNodeId: targetCell.id,
            targetPortId: targetPort,
          });
        },
      },
      container: elements.container,
      grid: {
        args: { color: '#d7e0ed', thickness: 1 },
        size: 16,
        type: 'dot',
        visible: true,
      },
      interacting: { edgeLabelMovable: false },
      mousewheel: {
        enabled: true,
        global: false,
        maxScale: 2,
        minScale: 0.25,
        modifiers: ['ctrl', 'meta'],
      },
      virtual: true,
    });

    this.scroller = new Scroller({
      autoResize: true,
      enabled: true,
      pageBreak: false,
      pageVisible: false,
      pannable: { enabled: true, eventTypes: ['leftMouseDown'] },
    });
    this.graph
      .use(this.scroller)
      .use(new Selection({ enabled: true, multiple: false, rubberband: false }))
      .use(new Snapline({ enabled: true }))
      .use(new History({ enabled: true, stackSize: 80 }))
      .use(new Clipboard({ enabled: true }))
      .use(
        new Keyboard({
          enabled: true,
          global: false,
          guard: (event) => !isEditableTarget(event.target),
        }),
      )
      .use(
        new MiniMap({
          container: elements.minimapContainer,
          height: 116,
          scalable: false,
          width: 160,
        }),
      );

    this.dnd = new Dnd({
      dndContainer: elements.dndContainer,
      getDragNode: (sourceNode) => sourceNode.clone(),
      getDropNode: (draggingNode) => draggingNode.clone(),
      scaled: false,
      target: this.graph,
    });
    this.scroller.container.addEventListener(
      'scroll',
      this.scheduleViewportChange,
      { passive: true },
    );
    this.bindEvents();
    this.bindShortcuts();
  }

  addNode(type: string, position?: { x: number; y: number }) {
    const template = CREATIVE_NODE_MAP.get(type);
    if (
      !template ||
      this.graph.getNodes().length >= MAX_WORKBENCH_NODES ||
      (type === 'content-planner' &&
        this.graph
          .getNodes()
          .some((node) => node.getData()?.type === 'content-planner'))
    ) {
      return undefined;
    }
    const definition = templateNode(template, position);
    this.graph.addNode(toX6Node(definition));
    return definition;
  }

  applyPlanAsBatch(plan: FdmCreativeApi.ContentPlan) {
    const videoItems = plan.items.filter((item) => item.kind === 'VIDEO');
    const needsVideoCompose = videoItems.length > 0;
    const desiredItemIds = new Set(plan.items.map((item) => item.itemId));
    const existingPlanner = this.graph
      .getNodes()
      .find(
        (node) =>
          node.id === 'content-planner' ||
          node.getData()?.type === 'content-planner',
      );
    const firstBranchY = 80;
    const branchGap = 190;
    const plannerVisual = getCreativeNodeVisual('content-planner');
    const planItemVisual = getCreativeNodeVisual('video-plan-item');
    const plannerY = Math.max(
      40,
      firstBranchY +
        ((plan.items.length - 1) * branchGap) / 2 +
        (planItemVisual.height - plannerVisual.height) / 2,
    );
    const plannerDefinition = existingPlanner
      ? this.workflowNodeFromCell(existingPlanner.id)!
      : templateNode(CREATIVE_NODE_MAP.get('content-planner')!, {
          x: 100,
          y: plannerY,
        });
    plannerDefinition.config = {
      ...plannerDefinition.config,
      planMode: plan.mode,
      prompt: plan.originalPrompt ?? plannerDefinition.config.prompt,
    };
    const desiredBranchNodeIds = new Set(
      plan.items.flatMap((item) => [
        `generate:${item.itemId}`,
        `plan-item:${item.itemId}`,
      ]),
    );
    const generatedNodeCount =
      [...desiredBranchNodeIds].filter((id) => !this.graph.getCellById(id))
        .length +
      (existingPlanner ? 0 : 1) +
      (needsVideoCompose && !this.graph.getCellById('video-compose') ? 1 : 0);
    const removablePlanNodeCount = this.graph.getNodes().filter((node) => {
      const id = node.id;
      const config = node.getData()?.config;
      const planItemId = config?.planItemId ?? config?.itemId;
      const legacyId =
        (id.startsWith('plan-') && !id.startsWith('plan-item:')) ||
        id.startsWith('generate-');
      return (
        (!needsVideoCompose && id === 'video-compose') ||
        legacyId ||
        ((id.startsWith('plan-item:') || id.startsWith('generate:')) &&
          typeof planItemId === 'string' &&
          !desiredItemIds.has(planItemId))
      );
    }).length;
    if (
      this.graph.getNodes().length -
        removablePlanNodeCount +
        generatedNodeCount >
      MAX_WORKBENCH_NODES
    ) {
      throw new Error(`画布节点不能超过 ${MAX_WORKBENCH_NODES} 个`);
    }

    const mergeNode = (definition: FdmCreativeApi.WorkflowNode) => {
      const existing = this.graph.getCellById(definition.id);
      if (!existing?.isNode()) {
        this.graph.addNode(toX6Node(definition));
        return;
      }
      const data = existing.getData() as {
        config?: Record<string, unknown>;
        name?: string;
      };
      const currentConfig = { ...data.config };
      const rawOverrides = currentConfig.userOverrides;
      const overrideKeys = new Set(
        Array.isArray(rawOverrides)
          ? rawOverrides.map(String)
          : Object.entries(
              rawOverrides && typeof rawOverrides === 'object'
                ? (rawOverrides as Record<string, unknown>)
                : {},
            )
              .filter(([, enabled]) => enabled === true)
              .map(([key]) => key),
      );
      for (const [key, value] of Object.entries(definition.config)) {
        if (!overrideKeys.has(key)) currentConfig[key] = value;
      }
      existing.setData({
        ...existing.getData(),
        config: currentConfig,
        name:
          overrideKeys.has('name') || overrideKeys.has('title')
            ? data.name
            : definition.name,
        ports: definition.ports,
        type: definition.type,
      });
      existing.removePorts();
      existing.addPorts(toX6Ports(definition.ports));
      const visual = getCreativeNodeVisual(definition.type);
      existing.resize(visual.width, visual.height);
    };

    this.graph.batchUpdate('apply-content-plan', () => {
      for (const node of [...this.graph.getNodes()]) {
        const id = node.id;
        const config = node.getData()?.config;
        const planItemId = config?.planItemId ?? config?.itemId;
        const legacyId =
          (id.startsWith('plan-') && !id.startsWith('plan-item:')) ||
          id.startsWith('generate-');
        if (
          legacyId ||
          ((id.startsWith('plan-item:') || id.startsWith('generate:')) &&
            typeof planItemId === 'string' &&
            !desiredItemIds.has(planItemId))
        ) {
          this.graph.removeNode(node);
        }
      }
      mergeNode(plannerDefinition);
      for (const [index, item] of plan.items.entries()) {
        const isImage = item.kind === 'IMAGE';
        const itemType = isImage ? 'image-plan-item' : 'video-plan-item';
        const generateType = isImage ? 'image-generate' : 'video-generate';
        const itemNode = templateNode(
          CREATIVE_NODE_MAP.get(itemType)!,
          {
            x: 440,
            y: firstBranchY + index * branchGap,
          },
          {
            config: { ...item, planItemId: item.itemId, prompt: item.prompt },
            id: `plan-item:${item.itemId}`,
            name: item.title,
          },
        );
        const generateNode = templateNode(
          CREATIVE_NODE_MAP.get(generateType)!,
          {
            x: 696,
            y: firstBranchY + index * branchGap,
          },
          {
            config: {
              capability: isImage ? 'TEXT_TO_IMAGE' : 'TEXT_TO_VIDEO',
              negativePrompt: item.negativePrompt,
              planItemId: item.itemId,
              prompt: item.prompt,
              ...(item.image ? { image: item.image } : {}),
              ...(item.video ? { video: item.video } : {}),
            },
            id: `generate:${item.itemId}`,
            name: `${item.title} · 生成`,
          },
        );
        mergeNode(itemNode);
        mergeNode(generateNode);
        const plannerEdgeId = `edge:planner:${item.itemId}`;
        if (!this.graph.getCellById(plannerEdgeId)) {
          this.graph.addEdge(
            toX6Edge({
              id: plannerEdgeId,
              sourceNodeId: plannerDefinition.id,
              sourcePortId: 'plan',
              targetNodeId: itemNode.id,
              targetPortId: 'plan',
            }),
          );
        }
        const generateEdgeId = `edge:generate:${item.itemId}`;
        if (!this.graph.getCellById(generateEdgeId)) {
          this.graph.addEdge(
            toX6Edge({
              id: generateEdgeId,
              sourceNodeId: itemNode.id,
              sourcePortId: 'item',
              targetNodeId: generateNode.id,
              targetPortId: 'item',
            }),
          );
        }
      }

      for (const edge of [...this.graph.getEdges()]) {
        const target = edge.getTarget();
        if (
          'cell' in target &&
          target.cell === 'video-compose' &&
          edge.id.startsWith('edge:compose:')
        ) {
          this.graph.removeEdge(edge);
        }
      }
      if (needsVideoCompose) {
        const composeVisual = getCreativeNodeVisual('video-compose');
        const lastBranchY = firstBranchY + (plan.items.length - 1) * branchGap;
        const composeDefinition = templateNode(
          CREATIVE_NODE_MAP.get('video-compose')!,
          {
            x: 950,
            y: Math.max(
              40,
              firstBranchY +
                (lastBranchY - firstBranchY) / 2 +
                (planItemVisual.height - composeVisual.height) / 2,
            ),
          },
          {
            config: {
              segmentOrder: videoItems.map((item) => `generate:${item.itemId}`),
            },
            id: 'video-compose',
            name: '视频合成',
          },
        );
        mergeNode(composeDefinition);
        for (const item of videoItems) {
          this.graph.addEdge(
            toX6Edge({
              id: `edge:compose:${item.itemId}`,
              sourceNodeId: `generate:${item.itemId}`,
              sourcePortId: 'asset',
              targetNodeId: 'video-compose',
              targetPortId: 'videos',
            }),
          );
        }
      } else {
        const compose = this.graph.getCellById('video-compose');
        if (compose?.isNode()) this.graph.removeNode(compose);
      }
    });
    // Generated plans can be much wider/taller than the viewport. Keep cards
    // readable at their designed size and move the viewport instead of
    // shrinking every card and its text with zoomToFit.
    this.graph.zoomTo(1);
    this.graph.centerContent();
    this.scheduleViewportChange();
  }

  clearSelection() {
    this.graph.cleanSelection();
    this.callbacks.onSelectionChange?.();
  }

  disposeWorkbenchGraph() {
    this.scroller.container.removeEventListener(
      'scroll',
      this.scheduleViewportChange,
    );
    if (this.viewportFrame !== undefined) {
      cancelAnimationFrame(this.viewportFrame);
      this.viewportFrame = undefined;
    }
    this.dnd.dispose();
    this.graph.dispose();
  }

  fit() {
    this.graph.zoomToFit({ maxScale: 1, padding: 36 });
  }

  getCanvasClientRect(): WorkbenchClientRect {
    return this.normalizeClientRect(
      this.scroller.container.getBoundingClientRect(),
    );
  }

  /**
   * Returns the node bounds relative to the visible X6 Scroller viewport.
   */
  getNodeCanvasRect(id: string): undefined | WorkbenchClientRect {
    const nodeRect = this.getNodeClientRect(id);
    if (!nodeRect) return undefined;
    const viewportRect = this.getCanvasClientRect();
    return this.createClientRect(
      nodeRect.left - viewportRect.left,
      nodeRect.top - viewportRect.top,
      nodeRect.width,
      nodeRect.height,
    );
  }

  /**
   * Returns the rendered node bounds in browser client coordinates. X6's
   * local-to-client transform includes graph zoom/translation and the
   * Scroller's current scroll offset, so DOM overlays can safely anchor to it.
   */
  getNodeClientRect(id: string): undefined | WorkbenchClientRect {
    const node = this.graph.getCellById(id);
    if (!node?.isNode()) return undefined;
    return this.normalizeClientRect(this.graph.localToClient(node.getBBox()));
  }

  redo() {
    if (this.graph.canRedo()) this.graph.redo();
  }

  restoreDefinition(
    definition: FdmCreativeApi.WorkflowDefinition = EMPTY_WORKFLOW,
    cleanHistory = true,
  ) {
    this.suppressChange = true;
    this.graph.batchUpdate('restore-workflow', () => {
      this.graph.clearCells();
      this.graph.addNodes(definition.nodes.map(toX6Node));
      this.graph.addEdges(definition.edges.map(toX6Edge));
      this.graph.zoomTo(definition.viewport.zoom || 1);
      this.graph.translate(
        definition.viewport.x || 0,
        definition.viewport.y || 0,
      );
    });
    if (cleanHistory) this.graph.cleanHistory();
    this.suppressChange = false;
  }

  serializeDefinition(): FdmCreativeApi.WorkflowDefinition {
    const translation = this.graph.translate();
    return {
      edges: this.graph.getEdges().flatMap((edge) => {
        const source = edge.getSource();
        const target = edge.getTarget();
        if (
          !('cell' in source) ||
          !('port' in source) ||
          !('cell' in target) ||
          !('port' in target) ||
          !source.cell ||
          !source.port ||
          !target.cell ||
          !target.port
        ) {
          return [];
        }
        return [
          {
            id: edge.id,
            sourceNodeId: String(source.cell),
            sourcePortId: source.port,
            targetNodeId: String(target.cell),
            targetPortId: target.port,
          },
        ];
      }),
      nodes: this.graph
        .getNodes()
        .map((node) => this.workflowNodeFromCell(node.id)!),
      schemaVersion: 1,
      viewport: {
        x: translation.tx,
        y: translation.ty,
        zoom: this.graph.zoom(),
      },
    };
  }

  setNodeDisplayData(id: string, display: Record<string, unknown>) {
    const node = this.graph.getCellById(id);
    if (!node?.isNode()) return;
    node.setData(
      { ...node.getData(), display },
      { ignoreHistory: true, workbenchRuntime: true },
    );
  }

  setNodeStatus(id: string, status: string) {
    const node = this.graph.getCellById(id);
    if (node?.isNode()) {
      node.setData(
        { ...node.getData(), status },
        { ignoreHistory: true, workbenchRuntime: true },
      );
    }
  }

  startDrag(template: CreativeNodeTemplate, event: MouseEvent) {
    if (
      this.graph.getNodes().length >= MAX_WORKBENCH_NODES ||
      (template.type === 'content-planner' &&
        this.graph
          .getNodes()
          .some((node) => node.getData()?.type === 'content-planner'))
    ) {
      return false;
    }
    const definition = templateNode(template);
    const source = this.graph.createNode(toX6Node(definition));
    this.dnd.start(source, event);
    return true;
  }

  undo() {
    if (this.graph.canUndo()) this.graph.undo();
  }

  updateNode(
    id: string,
    patch: { config?: Record<string, unknown>; name?: string },
  ) {
    const node = this.graph.getCellById(id);
    if (!node?.isNode()) return;
    node.setData({ ...node.getData(), ...patch });
  }

  zoomBy(delta: number) {
    const next = Math.min(2, Math.max(0.25, this.graph.zoom() + delta));
    this.graph.zoomTo(next);
  }

  private bindEvents() {
    const changed = () => {
      if (!this.suppressChange) this.callbacks.onChange?.();
    };
    this.graph.on('cell:added', changed);
    this.graph.on('cell:removed', changed);
    this.graph.on('node:change:position', ({ node }) => {
      changed();
      this.callbacks.onNodeGeometryChange?.(node.id);
    });
    this.graph.on('node:change:size', ({ node }) => {
      changed();
      this.callbacks.onNodeGeometryChange?.(node.id);
    });
    this.graph.on('node:change:data', ({ options }) => {
      if (!options?.workbenchRuntime) changed();
    });
    this.graph.on('edge:connected', changed);
    this.graph.on('scale', ({ sx }) => {
      this.callbacks.onZoom?.(sx);
      this.scheduleViewportChange();
    });
    this.graph.on('translate', this.scheduleViewportChange);
    this.graph.on('resize', this.scheduleViewportChange);
    this.graph.on('cell:selected', ({ cell }) => {
      this.callbacks.onSelectionChange?.(
        cell.isNode() ? this.workflowNodeFromCell(cell.id) : undefined,
      );
    });
    this.graph.on('blank:click', () => this.callbacks.onSelectionChange?.());
  }

  private bindShortcuts() {
    this.graph.bindKey(['backspace', 'delete'], (event) => {
      if (isEditableTarget(event.target)) return;
      const cells = this.graph.getSelectedCells();
      if (cells.length > 0) this.graph.removeCells(cells);
    });
    this.graph.bindKey(['ctrl+z', 'meta+z'], (event) => {
      if (!isEditableTarget(event.target) && this.graph.canUndo()) {
        this.graph.undo();
      }
    });
    this.graph.bindKey(['ctrl+shift+z', 'meta+shift+z'], (event) => {
      if (!isEditableTarget(event.target) && this.graph.canRedo()) {
        this.graph.redo();
      }
    });
    this.graph.bindKey(['ctrl+c', 'meta+c'], (event) => {
      if (!isEditableTarget(event.target)) {
        this.graph.copy(this.graph.getSelectedCells());
      }
    });
    this.graph.bindKey(['ctrl+v', 'meta+v'], (event) => {
      if (!isEditableTarget(event.target)) this.graph.paste({ offset: 28 });
    });
  }

  private createClientRect(
    x: number,
    y: number,
    width: number,
    height: number,
  ): WorkbenchClientRect {
    return {
      bottom: y + height,
      height,
      left: x,
      right: x + width,
      top: y,
      width,
      x,
      y,
    };
  }

  private normalizeClientRect(rect: {
    height: number;
    width: number;
    x: number;
    y: number;
  }): WorkbenchClientRect {
    return this.createClientRect(rect.x, rect.y, rect.width, rect.height);
  }

  private readonly scheduleViewportChange = () => {
    if (this.viewportFrame !== undefined) return;
    this.viewportFrame = requestAnimationFrame(() => {
      this.viewportFrame = undefined;
      this.callbacks.onViewportChange?.();
    });
  };

  private workflowNodeFromCell(id: string) {
    const node = this.graph.getCellById(id);
    if (!node?.isNode()) return undefined;
    const data = node.getData() as {
      config?: Record<string, unknown>;
      name?: string;
      ports?: FdmCreativeApi.WorkflowPort[];
      type?: string;
    };
    const position = node.getPosition();
    const size = node.getSize();
    return {
      config: data.config ?? {},
      height: size.height,
      id: node.id,
      name: data.name ?? node.id,
      ports: data.ports ?? [],
      type: data.type ?? 'unknown',
      width: size.width,
      x: position.x,
      y: position.y,
    } satisfies FdmCreativeApi.WorkflowNode;
  }
}

export function createWorkbenchGraph(
  elements: WorkbenchGraphElements,
  callbacks?: WorkbenchGraphCallbacks,
) {
  return new WorkbenchGraphAdapter(elements, callbacks);
}

export function serializeDefinition(adapter: WorkbenchGraphAdapter) {
  return adapter.serializeDefinition();
}

export function restoreDefinition(
  adapter: WorkbenchGraphAdapter,
  definition: FdmCreativeApi.WorkflowDefinition,
) {
  adapter.restoreDefinition(definition);
}

export function applyPlanAsBatch(
  adapter: WorkbenchGraphAdapter,
  plan: FdmCreativeApi.ContentPlan,
) {
  adapter.applyPlanAsBatch(plan);
}

export function disposeWorkbenchGraph(adapter: WorkbenchGraphAdapter) {
  adapter.disposeWorkbenchGraph();
}
