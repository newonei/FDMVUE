import type { FdmCreativeApi } from '#/api/fdmcreative';

import { describe, expect, it, vi } from 'vitest';

import { CREATIVE_NODE_MAP } from './catalog';
import {
  MAX_WORKBENCH_NODES,
  WorkbenchGraphAdapter,
} from './graph-adapter';

vi.mock('@antv/x6', () => ({
  Clipboard: function MockX6Constructor() {},
  Dnd: function MockX6Constructor() {},
  Graph: function MockX6Constructor() {},
  History: function MockX6Constructor() {},
  Keyboard: function MockX6Constructor() {},
  MiniMap: function MockX6Constructor() {},
  Scroller: function MockX6Constructor() {},
  Selection: function MockX6Constructor() {},
  Shape: { Edge: function MockX6Constructor() {} },
  Snapline: function MockX6Constructor() {},
}));
vi.mock('@antv/x6-vue-shape', () => ({ register: vi.fn() }));

interface FakeNodeDefinition {
  data: {
    config: Record<string, unknown>;
    name: string;
    ports: FdmCreativeApi.WorkflowPort[];
    type: string;
  };
  height: number;
  id: string;
  width: number;
  x: number;
  y: number;
}

interface FakeEdgeDefinition {
  id: string;
  source: { cell: string; port: string };
  target: { cell: string; port: string };
}

class FakeNode {
  get id() {
    return this.definition.id;
  }

  constructor(private readonly definition: FakeNodeDefinition) {}

  getData() {
    return this.definition.data;
  }

  getPosition() {
    return { x: this.definition.x, y: this.definition.y };
  }

  getSize() {
    return { height: this.definition.height, width: this.definition.width };
  }

  isNode() {
    return true;
  }
}

class FakeEdge {
  get id() {
    return this.definition.id;
  }

  constructor(private readonly definition: FakeEdgeDefinition) {}

  getSource() {
    return this.definition.source;
  }

  getTarget() {
    return this.definition.target;
  }
}

class FakeGraph {
  readonly batches: string[] = [];
  readonly edges: FakeEdge[] = [];
  readonly nodes: FakeNode[] = [];
  selectedId?: string;

  addEdge(definition: FakeEdgeDefinition) {
    this.edges.push(new FakeEdge(definition));
  }

  addNode(definition: FakeNodeDefinition) {
    this.nodes.push(new FakeNode(definition));
  }

  addNodes(definitions: FakeNodeDefinition[]) {
    definitions.forEach((definition) => this.addNode(definition));
  }

  batchUpdate(name: string, operation: () => void) {
    this.batches.push(name);
    operation();
  }

  getCellById(id: string) {
    return this.nodes.find((node) => node.id === id);
  }

  getEdges() {
    return this.edges;
  }

  getNodes() {
    return this.nodes;
  }

  select(id: string) {
    this.selectedId = id;
  }

  translate() {
    return { tx: 0, ty: 0 };
  }

  zoom() {
    return 1;
  }
}

function adapterFor(graph: FakeGraph) {
  const adapter = Object.create(
    WorkbenchGraphAdapter.prototype,
  ) as WorkbenchGraphAdapter;
  Object.assign(adapter as object, {
    graph,
    readOnly: false,
  });
  return adapter;
}

function originNode(id = 'origin'): FakeNodeDefinition {
  const template = CREATIVE_NODE_MAP.get('image-generate')!;
  return {
    data: {
      config: {},
      name: template.label,
      ports: template.ports.map((port) => ({ ...port })),
      type: template.type,
    },
    height: 126,
    id,
    width: 230,
    x: 120,
    y: 80,
  };
}

function tool(
  overrides: Partial<FdmCreativeApi.MediaToolDescriptor>,
): FdmCreativeApi.MediaToolDescriptor {
  return {
    applicableAssetKinds: ['IMAGE'],
    available: true,
    defaultConfig: {},
    generatedNodeType: 'image-crop',
    id: 'image-crop',
    inputPort: 'image',
    label: '图片裁剪',
    localExecution: true,
    outputPlacement: 'RIGHT',
    schemaVersion: 1,
    ...overrides,
  };
}

describe('media result graph branches', () => {
  it('pins a selected result through a normal input node in one undo batch', () => {
    const graph = new FakeGraph();
    graph.addNode(originNode());
    const adapter = adapterFor(graph);

    const result = adapter.addPinnedMediaAsset({
      assetId: '9007199254740993',
      assetKind: 'IMAGE',
      assetName: '第二张结果',
      originNodeId: 'origin',
    });

    expect(result?.inputNode.config.assetId).toBe('9007199254740993');
    expect(result?.inputNode.type).toBe('image-input');
    expect(graph.batches).toEqual(['pin-result-asset']);
    expect(graph.nodes).toHaveLength(2);
  });

  it('creates a compatible crop branch to the right of its source in one batch', () => {
    const graph = new FakeGraph();
    graph.addNode(originNode());
    const adapter = adapterFor(graph);

    const branch = adapter.addMediaToolBranch({
      assetId: '101',
      assetKind: 'IMAGE',
      assetName: '第二张结果',
      originNodeId: 'origin',
      tool: tool({ defaultConfig: { cropHeight: 1, cropWidth: 1 } }),
    });

    expect(branch?.inputNode.type).toBe('image-input');
    expect(branch?.derivedNode?.type).toBe('image-crop');
    expect(branch?.derivedNode?.config).toMatchObject({
      cropHeight: 1,
      cropWidth: 1,
    });
    expect(branch?.inputNode.x).toBeGreaterThan(120);
    expect(branch?.derivedNode?.x).toBeGreaterThan(branch?.inputNode.x ?? 0);
    expect(graph.batches).toEqual(['create-media-tool-branch']);
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]?.getSource().port).toBe('asset');
    expect(graph.edges[0]?.getTarget().port).toBe('image');
    expect(graph.selectedId).toBe(branch?.derivedNode?.id);
  });

  it('builds multi-angle generation as editable prompt, image-to-image and collection nodes', () => {
    const graph = new FakeGraph();
    graph.addNode(originNode());
    const adapter = adapterFor(graph);

    const branch = adapter.addMediaToolBranch({
      assetId: '101',
      assetKind: 'IMAGE',
      originNodeId: 'origin',
      tool: tool({
        generatedNodeType: 'workflow-template',
        id: 'multi-angle-template',
        label: '多角度生成',
        localExecution: false,
        template: 'MULTI_ANGLE_V1',
      }),
    });

    expect(branch?.nodeIds).toHaveLength(4);
    expect(graph.batches).toEqual(['create-media-tool-branch']);
    expect(graph.nodes.map((node) => node.getData().type)).toEqual(
      expect.arrayContaining([
        'image-input',
        'prompt-template',
        'image-to-image',
        'image-collection',
      ]),
    );
    expect(graph.edges).toHaveLength(3);
    expect(graph.edges.map((edge) => edge.getTarget().port)).toEqual(
      expect.arrayContaining(['reference', 'prompt', 'images']),
    );
  });

  it('does not create a partial media branch once the 300-node limit is reached', () => {
    const graph = new FakeGraph();
    for (let index = 0; index < MAX_WORKBENCH_NODES - 1; index += 1) {
      graph.addNode(originNode(`origin-${index}`));
    }
    const adapter = adapterFor(graph);

    const branch = adapter.addMediaToolBranch({
      assetId: '101',
      assetKind: 'IMAGE',
      tool: tool({}),
    });

    expect(branch).toBeUndefined();
    expect(graph.nodes).toHaveLength(MAX_WORKBENCH_NODES - 1);
    expect(graph.edges).toHaveLength(0);
    expect(graph.batches).toHaveLength(0);
  });
});
