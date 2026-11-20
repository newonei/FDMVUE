import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  procurementFinanceAction,
  registerInvoicePayment,
  registerOrderPayment,
  registerOtherPayment,
} from './procurement-finance';

const post = vi.hoisted(() => vi.fn());
vi.mock('#/api/request', () => ({ requestClient: { post } }));
vi.mock('#/components/upload-task', () => ({
  LARGE_FILE_TIMEOUT: 1000,
  withUploadProgress: (_files: File[], upload: () => unknown) => upload(),
}));

const base = '/fdmplatform/v1/procurement-finance';
const submissions = '/fdmplatform/v1/submissions/procurement-finance';
const fields = {
  amount: '50',
  paidAt: '2026-11-20',
  payeeName: '供应商',
  payerAccount: '对公银行账户',
  payerEntityId: 'payer',
};
const order = { ...fields, contractId: '', orderId: 'order-1' };
const file = () => new File(['voucher'], '付款凭证.pdf');

beforeEach(() => post.mockReset());

describe('付款登记附件', () => {
  it.each([
    {
      register: (files: File[]) =>
        registerOrderPayment(order, 'payment', 'SUBMIT', files),
      sourceType: 'PURCHASE_ORDER',
      action: 'SUBMIT',
    },
    {
      register: (files: File[]) =>
        registerInvoicePayment(
          { ...fields, invoiceId: 'invoice-1' },
          'payment',
          'CONFIRM',
          files,
        ),
      sourceType: 'PURCHASE_INVOICE',
      action: 'CONFIRM',
    },
    {
      register: (files: File[]) =>
        registerOtherPayment({ ...fields, currency: 'CNY' }, 'payment', files),
      sourceType: 'OTHER',
      action: 'CONFIRM',
    },
  ])(
    '先为 $sourceType 保存附件，再执行 $action',
    async ({ register, sourceType, action }) => {
      const saved = { id: 'payment-1', version: 4, status: 'SUBMITTED' };
      post
        .mockResolvedValueOnce({ ...saved, version: 3, status: 'DRAFT' })
        .mockResolvedValueOnce(saved);
      const attachment = file();

      await expect(register([attachment])).resolves.toBe(saved);

      expect(post).toHaveBeenCalledTimes(2);
      const [url, form] = post.mock.calls[0] as [string, FormData];
      expect(url).toBe(submissions);
      expect(
        JSON.parse(await (form.get('request') as Blob).text()),
      ).toMatchObject({
        type: 'PAYMENT',
        idempotencyKey: 'payment:create',
        payload: { ...fields, sourceType },
      });
      expect((form.getAll('files') as File[]).map(({ name }) => name)).toEqual([
        attachment.name,
      ]);
      expect(post).toHaveBeenNthCalledWith(2, `${base}/payment-1/actions`, {
        action,
        expectedVersion: 3,
        idempotencyKey: `payment:${action.toLowerCase()}`,
        payload: {},
      });
    },
  );

  it('附件保存失败时直接返回错误，不提交付款', async () => {
    const error = new Error('凭证上传失败');
    post.mockRejectedValueOnce(error);
    await expect(
      registerOrderPayment(order, 'payment', 'SUBMIT', [file()]),
    ).rejects.toBe(error);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('无附件时沿用 JSON 登记接口', async () => {
    post
      .mockResolvedValueOnce({ id: 'payment-1', version: 0, status: 'DRAFT' })
      .mockResolvedValueOnce({
        id: 'payment-1',
        version: 1,
        status: 'SUBMITTED',
      });
    await registerOrderPayment(order, 'payment');
    expect(post).toHaveBeenNthCalledWith(1, base, {
      type: 'PAYMENT',
      idempotencyKey: 'payment:create',
      payload: {
        ...order,
        contractId: undefined,
        sourceType: 'PURCHASE_ORDER',
      },
    });
  });

  it('修改付款时将表单与新附件一并提交', async () => {
    const saved = { id: 'payment-1', version: 5, status: 'REJECTED' };
    const command = {
      action: 'UPDATE',
      expectedVersion: 3,
      idempotencyKey: 'payment:update',
      payload: { ...fields, evidenceRefs: ['original-proof'] },
    };
    post.mockResolvedValueOnce(saved);

    await expect(
      procurementFinanceAction(saved.id, command, [file()]),
    ).resolves.toBe(saved);
    const [url, form] = post.mock.calls[0] as [string, FormData];
    expect(url).toBe(`${submissions}/payment-1/actions`);
    expect(JSON.parse(await (form.get('request') as Blob).text())).toEqual(
      command,
    );
    expect(form.getAll('files')).toHaveLength(1);
  });
});
