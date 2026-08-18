/* eslint-disable vue/one-component-per-file */
import type { FdmCreativeApi } from '#/api/fdmcreative';

import { createApp, nextTick } from 'vue';

import { afterEach, describe, expect, it, vi } from 'vitest';

import CanvasAgentPanel from './CanvasAgentPanel.vue';

const api = vi.hoisted(() => ({
  applyCreativeAgentRun: vi.fn(),
  archiveCreativeAgentConversation: vi.fn(),
  cancelCreativeAgentRun: vi.fn(),
  createCreativeAgentConversation: vi.fn(),
  createCreativeAgentRun: vi.fn(),
  executeCreativeAgentRun: vi.fn(),
  getCreativeAgentCapability: vi.fn(),
  getCreativeAgentConversationPage: vi.fn(),
  getCreativeAgentMessagePage: vi.fn(),
  getCreativeAgentRun: vi.fn(),
  renameCreativeAgentConversation: vi.fn(),
  retryCreativeAgentRun: vi.fn(),
}));

vi.mock('#/api/fdmcreative', () => api);

vi.mock('@vben/icons', () => ({
  IconifyIcon: { render: () => null },
}));

vi.mock('../use-agent-event-stream', () => ({
  useAgentEventStream: () => ({ state: 'idle' }),
}));

vi.mock('./AgentConversationList.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      emits: ['create'],
      setup(_props, { emit }) {
        return () =>
          h(
            'button',
            {
              'data-testid': 'create-conversation',
              onClick: () => emit('create'),
            },
            '新建会话',
          );
      },
    }),
  };
});

vi.mock('./AgentMessageList.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      setup() {
        return () => h('div', { 'data-testid': 'agent-messages' });
      },
    }),
  };
});

vi.mock('./AgentComposer.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      props: { enabled: Boolean },
      emits: ['submit'],
      setup(props, { emit }) {
        return () =>
          h(
            'button',
            {
              'data-testid': 'submit-natural-language',
              disabled: !props.enabled,
              onClick: () =>
                emit('submit', {
                  content: '创建提示词 → 图片生成 → 资产库输出流程',
                  references: [
                    { id: 'prompt-21', type: 'PROMPT' },
                    { id: 'asset-31', type: 'ASSET' },
                  ],
                }),
            },
            '提交自然语言方案',
          );
      },
    }),
  };
});

vi.mock('./AgentRunProgress.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      setup() {
        return () => h('div', { 'data-testid': 'agent-run-progress' });
      },
    }),
  };
});

vi.mock('./CanvasPatchPreview.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      props: { run: Object },
      emits: ['apply'],
      setup(props, { emit }) {
        return () =>
          h(
            'button',
            {
              'data-testid': 'apply-and-run',
              disabled: props.run?.status !== 'READY',
              onClick: () => emit('apply', false, true),
            },
            '应用并运行',
          );
      },
    }),
  };
});

const node: FdmCreativeApi.WorkflowNode = {
  config: {},
  height: 100,
  id: 'prompt-node',
  name: '提示词',
  ports: [],
  type: 'prompt-template',
  width: 180,
  x: 120,
  y: 120,
};

const readyRun: FdmCreativeApi.AgentRun = {
  attemptNo: 1,
  baseDraftVersion: 1,
  conversationId: '701',
  id: '801',
  patch: {
    baseDraftVersion: 1,
    operations: [
      {
        nodeId: 'image-node',
        nodeType: 'image-generate',
        operationId: 'add-image-node',
        type: 'ADD_NODE',
      },
    ],
    schemaVersion: 1,
    suggestedRun: { scope: 'FULL' },
    summary: '新增图片生成节点并输出到资产库',
  },
  projectId: '12',
  requestMessageId: '901',
  status: 'READY',
  suggestedRunScope: 'FULL',
};

const appliedDraft: FdmCreativeApi.WorkflowDraft = {
  definition: {
    edges: [],
    nodes: [node],
    schemaVersion: 1,
    viewport: { x: 0, y: 0, zoom: 1 },
  },
  draftVersion: 2,
  projectId: 12,
};

function page<T>(list: T[]) {
  return { list, total: list.length };
}

async function flushUi() {
  await Promise.resolve();
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
}

function mountPanel() {
  const draftApplied: Array<{
    affectedNodeIds: string[];
    draft: FdmCreativeApi.WorkflowDraft;
  }> = [];
  const executionIds: string[] = [];
  const container = document.createElement('div');
  document.body.append(container);
  const app = createApp(CanvasAgentPanel, {
    canEdit: true,
    canRun: true,
    draftVersion: 1,
    nodes: [node],
    projectId: 12,
    onDraftApplied: (payload: {
      affectedNodeIds: string[];
      draft: FdmCreativeApi.WorkflowDraft;
    }) => draftApplied.push(payload),
    onExecutionCreated: (executionId: string) => executionIds.push(executionId),
  });
  app.directive('access', () => {});
  app.mount(container);
  return { app, container, draftApplied, executionIds };
}

function button(container: Element, testId: string) {
  const element = container.querySelector<HTMLButtonElement>(
    `[data-testid="${testId}"]`,
  );
  expect(element).not.toBeNull();
  return element!;
}

function configureEnabledJourney() {
  let conversationCreated = false;
  const conversation: FdmCreativeApi.AgentConversation = {
    createdByUserId: '213',
    id: '701',
    projectId: '12',
    status: 'ACTIVE',
    title: '新的画布方案',
  };
  api.getCreativeAgentCapability.mockResolvedValue({
    enabled: true,
    routeKey: 'creative.agent.default',
  });
  api.getCreativeAgentConversationPage.mockImplementation(async () =>
    page(conversationCreated ? [conversation] : []),
  );
  api.getCreativeAgentMessagePage.mockResolvedValue(page([]));
  api.createCreativeAgentConversation.mockImplementation(async () => {
    conversationCreated = true;
    return conversation.id;
  });
  api.createCreativeAgentRun.mockResolvedValue(readyRun);
  api.getCreativeAgentRun.mockResolvedValue(readyRun);
}

afterEach(() => {
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe('canvas Agent user journeys', () => {
  it('creates a natural-language plan, applies the authoritative draft, then explicitly runs it', async () => {
    configureEnabledJourney();
    api.applyCreativeAgentRun.mockResolvedValue({
      affectedNodeIds: ['image-node'],
      draft: appliedDraft,
      run: { ...readyRun, appliedDraftVersion: 2, status: 'APPLIED' },
      status: 'APPLIED',
    });
    api.executeCreativeAgentRun.mockResolvedValue('1001');

    const mounted = mountPanel();
    await flushUi();
    button(mounted.container, 'create-conversation').click();
    await flushUi();
    button(mounted.container, 'submit-natural-language').click();
    await flushUi();

    expect(api.createCreativeAgentRun).toHaveBeenCalledWith(
      expect.objectContaining({
        content: '创建提示词 → 图片生成 → 资产库输出流程',
        conversationId: '701',
        projectId: 12,
        references: [
          { id: 'prompt-21', type: 'PROMPT' },
          { id: 'asset-31', type: 'ASSET' },
        ],
      }),
    );
    expect(button(mounted.container, 'apply-and-run').disabled).toBe(false);

    button(mounted.container, 'apply-and-run').click();
    await flushUi();

    expect(api.applyCreativeAgentRun).toHaveBeenCalledWith({
      approveDestructive: false,
      expectedDraftVersion: 1,
      projectId: 12,
      runId: '801',
    });
    expect(mounted.draftApplied).toEqual([
      { affectedNodeIds: ['image-node'], draft: appliedDraft },
    ]);
    expect(api.executeCreativeAgentRun).toHaveBeenCalledWith({
      expectedDraftVersion: 2,
      projectId: 12,
      runId: '801',
      scope: 'FULL',
    });
    expect(mounted.executionIds).toEqual(['1001']);

    mounted.app.unmount();
  });

  it('does not overwrite or execute when the server reports an Agent apply conflict', async () => {
    configureEnabledJourney();
    api.applyCreativeAgentRun.mockResolvedValue({
      run: { ...readyRun, status: 'CONFLICT' },
      status: 'CONFLICT',
    });

    const mounted = mountPanel();
    await flushUi();
    button(mounted.container, 'create-conversation').click();
    await flushUi();
    button(mounted.container, 'submit-natural-language').click();
    await flushUi();
    button(mounted.container, 'apply-and-run').click();
    await flushUi();

    expect(api.applyCreativeAgentRun).toHaveBeenCalledTimes(1);
    expect(mounted.draftApplied).toEqual([]);
    expect(api.executeCreativeAgentRun).not.toHaveBeenCalled();

    mounted.app.unmount();
  });

  it('restores an existing planning result after remount without submitting another model request', async () => {
    const conversation: FdmCreativeApi.AgentConversation = {
      createdByUserId: '213',
      id: '701',
      lastRunId: '801',
      projectId: '12',
      status: 'ACTIVE',
      title: '已恢复的会话',
    };
    api.getCreativeAgentCapability.mockResolvedValue({
      enabled: true,
      routeKey: 'creative.agent.default',
    });
    api.getCreativeAgentConversationPage.mockResolvedValue(page([conversation]));
    api.getCreativeAgentMessagePage.mockResolvedValue(page([]));
    api.getCreativeAgentRun.mockResolvedValue(readyRun);

    const first = mountPanel();
    await flushUi();
    first.app.unmount();
    const second = mountPanel();
    await flushUi();

    expect(api.getCreativeAgentRun).toHaveBeenCalledTimes(2);
    expect(api.createCreativeAgentRun).not.toHaveBeenCalled();

    second.app.unmount();
  });
});
