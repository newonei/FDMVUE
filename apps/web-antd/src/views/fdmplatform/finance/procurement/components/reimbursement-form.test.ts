import { describe, expect, it } from 'vitest';

import {
  copyReimbursementLine,
  reimbursementDraft,
  reimbursementFiles,
  reimbursementPayload,
  reimbursementTotal,
  validateReimbursement,
} from './reimbursement-form';

let key = 0;
function readyDraft() {
  return reimbursementDraft(
    {
      name: '样品寄送费用',
      currency: 'CNY',
      expenseEntityId: 'cost-company',
      payerEntityId: 'pay-company',
      advanceUserName: '垫付人',
      payeeName: '收款人',
      payeeAccount: '账户',
      expenses: [
        {
          category: 'TRANSPORT',
          amount: '0.10',
          expenseDate: '2026-09-18',
          evidenceRef: 'saved-voucher',
        },
      ],
    },
    () => `line-${++key}`,
  );
}
describe('报销编辑器金额、来源和行凭证', () => {
  it('费用公司与付款公司独立保存，不编造申请人和入账状态', () => {
    const draft = readyDraft();
    const body = reimbursementPayload(draft);
    expect(body).toMatchObject({
      expenseEntityId: 'cost-company',
      payerEntityId: 'pay-company',
    });
    expect(body).not.toHaveProperty('createdBy');
    expect(body).not.toHaveProperty('createdAt');
    expect(body).not.toHaveProperty('status');
    expect(body).not.toHaveProperty('costStatus');
  });
  it('按币种精确汇总，精度非法不显示伪零或擅自四舍五入', () => {
    const draft = readyDraft();
    draft.expenses.push({
      ...draft.expenses[0]!,
      localKey: 'other',
      amount: '0.20',
    });
    expect(reimbursementTotal(draft)).toBe('0.30');
    draft.expenses[0]!.amount = '0.001';
    expect(reimbursementTotal(draft)).toBe('—');
    expect(validateReimbursement(draft, false)?.message).toContain('2 位小数');
    draft.currency = 'JPY';
    draft.expenses[0]!.amount = '1.5';
    expect(validateReimbursement(draft, false)?.message).toContain('0 位小数');
  });
  it('多行上传按files数组显式定位，保留已有行凭证，删除行后索引重排', () => {
    const draft = readyDraft();
    const fileA = new File(['A'], 'first.pdf');
    const fileB = new File(['B'], 'second.pdf');
    draft.expenses.push(
      {
        ...draft.expenses[0]!,
        localKey: 'new-a',
        pendingFile: fileA,
      },
      {
        ...draft.expenses[0]!,
        localKey: 'new-b',
        pendingFile: fileB,
      },
    );
    expect(reimbursementFiles(draft)).toEqual([fileA, fileB]);
    expect(reimbursementPayload(draft).expenses).toMatchObject([
      { evidenceRef: 'saved-voucher' },
      { evidenceRef: '', evidenceFileIndex: 0 },
      { evidenceRef: '', evidenceFileIndex: 1 },
    ]);
    draft.expenses.splice(1, 1);
    expect(reimbursementFiles(draft)).toEqual([fileB]);
    expect(reimbursementPayload(draft).expenses).toMatchObject([
      { evidenceRef: 'saved-voucher' },
      { evidenceRef: '', evidenceFileIndex: 0 },
    ]);
  });
  it('复制费用清除服务端身份、票据和本地File，保留业务信息', () => {
    const line = readyDraft().expenses[0]!;
    line.id = 'expense-id';
    line.sourceKey = 'source';
    line.pendingFile = new File(['x'], 'voucher.pdf');
    line.contractId = 'contract';
    const copied = copyReimbursementLine(line, 'copy');
    expect(copied).toMatchObject({
      localKey: 'copy',
      contractId: 'contract',
      amount: '0.10',
      evidenceRef: '',
    });
    expect(copied.id).toBeUndefined();
    expect(copied.sourceKey).toBeUndefined();
    expect(copied.pendingFile).toBeUndefined();
    expect(line.pendingFile).toBeDefined();
  });
  it('草稿允许缺凭证和收款资料，提交严格校验并定位对应费用行', () => {
    const draft = readyDraft();
    draft.expenses[0]!.evidenceRef = '';
    draft.payeeName = '';
    expect(validateReimbursement(draft, false, '2026-09-18')).toBeUndefined();
    expect(validateReimbursement(draft, true, '2026-09-18')).toMatchObject({
      field: `line-${draft.expenses[0]!.localKey}-file`,
    });
    draft.expenses[0]!.pendingFile = new File(['x'], 'voucher.pdf');
    expect(validateReimbursement(draft, true, '2026-09-18')?.field).toBe(
      'payeeName',
    );
    draft.payeeName = '收款人';
    expect(reimbursementPayload(draft)).not.toHaveProperty('handlerUserId');
    expect(validateReimbursement(draft, true, '2026-09-18')).toBeUndefined();
  });
  it('防止未来日期、负数费用、采购货款重复报销，以及漏选合同产品', () => {
    const draft = readyDraft();
    const line = draft.expenses[0]!;
    line.expenseDate = '2026-09-19';
    expect(validateReimbursement(draft, true, '2026-09-18')?.message).toContain(
      '不能晚于今天',
    );
    line.expenseDate = '2026-09-18';
    line.amount = '-1';
    expect(validateReimbursement(draft, true, '2026-09-18')?.message).toContain(
      '大于零',
    );
    line.amount = '2';
    line.category = 'PURCHASE';
    expect(validateReimbursement(draft, true, '2026-09-18')?.message).toContain(
      '采购请款',
    );
    line.category = 'TRANSPORT';
    line.contractId = 'contract';
    expect(validateReimbursement(draft, true, '2026-09-18')?.message).toContain(
      '归属产品',
    );
  });
  it('独立费用不伪造合同关联，从合同入口新建时带入首行来源', () => {
    expect(reimbursementPayload(readyDraft()).contractId).toBeUndefined();
    const source = reimbursementDraft(
      { contractId: 'contract', orderId: 'order' },
      () => 'key',
    );
    expect(source.expenses[0]).toMatchObject({
      contractId: 'contract',
      orderId: 'order',
    });
  });
});
