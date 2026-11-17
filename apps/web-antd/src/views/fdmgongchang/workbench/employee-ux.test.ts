import type { FdmgongchangScheduleApi as ScheduleApi } from '#/api/fdmgongchang/schedule';
import type { FdmgongchangStageStockApi as StockApi } from '#/api/fdmgongchang/stage-stock';
import type { FdmgongchangWorkbenchApi as Api } from '#/api/fdmgongchang/workbench';

import { createApp, defineComponent, h, nextTick } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Home from './modules/home.vue';
import PieceStep from './modules/piece-step.vue';
import { createJob, provideJob } from './use-job';

const mocks = vi.hoisted(() => ({ picks: vi.fn(), mates: vi.fn(), wages: vi.fn() }));
vi.mock('#/api/fdmgongchang/workbench', () => ({
  getWorkbenchPickList: mocks.picks,
  getWorkbenchMates: mocks.mates,
  matchWorkbenchWage: mocks.wages,
}));
vi.mock('#/components/upload/image-upload.vue', () => ({ default: { render: () => null } }));

const process: Api.Process = { code: 'CUT', label: '立切', sources: ['SHEET'], outputStage: 'CUT', outputLabel: '已立切片材', outputUnit: '片' };
const task = (id: number): ScheduleApi.Task => ({
  id, process: 'CUT', orderCount: 1, scheduleId: 1, workDate: '2026-11-16', product: `瑜伽垫 ${id}`, contractCode: `SO-${id}`,
  quantity: 100, actualQuantity: 20, unit: '片',
  output: { stage: 'CUT', attrs: { color: id === 23 ? 'PU' : 'BL', length: 180, width: 60, thickness: 0.6 } },
});
const flush = async () => {
  for (let i = 0; i < 8; i++) { await Promise.resolve(); await nextTick(); }
};
function click(text: string) {
  const button = [...document.querySelectorAll('button')].find((node) => node.textContent?.includes(text));
  if (!button) throw new Error(`missing button ${text}`);
  button.click();
}

describe('employee workbench navigation and explicit finishing', () => {
  let job: ReturnType<typeof createJob>;
  let unmount: (() => void) | undefined;
  beforeEach(() => {
    job = createJob();
    job.my = { factoryName: '测试工厂', userId: 7, userName: '小王', today: '2026-11-16', todayAmount: 0, processes: [process], tasks: Array.from({ length: 23 }, (_, i) => task(i + 1)), inProgress: [], recentDone: [] };
    job.options = { stages: [{ code: 'CUT', label: '已立切片材', unit: '片' }], colors: [{ value: 'PU', label: '紫色' }, { value: 'BL', label: '蓝色' }], materials: [], patterns: [], textures: [], recipes: [], rawMaterials: [], processes: [] } as unknown as StockApi.Options;
    mocks.picks.mockResolvedValue([]);
    mocks.mates.mockResolvedValue([]);
    mocks.wages.mockResolvedValue([]);
  });
  afterEach(() => {
    unmount?.();
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });
  async function mount(component: typeof Home | typeof PieceStep, props = {}) {
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp(defineComponent({ setup() { provideJob(job); return () => h(component, props); } }));
    app.mount(host);
    unmount = () => app.unmount();
    await flush();
  }
  async function search(text: string) {
    const input = document.querySelector<HTMLInputElement>('[aria-label="搜索我的任务"]')!;
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
  }

  it('pages long task lists and searches displayed color names across all pages', async () => {
    await mount(Home);
    expect(document.querySelectorAll('article')).toHaveLength(10);
    expect(document.body.textContent).toContain('第 1 / 3 页');
    click('下一页'); await flush();
    expect(document.body.textContent).toContain('任务 #11');
    expect(document.body.textContent).not.toContain('任务 #1 ·');
    await search('紫色');
    expect(document.querySelectorAll('article')).toHaveLength(1);
    expect(document.body.textContent).toContain('任务 #23');
    expect(document.body.textContent).toContain('剩余 80 片');
    await search('SO-7');
    expect(document.body.textContent).toContain('任务 #7');
    expect(document.body.textContent).not.toContain('任务 #23');
    unmount?.();
    await mount(Home);
    expect(document.querySelector<HTMLInputElement>('[aria-label="搜索我的任务"]')?.value).toBe('SO-7');
    expect(document.querySelectorAll('article')).toHaveLength(1);
  });

  it('separates an already issued task from pending tasks and keeps recent completion distinct', async () => {
    job.my!.inProgress = [{ id: 88, orderNo: 'GX-88', process: 'CUT', scheduleTaskId: 1, outputStage: 'CUT', goodQuantity: 20, inputQuantity: 100, inputUnit: '片' } as Api.Order];
    job.my!.recentDone = [{ id: 89, orderNo: 'GX-DONE', process: 'CUT', outputStage: 'CUT', goodQuantity: 100 } as Api.Order];
    await mount(Home);
    expect(document.body.textContent).toContain('GX-88');
    expect(document.body.textContent).not.toContain('GX-DONE');
    click('待开工'); await flush();
    expect(document.body.textContent).not.toContain('任务 #1 ·');
    expect(document.body.textContent).toContain('任务 #2');
    click('最近完工'); await flush();
    expect(document.body.textContent).toContain('GX-DONE');
    expect(document.body.textContent).toContain('最近 3 天');
    expect(document.body.textContent).not.toContain('报本工序产出');
  });

  it('defaults to a partial report and requires explicit final confirmation when finishing', async () => {
    expect(job.finish).toBe(false);
    job.process = process;
    job.outputs = [{ key: 'out', attrs: {}, batchNo: '', goodQuantity: 12, defectQuantity: 1 }];
    job.finish = true;
    const submit = vi.fn();
    await mount(PieceStep, { submitting: false, onSubmit: submit });
    click('提交'); await flush();
    expect(submit).not.toHaveBeenCalled();
    document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    await flush();
    click('提交'); await flush();
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('shows the folding requirement and calls out missing requirements without inventing a value', async () => {
    job.my!.processes = [{ ...process, code: 'FOLD', label: '折叠' }];
    job.my!.tasks = [
      { ...task(1), process: 'FOLD', output: { stage: 'FOLDED', foldingType: '八折' } },
      { ...task(2), process: 'FOLD', output: { stage: 'FOLDED' } },
    ];
    await mount(Home);
    expect(document.body.textContent).toContain('折叠要求：八折');
    expect(document.body.textContent).toContain('折叠要求未确认，请联系主任');
    await search('八折');
    expect(document.querySelectorAll('article')).toHaveLength(1);
    expect(document.body.textContent).toContain('任务 #1');
  });

  it('keeps 179 team tasks collapsed, independently searches and pages them, and preserves reporting for a selected worker', async () => {
    job.my!.teamProcesses = [process];
    job.my!.teamTasks = Array.from({ length: 179 }, (_, i) => task(1001 + i));
    job.my!.teamTasks[178] = {
      ...task(1179), workerIds: '9', workerNames: '李四',
      output: { stage: 'CUT', foldingType: '八折', attrs: { color: 'PU', length: 200, width: 70, thickness: 0.6 } },
    };
    mocks.mates.mockResolvedValue([{ userId: 9, nickname: '李四' }]);
    const startTask = vi.fn();
    await mount(Home, { onStartTask: startTask });
    expect(document.body.textContent).toContain('共 179 个');
    expect(document.querySelector('#team-tasks-panel')).toBeNull();
    expect(document.querySelectorAll('[data-team-task-id]')).toHaveLength(0);
    await search('SO-7');
    document.querySelector<HTMLButtonElement>('[aria-label="展开组员任务"]')!.click();
    await flush();
    expect(document.querySelectorAll('[data-team-task-id]')).toHaveLength(10);
    expect(document.querySelector('[aria-label="组员任务分页"]')?.textContent).toContain('第 1 / 18 页');
    document.querySelector('[aria-label="组员任务分页"]')!.querySelectorAll<HTMLButtonElement>('button')[1]!.click();
    await flush();
    expect(document.querySelector('[data-team-task-id="1011"]')).not.toBeNull();
    expect(document.querySelector('[data-team-task-id="1001"]')).toBeNull();
    const input = document.querySelector<HTMLInputElement>('[aria-label="搜索组员任务"]')!;
    for (const term of ['SO-1179', '#1179', '紫色', '2000×700×6', '八折']) {
      input.value = term;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await flush();
      expect(document.querySelectorAll('[data-team-task-id]')).toHaveLength(1);
      expect(document.querySelector('[data-team-task-id="1179"]')).not.toBeNull();
      expect(document.querySelector('#team-tasks-panel')?.textContent).toContain('匹配 1 个');
    }
    expect(document.querySelectorAll('article')).toHaveLength(1);
    expect(document.querySelector('article')?.textContent).toContain('任务 #7');
    document.querySelector<HTMLButtonElement>('[data-team-task-id="1179"] button')!.click();
    await flush();
    click('下一步');
    await flush();
    expect(startTask).toHaveBeenCalledWith(expect.objectContaining({ id: 1179 }), process, { id: 9, name: '李四' });
    document.querySelector<HTMLButtonElement>('[aria-label="收起组员任务"]')!.click();
    await flush();
    expect(document.querySelector('#team-tasks-panel')).toBeNull();
  });
});
