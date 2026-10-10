import type { FdmgongchangFactoryApi as Api } from '#/api/fdmgongchang/factory';

import { createApp, defineComponent, h, nextTick } from 'vue';

import { afterEach, describe, expect, it, vi } from 'vitest';

import WorkerPage from './index.vue';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  myFactories: vi.fn().mockResolvedValue({
    canSeeAll: false,
    defaultFactoryId: 3,
    factories: [{ code: 'LYFDM', deptId: 124, id: 3, name: '洛阳飞德慕' }],
  }),
  add: vi.fn(),
  options: vi.fn(),
  remove: vi.fn(),
  save: vi.fn(),
  search: vi.fn(),
  setFactory: vi.fn(),
}));
vi.mock('#/api/fdmgongchang/factory', () => ({
  getMyFactories: mocks.myFactories,
  getWorkerList: mocks.list,
  getWorkerOptions: mocks.options,
  addWorkers: mocks.add,
  removeWorkers: mocks.remove,
  saveWorkers: mocks.save,
  searchWorkerCandidates: mocks.search,
  setCurrentFactoryId: mocks.setFactory,
}));
vi.mock('@vben/access', () => ({ useAccess: () => ({ hasAccessByCodes: () => true }) }));
vi.mock('@vben/common-ui', () => ({
  Page: defineComponent({ setup: (_, ctx) => () => h('main', ctx.slots.default?.()) }),
}));

const options: Api.WorkerOptions = {
  depts: [
    { id: 124, name: '洛阳飞德慕', parentId: 0 },
    { id: 165, name: '密炼车间', parentId: 145 },
  ],
  posts: [
    { code: 'MIX', label: '密炼挤出发泡', process: 'MIX' },
    { code: 'SLICE', label: '开片', process: 'SLICE' },
    { code: 'TEAM_LEADER', label: '班组长', process: null },
  ],
  wageModes: [
    { code: 'PIECE', label: '计件' },
    { code: 'TIME', label: '计时' },
  ],
};
const workers: Api.Worker[] = [
  { assigned: false, deptId: 165, deptName: '密炼车间', nickname: '李四', posts: [], userId: 12 },
  {
    assigned: true,
    deptId: 165,
    deptName: '密炼车间',
    nickname: '王五',
    posts: ['MIX', 'TEAM_LEADER'],
    status: 0,
    team: '密炼一组',
    userId: 13,
    wageMode: 'PIECE',
  },
];

const flush = async () => {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
    await nextTick();
  }
};

function clickButton(text: string) {
  const el = [...document.querySelectorAll('button')].find(
    (b) => b.textContent?.replaceAll(/\s/g, '') === text,
  );
  if (!el) throw new Error(`找不到按钮：${text}`);
  el.click();
}

describe('worker page', () => {
  let unmount: (() => void) | undefined;
  afterEach(() => {
    unmount?.();
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('lists factory people with their posts and assigns posts to someone waiting', async () => {
    mocks.options.mockResolvedValue(options);
    mocks.list.mockResolvedValue(workers);
    mocks.save.mockResolvedValue(true);
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp(WorkerPage);
    app.mount(host);
    unmount = () => app.unmount();
    await flush();

    expect(mocks.setFactory).toHaveBeenCalledWith(3);
    const text = document.body.textContent ?? '';
    expect(text).toContain('洛阳飞德慕');
    expect(text).toContain('1 人待分配岗位');
    expect(text).toContain('密炼挤出发泡');
    expect(text).toContain('班组长');
    expect(text).toContain('计件');

    clickButton('分配岗位');
    await flush();
    expect(document.body.textContent).toContain('分配岗位 · 李四');
    const slice = [...document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find(
      (c) => c.value === 'SLICE',
    );
    slice!.click();
    await flush();
    const team = document.querySelector<HTMLInputElement>('#worker-team')!;
    team.value = '开片一组';
    team.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
    clickButton('保存');
    await flush();
    expect(mocks.save).toHaveBeenCalledWith({
      posts: ['SLICE'],
      remark: undefined,
      status: 0,
      team: '开片一组',
      userIds: [12],
      wageMode: undefined,
    });
  });

  it('adds people from outside the factory dept, skipping ones already in another factory', async () => {
    mocks.options.mockResolvedValue(options);
    mocks.list.mockResolvedValue([{ ...workers[0], added: true }]);
    mocks.search.mockResolvedValue([
      { deptName: '总部', nickname: '赵七', userId: 21 },
      { deptName: '湖北飞德慕', factoryId: 1, factoryName: '湖北飞德慕', nickname: '赵八', userId: 22 },
    ]);
    mocks.add.mockResolvedValue(true);
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp(WorkerPage);
    app.mount(host);
    unmount = () => app.unmount();
    await flush();
    expect(document.body.textContent).toContain('手动添加');
    expect(document.body.textContent).toContain('移出本厂');

    clickButton('＋添加人员');
    await flush();
    const input = document.querySelector<HTMLInputElement>('#worker-add-keyword')!;
    input.value = '赵';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 350));
    await flush();
    expect(mocks.search).toHaveBeenCalledWith('赵');
    expect(document.body.textContent).toContain('在湖北飞德慕');
    const other = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('赵八'));
    expect(other?.disabled).toBe(true);
    [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('赵七'))!.click();
    await flush();
    clickButton('添加1人');
    await flush();
    expect(mocks.add).toHaveBeenCalledWith([21]);
  });
});
