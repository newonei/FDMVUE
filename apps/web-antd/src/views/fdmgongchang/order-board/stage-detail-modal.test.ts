import type { FactoryOrderBoardApi as Api } from '#/api/fdmgongchang/order-board';

import { createApp, h, nextTick } from 'vue';

import { afterEach, expect, it } from 'vitest';

import { orderStages } from './model';
import StageDetailModal from './stage-detail-modal.vue';

let unmount: (() => void) | undefined;

afterEach(() => {
  unmount?.();
  document.body.replaceChildren();
});

function item(id: number, productName: string, task: Api.StepTask): Api.Item {
  return {
    completedQuantity: 0,
    id,
    processes: ['PUNCH'],
    productId: String(id),
    productName,
    quantity: task.quantity,
    steps: [{
      completedTaskCount: Number(task.attained),
      defectQuantity: 91,
      goodQuantity: task.creditedQuantity,
      inProgressCount: 0,
      label: '冲裁',
      orderCount: task.children?.length ? 2 : 1,
      outputStage: 'PUNCHED',
      planned: true,
      process: 'PUNCH',
      state: task.attained ? 'COMPLETED' : 'PARTIAL',
      taskCount: 1,
      tasks: [task],
      unit: '件',
    }],
    unit: '条',
  };
}

function taskGroup(product: string) {
  const title = [...document.querySelectorAll('h3')].find((node) => node.textContent === product);
  return title?.closest('section')?.querySelector('[aria-label="排单任务明细"]');
}

it('nests completed supplements beneath their original task and keeps another product’s shortage visible', async () => {
  const violet = item(11, '云兔（紫）', {
    actualQuantity: 6800,
    attained: true,
    children: [{ actualQuantity: 91, attained: true, creditedQuantity: 91, id: 102, quantity: 91, status: 'DONE', unit: '件' }],
    creditedQuantity: 6891,
    id: 101,
    quantity: 6891,
    status: 'OPEN',
    unit: '件',
  });
  const pinkBlue = item(12, '云兔（粉/蓝）', {
    actualQuantity: 4400, attained: false, creditedQuantity: 4400, id: 103, quantity: 4491, status: 'OPEN', unit: '件',
  });
  const order: Api.Order = {
    completedQuantity: 0, factoryId: 1, id: 1, items: [violet, pinkBlue], orderNo: 'GD20261124-004',
    requesterUserId: 1, status: 'ACCEPTED', statusLabel: '生产中', totalQuantity: 11_382,
  };
  const stage = orderStages(order).find(({ code }) => code === 'PUNCH');
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(StageDetailModal, { failed: false, loading: false, order, stage }) });
  app.mount(host);
  unmount = () => app.unmount();
  await nextTick();

  const original = taskGroup(violet.productName)?.firstElementChild;
  expect(original?.firstElementChild?.textContent).toContain('原任务 #101');
  expect(original?.firstElementChild?.textContent).toContain('已达标');
  expect(original?.textContent).toContain('原报良品 6,800 件');
  expect(original?.textContent).toContain('补产后良品 6,891 件');
  expect(original?.textContent).not.toContain('待领取');
  const child = original?.querySelector('[aria-label="补产子任务"] > li');
  expect(child?.textContent).toContain('补产任务 #102');
  expect(child?.textContent).toContain('已报良品 91 件');

  const unfilled = taskGroup(pinkBlue.productName);
  expect(unfilled?.closest('section')?.firstElementChild?.textContent).toContain('部分完成');
  expect(unfilled?.textContent).toContain('剩余缺口 91 件');
  expect(unfilled?.querySelector('[aria-label="补产子任务"]')).toBeNull();
});
