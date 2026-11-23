import type { FdmgongchangMaterialPlanApi as Api } from '#/api/fdmgongchang/production-order';

import { createApp, nextTick } from 'vue';

import { afterEach, expect, it, vi } from 'vitest';

import MaterialPlan from './material-plan.vue';

const mocks = vi.hoisted(() => ({
  getMaterialPlan: vi.fn(),
  saveItemMaterial: vi.fn(),
}));

vi.mock('#/api/fdmgongchang/production-order', () => ({
  ...mocks,
  getRecipeOptions: vi.fn().mockResolvedValue([
    { recipeCode: 'REC-NEW', recipeName: '发泡配方' },
  ]),
}));

const items: Api.ItemPlan[] = [
  { itemId: 1, mouldProfileId: 11, quantity: 100, targetSize: '185×61×0.6' },
  { itemId: 2, mouldProfileId: null, quantity: 100, targetSize: '185×70×0.8' },
  { itemId: 3, mouldProfileId: 33, quantity: 100, targetSize: '185×61×0.6' },
  { itemId: 4, mouldProfileId: 44, quantity: '0.00', targetSize: '185×61×0.6' },
].map((item) => ({
  ...item,
  candidates: [],
  productName: `瑜伽垫 ${item.itemId}`,
  raws: [],
  remaining: item.quantity,
  stock: [],
  unit: '条',
  warnings: [],
}));

let unmount: (() => void) | undefined;

afterEach(() => {
  unmount?.();
  document.body.innerHTML = '';
  vi.resetAllMocks();
});

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
}

function button(text: string) {
  return [...document.querySelectorAll('button')].find((node) => node.textContent?.trim() === text)!;
}

function rowCheckbox(itemId: number) {
  return document.querySelector<HTMLInputElement>(`input[aria-label^="勾选 瑜伽垫 ${itemId}"]`)!;
}

it('批量选配方支持全选、部分成功和重试，并保留各产品的板材规格', async () => {
  let planItems = items;
  let failSecondItem = true;
  mocks.getMaterialPlan.mockImplementation(() =>
    Promise.resolve({ items: planItems, orderId: 9, orderNo: 'GD-009', shortage: false, totals: [] }),
  );
  mocks.saveItemMaterial.mockImplementation(({ itemId, recipeCode }: Api.ItemMaterialReq) => {
    if (itemId === 2 && failSecondItem) {
      failSecondItem = false;
      return Promise.reject(new Error('暂时无法保存'));
    }
    planItems = planItems.map((item) =>
      item.itemId === itemId ? { ...item, recipeCode, recipeName: '发泡配方' } : item,
    );
    return Promise.resolve(true);
  });
  const app = createApp(MaterialPlan, { editable: true, orderId: 9 });
  const host = document.createElement('div');
  document.body.append(host);
  app.mount(host);
  unmount = () => app.unmount();
  await flush();

  button('批量选配方').click();
  await flush();
  expect(button('应用到所选产品').disabled).toBe(true);
  const all = document.querySelector<HTMLInputElement>('section[aria-label="批量选配方"] th input[type="checkbox"]')!;
  all.click();
  await flush();
  expect(rowCheckbox(3).checked).toBe(true);
  expect(rowCheckbox(4)).toBeNull();
  rowCheckbox(3).click();
  await flush();
  document.querySelector('#mp-batch-recipe')!.closest('.ant-select')!.querySelector('.ant-select-selector')!
    .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  await flush();
  document.querySelector<HTMLElement>('.ant-select-item-option[title="发泡配方（REC-NEW）"]')!.click();
  await flush();

  button('应用到所选产品').click();
  await flush();
  expect(mocks.saveItemMaterial.mock.calls).toEqual([
    [{ itemId: 1, mouldProfileId: 11, recipeCode: 'REC-NEW' }],
    [{ itemId: 2, mouldProfileId: null, recipeCode: 'REC-NEW' }],
  ]);
  expect(mocks.getMaterialPlan).toHaveBeenCalledTimes(2);
  expect(host.textContent).toContain('已保存 1 个产品，1 个保存失败');
  expect(rowCheckbox(1).checked).toBe(false);
  expect(rowCheckbox(2).checked).toBe(true);
  expect(rowCheckbox(3).checked).toBe(false);

  button('应用到所选产品').click();
  await flush();
  expect(mocks.saveItemMaterial).toHaveBeenCalledTimes(3);
  expect(mocks.saveItemMaterial).toHaveBeenLastCalledWith({ itemId: 2, mouldProfileId: null, recipeCode: 'REC-NEW' });
  expect(mocks.getMaterialPlan).toHaveBeenCalledTimes(3);
  expect(rowCheckbox(2).checked).toBe(false);
  expect(host.textContent).not.toContain('保存失败');
});
