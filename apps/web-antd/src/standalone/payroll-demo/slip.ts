import type { SlipSession } from './delivery';

import { slipStorageKey, viewedKey, viewTime } from './delivery';
import { currency, monthLabel } from './format';

const content = document.querySelector<HTMLElement>('#slip-content')!;
const state = document.querySelector<HTMLElement>('#slip-state')!;

function readDelivery(): 'expired' | SlipSession | undefined {
  try {
    const value = sessionStorage.getItem(slipStorageKey);
    if (value) return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function showExpired() {
  sessionStorage.setItem(slipStorageKey, '"expired"');
  showState('工资条已到期', '如需再次查看，请联系财务部重新发送。');
}

function element<T extends keyof HTMLElementTagNameMap>(
  tag: T,
  text?: string,
  className?: string,
) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function showState(title: string, message: string) {
  content.replaceChildren();
  content.hidden = true;
  state.replaceChildren(element('strong', title), element('span', message));
  state.hidden = false;
}

function render(delivery: SlipSession, deadline: number) {
  const { slip } = delivery;
  const heading = element('section', undefined, 'slip-heading');
  const title = element('h1', `${monthLabel(slip.month)}工资条`);
  const hint = element('p', `${slip.name} · ${slip.department}`);
  const company = element('p', slip.company, 'slip-company');
  const verified = element(
    'div',
    delivery.preview ? '财务预览' : '钉钉免登演示',
    'slip-verified',
  );
  heading.append(verified, title, hint, company);

  const total = element('section', undefined, 'slip-total');
  const clock = element('span', undefined, 'clock');
  const totalCaption = element('div', undefined, 'slip-caption');
  totalCaption.append(element('span', '实发工资'), clock);
  total.append(
    totalCaption,
    element('strong', currency(slip.net)),
    element('small', '人民币'),
  );
  const sections = slip.sections.map((section) => {
    const group = element('section', undefined, 'slip-section');
    const header = element('div', undefined, 'slip-section-title');
    header.append(element('h2', section.title));
    if (section.total !== undefined)
      header.append(element('strong', currency(section.total)));
    const items = element('dl');
    for (const item of section.items) {
      const row = element('div', undefined, 'slip-row');
      const label = element('dt', item.label);
      if (item.note) label.append(element('small', item.note));
      row.append(label, element('dd', currency(item.value)));
      items.append(row);
    }
    group.append(header);
    if (section.items.length > 0) group.append(items);
    return group;
  });
  const footer = element('footer', '对工资明细有疑问，请联系财务部。');
  content.replaceChildren(heading, total, ...sections, footer);
  state.hidden = true;
  content.hidden = false;

  function tick() {
    const elapsed = deadline - Date.now();
    if (elapsed <= 0) {
      showExpired();
      return false;
    }
    const seconds = Math.ceil(elapsed / 1000);
    clock.textContent = `剩余 ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    return true;
  }
  if (tick()) {
    const timer = setInterval(() => {
      if (!tick()) clearInterval(timer);
    }, 500);
    window.addEventListener('pageshow', tick);
    document.addEventListener('visibilitychange', tick);
  }
}

const delivery = readDelivery();
if (delivery === 'expired') {
  showExpired();
} else if (delivery) {
  const firstView =
    (delivery.preview ? delivery.firstView : viewTime(delivery.id)) ??
    Date.now();
  if (delivery.preview) {
    sessionStorage.setItem(
      slipStorageKey,
      JSON.stringify({ ...delivery, firstView }),
    );
  } else if (!viewTime(delivery.id)) {
    localStorage.setItem(viewedKey(delivery.id), String(firstView));
  }
  render(delivery, firstView + delivery.minutes * 60_000);
} else {
  showState('工资条暂不可查看', '请从工资条工作通知中的「查看明细」打开。');
}
