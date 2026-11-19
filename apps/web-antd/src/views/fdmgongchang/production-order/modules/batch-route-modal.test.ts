import type { FdmgongchangProductionOrderApi as Api } from '#/api/fdmgongchang/production-order';

import { createApp, h, nextTick } from 'vue';

import { afterEach, expect, it, vi } from 'vitest';

import { batchAddEngrave, getProductionOrder } from '#/api/fdmgongchang/production-order';

import BatchRouteModal from './batch-route-modal.vue';

vi.mock('#/api/fdmgongchang/production-order', () => ({
  batchAddEngrave: vi.fn(),
  getProductionOrder: vi.fn(),
}));

function product(id: number, name: string, processes: string[], quantity = 20): Api.Item {
  return { completedQuantity: 0, id, processes, productCode: `SKU${id}`, productId: `p${id}`, productName: name, quantity, unit: '条' };
}

const order: Api.Order = {
  batchRouteEditable: true,
  completedQuantity: 0,
  factoryId: 1,
  id: 1,
  items: [
    product(10, '标准垫', ['PUNCH', 'PACK']),
    product(11, '折叠垫', ['PUNCH', 'FOLD', 'PACK']),
    product(12, '散装垫', ['PUNCH']),
    product(13, '已有雕刻', ['PUNCH', 'ENGRAVE']),
    product(14, '已取消产品', ['PUNCH'], 0),
    product(15, '未配置工艺的产品', []),
  ],
  orderNo: 'GD-001',
  requesterUserId: 5,
  status: 'ACCEPTED',
  statusLabel: '生产中',
  totalQuantity: 100,
};

let app: ReturnType<typeof createApp> | undefined;

afterEach(() => {
  app?.unmount();
  app = undefined;
  document.body.innerHTML = '';
  vi.resetAllMocks();
});

async function mount(fresh: Api.Order) {
  vi.mocked(getProductionOrder).mockResolvedValue(fresh);
  const saved = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  app = createApp({ render: () => h(BatchRouteModal, { onSaved: saved, order }) });
  app.mount(host);
  await vi.waitFor(() => expect(document.querySelector('.ant-modal')).toBeTruthy());
  await nextTick();
  return saved;
}

function button(text: string) {
  return [...document.querySelectorAll<HTMLButtonElement>('button')]
    .find((node) => node.textContent?.replaceAll(/\s/g, '') === text)!;
}

it('shows each eligible product route and saves only the selected IDs in one request', async () => {
  const changed = { ...order, items: [
    product(10, '标准垫', ['PUNCH', 'ENGRAVE', 'PACK']),
    product(11, '折叠垫', ['PUNCH', 'ENGRAVE', 'FOLD', 'PACK']),
    ...order.items.slice(2),
  ] };
  vi.mocked(batchAddEngrave).mockResolvedValue(changed);
  const saved = await mount(order);
  expect(getProductionOrder).toHaveBeenCalledWith(order.id);
  expect(button('保存工艺（0条）').disabled).toBe(true);
  const group = document.querySelector('[aria-label="选择要补雕刻的产品"]')!;
  expect(group.textContent).toContain('冲裁 → 包装');
  expect(group.textContent).toContain('冲裁 → 折叠 → 包装');
  const options = group.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
  expect(options).toHaveLength(3);
  options[0]!.click();
  await nextTick();
  options[1]!.click();
  await nextTick();
  button('保存工艺（2条）').click();
  await vi.waitFor(() => expect(saved).toHaveBeenCalledWith(changed));
  expect(batchAddEngrave).toHaveBeenCalledExactlyOnceWith({ itemIds: [10, 11], orderId: 1 });
});

it('disables saving if the latest order response no longer allows batch editing', async () => {
  await mount({ ...order, batchRouteEditable: false });
  expect(document.body.textContent).toContain('当前订单没有可批量补雕刻的产品');
  expect(button('保存工艺（0条）').disabled).toBe(true);
  expect(batchAddEngrave).not.toHaveBeenCalled();
});
