import { Graph, History, Scroller, Selection } from '@antv/x6';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WorkbenchGraphAdapter } from './graph-adapter';
import { findAvailableNodePosition, isEditableTarget } from './workflow-utils';

// X6 3's package main points at CJS inside a type:module package. Vite's browser
// resolver normally selects its ESM/source entry; use that source in Node tests.
vi.mock('@antv/x6', async () => import('@antv/x6/es/index.js'));
vi.mock('@antv/x6-vue-shape', () => ({ register: vi.fn() }));
vi.mock('../components/WorkbenchNode.vue', () => ({ default: {} }));

// Keep X6's real model, selection and history; Vue rendering is not
// relevant to graph mutation/undo contracts and needs a real browser instead.
Graph.registerNode('fdm-creative-vue-node', { inherit: 'rect' }, true);

const fixtures: Array<{
  graph: Graph;
  container: HTMLElement;
  dispose?: () => void;
}> = [];

function fixture(readOnly = false) {
  const container = document.createElement('div');
  container.tabIndex = -1;
  document.body.append(container);
  const graph = new Graph({ container, height: 600, width: 1000 });
  graph.use(new Selection({ enabled: true, multiple: true }));
  graph.use(new History({ enabled: true }));
  const callbacks = {
    onChange: vi.fn(),
    onHistoryChange: vi.fn(),
    onNodeDragStateChange: vi.fn(),
    onRequestNodePicker: vi.fn(),
    onSelectionChange: vi.fn(),
    onSelectionCountChange: vi.fn(),
  };
  const adapter = Object.create(
    WorkbenchGraphAdapter.prototype,
  ) as WorkbenchGraphAdapter;
  Object.assign(adapter, {
    callbacks,
    clipboardCells: [],
    clipboardOffset: 0,
    connectingEdgeIds: new Set(),
    graph,
    readOnly,
    scroller: { container },
    suppressChange: false,
  });
  const internals = adapter as unknown as {
    bindEvents(): void;
    bindShortcuts(): void;
    copySelection(): void;
    allowCanvasShortcut(event: KeyboardEvent): boolean;
    pasteSelection(): void;
  };
  internals.bindEvents();
  fixtures.push({ container, graph });
  return { adapter, callbacks, container, graph, internals };
}

function add(graph: Graph, id: string, x = 0, type = 'image-input') {
  return graph.addNode({
    id,
    shape: 'rect',
    x,
    y: 0,
    width: 160,
    height: 100,
    data: {
      config: { assetId: 123 },
      name: id,
      ports: [],
      type,
      status: 'SUCCEEDED',
      display: { previewUrl: 'old-result' },
    },
  });
}

function fullFixture() {
  vi.useFakeTimers();
  // happy-dom lacks SVGPoint's matrix operation, used by the virtual viewport.
  vi.spyOn(SVGSVGElement.prototype, 'createSVGPoint').mockImplementation(
    () =>
      ({
        x: 0,
        y: 0,
        matrixTransform(matrix: DOMMatrix) {
          return {
            x: this.x * matrix.a + this.y * matrix.c + matrix.e,
            y: this.x * matrix.b + this.y * matrix.d + matrix.f,
          };
        },
      }) as DOMPoint,
  );
  const root = document.createElement('div');
  const canvas = document.createElement('div');
  const minimap = document.createElement('div');
  root.append(canvas, minimap);
  document.body.append(root);
  const picker = vi.fn();
  const onChange = vi.fn();
  const onHistoryChange = vi.fn();
  const onSelectionChange = vi.fn();
  const adapter = new WorkbenchGraphAdapter(
    { container: canvas, minimapContainer: minimap },
    {
      onChange,
      onHistoryChange,
      onSelectionChange,
      onRequestNodePicker: picker,
    },
  );
  fixtures.push({
    graph: adapter.graph,
    container: root,
    dispose: () => adapter.disposeWorkbenchGraph(),
  });
  return {
    adapter,
    canvas,
    onChange,
    onHistoryChange,
    onSelectionChange,
    picker,
    root,
  };
}

afterEach(() => {
  fixtures.splice(0).forEach(({ graph, container, dispose }) => {
    if (dispose) dispose();
    else graph.dispose();
    container.remove();
  });
  if (vi.isFakeTimers()) {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  }
  vi.restoreAllMocks();
});

describe('workbench canvas interactions', () => {
  it('configures Shift selection, opens Tab search and temporarily pans with Space in the real adapter', () => {
    const { adapter, canvas, onChange, onHistoryChange, picker, root } =
      fullFixture();
    expect(adapter.graph.isMultipleSelection()).toBe(true);
    expect(adapter.graph.isRubberbandEnabled()).toBe(true);
    expect(adapter.graph.isSelectionMovable()).toBe(true);
    const first = add(adapter.graph, 'first');
    const second = add(adapter.graph, 'second');
    adapter.graph.resetSelection(first);
    const shiftClick = new MouseEvent('mouseup', { shiftKey: true });
    Object.defineProperty(shiftClick, 'target', { value: canvas });
    adapter.graph.trigger('cell:mouseup', {
      cell: second,
      e: shiftClick,
    } as never);
    expect(adapter.getSelectedNodeCount()).toBe(2);
    adapter.graph.cleanHistory();
    onChange.mockClear();
    onHistoryChange.mockClear();
    adapter.setNodeStatus(first.id, 'RUNNING');
    adapter.setNodeDisplayData(first.id, { previewUrl: 'new-result' });
    expect(adapter.getHistoryState()).toEqual({
      canRedo: false,
      canUndo: false,
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(onHistoryChange).not.toHaveBeenCalled();
    adapter.updateNode(first.id, { name: 'Renamed node' });
    expect(onChange).toHaveBeenCalledOnce();
    expect(adapter.getHistoryState().canUndo).toBe(true);
    const scroller = adapter.graph.getPlugin<Scroller>('scroller')!.container;
    scroller.focus();
    vi.spyOn(adapter.graph, 'clientToLocal').mockReturnValue({
      x: 10,
      y: 20,
    } as ReturnType<Graph['clientToLocal']>);
    scroller.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Tab',
        code: 'Tab',
        keyCode: 9,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(picker).toHaveBeenCalledOnce();
    expect(picker.mock.calls[0]?.[0].graphPoint).toEqual({ x: 10, y: 20 });
    scroller.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: ' ',
        code: 'Space',
        keyCode: 32,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(scroller.style.cursor).toBe('grab');
    scroller.scrollLeft = 200;
    scroller.scrollTop = 200;
    canvas.dispatchEvent(
      new MouseEvent('mousedown', {
        button: 0,
        clientX: 100,
        clientY: 100,
        bubbles: true,
        cancelable: true,
      }),
    );
    window.dispatchEvent(
      new MouseEvent('mousemove', { clientX: 140, clientY: 160 }),
    );
    expect(scroller.scrollLeft).toBe(160);
    expect(scroller.scrollTop).toBe(140);
    window.dispatchEvent(
      new KeyboardEvent('keyup', { key: ' ', code: 'Space' }),
    );
    expect(scroller.style.cursor).toBe('');
    window.dispatchEvent(
      new MouseEvent('mousemove', { clientX: 500, clientY: 500 }),
    );
    expect(scroller.scrollLeft).toBe(160);
    const libraryButton = document.createElement('button');
    root.append(libraryButton);
    libraryButton.focus();
    vi.spyOn(adapter.graph, 'centerCell').mockReturnValue(adapter.graph);
    expect(adapter.focusNode(first.id)).toBe(true);
    expect(document.activeElement).toBe(scroller);
  });

  it('undoes and redoes parameters through keyboard commands without rolling back live results or leaving the inspector stale', () => {
    const { adapter, onChange, onSelectionChange } = fullFixture();
    const node = add(adapter.graph, 'generation');
    adapter.setNodeStatus(node.id, 'IDLE');
    adapter.graph.resetSelection(node);
    adapter.graph.cleanHistory();
    adapter.updateNode(node.id, { name: 'Edited', config: { assetId: 456 } });
    adapter.setNodeStatus(node.id, 'SUCCEEDED');
    adapter.setNodeDisplayData(node.id, { previewUrl: 'completed-result' });
    onChange.mockClear();
    const undo = vi.spyOn(adapter, 'undo');
    const redo = vi.spyOn(adapter, 'redo');
    const scroller = adapter.graph.getPlugin<Scroller>('scroller')!.container;
    adapter.focusCanvas();
    const press = (shiftKey = false) =>
      scroller.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'z',
          code: 'KeyZ',
          keyCode: 90,
          ctrlKey: true,
          shiftKey,
          bubbles: true,
          cancelable: true,
        }),
      );
    press();
    expect(undo).toHaveBeenCalledOnce();
    expect(node.getData()).toMatchObject({
      name: 'generation',
      config: { assetId: 123 },
      status: 'SUCCEEDED',
      display: { previewUrl: 'completed-result' },
    });
    expect(onChange).toHaveBeenCalledOnce();
    expect(adapter.getHistoryState()).toEqual({
      canUndo: false,
      canRedo: true,
    });
    expect(onSelectionChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: 'generation', config: { assetId: 123 } }),
    );
    adapter.setNodeStatus(node.id, 'FAILED');
    adapter.setNodeDisplayData(node.id, { previewUrl: 'latest-result' });
    onChange.mockClear();
    press(true);
    expect(redo).toHaveBeenCalledOnce();
    expect(node.getData()).toMatchObject({
      name: 'Edited',
      config: { assetId: 456 },
      status: 'FAILED',
      display: { previewUrl: 'latest-result' },
    });
    expect(onChange).toHaveBeenCalledOnce();
    expect(adapter.getHistoryState()).toEqual({
      canUndo: true,
      canRedo: false,
    });
    expect(onSelectionChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: 'Edited', config: { assetId: 456 } }),
    );
  });

  it('places new nodes near the transformed viewport center, avoids overlap and focuses the new node', () => {
    const { adapter, graph } = fixture();
    vi.spyOn(adapter, 'getCanvasClientRect').mockReturnValue({
      left: 100,
      top: 80,
      width: 1000,
      height: 600,
      right: 1100,
      bottom: 680,
      x: 100,
      y: 80,
    });
    vi.spyOn(graph, 'clientToLocal').mockReturnValue({
      x: 2000,
      y: -600,
    } as ReturnType<Graph['clientToLocal']>);
    const focus = vi.spyOn(adapter, 'focusNode').mockReturnValue(true);
    const first = adapter.addNode('image-input')!;
    const second = adapter.addNode('image-input')!;
    expect(graph.clientToLocal).toHaveBeenCalledWith({ x: 600, y: 380 });
    expect(first.x + first.width / 2).toBe(2000);
    expect(first.y + first.height / 2).toBe(-600);
    expect(
      Math.abs(first.x - second.x) >= first.width + 32 ||
        Math.abs(first.y - second.y) >= first.height + 32,
    ).toBe(true);
    expect(focus).toHaveBeenLastCalledWith(second.id);
    focus.mockClear();
    expect(adapter.addNode('image-input', { x: 12, y: 34 })).toMatchObject({
      x: 12,
      y: 34,
    });
    expect(focus).not.toHaveBeenCalled();
  });

  it('reports a single selected node only when exactly one cell is selected', () => {
    const { adapter, callbacks, container, graph } = fixture();
    const a = add(graph, 'a');
    const b = add(graph, 'b', 250);
    graph.resetSelection(a);
    expect(callbacks.onSelectionChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'a' }),
    );
    graph.select(b);
    expect(adapter.getSelectedNodeCount()).toBe(2);
    expect(callbacks.onSelectionCountChange).toHaveBeenLastCalledWith(2);
    expect(callbacks.onSelectionChange).toHaveBeenLastCalledWith(undefined);
    graph.unselect(b);
    expect(callbacks.onSelectionChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'a' }),
    );
    const input = document.createElement('input');
    container.append(input);
    input.focus();
    adapter.clearSelection();
    expect(callbacks.onSelectionCountChange).toHaveBeenLastCalledWith(0);
    expect(document.activeElement).toBe(input);
  });

  it('selects only the new input when pinning a result from an already selected node', () => {
    const { adapter, callbacks, graph } = fixture();
    const origin = add(graph, 'origin');
    graph.resetSelection(origin);
    const branch = adapter.addPinnedMediaAsset({
      assetId: '123',
      assetKind: 'IMAGE',
      originNodeId: origin.id,
    });
    expect(branch).toBeDefined();
    expect(adapter.getSelectedNodeCount()).toBe(1);
    expect(callbacks.onSelectionChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: branch!.inputNode.id }),
    );
  });

  it('duplicates a selected branch with internal edges and resets results as one undo step', () => {
    const { adapter, container, graph } = fixture();
    const a = add(graph, 'a');
    const b = add(graph, 'b', 250);
    add(graph, 'outside', 500);
    graph.addEdge({ id: 'inside', source: 'a', target: 'b' });
    graph.addEdge({ id: 'outside-edge', source: 'b', target: 'outside' });
    graph.resetSelection([a, b]);
    graph.cleanHistory();
    adapter.duplicateSelection();
    expect(document.activeElement).toBe(container);
    expect(graph.getNodes()).toHaveLength(5);
    expect(graph.getEdges()).toHaveLength(3);
    expect(adapter.getSelectedNodeCount()).toBe(2);
    const clones = graph.getSelectedCells();
    expect(
      clones.every(
        (cell) => cell.getData().status === 'IDLE' && !cell.getData().display,
      ),
    ).toBe(true);
    expect(clones.map((node) => node.getData().config.assetId)).toEqual([
      123, 123,
    ]);
    graph.undo();
    expect(graph.getNodes()).toHaveLength(3);
    expect(graph.getEdges()).toHaveLength(2);
    expect(graph.canUndo()).toBe(false);
    graph.redo();
    expect(graph.getNodes()).toHaveLength(5);
  });

  it.each(['duplicate', 'paste'] as const)(
    'keeps stable prompt aliases attached to new edges after %s and repeated paste',
    (operation) => {
      const { adapter, graph, internals } = fixture();
      const source = add(graph, 'source');
      const target = add(graph, 'target', 250, 'image-edit');
      const config = {
        prompt: '使用 @图片7、@图片11 和 @图片3',
        referenceAssetIds: [234],
        promptReferenceBindings: [
          { alias: '图片1', bindingKey: 'EDGE:deleted:0' },
          { alias: '图片3', bindingKey: 'ASSET:234' },
          { alias: '图片7', bindingKey: 'EDGE:inside:images:0' },
          { alias: '图片11', bindingKey: 'EDGE:inside:images:1' },
          { alias: '图片12', bindingKey: 'EDGE:inside:images-external:0' },
        ],
      };
      target.setData({ ...target.getData(), config }, { overwrite: true });
      graph.addEdge({ id: 'inside:images', source, target });
      graph.resetSelection([source, target]);
      graph.cleanHistory();

      if (operation === 'duplicate') adapter.duplicateSelection();
      else {
        internals.copySelection();
        internals.pasteSelection();
      }

      const copiedTarget = graph
        .getSelectedCells()
        .find((node) => node.getData().type === 'image-edit')!;
      const copiedEdge = graph
        .getEdges()
        .find((edge) => edge.getTargetCellId() === copiedTarget.id)!;
      const expectedConfig = {
        ...config,
        promptReferenceBindings: config.promptReferenceBindings.map(
          (binding) => ({
            ...binding,
            bindingKey: binding.bindingKey.replace(
              /^EDGE:inside:images:(\d+)$/,
              `EDGE:${copiedEdge.id}:$1`,
            ),
          }),
        ),
      };
      expect(copiedTarget.getData().config).toEqual(expectedConfig);
      expect(target.getData().config).toEqual(config);
      graph.undo();
      expect(graph.getNodes()).toHaveLength(2);
      expect(graph.canUndo()).toBe(false);
      graph.redo();
      expect(graph.getCellById(copiedTarget.id)?.getData().config).toEqual(
        expectedConfig,
      );
      if (operation === 'paste') {
        internals.pasteSelection();
        const secondTarget = graph
          .getSelectedCells()
          .filter((cell) => cell.isNode())
          .find((node) => node.getData().type === 'image-edit')!;
        const secondEdge = graph
          .getEdges()
          .find((edge) => edge.getTargetCellId() === secondTarget.id)!;
        expect(secondEdge.id).not.toBe(copiedEdge.id);
        expect(secondTarget.getData().config).toEqual({
          ...config,
          promptReferenceBindings: config.promptReferenceBindings.map(
            (binding) => ({
              ...binding,
              bindingKey: binding.bindingKey.replace(
                /^EDGE:inside:images:(\d+)$/,
                `EDGE:${secondEdge.id}:$1`,
              ),
            }),
          ),
        });
        expect(secondTarget.getPosition()).toEqual({ x: 314, y: 64 });
        expect(graph.getCellById(copiedTarget.id)?.getData().config).toEqual(
          expectedConfig,
        );
        expect(target.getData().config).toEqual(config);
        graph.undo();
        expect(graph.getNodes()).toHaveLength(4);
      }
    },
  );

  it('deletes selected nodes and attached edges as one undo step and reports history availability', () => {
    const { adapter, callbacks, container, graph } = fixture();
    const a = add(graph, 'a');
    const b = add(graph, 'b', 250);
    graph.addEdge({ source: 'a', target: 'b' });
    graph.resetSelection([a, b]);
    graph.cleanHistory();
    adapter.deleteSelection();
    expect(document.activeElement).toBe(container);
    expect(graph.getCells()).toHaveLength(0);
    expect(callbacks.onHistoryChange).toHaveBeenLastCalledWith({
      canUndo: true,
      canRedo: false,
    });
    adapter.undo();
    expect(graph.getNodes()).toHaveLength(2);
    expect(graph.getEdges()).toHaveLength(1);
    expect(adapter.getHistoryState()).toEqual({
      canUndo: false,
      canRedo: true,
    });
  });

  it('groups movement of multiple nodes into one undo operation', () => {
    const { adapter, graph } = fixture();
    const a = add(graph, 'a');
    const b = add(graph, 'b', 250);
    graph.resetSelection([a, b]);
    graph.cleanHistory();
    graph.trigger('node:mousedown', { node: a } as never);
    a.translate(20, 40, { ui: true, translateBy: a.id });
    a.translate(20, 40, { ui: true, translateBy: a.id });
    graph.trigger('node:mouseup', { node: a } as never);
    expect(b.getPosition()).toEqual({ x: 290, y: 80 });
    adapter.undo();
    expect(a.getPosition()).toEqual({ x: 0, y: 0 });
    expect(b.getPosition()).toEqual({ x: 250, y: 0 });
    expect(graph.canUndo()).toBe(false);
  });

  it('keeps readonly graphs, singleton planners and the node cap protected', () => {
    const readonly = fixture(true);
    const node = add(readonly.graph, 'readonly');
    readonly.graph.resetSelection(node);
    readonly.graph.cleanHistory();
    readonly.adapter.duplicateSelection();
    readonly.adapter.deleteSelection();
    expect(readonly.graph.getNodes()).toHaveLength(1);
    expect(readonly.adapter.addNode('image-input')).toBeUndefined();
    const { adapter, graph } = fixture();
    const planner = add(graph, 'content-planner', 0, 'content-planner');
    graph.resetSelection(planner);
    adapter.duplicateSelection();
    expect(graph.getNodes()).toHaveLength(1);
    const ordinary = add(graph, 'ordinary');
    for (let index = 2; index < 300; index += 1) add(graph, `n-${index}`);
    graph.resetSelection(ordinary);
    adapter.duplicateSelection();
    expect(graph.getNodes()).toHaveLength(300);
  });

  it('pastes branches as one undo step without inherited result status', () => {
    const { graph, internals } = fixture();
    const a = add(graph, 'a');
    const b = add(graph, 'b', 250);
    graph.addEdge({ source: 'a', target: 'b' });
    graph.resetSelection([a, b]);
    internals.copySelection();
    graph.cleanHistory();
    internals.pasteSelection();
    expect(graph.getNodes()).toHaveLength(4);
    expect(graph.getEdges()).toHaveLength(2);
    expect(
      graph
        .getSelectedCells()
        .every((node) => node.getData().status === 'IDLE'),
    ).toBe(true);
    graph.undo();
    expect(graph.getNodes()).toHaveLength(2);
    expect(graph.canUndo()).toBe(false);
  });

  it('keeps shortcuts inside the canvas and away from editing targets', () => {
    const { container, internals } = fixture();
    const event = (target: Element) => {
      const key = new KeyboardEvent('keydown');
      Object.defineProperty(key, 'target', { value: target });
      return key;
    };
    expect(internals.allowCanvasShortcut(event(container))).toBe(true);
    expect(internals.allowCanvasShortcut(event(document.body))).toBe(false);
    const input = document.createElement('input');
    container.append(input);
    expect(internals.allowCanvasShortcut(event(input))).toBe(false);
    const editable = document.createElement('div');
    editable.setAttribute('role', 'textbox');
    container.append(editable);
    expect(internals.allowCanvasShortcut(event(editable))).toBe(false);
  });

  it('opens the node picker at the blank double click in graph coordinates', () => {
    const { callbacks, graph } = fixture();
    vi.spyOn(graph, 'clientToLocal').mockReturnValue({
      x: 440,
      y: 880,
    } as ReturnType<Graph['clientToLocal']>);
    graph.trigger('blank:dblclick', {
      e: new MouseEvent('dblclick', { clientX: 300, clientY: 400 }),
    } as never);
    expect(callbacks.onRequestNodePicker).toHaveBeenCalledWith({
      clientPoint: { x: 300, y: 400 },
      graphPoint: { x: 440, y: 880 },
    });
  });
});

describe('canvas placement and input guards', () => {
  it('avoids a large overlapping frame instead of moving by a small fixed offset', () => {
    const obstacle = { x: -1000, y: -1000, width: 2000, height: 2000 };
    const point = findAvailableNodePosition(
      { x: 0, y: 0 },
      { width: 200, height: 100 },
      [obstacle],
    );
    expect(
      point.x >= 1032 ||
        point.x + 232 <= -1000 ||
        point.y >= 1032 ||
        point.y + 132 <= -1000,
    ).toBe(true);
  });
  it('guards descendants of contenteditable and native buttons', () => {
    const button = document.createElement('button');
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    button.append(icon);
    expect(isEditableTarget(icon)).toBe(true);
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', '');
    const span = document.createElement('span');
    editable.append(span);
    expect(isEditableTarget(span)).toBe(true);
  });
});
