import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(
    resolve(
      process.cwd(),
      `apps/web-antd/src/views/fdmwaimao/receipt-record/${path}`,
    ),
    'utf8',
  );
}

const hubSource = source('index.vue');
const bankSource = source('components/BankReceiptWorkspace.vue');
const bankEditorSource = source('components/BankReceiptEditModal.vue');
const allocationSource = source('components/ReceiptAllocationWorkspace.vue');
const directFormSource = source('form/index.vue');
const draftSource = source('components/ReceiptAllocationDraftModal.vue');
const aiSource = source('components/ReceiptAllocationGenerationModal.vue');
const sharedDocumentSource = readFileSync(
  resolve(
    process.cwd(),
    'apps/web-antd/src/views/fdm-trade-shared/components/DocumentDetailContent.vue',
  ),
  'utf8',
);

describe('bank receipt and allocation UI safety boundary', () => {
  it('exposes direct receipt as the sole cash workspace', () => {
    expect(hubSource).toContain("label: '回款记录'");
    expect(hubSource).toContain("label: '消费 / 冲销记录'");
    expect(hubSource).toContain('新增回款记录');
    expect(hubSource).toContain("'/fdmwaimao/receipt-record/create'");
    expect(hubSource).not.toContain("label: '银行到账'");
    expect(hubSource).not.toContain("label: '到账分配'");
    expect(hubSource).not.toContain('BankReceiptWorkspace');
    expect(hubSource).not.toContain('ReceiptAllocationWorkspace');
    expect(hubSource).not.toMatch(/旧直接回款|兼容入口|兼容流程/);
  });

  it('uses direct receipt terminology in shared document details', () => {
    expect(sharedDocumentSource).toContain('title="回款与合同冲销"');
    expect(sharedDocumentSource).toContain('现金回款按已生效的回款记录统计');
    expect(sharedDocumentSource).not.toContain('银行到账与订单分配');
  });

  it('syncs authorized and removed workspaces into the canonical route', () => {
    const mounted = hubSource.match(
      /onMounted\(async \(\) => \{[\s\S]*?\n\}\);/,
    )?.[0];

    expect(mounted).toContain('selectAuthorizedReceiptWorkspace');
    expect(mounted).toContain('authorizedWorkspace !== activeWorkspace.value');
    expect(mounted).toContain('route.query.workspace !== authorizedWorkspace');
    expect(mounted).toContain('await syncWorkspaceRoute(authorizedWorkspace)');
  });

  it('never routes bank arrival through the legacy direct-receipt API', () => {
    expect(bankSource).toContain('getBankReceiptPage');
    expect(bankSource).toContain('voidBankReceipt');
    expect(bankEditorSource).toContain('createBankReceipt');
    expect(bankEditorSource).toContain('updateBankReceipt');
    expect(bankSource).not.toContain('createReceiptRecord');
    expect(bankEditorSource).not.toContain('createReceiptRecord');
    expect(bankSource).toContain('同一笔银行流水登记旧直接回款');
  });

  it('submits manual allocation facts without browser-owned FX or generation internals', () => {
    const saveHandler = draftSource.match(
      /async function save\(\)[\s\S]*?\n}\n\nwatch\(/,
    )?.[0];
    expect(saveHandler).toBeTruthy();
    expect(saveHandler).toContain('createReceiptAllocationDraft');
    expect(saveHandler).toContain('expectedBankReceiptVersion');
    expect(saveHandler).toContain('orderId: line.orderId');
    expect(saveHandler).toContain('sourceAmount: line.sourceAmount.trim()');
    expect(saveHandler).not.toContain('creationMode');
    expect(saveHandler).not.toContain('amountCny');
    expect(saveHandler).not.toContain('currencyToCnyRate');
    expect(saveHandler).not.toContain('rateSnapshotHash');
    expect(saveHandler).not.toContain('sourceSnapshotHash');
  });

  it('requires explicit model selection and materializes only the saved READY run', () => {
    expect(aiSource).toContain('v-model:value="selectedModelId"');
    expect(aiSource).not.toContain('models.value[0]?.id');
    expect(aiSource).toContain("job.value?.status === 'READY'");
    expect(aiSource).toContain('getReceiptAllocationGenerationJob');
    expect(aiSource).toContain('materializeReceiptAllocationGeneration');
    expect(aiSource).toContain('expectedRunVersion: String(current.version)');
    expect(aiSource).not.toContain('proposalJson: current');
    expect(aiSource).toContain('浏览器不会回传提案 JSON');
    expect(aiSource).toContain('loadActiveAllocationGeneration');
    expect(aiSource).toContain('saveActiveAllocationGeneration');
    expect(aiSource).toContain('jobRequestId += 1');
    expect(aiSource).toContain('String(result.sourceId) !== expectedSourceId');
  });

  it('gates buttons with final backend permissions and persists uncertain commands', () => {
    for (const permission of [
      'fdmwaimao:bank-receipt:create',
      'fdmwaimao:bank-receipt:update',
      'fdmwaimao:bank-receipt:void',
    ]) {
      expect(bankSource).toContain(permission);
    }
    for (const permission of [
      'fdmwaimao:receipt-allocation:create',
      'fdmwaimao:receipt-allocation:generate',
      'fdmwaimao:receipt-allocation:apply',
      'fdmwaimao:receipt-allocation:update',
      'fdmwaimao:receipt-allocation:void',
      'fdmwaimao:ai:use',
    ]) {
      expect(allocationSource).toContain(permission);
    }
    expect(draftSource).toContain('getOrCreateAllocationCommand');
    expect(aiSource).toContain('getOrCreateAllocationCommand');
    expect(allocationSource).toContain('getOrCreateAllocationCommand');
    expect(draftSource).toContain('const requestId = ++contextRequestId');
    expect(draftSource).toContain('receipt.id !== selectedBankReceiptId.value');
  });

  it('requires explicit server-audited confirmation for exact cross-ledger collisions', () => {
    expect(directFormSource).toContain(
      'isReceiptRecordDuplicateConfirmationError',
    );
    expect(directFormSource).toContain('发现疑似重复回款');
    expect(directFormSource).toContain(
      'buildReceiptSavePayload(receiptForm, confirmPotentialDuplicate)',
    );
    expect(allocationSource).toContain(
      'isReceiptAllocationDuplicateConfirmationError',
    );
    expect(allocationSource).toContain('submitAction(true, idempotencyKey)');
    expect(allocationSource).not.toContain('duplicateKey');
    expect(allocationSource).not.toContain('duplicateIds');
  });
});
