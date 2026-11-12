import type { FdmgongchangScheduleApi as Api } from '#/api/fdmgongchang/schedule';

import { createApp, defineComponent, h, nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import TaskForm from './modules/task-form-modal.vue';

const pickerState = vi.hoisted(() => ({ product: {} as Api.Product, inputProduct: {} as Api.Product }));
const preview = vi.hoisted(() => vi.fn());
const resolveInput = vi.hoisted(() => vi.fn());
vi.mock('#/api/fdmgongchang/schedule', () => ({ previewScheduleTaskMaterials: preview, getScheduleTaskInputProduct: resolveInput }));
vi.mock('./modules/product-picker-modal.vue', () => ({
  default: defineComponent({
    props: ['open', 'requiredStage'], emits: ['close', 'selected'],
    setup: (props, { emit }) => () => props.open ? h('div', { 'data-testid': props.requiredStage ? 'input-product-picker' : 'product-picker', 'data-required-stage': props.requiredStage }, [
      h('button', { onClick: () => emit('close') }, props.requiredStage ? '取消领料选品' : '取消选品'),
      h('button', { onClick: () => emit('selected', props.requiredStage ? pickerState.inputProduct : pickerState.product) }, props.requiredStage ? '选入领料产品' : '选入产品'),
    ]) : null,
  }),
}));
vi.mock('ant-design-vue', () => {
  const input = defineComponent({
    inheritAttrs: false,
    props: ['id', 'value'], emits: ['change', 'update:value'],
    setup: (props, { emit }) => () => h('input', { id: props.id, value: props.value ?? '', onChange: (event: Event) => {
      const raw = (event.target as HTMLInputElement).value;
      const value = raw === '' ? null : Number.isFinite(Number(raw)) ? Number(raw) : raw;
      emit('update:value', value); emit('change', value);
    } }),
  });
  return {
    Alert: defineComponent({ setup: (_, { slots }) => () => h('div', slots.message?.()) }),
    Button: defineComponent({ props: ['disabled', 'loading'], setup: (props, { slots }) => () => h('button', { disabled: props.disabled || props.loading }, slots.default?.()) }),
    Input: input,
    InputNumber: input,
    Modal: defineComponent({ props: ['open'], emits: ['ok'], setup: (props, { emit, slots }) => () => props.open
      ? h('div', [slots.default?.(), h('button', { onClick: () => emit('ok') }, '保存')]) : null }),
    Select: defineComponent({
      inheritAttrs: false,
      props: ['id', 'value', 'options'], emits: ['change', 'update:value'],
      setup: (props, { emit }) => () => h('select', { id: props.id, value: props.value ?? '', onChange: (event: Event) => {
        const value = (event.target as HTMLSelectElement).value;
        emit('update:value', value); emit('change', value);
      } }, [h('option', { value: '' }, '请选择'), ...(props.options ?? []).map((o: { label: string; value: string }) => h('option', { value: o.value }, o.label))]),
    }),
  };
});

const baseAttrs = { material: 'TPE', color: 'ZI', length: 210, width: 136, thickness: 4.8, recipeCode: 'REC-001' };
const options: Api.FormOptions = {
  demand: [1, 2].map((id) => ({
    assignmentId: 'POI:' + id, contractCode: 'GD-01', product: '同名双色瑜伽垫', productId: 'same-product',
    boards: id * 10, sheets: id * 80, remaining: 160,
    boardAttrs: { ...baseAttrs, color: null },
    sheetAttrs: { ...baseAttrs, thickness: 0.3, color: null },
    sourceStagesByProcess: { EMBOSS: ['SHEET'] },
    targetAttrs: { material: 'TPE', frontColor: 'ZI', backColor: 'HUI', length: 183, width: 61, thickness: 0.3 },
  })),
  processes: [
    { code: 'MIX', label: '发泡', unit: '张', outputStage: 'BOARD', sourceStages: ['RAW'] },
    { code: 'SLICE', label: '开片', unit: '片', outputStage: 'SHEET', sourceStages: ['BOARD'] },
    { code: 'CUT', label: '立切', unit: '片', outputStage: 'CUT', sourceStages: ['SHEET'] },
    { code: 'EMBOSS', label: '压花', unit: '条', outputStage: 'EMBOSSED', sourceStages: ['LAMINATED'] },
  ],
  materialOptions: {
    colors: [{ value: 'ZI', label: '紫色' }, { value: 'HUI', label: '灰色' }],
    materials: [{ value: 'TPE', label: 'TPE' }], recipes: [{ code: 'REC-001', name: '配方一', enabled: true }],
    patterns: [], processes: [], rawMaterials: [], stages: [], textures: [],
  },
};
const schedule: Api.Schedule = { days: 3, id: 9, revision: 1, scheduleNo: 'PB-09', startDate: '2026-11-10', status: 'DRAFT' };
const inputMaterial = (process = 'SLICE'): Api.Material => ({
  productId: 'INPUT-01', code: process === 'SLICE' ? 'BOARD-001' : 'SHEET-001',
  stage: process === 'SLICE' ? 'BOARD' : 'SHEET', name: process === 'SLICE' ? '紫色发泡板材' : '紫色已开片板材',
  unit: process === 'SLICE' ? '张' : '片',
  attrs: { material: 'TPE', color: 'ZI', length: 190, width: 132, thickness: 4.5 },
});
let unmount: (() => void) | undefined;
const flush = async () => { for (let i = 0; i < 5; i++) { await Promise.resolve(); await nextTick(); } };
beforeEach(() => { vi.useFakeTimers();
  preview.mockImplementation(async (request: Api.MaterialPreviewRequest) => ['SLICE', 'CUT'].includes(request.process)
    ? { inputs: [{ ...inputMaterial(request.process), quantity: request.process === 'SLICE' ? request.quantity : 2, available: 1, shortage: 1 }], sourceStages: [inputMaterial(request.process).stage], warnings: [], estimated: true }
    : { inputs: [], sourceStages: [], warnings: ['请确认实际用料'], estimated: false });
  resolveInput.mockImplementation(async (request: { process: string }) => inputMaterial(request.process));
  pickerState.inputProduct = { id: 'INPUT-01', code: 'BOARD-001', name: '历史板材', productStage: null, resolvedProductStage: 'BOARD', size: '999×999×999cm', colorCode: 'HUI' };
  pickerState.product = {
  id: 'STOCK-01', code: 'SKU-01', name: '瑜伽垫', displayName: '灰色瑜伽垫',
  size: '183×61×0.6', material: 'TPE', color: '灰色',
}; });
afterEach(() => { unmount?.(); document.body.innerHTML = ''; vi.clearAllMocks(); vi.useRealTimers(); });

async function mount(initial?: Api.PlanTask, existingTaskId?: number, status: Api.Status = existingTaskId ? 'CONFIRMED' : 'DRAFT', recalculateMaterials = false) {
  const submit = vi.fn().mockResolvedValue(undefined);
  const host = document.createElement('div'); document.body.append(host);
  const app = createApp(TaskForm, { existingTaskId, initial, options, recalculateMaterials, schedule: { ...schedule, status }, submit, workers: [], open: true });
  app.mount(host); unmount = () => app.unmount(); await flush();
  return submit;
}
async function set(id: string, value: string) {
  const field = document.getElementById(id) as HTMLInputElement | HTMLSelectElement;
  expect(field, id).toBeTruthy(); field.value = value; field.dispatchEvent(new Event('change', { bubbles: true })); await flush();
}
async function clickButton(text: string) {
  const button = [...document.querySelectorAll('button')].find((b) => b.textContent === text);
  expect(button, text).toBeTruthy(); button!.click(); await flush();
}
async function save() { await clickButton('保存'); }
async function selectInput() {
  document.getElementById('task-form-input-product')!.click(); await flush();
  await clickButton('选入领料产品');
}

describe('production task dispatch', () => {
  it('inherits all authoritative board dimensions including thickness without editable slicing fields', async () => {
    const submit = await mount(); await set('task-form-process', 'SLICE');
    await set('task-form-quantity', '8');
    document.getElementById('task-form-input-product')!.click(); await flush();
    expect(document.querySelector('[data-testid="input-product-picker"]')?.getAttribute('data-required-stage')).toBe('BOARD');
    await clickButton('选入领料产品');
    expect(resolveInput).toHaveBeenCalledWith({ process: 'SLICE', assignmentId: null, productId: 'INPUT-01' });
    expect(pickerState.inputProduct.productStage).toBeNull();
    expect(document.body.textContent).toContain('1900×1320×45 mm');
    expect(document.body.textContent).toContain('紫色');
    expect(document.body.textContent).not.toContain('9990');
    for (const field of ['material', 'color', 'length', 'width', 'thickness']) expect(document.getElementById('task-output-' + field)).toBeNull();
    await vi.advanceTimersByTimeAsync(350); await flush();
    expect(preview).toHaveBeenLastCalledWith({ process: 'SLICE', assignmentId: null, quantity: 8,
      inputProductId: 'INPUT-01', inputCode: 'BOARD-001',
      outputAttrs: { material: 'TPE', color: 'ZI', length: 190, width: 132, thickness: 4.5 } });
    await save();
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ inputs: [{ ...inputMaterial(), quantity: 8 }],
      output: expect.objectContaining({ stage: 'SHEET', attrs: { material: 'TPE', color: 'ZI', length: 190, width: 132, thickness: 4.5 } }) }));
  });

  it('inherits the selected board recipe for slicing and allows a 45 mm board to be cut into a specified 6 mm sheet', async () => {
    resolveInput.mockImplementation(async (request: { process: string }) => ({ ...inputMaterial(request.process),
      attrs: { ...inputMaterial(request.process).attrs, thickness: 4.5, recipeCode: 'REC-001', recipeName: '配方一' } }));
    const submit = await mount();
    await set('task-form-process', 'SLICE'); await selectInput(); await set('task-form-quantity', '3');
    await save();
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ output: expect.objectContaining({ attrs: {
      material: 'TPE', color: 'ZI', length: 190, width: 132, thickness: 4.5, recipeCode: 'REC-001', recipeName: '配方一',
    } }) }));
    unmount?.(); document.body.innerHTML = '';
    const cutSubmit = await mount();
    await set('task-form-process', 'CUT'); await set('task-form-order', 'GD-01'); await set('task-form-product', 'POI:1');
    await selectInput();
    expect((document.getElementById('task-output-thickness') as HTMLInputElement).value).toBe('3');
    expect(document.getElementById('task-output-recipeCode')).toBeNull();
    await set('task-output-length', '1800'); await set('task-output-width', '600'); await set('task-output-thickness', '6');
    await selectInput(); // Replacing the source must not overwrite the explicit target dimensions.
    expect((document.getElementById('task-output-thickness') as HTMLInputElement).value).toBe('6');
    await save();
    const target = { material: 'TPE', color: 'ZI', length: 180, width: 60, thickness: 0.6, recipeCode: 'REC-001', recipeName: '配方一' };
    expect(preview).toHaveBeenLastCalledWith(expect.objectContaining({ process: 'CUT', outputAttrs: target }));
    expect(cutSubmit).toHaveBeenCalledWith(expect.objectContaining({ output: expect.objectContaining({ stage: 'CUT', attrs: target }) }));
  });

  it.each(['process', 'order', 'product'])('clears selected material and ignores late resolution when the %s changes', async (change) => {
    const submit = await mount(); await set('task-form-process', 'SLICE'); await selectInput();
    let finishOld!: (material: Api.Material) => void;
    resolveInput.mockImplementationOnce(() => new Promise<Api.Material>((resolve) => { finishOld = resolve; }));
    await selectInput();
    expect(document.getElementById('task-form-input-product')!.textContent).toContain('正在读取所选板材');
    if (change === 'process') await set('task-form-process', 'CUT');
    if (change === 'order') await set('task-form-order', 'GD-01');
    if (change === 'product') {
      document.getElementById('task-form-product')!.click(); await flush(); await clickButton('选入产品');
    }
    finishOld({ ...inputMaterial(), name: '迟到的旧板材' }); await flush();
    expect(document.body.textContent).not.toContain('迟到的旧板材');
    expect(document.getElementById('task-form-input-product')!.textContent).toContain('点击从产品中心选择领料板材');
    expect(document.getElementById('task-output-thickness')).toBeNull();
    expect(document.getElementById('task-output-length')).toBeNull();
    await set('task-form-quantity', '8'); await save();
    expect(submit).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('请先从产品中心选择本次领料的板材');
  });

  it('does not save after a replacement material lookup fails even if the prior selection was valid', async () => {
    const submit = await mount(); await set('task-form-process', 'SLICE'); await selectInput();
    await set('task-form-quantity', '8');
    resolveInput.mockRejectedValueOnce(new Error('板材关联不存在'));
    await selectInput(); await save();
    expect(submit).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('领料产品读取失败');
    expect(document.body.textContent).toContain('请重新选择有效的领料产品');
  });

  it.each([
    { inputs: [{ ...inputMaterial(), quantity: 2 }], estimated: false },
    { inputs: [], estimated: true },
  ])('does not save a selected input with an incomplete material estimate: %j', async (result) => {
    preview.mockResolvedValue({ ...result, sourceStages: ['BOARD'], warnings: [] });
    const submit = await mount(); await set('task-form-process', 'SLICE'); await selectInput();
    await set('task-form-quantity', '8'); await save();
    expect(submit).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('所选领料与计划产出尚未匹配');
  });

  it('recalculates an existing single-material task by its saved input code when it has no product id', async () => {
    const original = { ...inputMaterial(), productId: undefined, code: 'LEGACY-BOARD', quantity: 8 };
    preview.mockResolvedValue({ inputs: [{ ...original, quantity: 12 }], sourceStages: ['BOARD'], warnings: [], estimated: true });
    const submit = await mount({ date: '2026-11-10', process: 'SLICE', quantity: 8, product: '历史开片任务', workerIds: [], inputs: [original],
      output: { stage: 'SHEET', attrs: { material: 'TPE', color: 'ZI', length: 190, width: 132, thickness: 4.5 } } });
    expect(document.getElementById('task-form-input-product')!.textContent).toContain('紫色发泡板材');
    await set('task-form-quantity', '12'); await save();
    expect(resolveInput).not.toHaveBeenCalled();
    expect(preview).toHaveBeenCalledWith(expect.objectContaining({ inputCode: 'LEGACY-BOARD', inputProductId: null, quantity: 12 }));
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ inputs: [{ ...original, quantity: 12 }] }));
  });

  it.each([
    { inputs: [{ ...inputMaterial(), quantity: 2 }] },
    { inputs: [{ ...inputMaterial(), quantity: 2 }, { ...inputMaterial(), code: 'BOARD-002', quantity: 1 }] },
    { inputs: [] },
    { inputs: [{ stage: 'BOARD', code: 'OLD-BOARD-WITHOUT-ATTRS', quantity: 2 }] },
  ])('preserves legacy input agreements when only dispatch date and reason change: %j', async ({ inputs }: { inputs: Api.Material[] }) => {
    const initial: Api.PlanTask = { date: '2026-11-10', sequence: 7, process: 'SLICE', quantity: 8, product: '历史开片任务', workerIds: [], inputs,
      output: { stage: 'SHEET', code: 'OLD-OUTPUT', attrs: { material: 'TPE', color: 'ZI', length: 190, width: 132, thickness: 0.3 } } };
    const submit = await mount(initial, 123);
    expect(document.body.textContent).toContain('当前保留历史任务的领料和产出约定');
    await set('task-form-date', '2026-11-11'); await set('task-form-reason', '调整开工日期'); await save();
    expect(resolveInput).not.toHaveBeenCalled(); expect(preview).not.toHaveBeenCalled();
    expect(submit).toHaveBeenCalledWith({ ...initial, date: '2026-11-11', sequence: null, reason: '调整开工日期' });
  });

  it.each(['DRAFT', 'CONFIRMED'] as const)('requires reselection instead of preserving a stale thickness for a new %s task', async (status) => {
    const initial: Api.PlanTask = { date: '2026-11-10', process: 'SLICE', quantity: 8, product: '历史开片任务', workerIds: [],
      inputs: [{ ...inputMaterial(), quantity: 2 }],
      output: { stage: 'SHEET', attrs: { material: 'TPE', color: 'ZI', length: 190, width: 132, thickness: 0.3 } } };
    const submit = await mount(initial, undefined, status);
    await set('task-form-reason', '调整说明'); await save();
    expect(submit).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('草稿或补派任务需要重新选择领料板材');
    expect(document.body.textContent).not.toContain('可直接调整日期、人员或说明');
    expect(initial.output?.attrs?.thickness).toBe(0.3);
  });

  it('requires explicit reselection to correct a historical thickness and discards its stale output identity and estimate', async () => {
    const initial: Api.PlanTask = { date: '2026-11-10', process: 'SLICE', quantity: 8, product: '历史开片任务', workerIds: [],
      inputs: [{ ...inputMaterial(), quantity: 2 }],
      output: { stage: 'SHEET', code: 'OLD-THIN-SHEET', attrs: { material: 'TPE', color: 'ZI', length: 190, width: 132, thickness: 0.3 } } };
    const submit = await mount(initial);
    expect(document.body.textContent).toContain('历史开片计划厚度与领料板材不一致');
    expect(document.body.textContent).toContain('1900×1320×3 mm');
    expect(preview).not.toHaveBeenCalled();
    await selectInput();
    expect(document.body.textContent).not.toContain('历史开片计划厚度与领料板材不一致');
    expect(document.body.textContent).toContain('1900×1320×45 mm');
    await save();
    expect(preview).toHaveBeenCalledWith(expect.objectContaining({ quantity: 8, outputAttrs: expect.objectContaining({ thickness: 4.5 }) }));
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ inputs: [{ ...inputMaterial(), quantity: 8 }],
      output: expect.objectContaining({ attrs: expect.objectContaining({ thickness: 4.5 }) }) }));
    expect(submit.mock.calls[0]![0].output.code).toBeUndefined();
    expect(initial.output?.attrs?.thickness).toBe(0.3);
    expect(initial.inputs?.[0]?.quantity).toBe(2);
  });

  it('updates inherited thickness when another board is selected', async () => {
    const submit = await mount(); await set('task-form-process', 'SLICE'); await set('task-form-quantity', '4'); await selectInput();
    const replacement = { ...inputMaterial(), code: 'BOARD-48', attrs: { ...inputMaterial().attrs, thickness: 4.8 } };
    resolveInput.mockResolvedValueOnce(replacement);
    preview.mockResolvedValue({ inputs: [{ ...replacement, quantity: 4 }], sourceStages: ['BOARD'], warnings: [], estimated: true });
    await selectInput(); await save();
    expect(document.getElementById('task-output-thickness')).toBeNull();
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ output: expect.objectContaining({ attrs: expect.objectContaining({ thickness: 4.8 }) }) }));
  });

  it('requires selecting material again when a legacy multi-material task changes planned quantity', async () => {
    const submit = await mount({ date: '2026-11-10', process: 'SLICE', quantity: 8, product: '历史开片任务', workerIds: [],
      inputs: [{ ...inputMaterial(), quantity: 2 }, { ...inputMaterial(), code: 'BOARD-002', quantity: 1 }],
      output: { stage: 'SHEET', attrs: { material: 'TPE', color: 'ZI', length: 190, width: 132, thickness: 0.3 } } });
    await set('task-form-quantity', '12'); await save();
    expect(submit).not.toHaveBeenCalled(); expect(preview).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('请先从产品中心选择本次领料的板材');
  });

  it('uses a historical board linked to the foaming stage without writing its archive classification', async () => {
    pickerState.product = { ...pickerState.product, productStage: null, resolvedProductStage: 'BOARD',
      resolvedProductStageLabel: '发泡板材', colorCode: 'ZI', size: '190×132×4.5cm' };
    const submit = await mount(); await set('task-form-process', 'MIX');
    document.getElementById('task-form-product')!.click(); await flush(); await clickButton('选入产品');
    expect((document.getElementById('task-output-length') as HTMLInputElement).value).toBe('1900');
    expect((document.getElementById('task-output-thickness') as HTMLInputElement).value).toBe('45');
    await set('task-output-recipeCode', 'REC-001'); await set('task-form-quantity', '8'); await save();
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ output: expect.objectContaining({ stage: 'BOARD',
      attrs: expect.objectContaining({ length: 190, width: 132, thickness: 4.5 }) }) }));
    expect(pickerState.product.productStage).toBeNull();
  });
  it('leaves an unmaintained face color empty even when the archive retains a legacy single color', async () => {
    pickerState.product = { ...pickerState.product, productStage: 'EMBOSSED', colorCode: 'HUI',
      frontColor: 'ZI', backColor: null };
    const submit = await mount(); await set('task-form-process', 'EMBOSS');
    document.getElementById('task-form-product')!.click(); await flush(); await clickButton('选入产品');
    expect((document.getElementById('task-output-frontColor') as HTMLSelectElement).value).toBe('ZI');
    expect((document.getElementById('task-output-backColor') as HTMLSelectElement).value).toBe('');
    await set('task-form-quantity', '8'); await save();
    expect(submit).not.toHaveBeenCalled();
    await set('task-output-backColor', 'HUI'); await save();
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({
      output: expect.objectContaining({ attrs: expect.objectContaining({ frontColor: 'ZI', backColor: 'HUI' }) }),
    }));
  });

  it('copies explicit double-sided colors and textures from the product archive into the planned output', async () => {
    pickerState.product = { ...pickerState.product, productStage: 'EMBOSSED', color: '旧颜色说明',
      frontColor: 'ZI', backColor: 'HUI', textureFront: 'WAVE', textureBack: 'LEAF' };
    const submit = await mount(); await set('task-form-process', 'EMBOSS');
    document.getElementById('task-form-product')!.click(); await flush(); await clickButton('选入产品');
    await set('task-form-quantity', '8'); await save();
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({
      output: expect.objectContaining({ stage: 'EMBOSSED', attrs: expect.objectContaining({
        frontColor: 'ZI', backColor: 'HUI', textureFront: 'WAVE', textureBack: 'LEAF',
      }) }),
    }));
  });

  it('uses an explicitly classified board specification when dispatching foaming', async () => {
    pickerState.product = { ...pickerState.product, productStage: 'BOARD', colorCode: 'ZI', size: '190×132×4.5' };
    const submit = await mount(); await set('task-form-process', 'MIX');
    document.getElementById('task-form-product')!.click(); await flush(); await clickButton('选入产品');
    expect((document.getElementById('task-output-length') as HTMLInputElement).value).toBe('1900');
    expect((document.getElementById('task-output-color') as HTMLSelectElement).value).toBe('ZI');
    await set('task-output-recipeCode', 'REC-001'); await set('task-form-quantity', '8'); await save();
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({
      output: expect.objectContaining({ stage: 'BOARD', attrs: expect.objectContaining({ length: 190, width: 132, thickness: 4.5, color: 'ZI' }) }),
    }));
  });

  it('selects a stock product through the modal and preserves the concrete stage output contract', async () => {
    const submit = await mount(); await set('task-form-process', 'CUT');
    document.getElementById('task-form-product')!.click(); await flush();
    expect(document.querySelector('[data-testid="product-picker"]')).toBeTruthy();
    await clickButton('选入产品');
    expect(document.querySelector('[data-testid="product-picker"]')).toBeNull();
    expect(document.getElementById('task-form-product')!.textContent).toContain('灰色瑜伽垫');
    expect(document.body.textContent).toContain('SKU-01');
    await selectInput();
    await set('task-form-quantity', '8'); await save();
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({
      assignmentId: null, contractCode: null, product: '灰色瑜伽垫', quantity: 8,
      output: expect.objectContaining({ stage: 'CUT', attrs: { length: 183, width: 61, thickness: 0.6, material: 'TPE', color: 'ZI' } }),
    }));
  });

  it('cancels a replacement without losing the selected product or edited output, and allows clearing the association', async () => {
    await mount(); await set('task-form-process', 'CUT');
    document.getElementById('task-form-product')!.click(); await flush(); await clickButton('选入产品');
    await selectInput();
    await set('task-output-length', '180'); await set('task-form-quantity', '6');
    document.getElementById('task-form-product')!.click(); await flush(); await clickButton('取消选品');
    expect(document.getElementById('task-form-product')!.textContent).toContain('灰色瑜伽垫');
    expect((document.getElementById('task-output-length') as HTMLInputElement).value).toBe('180');
    expect((document.getElementById('task-form-quantity') as HTMLInputElement).value).toBe('6');
    await clickButton('清除');
    expect(document.getElementById('task-form-product')!.textContent).toContain('点击从产品中心选择');
    expect(document.getElementById('task-output-length')).toBeNull();
    expect(document.getElementById('task-form-input-product')!.textContent).toContain('点击从产品中心选择领料板材');
    expect((document.getElementById('task-form-quantity') as HTMLInputElement).value).toBe('6');
    await set('task-form-order', 'GD-01');
    expect(document.getElementById('task-form-product')!.tagName).toBe('SELECT');
    expect(document.querySelector('[data-testid="product-picker"]')).toBeNull();
  });

  it('links duplicate products by the selected order item and explicitly plans one board color', async () => {
    const submit = await mount();
    await set('task-form-process', 'MIX'); await set('task-form-order', 'GD-01');
    const product = document.getElementById('task-form-product') as HTMLSelectElement;
    expect([...product.options].map((o) => o.value)).toContain('POI:2');
    await set('task-form-product', 'POI:2');
    await save();
    expect(submit).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('请选择本次产出的单一颜色');
    await set('task-output-color', 'HUI'); await save();
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({
      assignmentId: 'POI:2', product: '同名双色瑜伽垫', quantity: 20,
      output: expect.objectContaining({ stage: 'BOARD', attrs: { ...baseAttrs, color: 'HUI' }, quantity: 20 }),
    }));
  });

  it('requires the preceding material again after changing the process and inherits its color instead of a two-color order side', async () => {
    const submit = await mount();
    await set('task-form-order', 'GD-01'); await set('task-form-product', 'POI:1'); await set('task-form-process', 'SLICE');
    expect(document.body.textContent).toContain('报工产出：已开片板材');
    expect(document.getElementById('task-output-thickness')).toBeNull();
    await selectInput();
    expect(document.body.textContent).toContain('1900×1320');
    await set('task-form-process', 'CUT');
    expect(document.body.textContent).toContain('领料：已开片板材');
    expect(document.body.textContent).toContain('报工产出：片材（立切）');
    expect(document.getElementById('task-output-length')).toBeNull();
    await selectInput();
    expect((document.getElementById('task-output-length') as HTMLInputElement).value).toBe('1830');
    expect(document.getElementById('task-output-color')).toBeNull();
    await save();
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ output: expect.objectContaining({ stage: 'CUT', attrs: { material: 'TPE', color: 'ZI', length: 183, width: 61, thickness: 0.3 } }) }));
  });

  it('can dispatch foaming stock from the material target without choosing a finished product', async () => {
    const submit = await mount(); await set('task-form-process', 'MIX');
    for (const [field, value] of Object.entries(baseAttrs)) await set('task-output-' + field, String(['length', 'width', 'thickness'].includes(field) ? Number(value) * 10 : value));
    await set('task-form-quantity', '8'); await save();
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ contractCode: null, assignmentId: null, quantity: 8, output: expect.objectContaining({ stage: 'BOARD', attrs: baseAttrs }) }));
  });

  it('shows the preceding stage of the selected order route when intermediate processes are skipped', async () => {
    await mount();
    await set('task-form-process', 'EMBOSS');
    expect(document.body.textContent).toContain('领料：贴合垫');
    await set('task-form-order', 'GD-01'); await set('task-form-product', 'POI:1');
    expect(document.body.textContent).toContain('领料：已开片板材');
    expect(document.body.textContent).not.toContain('领料：贴合垫');
  });

  it('preserves input plans, output identity and covers when editing an existing task', async () => {
    const initial: Api.PlanTask = {
      assignmentId: 'POI:2', contractCode: 'GD-01', date: '2026-11-10', process: 'MIX', product: '同名双色瑜伽垫', quantity: 20, workerIds: [],
      covers: [{ assignmentId: 'POI:2', quantity: 20 }],
      inputs: [{ stage: 'RAW', name: '原料', quantity: 30, unit: 'kg', code: 'RAW-1' }],
      output: { stage: 'BOARD', attrs: baseAttrs, code: 'BC-001', productCode: 'PRODUCT-001', note: '既有物料' },
    };
    const submit = await mount(initial); await save();
    expect(preview).not.toHaveBeenCalled();
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ assignmentId: 'POI:2', covers: [{ assignmentId: 'POI:2', quantity: 20 }], inputs: initial.inputs,
      output: expect.objectContaining({ code: 'BC-001', productCode: 'PRODUCT-001', note: '既有物料', attrs: baseAttrs, quantity: 20 }) }));
  });

  it('shows anticipated materials and saves only the material plan, with mm converted to the cm API contract', async () => {
    preview.mockResolvedValue({ inputs: [{ stage: 'RAW', code: 'RAW-1', name: 'TPE原料', attrs: { rawMaterialCode: 'TPE-1' },
      quantity: 31.2, unit: 'kg', available: 20, shortage: 11.2, perBatch: 8 }], sourceStages: ['RAW'],
      basis: '按配方估算', warnings: ['不足可后续补录'], estimated: true, recipeBatches: 4 });
    const submit = await mount(); await set('task-form-process', 'MIX');
    for (const [field, value] of Object.entries(baseAttrs)) await set('task-output-' + field, String(['length', 'width', 'thickness'].includes(field) ? Number(value) * 10 : value));
    await set('task-output-thickness', '45'); await set('task-form-quantity', '8');
    await vi.advanceTimersByTimeAsync(350); await flush();
    expect(preview).toHaveBeenLastCalledWith(expect.objectContaining({ quantity: 8, outputAttrs: { ...baseAttrs, thickness: 4.5 } }));
    expect(document.body.textContent).toContain('预计领料');
    expect(document.body.textContent).toContain('TPE原料');
    expect(document.body.textContent).toContain('31.2');
    expect(document.body.textContent).toContain('2100×1360×45 mm');
    await save();
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({
      inputs: [{ stage: 'RAW', code: 'RAW-1', name: 'TPE原料', attrs: { rawMaterialCode: 'TPE-1' }, quantity: 31.2, unit: 'kg' }],
      output: expect.objectContaining({ attrs: { ...baseAttrs, thickness: 4.5 }, recipeBatches: 4 }),
    }));
  });

  it('recalculates saved input quantities after the planned output quantity changes', async () => {
    const original = { stage: 'RAW', name: '原料', attrs: { rawMaterialCode: 'TPE' }, quantity: 30, unit: 'kg' };
    preview.mockResolvedValue({ inputs: [{ ...original, quantity: 27 }], sourceStages: ['RAW'], warnings: [], estimated: true });
    const submit = await mount({ assignmentId: 'POI:2', contractCode: 'GD-01', date: '2026-11-10', process: 'MIX', quantity: 20,
      product: '同名双色瑜伽垫', workerIds: [], inputs: [original], output: { stage: 'BOARD', attrs: baseAttrs } });
    await set('task-form-quantity', '18'); await save();
    expect(preview).toHaveBeenCalledWith(expect.objectContaining({ quantity: 18 }));
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ inputs: [{ ...original, quantity: 27 }] }));
  });

  it('recalculates a structured replacement task instead of trusting proportionally scaled inputs', async () => {
    const original = { stage: 'RAW', name: '原料', quantity: 15, unit: 'kg' };
    preview.mockResolvedValue({ inputs: [{ ...original, quantity: 17 }], sourceStages: ['RAW'], warnings: [], estimated: true });
    const submit = await mount({ date: '2026-11-10', process: 'MIX', product: '补派板材', quantity: 10, workerIds: [],
      inputs: [original], output: { stage: 'BOARD', attrs: baseAttrs } }, undefined, 'CONFIRMED', true);
    await save();
    expect(preview).toHaveBeenCalledWith(expect.objectContaining({ quantity: 10 }));
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ inputs: [{ ...original, quantity: 17 }] }));
  });

  it('retains proportional scaling for unchanged legacy materials without structured attributes', async () => {
    const original = { stage: 'RAW', name: '旧原料', quantity: 30, unit: 'kg' };
    const submit = await mount({ date: '2026-11-10', process: 'MIX', product: '旧板材', quantity: 20, workerIds: [],
      inputs: [original], output: { stage: 'BOARD', name: '旧规格', code: 'OLD-BOARD' } });
    await set('task-form-quantity', '10');
    await save();
    expect(preview).not.toHaveBeenCalled();
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ inputs: [{ ...original, quantity: 15 }],
      output: expect.objectContaining({ code: 'OLD-BOARD', quantity: 10 }) }));
  });

  it('does not submit stale or unconfirmed material estimates when a recalculation fails', async () => {
    preview.mockRejectedValue(new Error('暂时不可用'));
    const submit = await mount({ date: '2026-11-10', process: 'MIX', quantity: 20, workerIds: [],
      inputs: [{ stage: 'RAW', name: '旧原料', quantity: 30 }], output: { stage: 'BOARD', attrs: baseAttrs } });
    await set('task-form-quantity', '18'); await save();
    expect(submit).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('预计领料计算失败');
  });

  it('ignores a late estimate for the old planned quantity', async () => {
    let finishOld!: (value: Api.MaterialPreview) => void;
    preview.mockImplementationOnce(() => new Promise<Api.MaterialPreview>((resolve) => { finishOld = resolve; }))
      .mockResolvedValue({ inputs: [{ stage: 'RAW', name: '新计划原料', quantity: 18, unit: 'kg' }], sourceStages: ['RAW'], warnings: [], estimated: true });
    await mount({ date: '2026-11-10', process: 'MIX', quantity: 20, workerIds: [], output: { stage: 'BOARD', attrs: baseAttrs } });
    await vi.advanceTimersByTimeAsync(350); await flush();
    await set('task-form-quantity', '18'); await vi.advanceTimersByTimeAsync(350); await flush();
    expect(document.body.textContent).toContain('新计划原料');
    finishOld({ inputs: [{ stage: 'RAW', name: '旧计划原料', quantity: 20 }], sourceStages: ['RAW'], warnings: [], estimated: true });
    await flush();
    expect(document.body.textContent).not.toContain('旧计划原料');
    expect(document.body.textContent).toContain('新计划原料');
  });

  it('drops stale input and output identities when the planned material specification changes', async () => {
    const submit = await mount({ assignmentId: 'POI:1', contractCode: 'GD-01', date: '2026-11-10', process: 'MIX', product: '同名双色瑜伽垫', quantity: 10, workerIds: [],
      inputs: [{ stage: 'RAW', code: 'OLD-RAW', quantity: 30 }], output: { stage: 'BOARD', attrs: baseAttrs, code: 'OLD-BOARD' } });
    await set('task-output-color', 'HUI'); await save();
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ inputs: undefined, output: expect.objectContaining({ attrs: { ...baseAttrs, color: 'HUI' } }) }));
    expect(submit.mock.calls[0]![0].output.code).toBeUndefined();
  });

  it('does not silently change allocations when a merged task quantity is edited', async () => {
    const submit = await mount({ contractCode: 'GD-01', date: '2026-11-10', process: 'MIX', product: '合并发泡', quantity: 30, workerIds: [],
      covers: [{ assignmentId: 'POI:1', quantity: 10 }, { assignmentId: 'POI:2', quantity: 20 }], output: { stage: 'BOARD', attrs: baseAttrs } });
    await set('task-form-quantity', '40'); await save();
    expect(submit).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('合并任务的计划数量必须保持各订单原分配合计');
  });
});
