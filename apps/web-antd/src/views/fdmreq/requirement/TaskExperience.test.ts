import { createApp, h, nextTick, ref } from 'vue';

import { afterEach, expect, it, vi } from 'vitest';

import TaskExperience from './TaskExperience.vue';

const api = vi.hoisted(() => vi.fn());
vi.mock('#/api/fdmmcp/experience', () => ({ experienceApi: api }));
let dispose = () => {};
afterEach(() => {
  dispose();
  api.mockReset();
});
it('任务切换时取消原来源的读取，迟到的草稿不会显示或提交', async () => {
  const req = ref({ reqNo: 'REQ-1', title: '旧任务', status: 'COMPLETED' });
  let finish!: (result: unknown) => void;
  api.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const visible = document.createElement('div');
  document.body.append(visible);
  const app = createApp({
    setup: () => () =>
      h(TaskExperience, { requirement: req.value, summary: '' }),
  });
  app.mount(visible);
  dispose = () => {
    app.unmount();
    visible.remove();
  };
  visible.querySelector('button')!.click();
  await vi.waitFor(() => expect(api.mock.calls).toHaveLength(1));
  const signal = api.mock.calls[0]![2];
  req.value = { reqNo: 'REQ-2', title: '其它任务', status: 'CANCELLED' };
  await nextTick();
  expect(signal.aborted).toBe(true);
  finish({ id: 'previous' });
  await nextTick();
  expect(document.body.querySelector('.ant-modal form')).toBeNull();
  expect(api.mock.calls.map(([action]) => action)).toEqual(['sourceLookup']);
});
it('仅已验收任务可打开，同来源稳定标识，重新打开编辑自己的已存经验', async () => {
  const req = ref({
    reqNo: 'REQ-42',
    title: '完成库存核对',
    rawDescription:
      '【当前问题】\n跨库账目不符\n\n【补充背景】\n不自动保存的备注',
    status: 'PENDING_ACCEPTANCE',
  });
  const visible = document.createElement('div');
  document.body.append(visible);
  const app = createApp({
    setup: () => () =>
      h(TaskExperience, {
        requirement: req.value,
        summary: '按批次核对',
        risk: '补登批次需要单独盘点',
      }),
  });
  app.mount(visible);
  dispose = () => {
    app.unmount();
    visible.remove();
  };
  expect(visible.textContent).not.toContain('沉淀为我的经验');
  req.value = { ...req.value, status: 'ACCEPTED' };
  await nextTick();
  let stored = false;
  api.mockImplementation(async (action, payload) => {
    if (action === 'sourceLookup') return { id: stored ? 'old' : null };
    if (action === 'own')
      return {
        id: 'old',
        version: 7,
        status: 'personal',
        title: '本人已修订',
        scenario: '场景',
        method: '当前方法',
        exception: '',
        source: '原任务',
      };
    if (action === 'save') {
      stored = true;
      return { ...payload, id: 'old' };
    }
  });
  visible.querySelector('button')!.click();
  await vi.waitFor(() =>
    expect(document.body.querySelector('.ant-modal form')).toBeTruthy(),
  );
  const key = api.mock.calls[0]![1].sourceKey;
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(['fdmreq.requirement', 'REQ-42'])),
  );
  expect(key).toBe(
    `task:${Array.from(new Uint8Array(digest), (v) =>
      v.toString(16).padStart(2, '0'),
    ).join('')}`,
  );
  const form = document.body.querySelector('form')!;
  const method = form.querySelectorAll('textarea')[1]!;
  expect(method.value).toBe('按批次核对');
  method.value = '我确认的做法';
  method.dispatchEvent(new Event('input'));
  req.value = { ...req.value }; // the actual detail refreshes every 15 seconds
  await nextTick();
  expect(method.value).toBe('我确认的做法');
  expect(api.mock.calls.some(([a]) => a === 'save')).toBe(false);
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() =>
    expect(visible.textContent).toContain('已保存到我的经验'),
  );
  expect(api).toHaveBeenCalledWith(
    'save',
    {
      sourceKey: key,
      title: '完成库存核对',
      scenario: '跨库账目不符',
      source: '已验收需求 REQ-42',
      method: '我确认的做法',
      exception: '补登批次需要单独盘点',
    },
    expect.anything(),
  );
  visible.querySelector('button')!.click();
  await vi.waitFor(() =>
    expect(api).toHaveBeenCalledWith('own', { id: 'old' }, expect.anything()),
  );
  const edit = document.body.querySelector('.ant-modal form')!;
  expect(edit.querySelector('input')!.value).toBe('本人已修订');
  edit.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() =>
    expect(api).toHaveBeenCalledWith(
      'save',
      expect.objectContaining({ id: 'old', version: 7 }),
      expect.anything(),
    ),
  );
});
