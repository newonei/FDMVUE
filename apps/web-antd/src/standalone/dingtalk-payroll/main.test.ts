import type { PayrollSlip } from './model';

import { expect, it, vi } from 'vitest';

const requestCardAuthCode = vi.hoisted(() => vi.fn().mockResolvedValue('code'));
vi.mock('../dingtalk-card/auth', () => ({ requestCardAuthCode }));

it('renders only issued fields and clears salary values when hidden or expired', async () => {
  vi.useFakeTimers();
  const originalPath = location.pathname + location.search;
  const userAgent = vi
    .spyOn(navigator, 'userAgent', 'get')
    .mockReturnValue('DingTalk');
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  const id = '683a8785-4c76-47df-a381-c48382c716e5';
  const serverNow = Date.now();
  window.history.replaceState(null, '', `/dingtalk-payroll.html?id=${id}`);
  document.body.innerHTML =
    '<main><section id="slip-state"></section><div id="slip-content" hidden></div></main>';
  const content = document.querySelector<HTMLElement>('#slip-content')!;
  const state = document.querySelector<HTMLElement>('#slip-state')!;

  let payload: PayrollSlip = {
    month: '2026-10',
    name: '寿命测试员工',
    department: '综合部',
    company: '测试公司',
    net: 123_456,
    sections: [{ title: '应发项目', total: 987_654, items: [] }],
  };
  const detail = vi.fn().mockImplementation(() =>
    Response.json({
      code: 0,
      data: {
        status: 'AVAILABLE',
        serverNow: Date.now(),
        expiresAt: serverNow + 2000,
        slip: payload,
      },
    }),
  );
  const fetcher = vi.fn().mockImplementation(async (url: string) => {
    if (url.includes('/payroll/my-slip')) return detail();
    let data;
    if (url.includes('get-by-website')) data = { id: 8 };
    if (url.includes('public-config'))
      data = { enabled: true, corpId: 'corp', clientId: 'app' };
    if (url.includes('dingtalk-mini-login')) data = { accessToken: 'token' };
    return Response.json({ code: 0, data });
  });
  vi.stubGlobal('fetch', fetcher);
  const localStorageLength = localStorage.length;
  const sessionStorageLength = sessionStorage.length;

  try {
    await import('./main');
    await vi.advanceTimersByTimeAsync(100);
    expect(content.textContent).toContain('1,234.56');
    expect(content.textContent).toContain('9,876.54');
    expect(detail).toHaveBeenCalledTimes(1);
    expect(requestCardAuthCode).toHaveBeenCalledWith('corp', 'app');

    hidden.mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(content.children).toHaveLength(0);
    expect(content.hidden).toBe(true);
    await vi.advanceTimersByTimeAsync(500);

    payload = {
      month: '2026-10',
      name: '寿命测试员工',
      department: '',
      company: '',
      net: null,
      sections: [
        {
          title: '应发项目',
          total: null,
          items: [{ label: '基础工资', value: 0 }],
        },
        {
          title: '出勤信息',
          items: [{ label: '出勤天数', text: '21.5', value: null }],
        },
      ],
    };
    hidden.mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(100);
    expect(detail).toHaveBeenCalledTimes(2);
    expect(content.querySelector('.slip-total')).toBeNull();
    expect(content.querySelector('.slip-section-title strong')).toBeNull();
    expect(content.querySelector('.slip-heading .clock')?.textContent).toMatch(
      /^剩余 /,
    );
    expect(content.textContent).not.toMatch(
      /1,234\.56|9,876\.54|测试公司|综合部/,
    );
    expect(
      [...content.querySelectorAll('dd')].map((node) => node.textContent),
    ).toEqual(['¥0.00', '21.5']);

    await vi.advanceTimersByTimeAsync(1600);
    expect(content.children).toHaveLength(0);
    expect(state.textContent).toContain('工资条已到期');
    expect(localStorage.length).toBe(localStorageLength);
    expect(sessionStorage.length).toBe(sessionStorageLength);
  } finally {
    window.dispatchEvent(new Event('pagehide'));
    window.history.replaceState(null, '', originalPath);
    document.body.replaceChildren();
    vi.unstubAllGlobals();
    hidden.mockRestore();
    userAgent.mockRestore();
    vi.useRealTimers();
  }
});
