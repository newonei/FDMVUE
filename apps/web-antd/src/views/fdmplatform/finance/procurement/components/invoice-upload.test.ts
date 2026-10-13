/* eslint-disable vue/one-component-per-file -- Minimal controls keep the upload flow observable. */
import { createApp, defineComponent, h, nextTick } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import InvoiceUpload from './InvoiceUpload.vue';

const api = vi.hoisted(() => ({ recognize: vi.fn(), create: vi.fn() }));
vi.mock('#/api/fdmplatform/procurement', () => ({
  recognizePurchaseInvoice: api.recognize,
  createPurchaseInvoice: api.create,
}));
vi.mock('ant-design-vue', () => {
  const field = defineComponent({
    props: { value: { type: null, default: undefined } },
    emits: ['update:value'],
    setup(props, { attrs, emit }) {
      return () =>
        h('input', {
          ...attrs,
          value: props.value ?? '',
          onInput: (event: Event) =>
            emit('update:value', (event.target as HTMLInputElement).value),
        });
    },
  });
  return {
    Alert: defineComponent({
      props: { message: { type: String, default: '' } },
      setup: (props) => () => h('div', { role: 'alert' }, props.message),
    }),
    Button: defineComponent({
      setup:
        (_, { attrs, slots }) =>
        () =>
          h('button', attrs, slots.default?.()),
    }),
    Input: field,
    InputNumber: field,
    Select: field,
  };
});

let cleanup: (() => void) | undefined;
beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

async function mount() {
  const host = document.createElement('div');
  document.body.append(host);
  const saved = vi.fn();
  const app = createApp(InvoiceUpload, {
    contractId: 'standalone',
    orderId: 'po-1',
    paymentId: 'pay-1',
    defaultAmount: '300',
    onSaved: saved,
  });
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { host, saved };
}
async function choose(host: Element, name: string) {
  const input = host.querySelector<HTMLInputElement>('input[type=file]')!;
  const file = new File(['%PDF'], name, { type: 'application/pdf' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change'));
  await vi.waitFor(() => expect(host.textContent).toContain(name));
  return file;
}

describe('上传付款发票', () => {
  it('选 PDF 后自动识别带入，保存时连同原件挂到这笔付款', async () => {
    api.recognize.mockResolvedValue({
      recognized: true,
      invoiceNo: '26332000007749697876',
      invoiceDate: '2026-09-08',
      amount: '495.00',
      taxRate: '13',
      invoiceType: 'SPECIAL',
      sellerName: '义乌市健群体育用品有限公司',
    });
    api.create.mockResolvedValue({ id: 'inv-1' });
    const { host, saved } = await mount();
    expect(host.querySelector('button')!.textContent).toContain('上传发票文件');
    const file = await choose(host, '发票.pdf');
    await vi.waitFor(() => expect(host.textContent).toContain('已识别'));
    const save = [...host.querySelectorAll('button')].find((node) =>
      node.textContent?.includes('保存发票'),
    )!;
    save.click();
    await vi.waitFor(() => expect(saved).toHaveBeenCalledOnce());
    expect(api.create).toHaveBeenCalledWith(
      file,
      expect.objectContaining({
        orderId: 'po-1',
        paymentId: 'pay-1',
        invoiceNo: '26332000007749697876',
        invoiceDate: '2026-09-08',
        amount: '495.00',
      }),
    );
  });

  it('图片不识别，保留默认金额让采购员核对后保存', async () => {
    api.create.mockResolvedValue({ id: 'inv-2' });
    const { host } = await mount();
    await choose(host, '发票.jpg');
    await nextTick();
    expect(api.recognize).not.toHaveBeenCalled();
    expect(host.textContent).toContain('不能自动识别');
    [...host.querySelectorAll('button')]
      .find((node) => node.textContent?.includes('保存发票'))!
      .click();
    await vi.waitFor(() => expect(api.create).toHaveBeenCalledOnce());
    expect(api.create.mock.calls[0]![1]).toMatchObject({
      amount: '300',
      invoiceNo: undefined,
    });
  });
});
