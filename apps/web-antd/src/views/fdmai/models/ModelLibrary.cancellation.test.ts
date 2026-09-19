import type { FdmAiApi } from '#/api/fdmai';

import { createApp, nextTick } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ModelLibrary from './ModelLibrary.vue';

const mocks = vi.hoisted(() => ({
  allowCancel: true,
  cancel: vi.fn(),
  info: vi.fn(),
  poll: vi.fn(),
  status: 'DOWNLOADING',
  submit: vi.fn(),
  success: vi.fn(),
}));

vi.mock('@vben/access', () => ({
  useAccess: () => ({
    hasAccessByCodes: (codes: string[]) => !codes.includes('fdmai:invocation:cancel') || mocks.allowCancel,
  }),
}));
vi.mock('#/api/fdmai', () => ({
  cancelFdmAiInvocation: mocks.cancel,
  createFdmAiModel: vi.fn(),
  discoverFdmAiProviderModels: vi.fn(),
  getFdmAiAdapters: vi.fn().mockResolvedValue([]),
  getFdmAiInvocation: mocks.poll,
  getFdmAiModels: vi.fn().mockResolvedValue([]),
  getFdmAiProviders: vi.fn().mockResolvedValue([]),
  getFdmAiRoutes: vi.fn().mockResolvedValue([]),
  importFdmAiProviderModels: vi.fn(),
  submitFdmAiModelTest: mocks.submit,
  updateFdmAiModel: vi.fn(),
  updateFdmAiRoute: vi.fn(),
}));
vi.mock('./ModelTypeDialog.vue', () => ({ default: { render: () => null } }));
vi.mock('ant-design-vue', async () => {
  const { defineComponent, h } = await import('vue');
  const block = defineComponent({
    props: { message: String, description: String },
    setup: (props, { attrs, slots }) => () => h('div', attrs, [props.message, props.description, slots.default?.()]),
  });
  const button = defineComponent({
    props: { disabled: Boolean, loading: Boolean },
    setup: (props, { attrs, slots }) => () => h('button', { ...attrs, disabled: props.disabled || props.loading }, slots.default?.()),
  });
  const input = defineComponent({
    props: { value: [String, Number] },
    emits: ['update:value'],
    setup: (props, { attrs, emit }) => () => h('textarea', {
      ...attrs, value: props.value,
      onInput: (event: Event) => emit('update:value', (event.target as HTMLTextAreaElement).value),
    }),
  });
  const modal = defineComponent({
    props: { open: Boolean },
    setup: (props, { slots }) => () => props.open ? h('section', { role: 'dialog' }, [slots.default?.(), slots.footer?.()]) : null,
  });
  return {
    Alert: block, Button: button, Collapse: Object.assign(block, { Panel: block }),
    Descriptions: Object.assign(block, { Item: block }), Form: Object.assign(block, { Item: block }),
    Input: input, InputNumber: input, Modal: modal, Progress: block, Select: block,
    Space: block, Switch: block, Table: block, Tag: block, Textarea: input,
    message: { info: mocks.info, success: mocks.success, warning: vi.fn(), error: vi.fn() },
  };
});

const model: FdmAiApi.ModelDefinition = {
  capabilities: ['TEXT_TO_IMAGE'], code: 'archive-test', currency: 'USD', enabled: true,
  id: 12, modality: 'IMAGE', name: '归档测试模型', parameterSchema: '{}', unitPrice: 1,
};
const cleanups: Array<() => void> = [];
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.allowCancel = true;
  mocks.status = 'DOWNLOADING';
  mocks.cancel.mockResolvedValue(true);
  mocks.submit.mockResolvedValue({ invocationId: 'invocation-1', status: 'QUEUED' });
  mocks.poll.mockImplementation(async () => ({
    invocationId: 'invocation-1', logicalModelId: model.id, outputs: [], progress: 80, status: mocks.status,
  }));
});
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.useRealTimers();
});
async function settle() {
  for (let index = 0; index < 8; index += 1) await nextTick();
}
function button(host: HTMLElement, text: string) {
  return [...host.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent?.trim() === text);
}
async function runningTest() {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(ModelLibrary);
  app.directive('access', {});
  const instance = app.mount(host) as unknown as { openTest: (record: FdmAiApi.ModelDefinition) => void };
  cleanups.push(() => { app.unmount(); host.remove(); });
  await settle();
  instance.openTest(model);
  await settle();
  const prompt = host.querySelector<HTMLTextAreaElement>('textarea[placeholder="输入一条用于验证模型连通性和输出效果的提示词"]')!;
  prompt.value = '生成测试图片';
  prompt.dispatchEvent(new Event('input', { bubbles: true }));
  await settle();
  button(host, '开始测试')!.click();
  await settle();
  expect(mocks.submit).toHaveBeenCalledTimes(1);
  return host;
}

describe('model test cancellation', () => {
  it('stops archiving through the cancel API and only enables another test after an observed terminal status', async () => {
    const host = await runningTest();
    expect(button(host, '再次测试')?.disabled).toBe(true);
    button(host, '停止轮询')!.click();
    await settle();
    expect(host.textContent).toContain('停止轮询或关闭弹窗不会终止调用');
    expect(mocks.cancel).not.toHaveBeenCalled();

    button(host, '停止归档')!.click();
    await settle();
    expect(mocks.cancel).toHaveBeenCalledExactlyOnceWith('invocation-1');
    expect(mocks.info).toHaveBeenCalledWith('已提交取消请求，正在查询实际状态');
    expect(host.textContent).toContain('结果归档中');
    expect(button(host, '再次测试')?.disabled).toBe(true);
    expect(mocks.submit).toHaveBeenCalledTimes(1);

    mocks.status = 'CANCELED';
    await vi.advanceTimersByTimeAsync(1000);
    await settle();
    expect(host.textContent).toContain('已取消');
    expect(button(host, '再次测试')?.disabled).toBe(false);
    button(host, '再次测试')!.click();
    await settle();
    expect(mocks.submit).toHaveBeenCalledTimes(2);
  });

  it('keeps an upstream running task pending after a cancellation request instead of claiming success', async () => {
    mocks.status = 'RUNNING';
    const host = await runningTest();
    button(host, '请求取消')!.click();
    await settle();
    expect(host.textContent).toContain('运行中');
    expect(host.textContent).not.toContain('已取消');
    expect(mocks.success).not.toHaveBeenCalled();
    expect(button(host, '再次测试')?.disabled).toBe(true);
    mocks.status = 'CANCEL_REQUESTED';
    await vi.advanceTimersByTimeAsync(1000);
    await settle();
    expect(button(host, '请求取消')?.disabled).toBe(true);
  });

  it('does not expose cancellation to a user without the invocation cancel permission', async () => {
    mocks.allowCancel = false;
    const host = await runningTest();
    expect(button(host, '停止归档')).toBeUndefined();
    expect(button(host, '请求取消')).toBeUndefined();
    expect(button(host, '停止轮询')).toBeDefined();
    expect(mocks.cancel).not.toHaveBeenCalled();
  });
});
