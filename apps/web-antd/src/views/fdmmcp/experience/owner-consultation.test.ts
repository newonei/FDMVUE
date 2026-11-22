import { createApp, nextTick, reactive } from 'vue';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import ExperienceLibrary from './index.vue';

const api = vi.hoisted(() => vi.fn());
vi.mock('#/api/fdmmcp/experience', () => ({ experienceApi: api }));
const session = reactive({ userInfo: { id: '1' } });
vi.mock('@vben/stores', () => ({
  useAccessStore: () => ({ accessToken: 'isolated-test', tenantId: 1 }),
  useUserStore: () => session,
}));
vi.mock('@vben/common-ui', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    Page: defineComponent({
      setup:
        (_, { slots }) =>
        () =>
          h('main', slots.default?.()),
    }),
  };
});

const people = [
  { id: '2', name: '同名作者' },
  { id: '3', name: '同名作者' },
];
const published = {
  id: 'example',
  ownerId: '3',
  ownerName: '同名作者',
  status: 'published',
  title: '按批次核对库存',
  scenario: '仓库盘点',
  method: '对照入库批次',
  exception: '',
  source: '已审核的盘点记录',
  version: 4,
  publishedVersion: 4,
  scope: 'company',
  reviewNote: '',
};
let container: HTMLDivElement;
let app: ReturnType<typeof createApp>;
function click(text: string) {
  const button = [...container.querySelectorAll('button')].find(
    (el) => el.textContent?.replaceAll(' ', '') === text,
  );
  if (!button) throw new Error(`找不到按钮 ${text}`);
  button.click();
}
function submit(text: string) {
  const input = container.querySelector<HTMLInputElement>(
    'input[aria-label="向所选员工提问"]',
  )!;
  input.value = text;
  input.dispatchEvent(new Event('input'));
  container
    .querySelector('form')!
    .dispatchEvent(new Event('submit', { cancelable: true }));
}
async function chooseThird() {
  click('可查阅知识');
  await vi.waitFor(() =>
    expect(api).toHaveBeenCalledWith(
      'owners',
      { query: '', publishedOnly: true },
      expect.anything(),
    ),
  );
  container
    .querySelector('.owners .ant-select-selector')!
    .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  await vi.waitFor(() =>
    expect(
      document.body.querySelectorAll('.ant-select-item-option'),
    ).toHaveLength(2),
  );
  const options = [
    ...document.body.querySelectorAll<HTMLElement>('.ant-select-item-option'),
  ];
  expect(options[0]?.textContent).toContain('员工编号 2');
  expect(options[1]?.textContent).toContain('员工编号 3');
  options[1]!.click();
  await nextTick();
}
beforeEach(async () => {
  session.userInfo.id = '1';
  api.mockReset().mockImplementation(async (action: string) => {
    if (action === 'profile')
      return { ...session.userInfo, name: '验收员工', canReview: false };
    if (action === 'owners') return { items: people };
    if (action === 'search') return { items: [published] };
    if (action === 'cite') return { ok: true };
    return { items: [] };
  });
  container = document.createElement('div');
  document.body.append(container);
  app = createApp(ExperienceLibrary);
  app.mount(container);
  await nextTick();
});
afterEach(() => {
  app.unmount();
  container.remove();
});

it('按指定作者查询已发布方法、来源和版本，并复用共享试用记录', async () => {
  await chooseThird();
  expect(container.textContent).toContain(
    '输入问题，查找这位员工已发布的做法和来源。',
  );
  expect(api.mock.calls.some(([action]) => action === 'search')).toBe(false);
  submit('库存应该如何盘点？');
  await vi.waitFor(() =>
    expect(container.textContent).toContain(published.source),
  );
  expect(api).toHaveBeenCalledWith(
    'search',
    { ownerId: '3', query: '库存应该如何盘点？' },
    expect.anything(),
  );
  expect(container.textContent).toContain('v4');
  click('引用此经验试用');
  await vi.waitFor(() =>
    expect(container.textContent).toContain('按此经验处理'),
  );
  expect(api).toHaveBeenCalledWith(
    'cite',
    {
      id: 'example',
      version: 4,
      messageId: expect.any(String),
      kind: 'shared-trial',
    },
    expect.anything(),
  );
  const messageId = api.mock.calls.find(([action]) => action === 'cite')![1]
    .messageId;
  const outcome = container.querySelector<HTMLInputElement>(
    'input[value="needs-detail"]',
  )!;
  expect(outcome.closest('label')?.textContent).toContain('未解决，需补充');
  outcome.click();
  const explanation = container.querySelector<HTMLTextAreaElement>(
    'textarea[aria-label="反馈说明"]',
  )!;
  explanation.value = '缺少临时盘点的适用条件';
  explanation.dispatchEvent(new Event('input'));
  container
    .querySelector('.feedback-form')!
    .dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() =>
    expect(api).toHaveBeenCalledWith(
      'feedback',
      {
        id: 'example',
        version: 4,
        messageId,
        outcome: 'needs-detail',
        note: '缺少临时盘点的适用条件',
      },
      expect.anything(),
    ),
  );
  await vi.waitFor(() =>
    expect(
      container.querySelector<HTMLElement>('nav button:disabled'),
    ).toBeNull(),
  );
  click('我的经验');
  await nextTick();
  click('可查阅知识');
  await vi.waitFor(() =>
    expect(
      container.querySelector('input[aria-label="查找经验"]'),
    ).toBeTruthy(),
  );
  expect(api).toHaveBeenCalledWith(
    'list',
    { view: 'shared', query: '' },
    expect.anything(),
  );
});

it('读者可补改上次使用反馈，作者通过被使用的发布快照打开当前工作副本', async () => {
  const use = {
    id: 'example',
    version: 4,
    title: published.title,
    at: '2026-11-22',
    messageId: 'reader-msg',
    kind: 'shared-trial',
    outcome: 'outdated',
    note: '旧说明',
  };
  const received = {
    id: 'example',
    version: 4,
    title: published.title,
    at: use.at,
    readerName: '读者',
    outcome: 'outdated',
    note: '旧说明',
  };
  const revised = {
    ...published,
    id: 'example',
    ownerId: '1',
    version: 9,
    status: 'personal',
    method: '作者当前私有工作副本',
  };
  api.mockImplementation(async (action) => {
    if (action === 'myUses') return { items: [use] };
    if (action === 'feedbackList') return { items: [received] };
    if (action === 'read') return { ...published, source: '历史发布来源' };
    if (action === 'own')
      return {
        ...published,
        id: 'example',
        ownerId: '1',
        version: 8,
        status: 'personal',
        method: '作者当前私有工作副本',
      };
    if (action === 'save') return revised;
    if (action === 'list') return { items: [revised] };
    return { items: [] };
  });
  click('使用记录');
  await nextTick();
  await vi.waitFor(() =>
    expect(container.textContent).toContain('我用过的经验'),
  );
  click('我用过的经验');
  await vi.waitFor(() => expect(container.textContent).toContain('旧说明'));
  click('修改使用反馈');
  await nextTick();
  expect(
    container.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="反馈说明"]',
    )?.value,
  ).toBe('旧说明');
  container.querySelector<HTMLInputElement>('input[value="resolved"]')!.click();
  container
    .querySelector('.feedback-form')!
    .dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() =>
    expect(api).toHaveBeenCalledWith(
      'feedback',
      {
        id: 'example',
        version: 4,
        messageId: 'reader-msg',
        outcome: 'resolved',
        note: '旧说明',
      },
      expect.anything(),
    ),
  );
  await vi.waitFor(() =>
    expect(
      container.querySelector<HTMLElement>('nav button:disabled'),
    ).toBeNull(),
  );
  click('收到的反馈');
  await vi.waitFor(() =>
    expect(container.textContent).toContain('查看被用版本'),
  );
  click('查看被用版本');
  await vi.waitFor(() =>
    expect(document.body.textContent).toContain('历史发布来源'),
  );
  expect(api).toHaveBeenCalledWith(
    'read',
    { id: 'example', version: 4, publishedOnly: true },
    expect.anything(),
  );
  [...document.body.querySelectorAll('button')]
    .find((b) => b.textContent === '编辑当前工作副本')!
    .click();
  await vi.waitFor(() =>
    expect(document.body.querySelector('.ant-modal form')).toBeTruthy(),
  );
  const form = document.body.querySelector('.ant-modal form')!;
  expect(form.querySelectorAll('textarea')[1]?.value).toBe(
    '作者当前私有工作副本',
  );
  expect(api).toHaveBeenCalledWith('own', { id: 'example' }, expect.anything());
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() =>
    expect(api).toHaveBeenCalledWith(
      'save',
      expect.objectContaining({ id: 'example', version: 8 }),
      expect.anything(),
    ),
  );
  await vi.waitFor(() =>
    expect(container.textContent).toContain('再次提交共享审核'),
  );
  click('再次提交共享审核');
  await vi.waitFor(() =>
    expect(api).toHaveBeenCalledWith(
      'share',
      { id: 'example', version: 9, scope: 'department' },
      expect.anything(),
    ),
  );
});

it('切换身份会取消在途问题，旧账号结果到达时也不会展示', async () => {
  await chooseThird();
  let complete!: (result: unknown) => void;
  api.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  submit('库存盘点');
  const signal = api.mock.calls.at(-1)![2];
  session.userInfo.id = '20';
  await nextTick();
  expect(signal.aborted).toBe(true);
  complete({ items: [published] });
  await vi.waitFor(() =>
    expect(container.textContent).toContain('还没有个人经验。'),
  );
  expect(container.textContent).not.toContain(published.source);
  expect(container.querySelector('.owners')).toBeNull();
});

it('向同事提问没有匹配时，只能以自己的身份补录，经本人确认才写入经验', async () => {
  const question = '盘点数量不符时如何复核？';
  await chooseThird();
  api.mockResolvedValueOnce({ items: [] });
  submit(question);
  await vi.waitFor(() =>
    expect(container.textContent).toContain('补充我处理这个问题的经验'),
  );
  click('补充我处理这个问题的经验');
  await nextTick();
  const form = document.body.querySelector<HTMLFormElement>('.ant-modal form')!;
  const fields = form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    'input, textarea',
  );
  expect([...fields].map((input) => input.value)).toEqual([
    '',
    question,
    '',
    '',
    '',
  ]);
  expect(api.mock.calls.some(([action]) => action === 'save')).toBe(false);
  for (const [index, value] of [
    [0, '按批次复核盘点'],
    [2, '核对批次后再复点'],
    [4, '本人盘点复核记录'],
  ] as const) {
    fields[index]!.value = value;
    fields[index]!.dispatchEvent(new Event('input'));
  }
  api.mockResolvedValueOnce({ id: 'own-entry', ownerId: '1' });
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() =>
    expect(container.textContent).toContain('已存为个人经验'),
  );
  expect(api).toHaveBeenCalledWith(
    'save',
    {
      title: '按批次复核盘点',
      scenario: question,
      method: '核对批次后再复点',
      source: '本人盘点复核记录',
      exception: '',
      sourceKey: expect.stringMatching(/^manual:/),
    },
    expect.anything(),
  );
});

it('本人检索只有成功返回空结果才可补录，改写问题后须重新查询', async () => {
  const input = container.querySelector<HTMLInputElement>(
    'input[aria-label="查找经验"]',
  )!;
  input.value = '原问题';
  input.dispatchEvent(new Event('input'));
  await nextTick();
  api.mockRejectedValueOnce(new Error('服务暂时不可用'));
  click('按问题查我的经验');
  await vi.waitFor(() =>
    expect(container.textContent).toContain('服务暂时不可用'),
  );
  expect(container.textContent).not.toContain('补充我处理这个问题的经验');
  api.mockResolvedValueOnce({ items: [] });
  click('按问题查我的经验');
  await vi.waitFor(() =>
    expect(container.textContent).toContain('补充我处理这个问题的经验'),
  );
  input.value = '尚未查询的新问题';
  input.dispatchEvent(new Event('input'));
  await nextTick();
  expect(container.textContent).not.toContain('补充我处理这个问题的经验');
});

it('目录失败后允许重试，过滤作者时丢弃上一次读取的结果', async () => {
  let finishEarlier!: (result: unknown) => void;
  let failedOnce = false;
  api.mockImplementation(
    async (action: string, payload: { query?: string }) => {
      if (action !== 'owners') return { items: [] };
      if (!failedOnce) {
        failedOnce = true;
        throw new Error('临时中断');
      }
      if (payload.query === '先')
        return new Promise((resolve) => {
          finishEarlier = resolve;
        });
      return { items: payload.query ? [] : people };
    },
  );
  click('可查阅知识');
  await vi.waitFor(() =>
    expect(container.textContent).toContain('员工目录读取失败'),
  );
  click('重试');
  await vi.waitFor(() =>
    expect(container.textContent).not.toContain('员工目录读取失败'),
  );
  container
    .querySelector('.owners .ant-select-selector')!
    .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  await vi.waitFor(() =>
    expect(
      document.body.querySelectorAll('.ant-select-item-option'),
    ).toHaveLength(2),
  );
  const search = container.querySelector<HTMLInputElement>('.owners input')!;
  for (const name of ['先', '后']) {
    search.value = name;
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        'owners',
        { query: name, publishedOnly: true },
        expect.anything(),
      ),
    );
  }
  await vi.waitFor(() =>
    expect(document.body.textContent).toContain('没有匹配的经验作者'),
  );
  finishEarlier({ items: people });
  await nextTick();
  expect(
    document.body.querySelectorAll('.ant-select-item-option'),
  ).toHaveLength(0);
});
