import type { PurchaseInvoice } from '#/api/fdmplatform/procurement';

import { h } from 'vue';

import { Input, message, Modal } from 'ant-design-vue';

import { voidPurchaseInvoice } from '#/api/fdmplatform/procurement';

/** 作废付款发票：填原因后作废，记录保留、不再计入收票合计。采购单抽屉和付款发票列表共用。 */
export function confirmVoidInvoice(
  invoice: PurchaseInvoice,
  onVoided: () => Promise<void> | void,
) {
  let reason = '';
  Modal.confirm({
    title: `作废发票 ${invoice.invoiceNo || invoice.file?.name || ''}？`,
    content: () =>
      h('div', [
        h(
          'p',
          '作废后不再计入收票合计，记录保留。识别错的发票作废后重新上传。',
        ),
        h(Input, {
          placeholder: '作废原因（必填）',
          'onUpdate:value': (value: string) => {
            reason = value;
          },
        }),
      ]),
    okText: '作废',
    okButtonProps: { danger: true },
    onOk: async () => {
      if (!reason.trim()) {
        message.error('请填写作废原因');
        throw new Error('missing reason');
      }
      await voidPurchaseInvoice(invoice.id, {
        idempotencyKey: crypto.randomUUID(),
        reason: reason.trim(),
      });
      message.success('发票已作废');
      await onVoided();
    },
  });
}
