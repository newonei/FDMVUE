import { createApp } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';

import { describe, expect, it, vi } from 'vitest';

import Stocktakes from '../../inventory-center/components/Stocktakes.vue';
import Transfers from '../../inventory-center/components/Transfers.vue';
import PurchaseReturns from './PurchaseReturns.vue';
import StockIns from './StockIns.vue';
import StockOuts from './StockOuts.vue';

const mocks = vi.hoisted(() => ({
  documents: vi.fn(),
  reviewStatuses: vi.fn(),
}));

vi.mock('#/api/fdmaicheck', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/api/fdmaicheck')>()),
  getAiReviewStatuses: mocks.reviewStatuses,
}));
vi.mock('#/api/fdmplatform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/api/fdmplatform')>()),
  getDirectory: vi.fn().mockResolvedValue({ users: [] }),
}));
vi.mock('#/api/fdmplatform/procurement', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/api/fdmplatform/procurement')>()),
  getProcurementSettings: vi.fn().mockResolvedValue([]),
}));
vi.mock('#/api/fdmplatform/warehouse', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/api/fdmplatform/warehouse')>()),
  getInventoryWarehouses: vi.fn().mockResolvedValue([]),
  getPurchaseReturns: mocks.documents,
  getStockIns: mocks.documents,
  getStockOuts: mocks.documents,
  getStocktakes: mocks.documents,
  getTransfers: mocks.documents,
}));

const tables = [
  { component: StockIns, docType: 'STOCK_IN' },
  { component: StockOuts, docType: 'STOCK_OUT' },
  { component: PurchaseReturns, docType: 'PURCHASE_RETURN' },
  { component: Transfers, docType: 'STOCK_TRANSFER' },
  { component: Stocktakes, docType: 'STOCKTAKE' },
] as const;

describe('仓储单据列表 AI 审核列', () => {
  it.each(tables)(
    '$docType 按单据 ID 展示未审核和检查结论',
    async ({ component, docType }) => {
      mocks.reviewStatuses.mockReset();
      const rows = [
        { code: 'NEW-001', id: 'document-1', lines: [] },
        { code: 'OLD-002', id: 'document-2', lines: [] },
      ];
      mocks.documents.mockResolvedValue({ list: rows, total: rows.length });
      mocks.reviewStatuses.mockResolvedValue({
        'document-1': { state: 'NOT_REVIEWED' },
        'document-2': {
          aiStatus: 'SUCCEEDED',
          counts: { PASS: 2, UNKNOWN: 1 },
          state: 'COMPLETED',
        },
      });

      const router = createRouter({
        history: createMemoryHistory(),
        routes: [{ path: '/warehouse', component }],
      });
      await router.push('/warehouse');
      const host = document.createElement('div');
      document.body.append(host);
      const app = createApp(component).use(router);
      app.mount(host);
      try {
        await vi.waitFor(() => {
          expect(mocks.reviewStatuses).toHaveBeenCalledWith(docType, [
            'document-1',
            'document-2',
          ]);
          expect(host.querySelector('thead')?.textContent).toContain('AI 审核');
          expect(
            host.querySelector('[data-row-key="document-1"] .ai-review-status')
              ?.textContent,
          ).toContain('未审核');
          const completed = host.querySelector(
            '[data-row-key="document-2"] .ai-review-status',
          )?.textContent;
          expect(completed).toContain('缺资料 1');
          expect(completed).toContain('通过 2');
        });
      } finally {
        app.unmount();
        host.remove();
      }
    },
  );
});
