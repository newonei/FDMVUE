import { createApp, defineComponent, h, nextTick } from 'vue';

import { afterEach, describe, expect, it, vi } from 'vitest';

import MaterialPlan from './material-plan.vue';

const mocks = vi.hoisted(() => ({
  plan: vi.fn(),
  save: vi.fn().mockResolvedValue(true),
}));
vi.mock('#/api/fdmgongchang/production-order', () => ({
  getMaterialPlan: mocks.plan,
  getRecipeOptions: vi.fn().mockResolvedValue([
    { recipeCode: 'REC-001', recipeName: '常规款' },
    { recipeCode: 'REC-002', recipeName: '加厚款' },
  ]),
  saveItemMaterial: mocks.save,
}));
// 下拉换成原生 select，方便在测试里选
vi.mock('ant-design-vue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ant-design-vue')>()),
  Select: defineComponent({
    props: ['id', 'options', 'value', 'disabled'],
    emits: ['change'],
    setup(props, { emit }) {
      return () =>
        h(
          'select',
          { id: props.id, onChange: (e: Event) => emit('change', (e.target as HTMLSelectElement).value) },
          [h('option', { value: '' }), ...(props.options ?? []).map((o: any) => h('option', { value: o.value }, o.label))],
        );
    },
  }),
}));

const board = {
  boards: 32,
  layers: 8,
  name: '本厂发泡出板',
  perBoard: 16,
  piecesPerLayer: 2,
  size: '210×136×4.8',
  source: 'SETTING' as const,
};
const mould = { ...board, mouldProfileId: 7, name: '大模', source: 'MOULD' as const };
const line = (itemId: number, targetSize: string) => ({
  board,
  candidates: [board, mould],
  itemId,
  productName: `产品${itemId}`,
  quantity: 100,
  raws: [],
  remaining: 100,
  stock: [],
  targetSize,
  unit: '条',
  warnings: [],
});

const flush = async () => {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
    await nextTick();
  }
};

function pick(id: string, value: string) {
  const el = document.querySelector<HTMLSelectElement>(`#${id}`)!;
  el.value = value;
  el.dispatchEvent(new Event('change'));
}

describe('material plan', () => {
  let unmount: (() => void) | undefined;
  afterEach(() => {
    unmount?.();
    document.body.innerHTML = '';
    mocks.save.mockClear();
  });

  function mount() {
    mocks.plan.mockResolvedValue({
      items: [line(1, '183×61×0.6'), line(2, '183×61×0.6'), line(3, '183×61×0.8')],
      orderId: 9,
      orderNo: 'GD-1',
      shortage: false,
      totals: [],
    });
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp(MaterialPlan, { editable: true, orderId: 9 });
    app.mount(host);
    unmount = () => app.unmount();
  }

  it('sets the same recipe and mould for products of the same size', async () => {
    mount();
    await flush();
    expect(document.body.textContent).toContain('同规格 2 个');

    pick('mp-recipe-1', 'REC-002');
    await flush();
    expect(mocks.save.mock.calls.map((c) => c[0])).toEqual([
      { itemId: 1, mouldProfileId: null, recipeCode: 'REC-002' },
      { itemId: 2, mouldProfileId: null, recipeCode: 'REC-002' },
    ]);

    mocks.save.mockClear();
    pick('mp-board-2', '7');
    await flush();
    expect(mocks.save.mock.calls.map((c) => c[0].itemId)).toEqual([2, 1]);
    expect(mocks.save.mock.calls[0]![0].mouldProfileId).toBe(7);
  });

  it('only changes the one product when syncing is turned off', async () => {
    mount();
    await flush();
    document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    await flush();
    pick('mp-recipe-1', 'REC-002');
    await flush();
    expect(mocks.save.mock.calls.map((c) => c[0].itemId)).toEqual([1]);
  });
});
