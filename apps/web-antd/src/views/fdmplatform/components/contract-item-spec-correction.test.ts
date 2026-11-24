import type { PropType } from 'vue';

import type { Contract, ContractItem } from '#/api/fdmplatform';

import { createApp, defineComponent, h, nextTick } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { contractAction } from '#/api/fdmplatform';
import { getProductAttributeOptions } from '#/api/fdmplatform/products';

import CorrectionModal from './ContractItemSpecCorrection.vue';

vi.mock('#/api/fdmplatform', () => ({
  contractAction: vi.fn(),
  newIdempotencyKey: () => 'correction-key',
}));

vi.mock('#/api/fdmplatform/products', () => ({
  getProductAttributeOptions: vi.fn(),
}));

vi.mock('ant-design-vue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ant-design-vue')>()),
  Select: defineComponent({
    props: {
      disabled: Boolean,
      options: Array as PropType<Array<{ label: string; value: string }>>,
      value: String,
    },
    emits: ['update:value'],
    setup:
      (props, { attrs, emit }) =>
      () =>
        h(
          'select',
          {
            ...attrs,
            disabled: props.disabled,
            value: props.value ?? '',
            onChange: (event: Event) =>
              emit('update:value', (event.target as HTMLSelectElement).value),
          },
          [
            h('option', { value: '' }),
            ...(props.options ?? []).map(({ label, value }) =>
              h('option', { value }, label),
            ),
          ],
        ),
  }),
}));

const legacyItem: ContractItem = {
  id: 'line-1',
  skuId: 'old-sku',
  skuCode: 'CG2400002',
  skuName: 'TPE双色瑜伽垫-尾单',
  specVersion: 'history',
  specification: '型号：随机 规格：1830*61*6mm',
  size: '1830*61*6mm',
  unit: '个',
  quantity: 2000,
  lengthMm: 1830,
  widthMm: 61,
  finishedThicknessMm: 6,
};

const contract: Contract = {
  id: 'contract-1',
  code: 'X001',
  name: '瑜伽垫销售合同',
  companyId: 17,
  departmentId: 1,
  ownerUserId: 1,
  customerId: 'customer-1',
  customerName: '客户',
  businessType: 'DOMESTIC',
  currency: 'CNY',
  status: 'ACTIVE',
  version: 4,
  businessVersion: 2,
  allowedActions: ['CORRECT_CONTRACT_ITEM_SPEC'],
  items: [legacyItem],
};

let unmount: (() => void) | undefined;

function mount(item = legacyItem) {
  const saved = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () =>
      h(CorrectionModal, {
        contract: { ...contract, items: [item] },
        onSaved: saved,
      }),
  });
  app.mount(host);
  unmount = () => app.unmount();
  return saved;
}

function field(label: string) {
  const element = document.querySelector<
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  >(`[aria-label="${label}"]`);
  if (!element) throw new Error(`未找到字段：${label}`);
  return element;
}

async function change(label: string, value: string) {
  const element = field(label);
  element.value = value;
  element.dispatchEvent(
    new Event(element.tagName === 'SELECT' ? 'change' : 'input', {
      bubbles: true,
    }),
  );
  await nextTick();
}

async function selectLine() {
  document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
  await nextTick();
}

function saveButton() {
  return [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent?.trim() === '保存更正',
  )!;
}

function expectCorrection(reason: string, fields: Record<string, string>) {
  expect(contractAction).toHaveBeenCalledWith(
    contract.id,
    'CORRECT_CONTRACT_ITEM_SPEC',
    contract.version,
    'correction-key',
    {
      items: [
        {
          contractItemId: legacyItem.id,
          lengthMm: 1830,
          widthMm: 610,
          thicknessMm: 6,
          colorMode: 'UNKNOWN',
          frontColor: '',
          backColor: '',
          textureFront: '',
          textureBack: '',
          patternMode: 'UNKNOWN',
          patternCode: '',
          patternVersion: '',
          ...fields,
        },
      ],
      reason,
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(contractAction).mockResolvedValue(contract);
  vi.mocked(getProductAttributeOptions).mockResolvedValue({
    colors: [
      { label: '黑色', value: 'BK' },
      { label: '红色', value: 'RD' },
    ],
    textures: [
      { label: '无纹路', value: 'NONE' },
      { label: '波浪纹', value: 'WAVE' },
    ],
    patterns: [{ label: '中心线', value: 'CENTER' }],
    matTypes: [],
    stages: [],
  });
});

afterEach(() => {
  unmount?.();
  unmount = undefined;
  document.body.innerHTML = '';
});

describe('contract item specification correction', () => {
  it('pre-fills legacy dimensions and saves a width correction while leaving production fields blank', async () => {
    const saved = mount({
      ...legacyItem,
      size: '型号：随机\n规格：1830*61*6mm',
      lengthMm: null,
      widthMm: null,
      finishedThicknessMm: null,
    });
    await selectLine();
    expect(getProductAttributeOptions).toHaveBeenCalledWith(contract.companyId);
    expect(Number(field('第 1 行长（mm）').value)).toBe(1830);
    expect(Number(field('第 1 行宽（mm）').value)).toBe(61);
    expect(Number(field('第 1 行厚（mm）').value)).toBe(6);
    expect(field('第 1 行单色 / 双色').value).toBe('');
    expect(field('第 1 行激光雕刻方式').value).toBe('');

    await change('更正原因', '  核对宽度后更正  ');
    await change('第 1 行宽（mm）', '610');
    expect(saveButton().disabled).toBe(false);
    saveButton().click();

    await vi.waitFor(() => expect(saved).toHaveBeenCalledWith(contract));
    expectCorrection('核对宽度后更正', {});
  });

  it('adds optional production details and disallows matching colors for a two-color specification', async () => {
    mount();
    await selectLine();
    await change('第 1 行宽（mm）', '610');
    await change('更正原因', '宽度与生产规格核对更正');

    await change('第 1 行单色 / 双色', 'DUAL');
    await change('第 1 行正面颜色', 'BK');
    await change('第 1 行反面颜色', 'BK');
    expect(saveButton().disabled).toBe(true);
    await change('第 1 行反面颜色', 'RD');
    await change('第 1 行正面纹路', 'NONE');
    await change('第 1 行反面纹路', 'WAVE');
    await change('第 1 行激光雕刻方式', 'LASER');
    await change('第 1 行激光雕刻图案', 'CENTER');
    await change('第 1 行图稿版本', 'V2');
    expect(saveButton().disabled).toBe(false);

    saveButton().click();
    expectCorrection('宽度与生产规格核对更正', {
      colorMode: 'DUAL',
      frontColor: 'BK',
      backColor: 'RD',
      textureFront: 'NONE',
      textureBack: 'WAVE',
      patternMode: 'LASER',
      patternCode: 'CENTER',
      patternVersion: 'V2',
    });
  });

  it('allows a color-only correction and applies the single color to both faces', async () => {
    mount({
      ...legacyItem,
      widthMm: 610,
      colorMode: 'SINGLE',
      frontColor: 'BK',
      backColor: 'BK',
      textureFront: 'NONE',
      textureBack: 'WAVE',
      patternMode: 'NONE',
    });
    await selectLine();
    await change('更正原因', '颜色更正');
    expect(saveButton().disabled).toBe(true);

    await change('第 1 行正面颜色', 'RD');
    expect(saveButton().disabled).toBe(false);
    saveButton().click();

    expectCorrection('颜色更正', {
      colorMode: 'SINGLE',
      frontColor: 'RD',
      backColor: 'RD',
      textureFront: 'NONE',
      textureBack: 'WAVE',
      patternMode: 'NONE',
    });
  });
});
