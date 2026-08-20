import type { FdmCreativeApi } from '#/api/fdmcreative';

import { describe, expect, it, vi } from 'vitest';

import { defaultResultHistorySelection } from '../result-history';
import { CREATIVE_NODE_MAP } from './catalog';
import { MAX_WORKBENCH_NODES, WorkbenchGraphAdapter } from './graph-adapter';

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

function catalogNode(
  id: string,
  type: string,
  config: Record<string, unknown> = {},
): FakeNodeDefinition {
  const template = CREATIVE_NODE_MAP.get(type);
  if (!template) throw new Error(`Missing catalog node ${type}`);
  return {
    data: {
      config: { ...template.defaultConfig, ...config },
      name: template.label,
      ports: template.ports.map((port) => ({ ...port })),
      type,
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

const DIRECT_TOOL_CASES: Array<{
  assetKind: 'AUDIO' | 'IMAGE' | 'VIDEO';
  expectedPort: string;
  tool: FdmCreativeApi.MediaToolDescriptor;
}> = [
  {
    assetKind: 'IMAGE',
    expectedPort: 'image',
    tool: tool({
      defaultConfig: {
        format: 'png',
        height: 1024,
        resizeMode: 'FIT',
        width: 1024,
      },
      generatedNodeType: 'image-resize',
      id: 'image-resize',
      label: '图片缩放/适配',
    }),
  },
  {
    assetKind: 'IMAGE',
    expectedPort: 'image',
    tool: tool({
      defaultConfig: {
        cropHeight: 1,
        cropWidth: 1,
        cropX: 0,
        cropY: 0,
        format: 'png',
      },
    }),
  },
  {
    assetKind: 'IMAGE',
    expectedPort: 'image',
    tool: tool({
      defaultConfig: { columns: 2, format: 'png', rows: 2 },
      generatedNodeType: 'image-split',
      id: 'image-split',
      label: '图片分割',
    }),
  },
  {
    assetKind: 'IMAGE',
    expectedPort: 'image',
    tool: tool({
      defaultConfig: {},
      generatedNodeType: 'image-edit',
      id: 'image-edit-variant',
      label: '图片编辑/变体',
      localExecution: false,
    }),
  },
  {
    assetKind: 'VIDEO',
    expectedPort: 'video',
    tool: tool({
      applicableAssetKinds: ['VIDEO'],
      defaultConfig: { frameMode: 'FIRST', timeSeconds: 0 },
      generatedNodeType: 'video-frame-extract',
      id: 'video-frame-extract',
      inputPort: 'video',
      label: '视频抽帧',
    }),
  },
  {
    assetKind: 'VIDEO',
    expectedPort: 'video',
    tool: tool({
      applicableAssetKinds: ['VIDEO'],
      defaultConfig: { durationSeconds: 5, startSeconds: 0 },
      generatedNodeType: 'video-trim',
      id: 'video-trim',
      inputPort: 'video',
      label: '视频裁剪',
    }),
  },
  {
    assetKind: 'VIDEO',
    expectedPort: 'video',
    tool: tool({
      applicableAssetKinds: ['VIDEO'],
      defaultConfig: { fps: 24, height: 720, width: 1280 },
      generatedNodeType: 'video-normalize',
      id: 'video-normalize',
      inputPort: 'video',
      label: '视频规格统一',
    }),
  },
  {
    assetKind: 'VIDEO',
    expectedPort: 'first',
    tool: tool({
      applicableAssetKinds: ['VIDEO'],
      defaultConfig: {
        offsetSeconds: 4,
        transition: '淡化',
        transitionSeconds: 1,
      },
      generatedNodeType: 'video-transition',
      id: 'video-transition',
      inputPort: 'first',
      label: '视频转场',
    }),
  },
  {
    assetKind: 'VIDEO',
    expectedPort: 'videos',
    tool: tool({
      applicableAssetKinds: ['VIDEO'],
      defaultConfig: {},
      generatedNodeType: 'video-compose',
      id: 'video-compose',
      inputPort: 'videos',
      label: '视频合成',
    }),
  },
  {
    assetKind: 'AUDIO',
    expectedPort: 'audio',
    tool: tool({
      applicableAssetKinds: ['AUDIO'],
      defaultConfig: {
        durationSeconds: 15,
        fadeInSeconds: 0,
        fadeOutSeconds: 0,
        format: 'wav',
        startSeconds: 0,
      },
      generatedNodeType: 'audio-trim',
      id: 'audio-trim',
      inputPort: 'audio',
      label: '音频裁剪',
    }),
  },
  {
    assetKind: 'IMAGE',
    expectedPort: 'image',
    tool: tool({
      applicableAssetKinds: ['IMAGE', 'VIDEO'],
      defaultConfig: {},
      generatedNodeType: 'asset-library-output',
      id: 'save-asset-library',
      inputPort: 'asset',
      label: '保存到资产库',
    }),
  },
  {
    assetKind: 'VIDEO',
    expectedPort: 'video',
    tool: tool({
      applicableAssetKinds: ['IMAGE', 'VIDEO'],
      defaultConfig: {},
      generatedNodeType: 'asset-library-output',
      id: 'save-asset-library',
      inputPort: 'asset',
      label: '保存到资产库',
    }),
  },
  {
    assetKind: 'AUDIO',
    expectedPort: 'audio',
    tool: tool({
      applicableAssetKinds: ['AUDIO', 'IMAGE', 'VIDEO'],
      defaultConfig: {},
      generatedNodeType: 'asset-library-output',
      id: 'save-asset-library',
      inputPort: 'asset',
      label: '保存到资产库',
    }),
  },
];

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

  it('pins an audio result through the audio input node without copying its file', () => {
    const graph = new FakeGraph();
    graph.addNode(originNode());
    const adapter = adapterFor(graph);

    const result = adapter.addPinnedMediaAsset({
      assetId: 'audio-result-1',
      assetKind: 'AUDIO',
      assetName: '旁白.wav',
      originNodeId: 'origin',
    });

    expect(result?.inputNode.type).toBe('audio-input');
    expect(result?.inputNode.config.assetId).toBe('audio-result-1');
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

  it.each(DIRECT_TOOL_CASES)(
    'creates the $tool.id shortcut with a valid $expectedPort input connection',
    ({ assetKind, expectedPort, tool: mediaTool }) => {
      const graph = new FakeGraph();
      graph.addNode(originNode());
      const adapter = adapterFor(graph);

      const branch = adapter.addMediaToolBranch({
        assetId: `asset-${mediaTool.id}-${assetKind}`,
        assetKind,
        assetName: `${mediaTool.label}来源素材`,
        originNodeId: 'origin',
        tool: mediaTool,
      });

      expect(branch?.derivedNode?.type).toBe(mediaTool.generatedNodeType);
      expect(branch?.derivedNode?.config).toMatchObject(
        mediaTool.defaultConfig,
      );
      expect(branch?.inputNode.config.assetId).toBe(
        `asset-${mediaTool.id}-${assetKind}`,
      );
      expect(graph.batches).toEqual(['create-media-tool-branch']);
      expect(graph.edges).toHaveLength(1);
      expect(graph.edges[0]?.getSource().port).toBe('asset');
      expect(graph.edges[0]?.getTarget().port).toBe(expectedPort);
      const derivedTemplate = CREATIVE_NODE_MAP.get(
        mediaTool.generatedNodeType,
      )!;
      expect(
        derivedTemplate.ports.some(
          (port) => port.direction === 'INPUT' && port.id === expectedPort,
        ),
      ).toBe(true);
    },
  );

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

  it('traces four generated images through adoption, crop derivation, and asset-library preservation', () => {
    const selected = defaultResultHistorySelection([
      {
        assets: [
          {
            adopted: false,
            availability: 'ACTIVE',
            deleteEligible: false,
            id: 'generated-1',
            kind: 'IMAGE',
            url: 'private://generated-1.png',
          },
          {
            adopted: true,
            availability: 'ACTIVE',
            deleteEligible: false,
            id: 'generated-2',
            kind: 'IMAGE',
            url: 'private://generated-2.png',
          },
          {
            adopted: false,
            availability: 'ACTIVE',
            deleteEligible: false,
            id: 'generated-3',
            kind: 'IMAGE',
            url: 'private://generated-3.png',
          },
          {
            adopted: false,
            availability: 'ACTIVE',
            deleteEligible: false,
            id: 'generated-4',
            kind: 'IMAGE',
            url: 'private://generated-4.png',
          },
        ],
        nodeRunId: 'generation-run-8',
        selectionStatus: 'CURRENT',
        selectionVersion: 3,
      },
    ]);
    const adoptedSecondAssetId = selected?.asset.id;
    expect(adoptedSecondAssetId).toBe('generated-2');
    if (!adoptedSecondAssetId) {
      throw new Error('采用版本缺少可用的素材 ID');
    }

    const graph = new FakeGraph();
    graph.addNode(originNode());
    const adapter = adapterFor(graph);
    const crop = adapter.addMediaToolBranch({
      assetId: adoptedSecondAssetId,
      assetKind: 'IMAGE',
      assetName: '第二张生成结果',
      originNodeId: 'origin',
      tool: tool({
        defaultConfig: {
          cropHeight: 0.7,
          cropWidth: 0.7,
          cropX: 0.15,
          cropY: 0.15,
        },
      }),
    });
    expect(crop?.inputNode.config).toEqual(
      expect.objectContaining({ assetId: 'generated-2' }),
    );
    expect(JSON.stringify(crop?.inputNode.config)).not.toContain('private://');

    // The crop executor publishes a new project asset after successful execution. The output
    // node below must preserve its identity instead of uploading/copying the binary again.
    const assetLibrary = adapter.addMediaToolBranch({
      assetId: 'cropped-generated-2',
      assetKind: 'IMAGE',
      assetName: '第二张裁剪结果',
      originNodeId: crop?.derivedNode?.id,
      tool: tool({
        applicableAssetKinds: ['IMAGE', 'VIDEO'],
        defaultConfig: {},
        generatedNodeType: 'asset-library-output',
        id: 'save-asset-library',
        inputPort: 'asset',
        label: '保存到资产库',
      }),
    });

    expect(assetLibrary?.inputNode.config).toEqual(
      expect.objectContaining({ assetId: 'cropped-generated-2' }),
    );
    expect(assetLibrary?.derivedNode?.type).toBe('asset-library-output');
    expect(graph.batches).toEqual([
      'create-media-tool-branch',
      'create-media-tool-branch',
    ]);
    expect(graph.edges).toHaveLength(2);
  });

  it('persists the audio-to-video production chain with explicit ordered mix inputs', () => {
    const graph = new FakeGraph();
    graph.addNodes([
      catalogNode('voice', 'audio-generate', {
        prompt: '女声旁白',
        durationSeconds: 8,
      }),
      catalogNode('music', 'music-generate', {
        prompt: '轻快背景音乐',
        durationSeconds: 12,
      }),
      catalogNode('mix', 'audio-mix', {
        audioOrder: ['voice', 'music'],
        durationPolicy: 'LONGEST',
      }),
      catalogNode('video', 'video-input', { assetId: 'video-asset-1' }),
      catalogNode('merge', 'video-audio-merge', {
        audioMode: 'DUCK',
        durationPolicy: 'SHORTEST',
      }),
      catalogNode('library', 'asset-library-output'),
    ]);
    graph.addEdge({
      id: 'voice-mix',
      source: { cell: 'voice', port: 'asset' },
      target: { cell: 'mix', port: 'audios' },
    });
    graph.addEdge({
      id: 'music-mix',
      source: { cell: 'music', port: 'asset' },
      target: { cell: 'mix', port: 'audios' },
    });
    graph.addEdge({
      id: 'video-merge',
      source: { cell: 'video', port: 'asset' },
      target: { cell: 'merge', port: 'video' },
    });
    graph.addEdge({
      id: 'mix-merge',
      source: { cell: 'mix', port: 'asset' },
      target: { cell: 'merge', port: 'audio' },
    });
    graph.addEdge({
      id: 'merge-library',
      source: { cell: 'merge', port: 'asset' },
      target: { cell: 'library', port: 'video' },
    });
    const definition = adapterFor(graph).serializeDefinition();

    expect(definition.nodes.map((node) => node.type)).toEqual([
      'audio-generate',
      'music-generate',
      'audio-mix',
      'video-input',
      'video-audio-merge',
      'asset-library-output',
    ]);
    expect(
      definition.nodes.find((node) => node.id === 'mix')?.config,
    ).toMatchObject({
      audioOrder: ['voice', 'music'],
      durationPolicy: 'LONGEST',
    });
    expect(definition.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceNodeId: 'voice',
          targetNodeId: 'mix',
          targetPortId: 'audios',
        }),
        expect.objectContaining({
          sourceNodeId: 'music',
          targetNodeId: 'mix',
          targetPortId: 'audios',
        }),
        expect.objectContaining({
          sourceNodeId: 'mix',
          targetNodeId: 'merge',
          targetPortId: 'audio',
        }),
        expect.objectContaining({
          sourceNodeId: 'merge',
          targetNodeId: 'library',
          targetPortId: 'video',
        }),
      ]),
    );
  });
});
