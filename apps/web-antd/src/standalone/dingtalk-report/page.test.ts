import { createApp } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ReportPage from './page.vue';

const mocks = vi.hoisted(() => ({
  authCode: vi.fn(),
  login: vi.fn(),
  my: vi.fn(),
  options: vi.fn(),
  prepare: vi.fn(),
  publicConfig: vi.fn(),
  report: vi.fn(),
  resolveTenant: vi.fn(),
  wageMatch: vi.fn(),
}));

vi.mock('../dingtalk-card/auth', () => ({
  requestCardAuthCode: mocks.authCode,
}));
vi.mock('../dingtalk-card/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../dingtalk-card/api')>()),
  createCardApi: () => ({
    login: mocks.login,
    publicConfig: mocks.publicConfig,
    resolveTenant: mocks.resolveTenant,
  }),
}));
vi.mock('./api', () => ({
  createReportApi: () => ({
    my: mocks.my,
    options: mocks.options,
    prepare: mocks.prepare,
    report: mocks.report,
    wageMatch: mocks.wageMatch,
  }),
  shrinkPhoto: vi.fn(),
}));

describe('dingtalk report handoff to the full workbench', () => {
  let app: ReturnType<typeof createApp> | undefined;
  let host: HTMLDivElement | undefined;
  let previousUrl: string;

  beforeEach(() => {
    vi.resetAllMocks();
    sessionStorage.clear();
    previousUrl = window.location.href;
    window.history.replaceState(
      {},
      '',
      '/dingtalk-report?factoryId=2&taskId=7',
    );
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(
      'DingTalk/7.0',
    );
    mocks.resolveTenant.mockResolvedValue(1);
    mocks.publicConfig.mockResolvedValue({
      enabled: true,
      corpId: 'corp-test',
      clientId: 'client-test',
    });
    mocks.authCode.mockResolvedValue('test-auth-code');
    mocks.login.mockResolvedValue({
      accessToken: 'test-token',
      expiresTime: Date.now() + 300_000,
    });
    mocks.options.mockResolvedValue({
      materials: [{ value: 'TPE', label: 'TPE' }],
    });
  });

  afterEach(() => {
    app?.unmount();
    host?.remove();
    app = undefined;
    host = undefined;
    sessionStorage.clear();
    window.history.replaceState({}, '', previousUrl);
    vi.restoreAllMocks();
  });

  it.each([
    {
      process: 'SLICE',
      inProgressOrderId: undefined,
      reason: '开片按本次良品体积计薪',
    },
    { process: 'CUT', inProgressOrderId: 91, reason: '这个任务已经领料' },
  ])(
    'hands off $process without showing or submitting the simple report',
    async ({ process, inProgressOrderId, reason }) => {
      const outputStage = process === 'SLICE' ? 'SHEET' : 'CUT';
      const sourceStage = process === 'SLICE' ? 'BOARD' : 'SHEET';
      const attrs = {
        material: 'TPE',
        recipeCode: 'REC-001',
        color: 'PU',
        length: 190,
        width: 130,
        thickness: 4.8,
      };
      mocks.my.mockResolvedValue({
        userId: 164,
        processes: [
          {
            code: process,
            label: process === 'SLICE' ? '开片' : '立切',
            outputLabel: '片材',
            outputStage,
            outputUnit: '片',
            sources: [sourceStage],
          },
        ],
      });
      mocks.prepare.mockResolvedValue({
        aux: [],
        inProgressOrderId,
        outputAttrs: attrs,
        picks: [
          {
            quantity: '5',
            stock: {
              id: 11,
              itemId: 31,
              item: attrs,
              itemCode: 'BOARD-1',
              batchNo: 'B1',
              location: '板材区',
              quantity: '20',
              stage: sourceStage,
            },
          },
        ],
        sourceStage,
        sourceStages: [sourceStage],
        task: {
          id: 7,
          process,
          product: '测试板材',
          quantity: '5',
          unit: '片',
        },
      });

      host = document.createElement('div');
      document.body.append(host);
      app = createApp(ReportPage);
      app.mount(host);

      await vi.waitFor(() => expect(host?.textContent).toContain(reason));
      const link = host.querySelector<HTMLAnchorElement>('a');
      expect(link?.textContent).toBe('打开工作台');
      expect(link?.getAttribute('href')).toBe(
        '/gongchang/workbench?factoryId=2&taskId=7',
      );
      expect(mocks.prepare).toHaveBeenCalledWith(
        { accessToken: 'test-token', factoryId: 2, tenantId: 1 },
        7,
      );
      expect(host.querySelector('#good')).toBeNull();
      expect(host.querySelector('#bad')).toBeNull();
      expect(host.querySelector('input[type="file"]')).toBeNull();
      expect(
        [...host.querySelectorAll('button')].some((button) =>
          button.textContent?.includes('报工'),
        ),
      ).toBe(false);
      expect(mocks.wageMatch).not.toHaveBeenCalled();
      expect(mocks.report).not.toHaveBeenCalled();
    },
  );
});
