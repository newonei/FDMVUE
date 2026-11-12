import type { FdmgongchangScheduleApi as Api } from '#/api/fdmgongchang/schedule';

import { createApp, defineComponent, h, nextTick, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ProductPicker from './modules/product-picker-modal.vue';

const mocks = vi.hoisted(() => ({ page: vi.fn(), categories: vi.fn(), platformCategories: vi.fn(), attributes: vi.fn() }));
vi.mock('#/api/fdmgongchang/schedule', () => ({
  getScheduleProductPage: mocks.page,
  getScheduleProductCategories: mocks.categories,
  getScheduleProductAttributeOptions: mocks.attributes,
}));
vi.mock('#/views/fdmplatform/products/components/ProductStageSelect.vue', () => ({
  default: defineComponent({
    props: { value: String, options: Array, allowGroups: Boolean }, emits: ['update:value'],
    setup: (props, { emit }) => () => h('select', {
      'aria-label': '生产分类', value: props.value ?? '',
      onChange: (event: Event) => emit('update:value', (event.target as HTMLSelectElement).value || undefined),
    }, [h('option', { value: '' }, '全部'),
      ...(props.allowGroups ? [...new Set((props.options ?? []).map((item) => (item as { group: string }).group))].map((group) => h('option', { value: `group:${group}` }, String(group))) : []),
      ...(props.options ?? []).map((item) => { const option = item as { value: string; label: string }; return h('option', { value: option.value }, option.label); })]),
  }),
}));
vi.mock('#/api/fdmplatform/products', () => ({ getProductCategories: mocks.platformCategories }));
vi.mock('@vben/icons', () => ({ IconifyIcon: defineComponent({ setup: () => () => h('span') }) }));
vi.mock('ant-design-vue', () => {
  const wrapper = defineComponent({ setup: (_, { slots }) => () => h('div', slots.default?.()) });
  return {
    Alert: defineComponent({ props: ['message'], setup: (props) => () => h('div', props.message) }),
    Button: defineComponent({ props: ['disabled'], setup: (props, { slots }) => () => h('button', { disabled: props.disabled }, slots.default?.()) }),
    Empty: wrapper,
    Image: wrapper,
    Spin: wrapper,
    Input: defineComponent({
      inheritAttrs: false,
      props: ['value'], emits: ['update:value', 'pressEnter'],
      setup: (props, { emit, attrs }) => () => h('input', {
        ...attrs, value: props.value,
        onInput: (event: Event) => emit('update:value', (event.target as HTMLInputElement).value),
        onKeydown: (event: KeyboardEvent) => { if (event.key === 'Enter') emit('pressEnter'); },
      }),
    }),
    Modal: defineComponent({ props: ['open', 'title'], setup: (props, { slots }) => () => props.open ? h('div', [h('h2', props.title), slots.default?.(), slots.footer?.()]) : null }),
    Table: defineComponent({
      props: ['columns', 'dataSource', 'pagination', 'customRow', 'rowSelection'], emits: ['change'],
      setup: (props, { emit, slots }) => () => h('div', [
        h('div', props.columns.map((column: { title: string }) => h('span', column.title))),
        ...props.dataSource.map((product: Api.Product) => h('div', { 'data-row': product.id }, [h('button', {
          ...props.customRow(product),
          'data-product': product.id,
          'data-selected': props.rowSelection.selectedRowKeys.includes(product.id),
        }, product.name), slots.bodyCell?.({ column: { key: 'category' }, record: product }),
        h('span', { 'data-column': 'currentStock' }, slots.bodyCell?.({ column: { key: 'currentStock' }, record: product })),
        h('span', { 'data-column': 'unit' }, slots.bodyCell?.({ column: { key: 'unit' }, record: product }))])),
        h('button', { onClick: () => emit('change', { current: props.pagination.current + 1, pageSize: props.pagination.pageSize }) }, '下一页'),
      ]),
    }),
  };
});

const product = (id: string): Api.Product => ({ id, name: `产品 ${id}`, code: `SKU-${id}`, category: '瑜伽垫', size: '183×61×0.3', material: 'TPE', color: '紫色', unit: '条' });
const categoryView = {
  total: 25,
  categories: [{ id: 'yoga', name: '瑜伽垫', sort: 1, active: true, version: 1 }],
  items: [{ categoryId: 'yoga', count: 23 }, { categoryId: '', count: 2 }],
};
let unmount: (() => void) | undefined;
async function flush() { for (let i = 0; i < 5; i++) { await Promise.resolve(); await nextTick(); } }
function button(text: string) {
  const found = [...document.querySelectorAll('button')].find((item) => item.textContent === text);
  expect(found, text).toBeTruthy();
  return found!;
}
async function input(label: string, value: string) {
  const field = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
  field.value = value; field.dispatchEvent(new Event('input', { bubbles: true })); await flush();
}
async function mount(options: { requiredStage?: string; title?: string } = {}) {
  const open = ref(true);
  const requiredStage = ref(options.requiredStage);
  const selected = vi.fn();
  const close = vi.fn(() => { open.value = false; });
  const host = document.createElement('div'); document.body.append(host);
  const app = createApp({ render: () => h(ProductPicker, { open: open.value, requiredStage: requiredStage.value, title: options.title, onClose: close, onSelected: selected }) });
  app.mount(host); unmount = () => app.unmount(); await flush();
  return { open, requiredStage, selected, close };
}

beforeEach(() => {
  mocks.page.mockImplementation(async (query: Api.ProductQuery) => ({ list: [product(String(query.pageNo))], total: 25 }));
  mocks.categories.mockResolvedValue(categoryView);
  mocks.attributes.mockResolvedValue({ stages: [{ value: 'BOARD', label: '发泡板材', group: '半成品' }], colors: [], textures: [], matTypes: [] });
});
afterEach(() => { unmount?.(); document.body.innerHTML = ''; vi.resetAllMocks(); });

describe('工厂任务产品选择弹窗', () => {
  it('显示本厂账面库存及工序单位，区分零库存与未知库存，保留负数且不限制选料', async () => {
    const rows: Api.Product[] = [
      { ...product('positive'), currentStock: 8 },
      { ...product('decimal'), currentStock: '12.3400' },
      { ...product('zero'), currentStock: 0 },
      { ...product('negative'), currentStock: '-2.5' },
      { ...product('unknown'), currentStock: null },
    ].map((row) => ({ ...row, productStage: 'BOARD', stockUnit: '张' }));
    mocks.page.mockResolvedValue({ list: rows, total: rows.length });
    const { selected } = await mount({ requiredStage: 'BOARD' });
    expect(document.body.textContent).toContain('当前库存');
    expect(document.body.textContent).toContain('当前库存为本厂账面数量');
    for (const [id, expected] of [['positive', '8'], ['decimal', '12.34'], ['zero', '0'], ['negative', '-2.5'], ['unknown', '—']]) {
      const row = document.querySelector(`[data-row="${id}"]`)!;
      expect(row.querySelector('[data-column="currentStock"]')?.textContent).toBe(expected);
      expect(row.querySelector('[data-column="unit"]')?.textContent).toBe('张');
    }
    expect(document.querySelector('[data-row="negative"] .text-destructive')).toBeTruthy();
    button('产品 zero').click(); await flush(); button('确定').click(); await flush();
    expect(selected).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'zero', currentStock: 0 }));
    button('产品 negative').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); await flush();
    expect(selected).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'negative', currentStock: '-2.5' }));
  });

  it('初次打开加载分类和产品，并在分类及分页时沿用已查询的属性条件', async () => {
    await mount();
    expect(mocks.page).toHaveBeenCalledTimes(1);
    expect(mocks.categories).toHaveBeenCalledTimes(1);
    expect(mocks.platformCategories).not.toHaveBeenCalled();
    await input('搜索产品', '  瑜伽  '); await input('筛选材质', 'TPE');
    await input('筛选尺寸', '183'); await input('筛选颜色', '紫色'); await input('筛选形状', '长方形');
    button('查询').click(); await flush();
    const filters = { keyword: '瑜伽', material: 'TPE', size: '183', color: '紫色', shape: '长方形', productStage: undefined };
    expect(mocks.categories).toHaveBeenLastCalledWith(filters);
    const category = [...document.querySelectorAll<HTMLButtonElement>('.node')].find((node) => node.textContent?.startsWith('瑜伽垫'))!;
    category.click(); await flush();
    expect(mocks.page).toHaveBeenLastCalledWith({ ...filters, categoryId: 'yoga', pageNo: 1, pageSize: 10 });
    await input('筛选颜色', '尚未查询');
    button('下一页').click(); await flush();
    expect(mocks.page).toHaveBeenLastCalledWith({ ...filters, categoryId: 'yoga', pageNo: 2, pageSize: 10 });
    const uncategorized = [...document.querySelectorAll<HTMLButtonElement>('.node')].find((node) => node.textContent?.startsWith('未分类'))!;
    uncategorized.click(); await flush();
    expect(mocks.page).toHaveBeenLastCalledWith({ ...filters, categoryId: '', pageNo: 1, pageSize: 10 });
  });

  it.each(['BOARD', 'group:半成品'])('生产分类 %s 查询与分类计数、翻页保持一致，清空后恢复全部阶段', async (stage) => {
    await mount();
    const select = document.querySelector<HTMLSelectElement>('[aria-label="生产分类"]')!;
    select.value = stage; select.dispatchEvent(new Event('change', { bubbles: true })); await flush();
    expect(mocks.page).toHaveBeenLastCalledWith(expect.objectContaining({ productStage: stage, pageNo: 1 }));
    expect(mocks.categories).toHaveBeenLastCalledWith(expect.objectContaining({ productStage: stage }));
    button('下一页').click(); await flush();
    expect(mocks.page).toHaveBeenLastCalledWith(expect.objectContaining({ productStage: stage, pageNo: 2 }));
    select.value = ''; select.dispatchEvent(new Event('change', { bubbles: true })); await flush();
    expect(mocks.page).toHaveBeenLastCalledWith(expect.objectContaining({ productStage: undefined, pageNo: 1 }));
    expect(mocks.categories).toHaveBeenLastCalledWith(expect.objectContaining({ productStage: undefined }));
  });

  it('历史板材显示关联阶段，选择后保留原档案阶段为空', async () => {
    const board = { ...product('legacy'), category: '半成品', productStage: null,
      resolvedProductStage: 'BOARD', resolvedProductStageLabel: '发泡板材' };
    mocks.page.mockResolvedValue({ list: [board], total: 1 });
    const { selected } = await mount();
    expect(document.body.textContent).toContain('半成品');
    expect(document.body.textContent).toContain('发泡板材');
    button('产品 legacy').click(); await flush(); button('确定').click(); await flush();
    expect(selected).toHaveBeenCalledWith(expect.objectContaining({ productStage: null, resolvedProductStage: 'BOARD' }));
  });

  it('领料选品锁定上工序阶段，分类、颜色、分页和重置都保持限定', async () => {
    await mount({ requiredStage: 'BOARD', title: '选择预计领取的发泡板材' });
    expect(document.querySelector('h2')?.textContent).toBe('选择预计领取的发泡板材');
    expect(document.body.textContent).toContain('已限定：发泡板材');
    expect(document.querySelector('[aria-label="生产分类"]')).toBeNull();
    expect(mocks.page).toHaveBeenLastCalledWith(expect.objectContaining({ productStage: 'BOARD' }));
    expect(mocks.categories).toHaveBeenLastCalledWith(expect.objectContaining({ productStage: 'BOARD' }));
    await input('筛选颜色', '米白'); button('查询').click(); await flush();
    const category = [...document.querySelectorAll<HTMLButtonElement>('.node')].find((node) => node.textContent?.startsWith('瑜伽垫'))!;
    category.click(); await flush();
    button('下一页').click(); await flush();
    expect(mocks.page).toHaveBeenLastCalledWith(expect.objectContaining({ productStage: 'BOARD', color: '米白', categoryId: 'yoga', pageNo: 2 }));
    expect(mocks.categories).toHaveBeenLastCalledWith(expect.objectContaining({ productStage: 'BOARD', color: '米白' }));
    button('重置').click(); await flush();
    expect(mocks.page).toHaveBeenLastCalledWith(expect.objectContaining({ productStage: 'BOARD', color: undefined, categoryId: undefined, pageNo: 1 }));
    expect(mocks.categories).toHaveBeenLastCalledWith(expect.objectContaining({ productStage: 'BOARD', color: undefined }));
  });

  it('限定模式确认和双击都拒绝其他阶段，兼容历史关联阶段并优先人工阶段', async () => {
    const legacy = { ...product('legacy'), productStage: null, resolvedProductStage: 'BOARD' };
    const explicit = { ...product('explicit'), productStage: 'BOARD' };
    const overridden = { ...product('overridden'), productStage: 'CUT', resolvedProductStage: 'BOARD' };
    mocks.page.mockResolvedValue({ list: [legacy, explicit, overridden, product('unknown')], total: 4 });
    const { selected } = await mount({ requiredStage: 'BOARD' });
    for (const id of ['overridden', 'unknown']) {
      button(`产品 ${id}`).click(); await flush();
      expect(button('确定').disabled).toBe(true);
      button('确定').click();
      button(`产品 ${id}`).dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); await flush();
    }
    expect(selected).not.toHaveBeenCalled();
    button('产品 explicit').click(); await flush(); button('确定').click(); await flush();
    expect(selected).toHaveBeenLastCalledWith(explicit);
    button('产品 legacy').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); await flush();
    expect(selected).toHaveBeenLastCalledWith(legacy);
    expect(selected).toHaveBeenCalledTimes(2);
  });

  it('切换领料阶段及重开弹窗清空旧分类和选择，解除限定恢复通用选品', async () => {
    mocks.page.mockImplementation(async (query: Api.ProductQuery) => ({ list: [{ ...product('1'), productStage: query.productStage }], total: 1 }));
    const { open, requiredStage, selected } = await mount({ requiredStage: 'BOARD' });
    await input('筛选颜色', '米白'); button('查询').click(); await flush();
    const category = [...document.querySelectorAll<HTMLButtonElement>('.node')].find((node) => node.textContent?.startsWith('瑜伽垫'))!;
    category.click(); await flush();
    button('产品 1').click(); await flush(); expect(button('确定').disabled).toBe(false);
    requiredStage.value = 'SHEET'; await flush();
    expect(mocks.page).toHaveBeenLastCalledWith({ productStage: 'SHEET', categoryId: undefined, pageNo: 1, pageSize: 10 });
    expect(mocks.categories).toHaveBeenLastCalledWith({ productStage: 'SHEET' });
    expect(button('确定').disabled).toBe(true);
    expect(selected).not.toHaveBeenCalled();
    await input('筛选颜色', '黑色'); button('查询').click(); await flush();
    button('取消').click(); await flush(); open.value = true; await flush();
    expect(mocks.page).toHaveBeenLastCalledWith({ productStage: 'SHEET', categoryId: undefined, pageNo: 1, pageSize: 10 });
    requiredStage.value = undefined; await flush();
    expect(document.querySelector('[aria-label="生产分类"]')).not.toBeNull();
    expect(mocks.page).toHaveBeenLastCalledWith({ productStage: undefined, categoryId: undefined, pageNo: 1, pageSize: 10 });
    expect(document.querySelector('h2')?.textContent).toBe('从产品中心选择');
  });

  it('取消不选入产品，重新打开清空待确认选择，确认仅提交当前产品', async () => {
    const { open, selected, close } = await mount();
    button('产品 1').click(); await flush();
    expect(button('确定').disabled).toBe(false);
    button('取消').click(); await flush();
    expect(close).toHaveBeenCalledOnce(); expect(selected).not.toHaveBeenCalled();
    open.value = true; await flush();
    expect(button('确定').disabled).toBe(true);
    expect(mocks.page).toHaveBeenCalledTimes(2);
    expect(mocks.categories).toHaveBeenCalledTimes(2);
    button('产品 1').click(); await flush(); button('确定').click(); await flush();
    expect(selected).toHaveBeenCalledOnce();
    expect(selected).toHaveBeenLastCalledWith(product('1'));
  });

  it('较早的查询结果不会覆盖新结果，双击直接选入当前产品', async () => {
    const { selected } = await mount();
    let resolveOld: (value: { list: Api.Product[]; total: number }) => void = () => {};
    mocks.page.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    await input('搜索产品', '旧查询'); button('查询').click(); await flush();
    mocks.page.mockResolvedValueOnce({ list: [product('new')], total: 1 });
    await input('搜索产品', '新查询'); button('查询').click(); await flush();
    resolveOld({ list: [product('old')], total: 1 }); await flush();
    expect(document.querySelector('[data-product="old"]')).toBeNull();
    button('产品 new').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); await flush();
    expect(selected).toHaveBeenCalledOnce();
    expect(selected).toHaveBeenLastCalledWith(product('new'));
  });
});
