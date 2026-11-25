import type {
  ProductionOrderOutboundCandidate,
  StockBalance,
} from '#/api/fdmplatform/warehouse';

import { createApp, h, nextTick } from 'vue';

import { describe, expect, it, vi } from 'vitest';

import { outboundRows, stockOutPayload } from '../../purchase/warehouse/model';
import { pickLines, pickRows } from './model';
import ProductionOrderSelect from './ProductionOrderSelect.vue';

vi.mock('ant-design-vue', async () => {
  const { h } = await import('vue');
  return {
    Select: (
      props: {
        disabled?: boolean;
        options: { label: string; value: number }[];
        placeholder?: string;
        value?: number;
      },
      { emit }: { emit: (name: string, value: number) => void },
    ) =>
      h(
        'select',
        {
          disabled: props.disabled,
          value: props.value,
          'data-placeholder': props.placeholder,
          onChange: (event: Event) =>
            emit(
              'update:value',
              Number((event.target as HTMLSelectElement).value),
            ),
        },
        props.options.map((option) =>
          h('option', { value: option.value }, option.label),
        ),
      ),
  };
});

const candidate = (
  id: number,
  extra: Partial<ProductionOrderOutboundCandidate> = {},
): ProductionOrderOutboundCandidate => ({
  productionOrderItemId: id,
  productionOrderId: 10,
  orderNo: `GD2026112500${id}`,
  productName: '瑜伽垫',
  skuId: 'sku',
  specVersion: 'v1',
  unit: '条',
  receivedQuantity: '10',
  outboundQuantity: '3',
  availableQuantity: '7',
  ...extra,
});

describe('生产订单与库存出库关联', () => {
  it('shows matching products and available quantities, hides generated numbers, and emits the chosen item', async () => {
    const selected = vi.fn();
    const host = document.createElement('div');
    const app = createApp({
      render: () =>
        h(ProductionOrderSelect, {
          candidates: [
            candidate(1),
            candidate(2, { skuId: 'other' }),
            candidate(3, { specVersion: 'v2' }),
          ],
          skuId: 'sku',
          specVersion: 'v1',
          'onUpdate:value': selected,
        }),
    });
    app.mount(host);
    try {
      expect(
        [...host.querySelectorAll('option')].map(
          (option) => option.textContent,
        ),
      ).toEqual(['瑜伽垫 · 可出 7 条']);
      expect(host.textContent).not.toContain('GD20261125001');
      const select = host.querySelector('select')!;
      select.value = '1';
      select.dispatchEvent(new Event('change'));
      await nextTick();
      expect(selected).toHaveBeenCalledWith(1);
    } finally {
      app.unmount();
    }
  });

  it('preserves the selected production order in a sales shipment payload', () => {
    const rows = outboundRows([
      {
        contractItemId: 'item',
        skuId: 'sku',
        specVersion: 'v1',
        itemQuantity: '10',
        shippedQuantity: '0',
        remainingQuantity: '10',
        onHand: '10',
      },
    ]);
    rows[0]!.productionOrderItemId = 1;
    const payload = stockOutPayload({ warehouseId: 'wh' }, rows, {
      contractId: 'contract',
      idempotencyKey: 'key',
    });
    expect(rows[0]).toMatchObject({ skuId: 'sku', specVersion: 'v1' });
    expect(payload.lines).toEqual([
      { contractItemId: 'item', quantity: '10', productionOrderItemId: 1 },
    ]);
  });

  it('preserves links for other outbound while ordinary unlinked stock keeps its existing payload', () => {
    const stock: StockBalance = {
      id: 'stock',
      warehouseId: 'wh',
      warehouseName: '成品仓',
      skuId: 'sku',
      specVersion: 'v1',
      onHand: '20',
      costAmount: '0',
      costKnown: false,
    };
    const rows = pickRows([stock]);
    rows[0]!.quantity = '7';
    expect(pickLines(rows)).toEqual([{ stockId: 'stock', quantity: '7' }]);
    rows[0]!.productionOrderItemId = 1;
    expect(rows[0]).toMatchObject({ skuId: 'sku', specVersion: 'v1' });
    expect(pickLines(rows)).toEqual([
      { stockId: 'stock', quantity: '7', productionOrderItemId: 1 },
    ]);
  });
});
