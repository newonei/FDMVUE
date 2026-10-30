import type { Component } from 'vue';

import { createApp, h, nextTick } from 'vue';

import { getCurrentTimezone, setCurrentTimezone } from '@vben/utils';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AttachmentPanel from './AttachmentPanel.vue';
import RecordTable from './RecordTable.vue';

vi.mock('#/api/fdmplatform', () => ({
  downloadAttachment: vi.fn(),
  newIdempotencyKey: () => 'unused',
  uploadAttachment: vi.fn(),
}));

const cleanups: (() => void)[] = [];
const originalTimezone = getCurrentTimezone();
beforeEach(() => setCurrentTimezone('Asia/Shanghai'));
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  setCurrentTimezone(originalTimezone);
});

async function mount(component: Component, props: Record<string, unknown>) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(component, props) });
  app.mount(host);
  cleanups.push(() => {
    app.unmount();
    host.remove();
  });
  await nextTick();
  return host;
}

describe('business table date rendering', () => {
  it('renders the uploaded contract attachment time as a readable date and time', async () => {
    const host = await mount(AttachmentPanel, {
      categories: [],
      contractId: 'contract-1',
      error: '',
      loading: false,
      view: {
        enabled: true,
        uploadCategories: [],
        items: [
          {
            id: 'attachment-1',
            name: '合同附件.pdf',
            category: 'SALES',
            size: 1024,
            createdAt: 1_789_973_875_794,
          },
        ],
      },
    });
    expect(host.textContent).toContain('2026-09-21 14:57:55');
    expect(host.textContent).not.toContain('1789973875794');
    expect(host.textContent).toContain('合同附件.pdf');
    expect(host.textContent).toContain('下载');
  });

  it('formats audit, nested event and business dates without converting numeric document IDs', async () => {
    const host = await mount(RecordTable, {
      columns: [
        { key: 'id', title: '单据编号' },
        { key: 'created_at', title: '操作时间' },
        { key: 'event.occurredAt', title: '发生时间' },
        { key: 'receivedAt', title: '到账日期' },
      ],
      data: [
        {
          id: '1789973875794',
          created_at: 1_789_973_875_794,
          event: { occurredAt: '1789973875794' },
          receivedAt: '2026-09-21',
        },
      ],
    });
    const cells = [...host.querySelectorAll('tbody tr:first-child td')].map(
      (cell) => cell.textContent,
    );
    expect(cells).toEqual([
      '1789973875794',
      '2026-09-21 14:57:55',
      '2026-09-21 14:57:55',
      '2026-09-21',
    ]);
  });
});
