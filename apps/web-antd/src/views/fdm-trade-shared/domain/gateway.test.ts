import { describe, expect, it } from 'vitest';

import { TradePrototypeGateway } from './gateway';
import {
  createTradePrototypeSeed,
  FORMULA_ORDER_ID,
  FULFILMENT_ORDER_ID,
  MAIN_ORDER_ID,
} from './mock-data';

const fixedNow = () => new Date('2026-08-27T08:00:00.000Z');

function createGateway() {
  return new TradePrototypeGateway({ now: fixedNow });
}

describe('foreign-trade prototype gateway', () => {
  it('keeps the 1000 USD receipt and write-off formula exact', async () => {
    const gateway = createGateway();
    const summary = await gateway.getReceivableSummary(FORMULA_ORDER_ID);

    expect(summary).toEqual({
      actualReceiptAmount: '600.00',
      consumedBalanceAmount: '100.00',
      contractAmount: '1000.00',
      outstandingAmount: '280.00',
      waiverAmount: '20.00',
      writeOffAmount: '720.00',
    });
  });

  it('lets a human edit an AI draft but blocks an unbalanced confirmation', async () => {
    const gateway = createGateway();
    const draft = await gateway.generateDemandDraft(MAIN_ORDER_ID);
    const line = draft.lines[0]!;

    const edited = await gateway.updateDemandSplit(
      draft.id,
      line.id,
      { factoryQty: '4400', purchaseQty: '0', stockQty: '500' },
      '林晓月',
    );
    expect(edited.status).toBe('AI_DRAFT');
    await expect(
      gateway.confirmDemandSplit(draft.id, '林晓月'),
    ).rejects.toMatchObject({
      code: 'RULE_VIOLATION',
    });

    await gateway.updateDemandSplit(
      draft.id,
      line.id,
      { factoryQty: '4500', purchaseQty: '0', stockQty: '500' },
      '林晓月',
    );
    const result = await gateway.confirmDemandSplit(draft.id, '林晓月');
    expect(result.analysis.status).toBe('CONFIRMED');
    expect(result.factoryTasks.length).toBeGreaterThan(0);
    expect(result.factoryTasks.every((task) => task.status === 'DRAFT')).toBe(
      true,
    );
    expect(
      result.purchaseRequisitions.every(
        (requisition) => requisition.status === 'DRAFT',
      ),
    ).toBe(true);

    const requisition = result.purchaseRequisitions[0]!;
    const requisitionLine = requisition.lines[0]!;
    const supplierId = requisitionLine.suggestions[0]!.supplierId;
    const adoption = await gateway.adoptSupplierSuggestion(
      requisition.id,
      requisitionLine.id,
      supplierId,
      '采购员赵敏',
    );
    expect(adoption.purchaseOrder.status).toBe('DRAFT');
  });

  it('adopts a supplier suggestion into a purchase order draft only', async () => {
    const gateway = createGateway();
    const result = await gateway.adoptSupplierSuggestion(
      'PR-202608-012',
      'PRL-012-01',
      'SUP-0041',
      '采购员赵敏',
    );

    expect(result.requisition.status).toBe('SOURCED');
    expect(result.purchaseOrder.status).toBe('DRAFT');
    expect(result.purchaseOrder.supplierId).toBe('SUP-0041');
    expect(result.purchaseOrder.totalAmount).toBe('5900.00');
  });

  it('creates shipment, outbound and follow-up drafts in one command', async () => {
    const gateway = createGateway();
    const demand = await gateway.generateDemandDraft(MAIN_ORDER_ID);
    await gateway.confirmDemandSplit(demand.id, '林晓月');
    const result = await gateway.createShipmentDraft(
      {
        batch: '首批演示',
        eta: '2026-11-01',
        etd: '2026-10-20',
        lines: [
          {
            orderLineId: 'SOL-018-01',
            quantity: '5000',
            sources: [
              {
                quantity: '500',
                sourceLocation: '武汉成品仓',
                sourceType: 'WAREHOUSE',
              },
              {
                quantity: '4500',
                sourceLocation: '黄石飞德慕工厂',
                sourceType: 'FACTORY',
              },
            ],
          },
        ],
        orderId: MAIN_ORDER_ID,
        owner: '赵敏',
      },
      '林晓月',
    );

    expect(result.shipment.status).toBe('DRAFT');
    expect(result.outboundDocuments).toHaveLength(2);
    expect(
      result.outboundDocuments.every((document) => document.status === 'DRAFT'),
    ).toBe(true);
    expect(result.followUpTask.status).toBe('DRAFT');
    expect(result.followUpTask.aiReadiness).toBe('NOT_CHECKED');
  });

  it('checks customs readiness without formally advancing the task', async () => {
    const gateway = createGateway();
    const before = gateway
      .getSnapshot()
      .followUpTasks.find((task) => task.id === 'FUP-202608-011')!;
    const checked = await gateway.checkCustomsReadiness(before.id);

    expect(checked.readiness).toBe('BLOCKED');
    expect(checked.missingDocumentIds).toEqual(['DOC-PL-011']);
    expect(checked.task.status).toBe(before.status);
    expect(checked.task.stage).toBe(before.stage);
  });

  it('records actual receipt, balance consumption and waiver separately', async () => {
    const state = createTradePrototypeSeed();
    state.receipts = state.receipts.filter(
      (receipt) => receipt.id !== 'RC-202608-1000',
    );
    state.receiptAllocations = state.receiptAllocations.filter(
      (allocation) => allocation.orderId !== FORMULA_ORDER_ID,
    );
    state.writeOffItems = state.writeOffItems.filter(
      (item) => item.orderId !== FORMULA_ORDER_ID,
    );
    const gateway = new TradePrototypeGateway({
      initialState: state,
      now: fixedNow,
    });

    const result = await gateway.recordReceiptAndWriteOff({
      account: '中国银行武汉分行 · USD 账户',
      actor: '财务王婷',
      actualAmount: '600.00',
      consumedBalanceAmount: '100.00',
      currency: 'USD',
      orderId: FORMULA_ORDER_ID,
      payer: 'Balance Lab Trading Ltd',
      rate: '7.18',
      receivedAt: '2026-08-27',
      waiverAmount: '20.00',
    });

    expect(result.receipt.amount).toBe('600.00');
    expect(result.receipt.cnyAmount).toBe('4308.00');
    expect(result.allocations[0]?.amount).toBe('600.00');
    expect(result.writeOffItems.map((item) => item.amount)).toEqual([
      '100.00',
      '20.00',
    ]);
    expect(result.summary.writeOffAmount).toBe('720.00');
    expect(result.summary.outstandingAmount).toBe('280.00');
  });

  it('updates factory progress with hard upper-bound enforcement', async () => {
    const gateway = createGateway();
    const completed = await gateway.updateFactoryTaskProgress(
      'FT-202607-011',
      '2400',
      '王工',
    );
    expect(completed.status).toBe('COMPLETED');

    await expect(
      gateway.updateFactoryTaskProgress('FT-202607-011', '2400.01'),
    ).rejects.toMatchObject({
      code: 'RULE_VIOLATION',
    });
  });

  it('returns the transitive order-centered document relations', async () => {
    const gateway = createGateway();
    const relations = await gateway.getOrderRelations(FULFILMENT_ORDER_ID);
    expect(
      relations.some((relation) => relation.fromId === 'PO-202608-028'),
    ).toBe(true);
    expect(
      relations.some((relation) => relation.toId === FULFILMENT_ORDER_ID),
    ).toBe(true);
  });
});
