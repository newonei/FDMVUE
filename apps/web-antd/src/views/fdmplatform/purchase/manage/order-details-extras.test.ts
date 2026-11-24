/* eslint-disable vue/one-component-per-file -- Small adapters exercise the actual details and extras boundary. */
import type { ProcurementOrderView } from '#/api/fdmplatform/procurement';

import { createApp, defineComponent, h, nextTick, ref } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getProcurementSettings,
  getSupplierContacts,
} from '#/api/fdmplatform/procurement';

import OrderDetails from './components/OrderDetails.vue';

const extras = vi.hoisted(() => ({
  payload: {
    lineExtras: [],
    detailColumns: [{ id: 'remark', title: '备注', type: 'TEXT' }],
    additionalLines: [{ id: 'fee', name: '加工费' }],
    sharedColumns: [],
    accessories: [],
    packagingSteps: [],
  },
}));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('#/api/fdmplatform/procurement', () => ({
  getProcurementSettings: vi.fn().mockResolvedValue([]),
  getSupplierContacts: vi.fn().mockResolvedValue([]),
}));
vi.mock('#/components/fdm-resizable-drawer', () => ({
  FdmResizableDrawer: defineComponent({ render: () => null }),
}));
vi.mock('./components/SupplierContacts.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('./components/OrderPrintExtras.vue', () => ({
  default: defineComponent({
    props: { disabled: Boolean, saving: Boolean },
    emits: ['save', 'dirty', 'busy'],
    setup: (props, ctx) => {
      ctx.expose({ payload: () => extras.payload, markSaved: vi.fn() });
      return () =>
        h(
          'button',
          {
            'data-extras': true,
            disabled: props.disabled,
            onClick: () => ctx.emit('save'),
          },
          '保存采购单附加资料',
        );
    },
  }),
}));
vi.mock('ant-design-vue', () => {
  const Wrap = defineComponent({
    setup: (_, ctx) => () => h('div', ctx.slots.default?.()),
  });
  const Input = defineComponent({
    props: ['value', 'disabled'],
    emits: ['update:value'],
    setup: (props, ctx) => () =>
      h('input', {
        ...ctx.attrs,
        value: props.value,
        disabled: props.disabled,
        onInput: (event: Event) =>
          ctx.emit('update:value', (event.target as HTMLInputElement).value),
      }),
  });
  return {
    Alert: defineComponent({
      props: { message: String },
      setup: (props) => () => h('p', props.message),
    }),
    Button: defineComponent({
      props: { disabled: Boolean },
      setup: (props, ctx) => () =>
        h('button', { disabled: props.disabled }, ctx.slots.default?.()),
    }),
    Card: Wrap,
    Form: Object.assign(Wrap, { Item: Wrap }),
    Input,
    Select: Wrap,
    Space: Wrap,
    Tag: Wrap,
    Textarea: Input,
  };
});
function fixture(actions: string[]): ProcurementOrderView {
  return {
    id: 'order-1',
    order: { supplierId: 'supplier-1' },
    details: {
      version: 1,
      status: 'CONFIRMED',
      deliveryAddress: '原交货地址',
      deliveryDate: '2026-11-28',
      documentDate: '2026-11-18',
      purchaseDate: '2026-11-17',
      subject: 'NB-202611-18',
      clauseIds: [],
    },
    allowedActions: actions,
    blockReasons: [],
  } as unknown as ProcurementOrderView;
}
const cleanup: (() => void)[] = [];
beforeEach(() => {
  vi.mocked(getProcurementSettings).mockReset().mockResolvedValue([]);
  vi.mocked(getSupplierContacts).mockReset().mockResolvedValue([]);
});
afterEach(() => cleanup.splice(0).forEach((dispose) => dispose()));
async function mount(actions: string[]) {
  const view = ref(fixture(actions));
  const saved = vi.fn();
  const savedDetails = vi.fn();
  const confirmed = vi.fn();
  const details = ref<InstanceType<typeof OrderDetails>>();
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () =>
      h(OrderDetails, {
        ref: details,
        view: view.value,
        saving: false,
        onConfirm: confirmed,
        onSave: savedDetails,
        onSaveExtras: saved,
      }),
  });
  app.mount(host);
  cleanup.push(() => {
    app.unmount();
    host.remove();
  });
  await Promise.resolve();
  await nextTick();
  return { host, view, saved, savedDetails, confirmed, details };
}

describe('independent procurement extras saving', () => {
  function defaultSettings() {
    vi.mocked(getProcurementSettings).mockImplementation(async (kind) => {
      const item = {
        id: kind,
        active: true,
        ...(kind === 'entities'
          ? { legalName: '签约公司', address: '签约地址' }
          : {}),
        ...(kind === 'templates' ? { requiredClauseGroups: ['payment'] } : {}),
        ...(kind === 'clauses' ? { groupCode: 'payment' } : {}),
      };
      return [item] as Awaited<ReturnType<typeof getProcurementSettings>>;
    });
  }

  it('下单资料要求采购日期，允许清空交付日期后保存和确认', async () => {
    defaultSettings();
    vi.mocked(getSupplierContacts).mockResolvedValue([
      { id: 'contact-1', active: true, defaultContact: true, phone: '12345' },
    ] as Awaited<ReturnType<typeof getSupplierContacts>>);
    const { host, savedDetails, confirmed } = await mount([
      'SAVE_DETAILS',
      'CONFIRM_DETAILS',
    ]);
    const button = (label: string) =>
      [...host.querySelectorAll('button')].find(
        (item) => item.textContent?.trim() === label,
      )!;
    const fillDate = (field: string, value: string) => {
      const input = host.querySelector<HTMLInputElement>(
        `#order-details-${field}-date`,
      )!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    expect(host.querySelector('#order-details-document-date')).toBeNull();
    fillDate('purchase', '');
    await nextTick();
    button('先存草稿').click();
    expect(savedDetails).not.toHaveBeenCalled();
    expect(button('确认下单资料').disabled).toBe(true);

    fillDate('purchase', '2026-11-17');
    fillDate('delivery', '');
    await nextTick();
    button('先存草稿').click();
    button('确认下单资料').click();
    const dates = {
      deliveryDate: '',
      purchaseDate: '2026-11-17',
    };
    expect(savedDetails).toHaveBeenCalledWith(expect.objectContaining(dates));
    expect(confirmed).toHaveBeenCalledWith(expect.objectContaining(dates));
    expect(savedDetails.mock.calls[0]![0]).not.toHaveProperty('documentDate');
    expect(confirmed.mock.calls[0]![0]).not.toHaveProperty('documentDate');
  });

  it('保存下单资料时可以修改采购主题', async () => {
    const { host, view, savedDetails, details } = await mount(['SAVE_DETAILS']);
    const subject = host.querySelector<HTMLInputElement>(
      '#order-details-subject',
    )!;
    expect(subject.value).toBe('NB-202611-18');
    expect(details.value?.isDirty()).toBe(false);

    subject.value = 'NB-202611-18 瑜伽垫包装';
    subject.dispatchEvent(new Event('input'));
    await nextTick();
    expect(details.value?.pendingSave()).toMatchObject({
      action: 'SAVE_DETAILS',
      payload: { subject: subject.value },
    });
    [...host.querySelectorAll('button')]
      .find((button) => button.textContent?.trim() === '先存草稿')!
      .click();
    expect(savedDetails).toHaveBeenCalledWith(
      expect.objectContaining({ subject: subject.value }),
    );

    view.value = {
      ...view.value,
      details: { ...view.value.details, subject: subject.value, version: 2 },
    };
    await nextTick();
    details.value?.markSaved('SAVE_DETAILS');
    expect(subject.value).toBe('NB-202611-18 瑜伽垫包装');
    expect(details.value?.isDirty()).toBe(false);
  });

  it('does not count automatically selected settings and contacts as edits', async () => {
    defaultSettings();
    vi.mocked(getSupplierContacts).mockResolvedValue([
      { id: 'contact-1', active: true, defaultContact: true },
    ] as Awaited<ReturnType<typeof getSupplierContacts>>);
    const { host, details } = await mount(['SAVE_DETAILS']);
    await nextTick();
    expect(details.value?.isDirty()).toBe(false);
    const address = host.querySelector<HTMLInputElement>(
      'input[placeholder="不填则按合同约定"]',
    )!;
    address.value = '新地址';
    address.dispatchEvent(new Event('input'));
    await nextTick();
    expect(details.value?.pendingSave().payload).toMatchObject({
      contactId: 'contact-1',
      signingEntityId: 'entities',
      templateId: 'templates',
      clauseIds: ['clauses'],
    });
    expect(details.value?.isDirty()).toBe(true);
  });

  it('keeps a user edit dirty when defaults finish loading and clears it on revert', async () => {
    let resolveContacts!: (
      value: Awaited<ReturnType<typeof getSupplierContacts>>,
    ) => void;
    vi.mocked(getSupplierContacts).mockReturnValue(
      new Promise((resolve) => {
        resolveContacts = resolve;
      }),
    );
    const { host, details } = await mount(['SAVE_DETAILS']);
    const address = host.querySelector<HTMLInputElement>(
      'input[placeholder="不填则按合同约定"]',
    )!;
    address.value = '修改后的地址';
    address.dispatchEvent(new Event('input'));
    resolveContacts([
      { id: 'contact-1', active: true, defaultContact: true },
    ] as Awaited<ReturnType<typeof getSupplierContacts>>);
    await Promise.resolve();
    await nextTick();
    expect(details.value?.isDirty()).toBe(true);
    address.value = '原交货地址';
    address.dispatchEvent(new Event('input'));
    await nextTick();
    expect(details.value?.isDirty()).toBe(false);
  });

  it('allows confirmed details to save only the six extras fields', async () => {
    const { host, saved } = await mount(['SAVE_EXTRAS']);
    expect(
      host.querySelector<HTMLInputElement>('#order-details-subject')?.disabled,
    ).toBe(true);
    const button = host.querySelector<HTMLButtonElement>('[data-extras]')!;
    expect(button.disabled).toBe(false);
    button.click();
    expect(saved).toHaveBeenCalledWith(extras.payload);
    expect(saved.mock.calls[0]![0]).not.toHaveProperty('status');
    expect(saved.mock.calls[0]![0]).not.toHaveProperty('deliveryAddress');
  });

  it('keeps extras disabled when the backend does not allow that action', async () => {
    const { host, saved } = await mount([]);
    host.querySelector<HTMLButtonElement>('[data-extras]')!.click();
    expect(saved).not.toHaveBeenCalled();
  });

  it('preserves unfinished delivery edits when extras save updates the version', async () => {
    const { host, view, details } = await mount([
      'SAVE_EXTRAS',
      'SAVE_DETAILS',
    ]);
    const address = host.querySelector<HTMLInputElement>(
      'input[placeholder="不填则按合同约定"]',
    )!;
    address.value = '尚未保存的新交货地址';
    address.dispatchEvent(new Event('input'));
    await nextTick();
    expect(details.value?.isDirty()).toBe(true);
    view.value = {
      ...view.value,
      details: { ...view.value.details, version: 2 },
    };
    await nextTick();
    details.value?.markSaved('SAVE_EXTRAS');
    expect(address.value).toBe('尚未保存的新交货地址');
    expect(details.value?.isDirty()).toBe(true);
    expect(details.value?.pendingSave()).toMatchObject({
      action: 'SAVE_DETAILS',
      payload: { deliveryAddress: '尚未保存的新交货地址' },
    });
    details.value?.markSaved('SAVE_DETAILS');
    expect(details.value?.isDirty()).toBe(false);
  });
});
