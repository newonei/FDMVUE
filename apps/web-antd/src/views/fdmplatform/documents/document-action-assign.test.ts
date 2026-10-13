/* eslint-disable vue/one-component-per-file -- Minimal stand-ins keep the routing observable. */
import { createApp, defineComponent, h, nextTick } from 'vue';

import { afterEach, describe, expect, it, vi } from 'vitest';

import DocumentAction from './DocumentAction.vue';

const api = vi.hoisted(() => ({ getContract: vi.fn() }));
vi.mock('#/api/fdmplatform', () => ({
  getContract: api.getContract,
  getAttachments: vi.fn(),
  getDirectory: vi.fn(),
  newIdempotencyKey: () => 'key',
}));
vi.mock('../purchase/tasks/RequestAssignDialog.vue', () => ({
  default: defineComponent({
    props: {
      open: Boolean,
      contractId: { type: String, default: undefined },
      requestId: { type: String, default: undefined },
    },
    emits: ['close', 'saved'],
    setup:
      (props, { emit }) =>
      () =>
        props.open
          ? h(
              'section',
              {
                'data-assign': true,
                'data-contract': props.contractId,
                'data-request': props.requestId ?? '',
              },
              [
                h(
                  'button',
                  { onClick: () => emit('saved', { id: 'c1' }) },
                  '确认分派',
                ),
              ],
            )
          : null,
  }),
}));
vi.mock('./ContractPicker.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('../components/ActionDialog.vue', () => ({
  default: defineComponent({
    props: { open: Boolean },
    setup: (props) => () =>
      props.open ? h('section', { 'data-old-form': true }) : null,
  }),
}));

let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.clearAllMocks();
});

function mount(props: Record<string, unknown>) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(DocumentAction, props);
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

describe('分派采购任务只分单', () => {
  it('从合同订单的申请进来，直接弹出只选采购员的分派弹窗', async () => {
    const updated = vi.fn();
    const closed = vi.fn();
    const host = mount({
      open: true,
      kind: 'tasks',
      action: 'ASSIGN_FULFILLMENT',
      contractId: 'c1',
      lockContract: true,
      source: { kind: 'requests', id: 'r1' },
      onUpdated: updated,
      onClose: closed,
    });
    await nextTick();
    const dialog = host.querySelector<HTMLElement>('[data-assign]')!;
    expect(dialog.dataset.contract).toBe('c1');
    expect(dialog.dataset.request).toBe('r1');
    expect(host.querySelector('[data-old-form]')).toBeNull();
    expect(api.getContract).not.toHaveBeenCalled();
    host.querySelector('button')!.click();
    await nextTick();
    expect(updated).toHaveBeenCalledWith({ id: 'c1' });
    expect(closed).toHaveBeenCalledOnce();
  });

  it('没有指定申请时也走同一个弹窗，在弹窗里选申请', async () => {
    const host = mount({
      open: true,
      kind: 'tasks',
      action: 'ASSIGN_FULFILLMENT',
      contractId: 'c1',
      lockContract: true,
    });
    await nextTick();
    expect(
      host.querySelector<HTMLElement>('[data-assign]')!.dataset.request,
    ).toBe('');
  });
});
