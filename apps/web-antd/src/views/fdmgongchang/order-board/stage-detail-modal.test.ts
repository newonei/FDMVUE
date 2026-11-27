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

async function openStage(order: Api.Order, code: string) {
  const stage = orderStages(order).find((candidate) => candidate.code === code);
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(StageDetailModal, { failed: false, loading: false, order, stage }) });
  app.mount(host);
  unmount = () => app.unmount();
  await nextTick();
}

it('keeps supplements with their original task and shows each product’s shortage in its own row', async () => {
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
  await openStage(order, 'PUNCH');

  const table = document.querySelector('table[aria-label="排单任务明细"]')!;
  const headers = [...table.querySelectorAll('thead th')].map((cell) => cell.textContent?.trim());
  const rows = [...table.querySelectorAll('tbody tr')];
  const cell = (row: Element | undefined, header: string) => row?.children[headers.indexOf(header)]?.textContent?.trim();
  expect(rows).toHaveLength(3);
  const [original, supplement, unfilled] = rows;
  expect(cell(original, '排单任务')).toBe('原任务 #101');
  expect(cell(original, '状态')).toBe('已达标');
  expect(cell(original, '已报良品')).toBe('6,800 件');
  expect(cell(original, '补产后良品')).toBe('6,891 件');
  expect(cell(supplement, '排单任务')).toBe('补产任务 #102');
  expect(cell(supplement, '归属原任务')).toBe('#101');
  expect(cell(supplement, '已报良品')).toBe('91 件');
  expect(cell(unfilled, '产品')).toBe(pinkBlue.productName);
  expect(cell(unfilled, '剩余缺口')).toBe('91 件');
  const productRows = [...document.querySelectorAll('table[aria-label="工序产品明细"] tbody tr')];
  expect(productRows.find((row) => row.textContent?.includes(pinkBlue.productName))?.textContent).toContain('部分完成');
});

it('shows finished products side by side with their scheduled board colors and expands the task details', async () => {
  const order: Api.Order = {
    colorLabels: {
      BLUE: '蓝色',
      OCEAN: '深海蓝',
      PINK: '粉色',
      ROSE: '玫瑰粉',
    },
    completedQuantity: 0,
    factoryId: 1,
    id: 1,
    items: [{
      color: '采购原色',
      completedQuantity: 0,
      id: 11,
      material: 'TPE',
      processes: ['MIX'],
      productCode: 'DZ2400033',
      productId: '11',
      productName: '云兔双色瑜伽垫',
      quantity: 4491,
      size: '1830×610×4mm',
      steps: [{
        completedTaskCount: 1,
        defectQuantity: 3,
        goodQuantity: 218,
        inProgressCount: 0,
        label: '发泡',
        orderCount: 2,
        outputStage: 'BOARD',
        planned: true,
        process: 'MIX',
        state: 'COMPLETED',
        taskCount: 1,
        tasks: [{
          actualQuantity: 208,
          attained: true,
          boardColor: 'ROSE',
          boardSide: 'FRONT',
          children: [{
            actualQuantity: 10,
            attained: true,
            boardColor: 'OCEAN',
            boardSide: 'BACK',
            creditedQuantity: 10,
            id: 1132,
            quantity: 10,
            status: 'DONE',
            unit: '张',
          }],
          creditedQuantity: 218,
          id: 1131,
          quantity: 218,
          status: 'DONE',
          unit: '张',
        }],
        unit: '张',
      }],
      targetBackColor: 'BLUE',
      targetFrontColor: 'PINK',
      unit: '条',
    }, {
      color: '紫色',
      completedQuantity: 0,
      id: 12,
      processes: ['MIX'],
      productId: '12',
      productName: '历史订单单色瑜伽垫',
      quantity: 6891,
      unit: '条',
    }],
    orderNo: 'GD20261124-004',
    requesterUserId: 1,
    status: 'ACCEPTED',
    statusLabel: '生产中',
    totalQuantity: 11_382,
  };
  await openStage(order, 'MIX');

  const products = document.querySelector('table[aria-label="发泡成品明细"]');
  const headers = [...products!.querySelectorAll('thead th')].map((cell) => cell.textContent?.trim());
  const rows = products!.querySelectorAll('tbody > tr');
  expect(rows).toHaveLength(2);
  const [finished, legacy] = [...rows];
  const cell = (row: Element, header: string) =>
    row.children[headers.indexOf(header)]?.textContent?.trim();
  expect(cell(finished!, '成品')).toContain('DZ2400033');
  expect(cell(finished!, '成品规格')).toContain('1830×610×4mm');
  expect(cell(finished!, '成品规格')).toContain('TPE');
  expect(cell(finished!, '成品颜色')).toContain('粉色');
  expect(cell(finished!, '成品颜色')).toContain('蓝色');
  expect(cell(finished!, '板材颜色')).toContain('玫瑰粉');
  expect(cell(finished!, '板材颜色')).toContain('深海蓝');
  expect(cell(finished!, '订单需求')).toBe('4,491 条');
  expect(cell(finished!, '良品')).toBe('218 张');
  expect(cell(finished!, '不良品')).toBe('3 张');
  expect(cell(legacy!, '成品颜色')).toBe('紫色');
  expect(cell(legacy!, '板材颜色')).toBe('—');

  const expand = [...finished!.querySelectorAll('button')].find((button) => button.textContent?.trim() === '查看明细');
  expect(expand).toBeDefined();
  expand?.click();
  await nextTick();

  const tasks = document.querySelector('table[aria-label="排单任务明细"]');
  const taskRows = [...tasks!.querySelectorAll('tbody tr')];
  const original = taskRows.find((row) => row.textContent?.includes('#1131'));
  expect(original?.textContent).toContain('玫瑰粉');
  const supplement = taskRows.find((row) => row.textContent?.includes('#1132'));
  expect(supplement?.textContent).toContain('深海蓝');
});
