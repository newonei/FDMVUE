import type { PublicConfig } from '../dingtalk-card/model';
import type { PayrollSlip } from './model';

import { CardApiError } from '../dingtalk-card/api';
import { requestCardAuthCode } from '../dingtalk-card/auth';
import { createPayrollApi } from './api';
import {
  formatAmount,
  formatCountdown,
  formatMonth,
  parseSlipId,
} from './model';

import './style.css';

const state = document.querySelector<HTMLElement>('#slip-state')!;
const content = document.querySelector<HTMLElement>('#slip-content')!;
const id = parseSlipId(window.location.search);
const inDingTalk = /DingTalk/i.test(navigator.userAgent);
const appConfig = (
  window as Window & {
    _VBEN_ADMIN_PRO_APP_CONF_?: { VITE_GLOB_API_URL?: string };
  }
)._VBEN_ADMIN_PRO_APP_CONF_;
const api = createPayrollApi(
  appConfig?.VITE_GLOB_API_URL ||
    import.meta.env.VITE_GLOB_API_URL ||
    '/admin-api',
);

let tenant: undefined | { config: PublicConfig; id: number };
let token: string | undefined;
let pending: AbortController | undefined;
let timer: ReturnType<typeof setInterval> | undefined;
let finalState = false;

function element<Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
  className?: string,
  text?: string,
) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function clearSlip() {
  clearInterval(timer);
  timer = undefined;
  content.hidden = true;
  content.replaceChildren();
}

function showState(title: string, message?: string, retry = false) {
  clearSlip();
  state.replaceChildren(element('h1', undefined, title));
  if (message) state.append(element('p', undefined, message));
  if (retry) {
    const button = element('button', undefined, '重新打开');
    button.type = 'button';
    button.addEventListener('click', () => void load());
    state.append(button);
  }
  state.hidden = false;
}

function showExpired() {
  finalState = true;
  token = undefined;
  showState('工资条已到期', '如需再次查看，请联系人事部门。');
}

function ensureActive(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('请求已取消', 'AbortError');
}

function startCountdown(clock: HTMLElement, remainingMs: number) {
  const wallDeadline = Date.now() + remainingMs;
  const monotonicDeadline = performance.now() + remainingMs;
  function update() {
    const remaining = Math.min(
      wallDeadline - Date.now(),
      monotonicDeadline - performance.now(),
    );
    if (remaining <= 0) {
      showExpired();
      return;
    }
    clock.textContent = formatCountdown(remaining);
  }
  timer = setInterval(update, 250);
  update();
}

function renderSlip(slip: PayrollSlip, remainingMs: number) {
  const heading = element('section', 'slip-heading');
  heading.append(
    element('h1', undefined, `${formatMonth(slip.month)}工资条`),
    element(
      'p',
      undefined,
      [slip.name, slip.department].filter(Boolean).join(' · '),
    ),
  );
  if (slip.company) heading.append(element('p', 'slip-company', slip.company));

  const clock = element('span', 'clock');
  const caption = element('div', 'slip-caption');
  caption.append(element('span', undefined, '实发工资'), clock);
  const total = element('section', 'slip-total');
  total.append(
    caption,
    element('strong', undefined, formatAmount(slip.net)),
    element('small', undefined, '人民币'),
  );

  const sections = slip.sections.map((section) => {
    const group = element('section', 'slip-section');
    const header = element('div', 'slip-section-title');
    header.append(element('h2', undefined, section.title));
    if (typeof section.total === 'number')
      header.append(element('strong', undefined, formatAmount(section.total)));
    group.append(header);

    if (section.items.length > 0) {
      const items = element('dl');
      for (const item of section.items) {
        const row = element('div', 'slip-row');
        const label = element('dt', undefined, item.label);
        if (item.note) label.append(element('small', undefined, item.note));
        row.append(label, element('dd', undefined, formatAmount(item.value)));
        items.append(row);
      }
      group.append(items);
    }
    return group;
  });

  content.replaceChildren(
    heading,
    total,
    ...sections,
    element('footer', undefined, '对工资明细有疑问，请联系人事部门。'),
  );
  state.hidden = true;
  content.hidden = false;
  startCountdown(clock, remainingMs);
}

async function authenticate(
  current: NonNullable<typeof tenant>,
  signal: AbortSignal,
) {
  showState('正在钉钉免登…');
  const { corpId, clientId } = current.config;
  const code = await requestCardAuthCode(corpId, clientId);
  ensureActive(signal);
  const login = await api.login(current.id, corpId, code);
  ensureActive(signal);
  if (!login?.accessToken) throw new Error('钉钉免登失败');
  token = login.accessToken;
  return token;
}

async function load() {
  if (!id || !inDingTalk || pending || finalState || document.hidden) return;
  const request = new AbortController();
  const { signal } = request;
  pending = request;

  try {
    if (!tenant) {
      showState('正在确认企业…');
      const tenantId = await api.resolveTenant(location.hostname);
      ensureActive(signal);
      const config = await api.publicConfig(tenantId);
      ensureActive(signal);
      if (!config?.enabled || !config.corpId || !config.clientId) {
        finalState = true;
        showState('企业尚未启用钉钉免登', '请联系企业管理员。');
        return;
      }
      tenant = { id: tenantId, config };
    }
    const usedCachedToken = !!token;
    let accessToken = token || (await authenticate(tenant, signal));
    showState('正在读取工资条…');
    let result;
    try {
      result = await api.detail(tenant.id, accessToken, id, signal);
    } catch (error) {
      if (
        !(
          usedCachedToken &&
          error instanceof CardApiError &&
          error.code === 401
        )
      )
        throw error;
      ensureActive(signal);
      token = undefined;
      accessToken = await authenticate(tenant, signal);
      showState('正在读取工资条…');
      result = await api.detail(tenant.id, accessToken, id, signal);
    }
    ensureActive(signal);
    if (result.status === 'EXPIRED') {
      showExpired();
      return;
    }
    renderSlip(result.slip, result.remainingMs);
  } catch (error) {
    if (signal.aborted) return;
    if (error instanceof CardApiError && [403, 404].includes(error.code)) {
      finalState = true;
      token = undefined;
      showState('工资条暂不可查看', '请从自己的钉钉工作通知打开工资条。');
      return;
    }
    if (error instanceof CardApiError && error.code === 401) token = undefined;
    showState('暂时无法打开工资条', '请确认企业和钉钉账号后重试。', true);
  } finally {
    if (pending === request) pending = undefined;
  }
}

function suspend() {
  pending?.abort();
  pending = undefined;
  if (!finalState) showState('正在验证查看权限…');
}

if (!id) {
  showState('工资条链接无效', '请从钉钉工作通知中的「查看明细」打开。');
} else if (inDingTalk) {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) suspend();
    else void load();
  });
  window.addEventListener('pagehide', () => {
    suspend();
    token = undefined;
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) void load();
  });
  void load();
} else {
  showState(
    '请在钉钉内打开',
    '返回钉钉工作通知，点击「查看明细」查阅本人限时工资条。',
  );
}
