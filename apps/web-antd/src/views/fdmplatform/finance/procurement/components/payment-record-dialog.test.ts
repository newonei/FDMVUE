import { createApp, nextTick } from 'vue';

import { afterEach, describe, expect, it, vi } from 'vitest';

import PaymentRecordDialog from './PaymentRecordDialog.vue';

const registerOrderPayment = vi.hoisted(() => vi.fn());
vi.mock('@vben/access', () => ({
  useAccess: () => ({ hasAccessByCodes: () => false }),
}));
vi.mock('#/api/fdmcaiwu/bank-account', () => ({
  listCashAccountOptions: () => Promise.resolve([]),
}));
vi.mock('#/api/fdmplatform/procurement', () => ({
  getProcurementSettings: () =>
    Promise.resolve([
      { id: 'payer-1', name: '付款公司', bankName: '开户银行' },
    ]),
}));
vi.mock('#/api/fdmplatform/procurement-finance', () => ({
  registerOrderPayment,
  PaymentRegistrationCancelledError: class extends Error {},
}));

let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());

function button(text: string) {
  const result = [...document.querySelectorAll('button')].find(
    (entry) => entry.textContent?.trim() === text,
  );
  expect(result).toBeDefined();
  return result!;
}

describe('登记付款弹窗', () => {
  it('可在提交前选择附件，上传失败后保留文件并用同一幂等键重试', async () => {
    const saved = { id: 'payment-1', status: 'SUBMITTED', version: 3 };
    registerOrderPayment
      .mockRejectedValueOnce(new Error('付款凭证上传失败'))
      .mockResolvedValueOnce(saved);
    const onSaved = vi.fn();
    const app = createApp(PaymentRecordDialog, {
      open: true,
      available: '150',
      contractId: 'contract-1',
      orderId: 'order-1',
      supplierName: '供应商',
      onSaved,
    });
    const host = document.createElement('div');
    document.body.append(host);
    app.mount(host);
    cleanup = () => {
      app.unmount();
      host.remove();
    };
    await vi.waitFor(() =>
      expect(
        [...document.querySelectorAll('input')].some(
          (input) => input.value === '开户银行',
        ),
      ).toBe(true),
    );
    const input = document.querySelector<HTMLInputElement>('input[type=file]')!;
    const pick = vi.spyOn(input, 'click').mockImplementation(() => {});
    button('选择附件').click();
    expect(pick).toHaveBeenCalledOnce();
    const file = new File(['voucher'], '打款凭证.pdf');
    Object.defineProperty(input, 'files', { value: [file] });
    input.dispatchEvent(new Event('change'));
    await nextTick();
    expect(document.body.textContent).toContain(file.name);
    expect(registerOrderPayment).not.toHaveBeenCalled();

    button('提交财务审核').click();
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain('付款凭证上传失败'),
    );
    expect(document.body.textContent).toContain(file.name);
    expect(onSaved).not.toHaveBeenCalled();

    button('提交财务审核').click();
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
    expect(registerOrderPayment).toHaveBeenCalledTimes(2);
    expect(registerOrderPayment.mock.calls[1]).toEqual(
      registerOrderPayment.mock.calls[0],
    );
    expect(registerOrderPayment).toHaveBeenLastCalledWith(
      expect.objectContaining({ orderId: 'order-1' }),
      expect.any(String),
      'SUBMIT',
      [file],
    );
  });
});
