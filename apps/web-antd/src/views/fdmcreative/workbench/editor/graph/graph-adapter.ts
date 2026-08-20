import type { Edge, Node } from '@antv/x6';

import type {
  CreativeNodeTemplate,
  CreativeQuickConnectOption,
} from './catalog';

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
import {
  CREATIVE_NODE_MAP,
  getQuickConnectOptions as getCatalogQuickConnectOptions,
  getCreativeNodeVisual,
  normalizeCreativeNodeConfig,
  normalizeCreativeNodePorts,
  normalizeCreativeWorkflowEdges,
} from './catalog';
import {
  EMPTY_WORKFLOW,
  findAutoConnectTargetPort,
  isEditableTarget,
  validateWorkflowConnection,
} from './workflow-utils';

const NODE_SHAPE = 'fdm-creative-vue-node';
const DEFAULT_NODE_VISUAL = getCreativeNodeVisual('creative-brief');
const PROMPT_PORT_COLOR = '#7c3aed';
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
  if (type === 'prompt-text') return PROMPT_PORT_COLOR;
  if (type.includes('image')) return '#16a34a';
  if (type.includes('video') || type === 'timeline') return '#0d9488';
  if (type.includes('audio')) return '#a855f7';
  if (type === 'artifact-set') return '#64748b';
  return '#1677ff';
}

function edgeColor(edge: FdmCreativeApi.WorkflowEdge) {
  if (edge.sourcePortId === 'prompt') return PROMPT_PORT_COLOR;
  if (edge.sourcePortId === 'item' || edge.sourcePortId === 'plan') {
    return '#1677ff';
  }
  if (/compose|video|timeline/.test(`${edge.id}:${edge.sourcePortId}`)) {
    return '#0d9488';
  }
  if (/audio|music/.test(`${edge.id}:${edge.sourcePortId}`)) return '#a855f7';
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
  const ports = normalizeCreativeNodePorts(node.type, node.ports);
  return {
    data: {
      config: normalizeCreativeNodeConfig(node.type, node.config),
      name: node.name,
      ports,
      status: 'IDLE',
      type: node.type,
    },
    height: visual.height,
    id: node.id,
    ports: toX6Ports(ports),
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

export interface WorkbenchPoint {
  x: number;
  y: number;
}

export interface WorkbenchNavigationNode {
  color: string;
  icon: string;
  id: string;
  label: string;
  name: string;
  status: string;
  type: string;
}

export interface WorkbenchBlankConnectionRequest {
  clientPoint: WorkbenchPoint;
  graphPoint: WorkbenchPoint;
  options: CreativeQuickConnectOption[];
  sourceNodeId: string;
  sourcePortId: string;
  sourcePortType: FdmCreativeApi.PortType;
}

/**
 * A result-history asset can only enter the graph through a normal FDM
 * image/video input node.  The value is the stable asset id, never a provider
 * URL or a browser-side file copy.
 */
export interface WorkbenchMediaBranchRequest {
  assetId: FdmCreativeApi.MediaLongId;
  assetKind: 'AUDIO' | 'IMAGE' | 'VIDEO';
  assetName?: string;
  originNodeId?: string;
  tool?: FdmCreativeApi.MediaToolDescriptor;
}

export interface WorkbenchMediaBranchResult {
  derivedNode?: FdmCreativeApi.WorkflowNode;
  inputNode: FdmCreativeApi.WorkflowNode;
  nodeIds: string[];
}

export interface WorkbenchGraphCallbacks {
  onChange?: () => void;
  onConnectToBlank?: (request: WorkbenchBlankConnectionRequest) => void;
  /** True while a node is being dragged; the second value is true only when its geometry changed. */
  onNodeDragStateChange?: (dragging: boolean, changed?: boolean) => void;
  onNavigationChange?: () => void;
  onNodeGeometryChange?: (nodeId: string) => void;
  onSelectionChange?: (node?: FdmCreativeApi.WorkflowNode) => void;
  onViewportChange?: () => void;
  onZoom?: (zoom: number) => void;
}

export interface WorkbenchGraphElements {
  container: HTMLElement;
  dndContainer?: HTMLElement;
  minimapContainer: HTMLElement;
  readonly?: boolean;
}

export class WorkbenchGraphAdapter {
  readonly graph: Graph;
  private readonly callbacks: WorkbenchGraphCallbacks;
  private readonly connectingEdgeIds = new Set<string>();
  private readonly dnd: Dnd;
  private nodeDragActive = false;
  private nodeGeometryChangedDuringDrag = false;
  private readonly pendingNodeTargetPorts = new Map<
    string,
    Map<string, string>
  >();
  private readonly readOnly: boolean;
  private readonly scroller: Scroller;
  private suppressChange = false;
  private viewportFrame?: number;

  constructor(
    elements: WorkbenchGraphElements,
    callbacks: WorkbenchGraphCallbacks = {},
  ) {
    registerWorkbenchShapes();
    this.callbacks = callbacks;
    this.readOnly = elements.readonly === true;
    const borderToken = getComputedStyle(elements.container)
      .getPropertyValue('--border')
      .trim();
    this.graph = new Graph({
      autoResize: true,
      background: { color: 'transparent' },
      connecting: {
        allowBlank: ({ edge }) =>
          !this.readOnly &&
          Boolean(edge && this.connectingEdgeIds.has(edge.id)),
        allowEdge: false,
        allowLoop: false,
        allowNode: ({ type }) => !this.readOnly && type === 'target',
        allowPort: !this.readOnly,
        createEdge: () => {
          const edge = new Shape.Edge({
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
          });
          this.connectingEdgeIds.add(edge.id);
          return edge;
        },
        highlight: true,
        snap: false,
        validateConnection: ({
          edge,
          sourceCell,
          sourcePort,
          targetCell,
          targetPort,
          type,
        }) => {
          if (this.readOnly) return false;
          if (!sourceCell?.isNode() || !targetCell?.isNode() || !sourcePort) {
            return false;
          }
          const definition = this.connectionDefinition(edge?.id);
          let resolvedTargetPort = targetPort ?? undefined;
          if (!resolvedTargetPort) {
            if (type !== 'target' || !edge) return false;
            resolvedTargetPort = findAutoConnectTargetPort({
              definition,
              preferredTargetPortIds: this.preferredInputPortIds(
                targetCell,
                edge.getTargetPoint(),
              ),
              sourceNodeId: sourceCell.id,
              sourcePortId: sourcePort,
              targetNodeId: targetCell.id,
            });
            if (!resolvedTargetPort) return false;
            const targetPorts =
              this.pendingNodeTargetPorts.get(edge.id) ?? new Map();
            targetPorts.set(targetCell.id, resolvedTargetPort);
            this.pendingNodeTargetPorts.set(edge.id, targetPorts);
          }
          return validateWorkflowConnection({
            definition,
            sourceNodeId: sourceCell.id,
            sourcePortId: sourcePort,
            targetNodeId: targetCell.id,
            targetPortId: resolvedTargetPort,
          });
        },
        validateEdge: ({ edge, type }) => {
          if (this.readOnly) return false;
          // Existing edges may be reconnected to another valid port, but
          // neither terminal is ever allowed to remain on blank canvas.
          if (type !== 'target') {
            this.pendingNodeTargetPorts.delete(edge.id);
            return Boolean(edge.getSourceCellId());
          }
          const targetNodeId = edge.getTargetCellId();
          if (targetNodeId) {
            if (!edge.getTargetPortId()) {
              const targetPortId = this.resolvePendingTargetPort(edge);
              if (!targetPortId) {
                this.pendingNodeTargetPorts.delete(edge.id);
                return false;
              }
              edge.setTarget(
                { cell: targetNodeId, port: targetPortId },
                { ui: true },
              );
            }
            this.pendingNodeTargetPorts.delete(edge.id);
            this.connectingEdgeIds.delete(edge.id);
            return true;
          }
          this.pendingNodeTargetPorts.delete(edge.id);
          if (!this.connectingEdgeIds.has(edge.id)) return false;
          const sourceNodeId = edge.getSourceCellId();
          const sourcePortId = edge.getSourcePortId();
          if (!sourceNodeId || !sourcePortId) return false;
          const sourceNode = this.workflowNodeFromCell(sourceNodeId);
          const sourcePort = sourceNode?.ports.find(
            (port) => port.id === sourcePortId && port.direction === 'OUTPUT',
          );
          if (!sourcePort) return false;
          const graphPoint = edge.getTargetPoint();
          const clientPoint = this.graph.localToClient(graphPoint);
          const request: WorkbenchBlankConnectionRequest = {
            clientPoint: { x: clientPoint.x, y: clientPoint.y },
            graphPoint: { x: graphPoint.x, y: graphPoint.y },
            options: this.getQuickConnectOptions(sourceNodeId, sourcePortId),
            sourceNodeId,
            sourcePortId,
            sourcePortType: sourcePort.type,
          };
          // Wait until X6 removes the rejected temporary edge and closes its
          // internal `add-edge` history batch before opening the Vue picker.
          queueMicrotask(() => {
            this.connectingEdgeIds.delete(edge.id);
            this.callbacks.onConnectToBlank?.(request);
          });
          return false;
        },
      },
      container: elements.container,
      grid: {
        args: {
          color: borderToken ? `hsl(${borderToken})` : '#d7e0ed',
          thickness: 1,
        },
        size: 16,
        type: 'dot',
        visible: true,
      },
      interacting: {
        edgeLabelMovable: false,
        edgeMovable: !this.readOnly,
        magnetConnectable: !this.readOnly,
        nodeMovable: !this.readOnly,
      },
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

  addConnectedNode(
    request: WorkbenchBlankConnectionRequest,
    selectedOption: CreativeQuickConnectOption,
  ) {
    if (this.readOnly) return undefined;
    const option = this.getQuickConnectOptions(
      request.sourceNodeId,
      request.sourcePortId,
    ).find(
      (item) =>
        item.template.type === selectedOption.template.type &&
        item.targetPortId === selectedOption.targetPortId,
    );
    if (!option) return undefined;
    const visual = getCreativeNodeVisual(option.template.type);
    const inputPorts = option.template.ports.filter(
      (port) => port.direction === 'INPUT',
    );
    const inputIndex = Math.max(
      0,
      inputPorts.findIndex((port) => port.id === option.targetPortId),
    );
    const targetPortOffset =
      (visual.height * (inputIndex + 1)) / (inputPorts.length + 1);
    let definition: FdmCreativeApi.WorkflowNode | undefined;
    this.graph.batchUpdate('quick-connect-node', () => {
      definition = this.addNode(option.template.type, {
        x: request.graphPoint.x + 24,
        y: request.graphPoint.y - targetPortOffset,
      });
      if (!definition) return;
      const connection = {
        definition: this.serializeDefinition(),
        sourceNodeId: request.sourceNodeId,
        sourcePortId: request.sourcePortId,
        targetNodeId: definition.id,
        targetPortId: option.targetPortId,
      };
      if (!validateWorkflowConnection(connection)) {
        this.graph.removeNode(definition.id);
        definition = undefined;
        return;
      }
      this.graph.addEdge(
        toX6Edge({
          id: createLocalId('edge'),
          sourceNodeId: connection.sourceNodeId,
          sourcePortId: connection.sourcePortId,
          targetNodeId: connection.targetNodeId,
          targetPortId: connection.targetPortId,
        }),
      );
    });
    if (definition) this.graph.select(definition.id);
    return definition;
  }

  /**
   * Build a visible, editable workflow branch from a selected result asset.
   * No external model request occurs here: the user confirms the operation by
   * creating the branch, and the normal workflow save/run paths own execution.
   */
  addMediaToolBranch(
    request: WorkbenchMediaBranchRequest,
  ): undefined | WorkbenchMediaBranchResult {
    const tool = request.tool;
    if (
      this.readOnly ||
      !tool ||
      !tool.available ||
      !tool.applicableAssetKinds.includes(request.assetKind)
    ) {
      return undefined;
    }
    const additions = tool.template === 'MULTI_ANGLE_V1' ? 4 : 2;
    if (this.graph.getNodes().length + additions > MAX_WORKBENCH_NODES) {
      return undefined;
    }
    const inputNode = this.createPinnedMediaInput(request);
    if (!inputNode) return undefined;

    let derivedNode: FdmCreativeApi.WorkflowNode | undefined;
    let nodeIds: string[] = [];
    this.graph.batchUpdate('create-media-tool-branch', () => {
      if (tool.template === 'MULTI_ANGLE_V1') {
        const branch = this.addMultiAngleBranch(inputNode, tool);
        if (!branch) return;
        derivedNode = branch.derivedNode;
        nodeIds = branch.nodeIds;
        return;
      }
      const template = CREATIVE_NODE_MAP.get(tool.generatedNodeType);
      if (!template) return;
      derivedNode = templateNode(template, this.rightOf(inputNode, 56), {
        config: {
          ...template.defaultConfig,
          ...tool.defaultConfig,
        },
      });
      const targetPortId = this.resolveMediaToolInputPort(
        tool,
        request.assetKind,
      );
      if (
        !targetPortId ||
        !this.canAddBranchEdge(inputNode, derivedNode, targetPortId)
      ) {
        derivedNode = undefined;
        return;
      }
      this.graph.addNode(toX6Node(inputNode));
      this.graph.addNode(toX6Node(derivedNode));
      this.graph.addEdge(
        toX6Edge({
          id: createLocalId('edge'),
          sourceNodeId: inputNode.id,
          sourcePortId: 'asset',
          targetNodeId: derivedNode.id,
          targetPortId,
        }),
      );
      nodeIds = [inputNode.id, derivedNode.id];
    });
    if (!derivedNode || nodeIds.length === 0) return undefined;
    this.graph.select(derivedNode.id);
    return { derivedNode, inputNode, nodeIds };
  }

  addNode(type: string, position?: { x: number; y: number }) {
    if (this.readOnly) return undefined;
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

  /**
   * Pin a historical, project-scoped result to a regular input node. This is
   * deliberately one history batch so one Undo removes the whole insertion.
   */
  addPinnedMediaAsset(
    request: Omit<WorkbenchMediaBranchRequest, 'tool'>,
  ): undefined | WorkbenchMediaBranchResult {
    if (this.readOnly || !request.assetId) return undefined;
    if (this.graph.getNodes().length >= MAX_WORKBENCH_NODES) return undefined;
    const inputNode = this.createPinnedMediaInput(request);
    if (!inputNode) return undefined;
    this.graph.batchUpdate('pin-result-asset', () => {
      this.graph.addNode(toX6Node(inputNode));
    });
    this.graph.select(inputNode.id);
    return { inputNode, nodeIds: [inputNode.id] };
  }

  applyPlanAsBatch(plan: FdmCreativeApi.ContentPlan) {
    if (this.readOnly) return;
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
    const branchGap = 148;
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
            x: 360,
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
            x: 584,
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
            x: 824,
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
    if (plan.items.length > 4) this.fit();
    else {
      this.graph.zoomTo(1);
      this.graph.centerContent();
    }
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

  focusNode(id: string, minimumZoom = 0.65) {
    const node = this.graph.getCellById(id);
    if (!node?.isNode()) return false;
    if (this.graph.zoom() < minimumZoom) this.graph.zoomTo(minimumZoom);
    this.graph.select(node);
    this.graph.centerCell(node, { padding: 72 });
    this.scheduleViewportChange();
    return true;
  }

  getCanvasClientRect(): WorkbenchClientRect {
    return this.normalizeClientRect(
      this.scroller.container.getBoundingClientRect(),
    );
  }

  getNavigationNodes(): WorkbenchNavigationNode[] {
    return this.graph.getNodes().map((node) => {
      const data = node.getData() ?? {};
      const type = String(data.type ?? 'creative-brief');
      const template = CREATIVE_NODE_MAP.get(type);
      return {
        color: template?.color ?? '#64748b',
        icon: template?.icon ?? 'lucide:box',
        id: node.id,
        label: template?.label ?? type,
        name: String(data.name ?? template?.label ?? type),
        status: String(data.status ?? 'IDLE'),
        type,
      };
    });
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

  getQuickConnectOptions(sourceNodeId: string, sourcePortId: string) {
    if (this.readOnly) return [];
    if (this.graph.getNodes().length >= MAX_WORKBENCH_NODES) return [];
    const sourceNode = this.workflowNodeFromCell(sourceNodeId);
    const sourcePort = sourceNode?.ports.find(
      (port) => port.id === sourcePortId && port.direction === 'OUTPUT',
    );
    if (!sourcePort) return [];
    const hasPlanner = this.graph
      .getNodes()
      .some((node) => node.getData()?.type === 'content-planner');
    return getCatalogQuickConnectOptions(sourcePort.type).filter(
      (option) => option.template.type !== 'content-planner' || !hasPlanner,
    );
  }

  redo() {
    if (!this.readOnly && this.graph.canRedo()) this.graph.redo();
  }

  /**
   * Agent application always receives a fully validated server draft. Keep the restoration as one
   * named X6 history batch so the UI does not replay the model's individual patch operations.
   */
  restoreAuthoritativeAgentDefinition(
    definition: FdmCreativeApi.WorkflowDefinition,
  ) {
    this.restoreDefinition(
      definition,
      false,
      'agent-apply-authoritative-draft',
    );
  }

  restoreDefinition(
    definition: FdmCreativeApi.WorkflowDefinition = EMPTY_WORKFLOW,
    cleanHistory = true,
    batchName = 'restore-workflow',
  ) {
    this.suppressChange = true;
    this.graph.batchUpdate(batchName, () => {
      this.graph.clearCells();
      this.graph.addNodes(definition.nodes.map(toX6Node));
      this.graph.addEdges(
        normalizeCreativeWorkflowEdges(definition.nodes, definition.edges).map(
          (edge) => toX6Edge(edge),
        ),
      );
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
    const currentDisplay = node.getData()?.display;
    node.setData(
      {
        ...node.getData(),
        display: {
          ...(currentDisplay &&
          typeof currentDisplay === 'object' &&
          !Array.isArray(currentDisplay)
            ? currentDisplay
            : {}),
          ...display,
        },
      },
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
      this.callbacks.onNavigationChange?.();
    }
  }

  startDrag(template: CreativeNodeTemplate, event: MouseEvent) {
    if (this.readOnly) return false;
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
    if (!this.readOnly && this.graph.canUndo()) this.graph.undo();
  }

  updateNode(
    id: string,
    patch: { config?: Record<string, unknown>; name?: string },
  ) {
    if (this.readOnly) return;
    const node = this.graph.getCellById(id);
    if (!node?.isNode()) return;
    node.setData({ ...node.getData(), ...patch });
  }

  zoomBy(delta: number) {
    const next = Math.min(2, Math.max(0.25, this.graph.zoom() + delta));
    this.graph.zoomTo(next);
  }

  private addMultiAngleBranch(
    inputNode: FdmCreativeApi.WorkflowNode,
    tool: FdmCreativeApi.MediaToolDescriptor,
  ): undefined | WorkbenchMediaBranchResult {
    const promptTemplate = CREATIVE_NODE_MAP.get('prompt-template');
    const imageToImage = CREATIVE_NODE_MAP.get('image-to-image');
    const imageCollection = CREATIVE_NODE_MAP.get('image-collection');
    if (!promptTemplate || !imageToImage || !imageCollection) return undefined;
    const promptNode = templateNode(
      promptTemplate,
      this.rightOf(inputNode, 56),
      {
        config: {
          ...promptTemplate.defaultConfig,
          language: 'ZH_CN',
          prompt: '请基于参考图生成多角度视图：正面、45 度、侧面和细节特写。',
          targetType: 'IMAGE',
        },
        name: '多角度提示词',
      },
    );
    const generationNode = templateNode(
      imageToImage,
      this.rightOf(promptNode, 56),
      {
        config: {
          ...imageToImage.defaultConfig,
          ...tool.defaultConfig,
          outputCount: 4,
          prompt: '请基于参考图生成多角度视图：正面、45 度、侧面和细节特写。',
        },
        name: '多角度生成',
      },
    );
    const collectionNode = templateNode(
      imageCollection,
      this.rightOf(generationNode, 56),
      { name: '多角度图片集合' },
    );
    const proposed = [
      {
        sourceNodeId: inputNode.id,
        sourcePortId: 'asset',
        targetNodeId: generationNode.id,
        targetPortId: 'reference',
      },
      {
        sourceNodeId: promptNode.id,
        sourcePortId: 'prompt',
        targetNodeId: generationNode.id,
        targetPortId: 'prompt',
      },
      {
        sourceNodeId: generationNode.id,
        sourcePortId: 'asset',
        targetNodeId: collectionNode.id,
        targetPortId: 'images',
      },
    ];
    const definition = this.serializeDefinition();
    definition.nodes.push(
      inputNode,
      promptNode,
      generationNode,
      collectionNode,
    );
    for (const edge of proposed) {
      if (!validateWorkflowConnection({ definition, ...edge }))
        return undefined;
      definition.edges.push({ id: createLocalId('edge-probe'), ...edge });
    }
    this.graph.addNodes(
      [inputNode, promptNode, generationNode, collectionNode].map((node) =>
        toX6Node(node),
      ),
    );
    for (const edge of proposed) {
      this.graph.addEdge(toX6Edge({ id: createLocalId('edge'), ...edge }));
    }
    return {
      derivedNode: generationNode,
      inputNode,
      nodeIds: [
        inputNode.id,
        promptNode.id,
        generationNode.id,
        collectionNode.id,
      ],
    };
  }

  private bindEvents() {
    const changed = () => {
      if (!this.suppressChange) this.callbacks.onChange?.();
    };
    this.graph.on('cell:added', ({ cell }) => {
      if (!this.connectingEdgeIds.has(cell.id)) changed();
    });
    this.graph.on('cell:removed', ({ cell }) => {
      if (this.connectingEdgeIds.has(cell.id)) {
        queueMicrotask(() => this.connectingEdgeIds.delete(cell.id));
      } else {
        changed();
      }
    });
    this.graph.on('node:change:position', ({ node }) => {
      if (this.nodeDragActive) this.nodeGeometryChangedDuringDrag = true;
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
    this.graph.on('node:mousedown', () => {
      if (this.readOnly) return;
      this.nodeDragActive = true;
      this.nodeGeometryChangedDuringDrag = false;
      this.callbacks.onNodeDragStateChange?.(true);
    });
    this.graph.on('node:mouseup', () => this.finishNodeDrag());
    this.graph.on('blank:mouseup', () => this.finishNodeDrag());
    this.graph.on('edge:connected', ({ edge }) => {
      const sourceNodeId = edge.getSourceCellId();
      const sourcePortId = edge.getSourcePortId();
      const sourcePort = sourceNodeId
        ? this.workflowNodeFromCell(sourceNodeId)?.ports.find(
            (port) => port.direction === 'OUTPUT' && port.id === sourcePortId,
          )
        : undefined;
      if (sourcePort) {
        edge.attr('line/stroke', portColor(sourcePort.type));
      }
      changed();
    });
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
      if (this.readOnly || isEditableTarget(event.target)) return;
      const cells = this.graph.getSelectedCells();
      if (cells.length > 0) this.graph.removeCells(cells);
    });
    this.graph.bindKey(['ctrl+z', 'meta+z'], (event) => {
      if (
        !this.readOnly &&
        !isEditableTarget(event.target) &&
        this.graph.canUndo()
      ) {
        this.graph.undo();
      }
    });
    this.graph.bindKey(['ctrl+shift+z', 'meta+shift+z'], (event) => {
      if (
        !this.readOnly &&
        !isEditableTarget(event.target) &&
        this.graph.canRedo()
      ) {
        this.graph.redo();
      }
    });
    this.graph.bindKey(['ctrl+c', 'meta+c'], (event) => {
      if (!isEditableTarget(event.target)) {
        this.graph.copy(this.graph.getSelectedCells());
      }
    });
    this.graph.bindKey(['ctrl+v', 'meta+v'], (event) => {
      if (!this.readOnly && !isEditableTarget(event.target)) {
        this.graph.paste({ offset: 28 });
      }
    });
  }

  private canAddBranchEdge(
    inputNode: FdmCreativeApi.WorkflowNode,
    derivedNode: FdmCreativeApi.WorkflowNode,
    targetPortId: string,
  ) {
    const definition = this.serializeDefinition();
    definition.nodes.push(inputNode, derivedNode);
    return validateWorkflowConnection({
      definition,
      sourceNodeId: inputNode.id,
      sourcePortId: 'asset',
      targetNodeId: derivedNode.id,
      targetPortId,
    });
  }

  private connectionDefinition(edgeId?: string) {
    const definition = this.serializeDefinition();
    if (!edgeId) return definition;
    return {
      ...definition,
      edges: definition.edges.filter((edge) => edge.id !== edgeId),
    };
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

  private createPinnedMediaInput(
    request: Omit<WorkbenchMediaBranchRequest, 'tool'>,
  ) {
    const type =
      request.assetKind === 'AUDIO'
        ? 'audio-input'
        : request.assetKind === 'VIDEO'
          ? 'video-input'
          : 'image-input';
    const template = CREATIVE_NODE_MAP.get(type);
    if (!template) return undefined;
    const origin = request.originNodeId
      ? this.workflowNodeFromCell(request.originNodeId)
      : undefined;
    const position = origin
      ? this.rightOf(origin, 56)
      : { x: 120, y: 120 + this.graph.getNodes().length * 12 };
    return templateNode(template, position, {
      config: {
        ...template.defaultConfig,
        assetId: request.assetId,
      },
      name: request.assetName?.trim() || template.label,
    });
  }

  private finishNodeDrag() {
    if (!this.nodeDragActive) return;
    const changed = this.nodeGeometryChangedDuringDrag;
    this.nodeDragActive = false;
    this.nodeGeometryChangedDuringDrag = false;
    this.callbacks.onNodeDragStateChange?.(false, changed);
  }

  private normalizeClientRect(rect: {
    height: number;
    width: number;
    x: number;
    y: number;
  }): WorkbenchClientRect {
    return this.createClientRect(rect.x, rect.y, rect.width, rect.height);
  }

  private preferredInputPortIds(targetCell: Node, point: WorkbenchPoint) {
    const targetNode = this.workflowNodeFromCell(targetCell.id);
    const inputPorts =
      targetNode?.ports.filter((port) => port.direction === 'INPUT') ?? [];
    const layouts = targetCell.getPortsPosition('input');
    const origin = targetCell.getBBox().getOrigin();
    return inputPorts
      .map((port, index) => {
        const position = layouts[port.id]?.position;
        return {
          distance: position
            ? Math.hypot(
                origin.x + position.x - point.x,
                origin.y + position.y - point.y,
              )
            : Number.MAX_SAFE_INTEGER,
          index,
          portId: port.id,
        };
      })
      .toSorted(
        (left, right) =>
          left.distance - right.distance || left.index - right.index,
      )
      .map((item) => item.portId);
  }

  private resolveMediaToolInputPort(
    tool: FdmCreativeApi.MediaToolDescriptor,
    assetKind: 'AUDIO' | 'IMAGE' | 'VIDEO',
  ) {
    if (tool.generatedNodeType === 'asset-library-output') {
      return assetKind === 'AUDIO'
        ? 'audio'
        : assetKind === 'VIDEO'
          ? 'video'
          : 'image';
    }
    const template = CREATIVE_NODE_MAP.get(tool.generatedNodeType);
    if (!template) return undefined;
    const requested = template.ports.find(
      (port) => port.direction === 'INPUT' && port.id === tool.inputPort,
    );
    return requested?.id;
  }

  private resolvePendingTargetPort(edge: Edge) {
    const sourceNodeId = edge.getSourceCellId();
    const sourcePortId = edge.getSourcePortId();
    const targetNodeId = edge.getTargetCellId();
    if (!sourceNodeId || !sourcePortId || !targetNodeId) return undefined;

    const definition = this.connectionDefinition(edge.id);
    const rememberedPortId = this.pendingNodeTargetPorts
      .get(edge.id)
      ?.get(targetNodeId);
    if (
      rememberedPortId &&
      validateWorkflowConnection({
        definition,
        sourceNodeId,
        sourcePortId,
        targetNodeId,
        targetPortId: rememberedPortId,
      })
    ) {
      return rememberedPortId;
    }
    return findAutoConnectTargetPort({
      definition,
      sourceNodeId,
      sourcePortId,
      targetNodeId,
    });
  }

  private rightOf(
    source: Pick<FdmCreativeApi.WorkflowNode, 'height' | 'width' | 'x' | 'y'>,
    gap: number,
  ) {
    return {
      x: source.x + source.width + gap,
      y: source.y,
    };
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
