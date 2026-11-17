/* eslint-disable vue/one-component-per-file -- Small adapters exercise the actual details and extras boundary. */
import type { ProcurementOrderView } from '#/api/fdmplatform/procurement';

import { createApp, defineComponent, h, nextTick, ref } from 'vue';

import { afterEach, describe, expect, it, vi } from 'vitest';

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
    Alert: Wrap,
    Button: Wrap,
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
      clauseIds: [],
    },
    allowedActions: actions,
    blockReasons: [],
  } as unknown as ProcurementOrderView;
}
const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach((dispose) => dispose()));
async function mount(actions: string[]) {
  const view = ref(fixture(actions));
  const saved = vi.fn();
  const details = ref<InstanceType<typeof OrderDetails>>();
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () =>
      h(OrderDetails, {
        ref: details,
        view: view.value,
        saving: false,
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
  return { host, view, saved, details };
}

describe('independent procurement extras saving', () => {
  it('allows confirmed details to save only the six extras fields', async () => {
    const { host, saved } = await mount(['SAVE_EXTRAS']);
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
