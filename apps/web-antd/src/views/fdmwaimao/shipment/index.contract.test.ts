import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const pageSource = readFileSync(
  resolve(
    process.cwd(),
    process.cwd().endsWith(String.raw`apps\web-antd`) ||
      process.cwd().endsWith('apps/web-antd')
      ? 'src/views/fdmwaimao/shipment/index.vue'
      : 'apps/web-antd/src/views/fdmwaimao/shipment/index.vue',
  ),
  'utf8',
);

describe('shipment readiness materialization page boundary', () => {
  it('passes pending attachment IDs only in the shipment draft create request', () => {
    const createBlock = pageSource.slice(
      pageSource.indexOf('async function submitCreate()'),
      pageSource.indexOf('function openUpdate()'),
    );
    expect(createBlock).toMatch(
      /createShipmentDraft\(\{[\s\S]*attachmentIds:\s*createForm\.attachments\.map\([\s\S]*attachment\.id/,
    );

    const updateBlock = pageSource.slice(
      pageSource.indexOf('async function submitUpdate()'),
      pageSource.indexOf('async function submitCancel()'),
    );
    expect(updateBlock).toContain('updateShipmentDraft({');
    expect(updateBlock).not.toContain('attachmentIds');
  });

  it('gates materialization on all four backend permissions and legal READY state', () => {
    for (const permission of [
      'fdmwaimao:shipment:query',
      'fdmwaimao:shipment:update',
      'fdmwaimao:shipment:ai-generate',
      'fdmwaimao:ai:use',
    ]) {
      expect(pageSource).toContain(`'${permission}'`);
    }
    expect(pageSource).toContain('const canMaterializeReadiness = computed');
    expect(pageSource).toContain('canAiGenerate.value &&');
    expect(pageSource).toContain('canMaterializeReadinessJob(job)');
    expect(pageSource).toContain('v-if="canMaterializeReadiness"');
    expect(pageSource).toContain('确认生成发货明细');
  });

  it('invalidates old polling before the identity-only materialize request', () => {
    const materializeFunction = pageSource.slice(
      pageSource.indexOf('async function materializeReadiness()'),
      pageSource.indexOf('function confirmReadinessMaterialization()'),
    );

    expect(
      materializeFunction.indexOf('invalidateReadinessPollSession()'),
    ).toBeGreaterThan(0);
    expect(
      materializeFunction.indexOf('materializeShipmentReadinessGeneration({'),
    ).toBeGreaterThan(
      materializeFunction.indexOf('invalidateReadinessPollSession()'),
    );
    expect(materializeFunction).toContain('expectedRunVersion: job.version');
    expect(materializeFunction).toContain(
      'expectedSourceSnapshotHash: job.sourceSnapshotHash',
    );
    expect(materializeFunction).not.toMatch(
      /(?:productId|shipQuantity|warehouseId|warehouseEvidence|authorityHash|evidence)\s*:/,
    );
  });

  it('moves materialized DRAFTs to the explicit reservation step only', () => {
    expect(pageSource).toContain(
      '只会把服务端重新校验通过的 READY 提案物化为当前发货单的 DRAFT 明细',
    );
    expect(pageSource).toContain('不会预留或扣减库存');
    expect(pageSource).toContain('不会确认发货');
    expect(pageSource).toContain('不会创建 WAREHOUSE 出库单');
    expect(pageSource).toMatch(/下一步可另行显式预留真实 WAREHOUSE\s*库存/);
    expect(pageSource).toContain(
      "result.nextRequiredAction === 'RESERVE_WAREHOUSE_STOCK'",
    );
    expect(pageSource).toContain(
      'readinessMaterializationResult.readinessSnapshotHash',
    );
  });

  it('gates reserve, release and re-reserve on the dedicated permission and server state', () => {
    expect(pageSource).toContain("'fdmwaimao:shipment:reserve'");
    expect(pageSource).toContain('const detailReservationAction = computed');
    expect(pageSource).toContain('availableShipmentReservationAction(');
    expect(pageSource).toContain('v-if="detailReservationAction"');
    expect(pageSource).toContain('预留库存');
    expect(pageSource).toContain('释放预留');
    expect(pageSource).toContain('重新预留');
    expect(pageSource).toContain('detail.reservationExpiresAt');
    expect(pageSource).toContain('detail.reservationRequestHash');
  });

  it('publishes confirmation only behind permission plus the backend availability flag', () => {
    expect(pageSource).toContain("'fdmwaimao:shipment:confirm'");
    expect(pageSource).toContain('const detailCanConfirm = computed');
    expect(pageSource).toContain(
      'canConfirmShipment(detail.value, canConfirm.value)',
    );
    expect(pageSource).toContain('v-if="detailCanConfirm"');
    expect(pageSource).toContain('confirmAvailable');
    expect(pageSource).toContain('confirmShipment({');
    expect(pageSource).toContain('expectedVersion: command.expectedVersion');
    expect(pageSource).toContain('idempotencyKey: command.idempotencyKey');
    expect(pageSource).toContain('发货已确认并提交 WAREHOUSE 交接队列');
    expect(pageSource).not.toMatch(
      /function\s+(?:completeShipment|createWarehouseShipmentOrder|deductInventory)\s*\(/,
    );
    expect(pageSource).not.toMatch(
      /@click="(?:completeShipment|createWarehouseShipmentOrder|deductInventory)/,
    );
  });

  it('keeps one command identity for uncertain retries and refreshes after every outcome', () => {
    expect(pageSource).toContain('pendingReservationCommand');
    expect(pageSource).toContain('ensureShipmentReservationCommand(');
    expect(pageSource).toContain('refreshShipmentAfterReservationAction(');
    expect(pageSource).toContain('再次点击将使用相同幂等键安全重试');
  });

  it('shows dead-letter recovery only from the backend recovery flag and preserves identity', () => {
    expect(pageSource).toContain('const detailCanRecoverHandoff = computed');
    expect(pageSource).toContain(
      'canRecoverShipmentHandoff(detail.value, canConfirm.value)',
    );
    expect(pageSource).toContain('v-if="detailCanRecoverHandoff"');
    expect(pageSource).toContain('pendingHandoffRecoveryCommand');
    expect(pageSource).toContain('ensureShipmentHandoffRecoveryCommand(');
    expect(pageSource).toContain('recoverShipmentWarehouseHandoff({');
    expect(pageSource).toContain('reason: command.reason');
    expect(pageSource).toContain('原 WAREHOUSE 交接事件已重新排队');
    expect(pageSource).toContain('不会重新冻结预留');
  });

  it('distinguishes a first materialization from an idempotent replay', () => {
    expect(pageSource).toContain('result.materializedNow');
    expect(pageSource).toContain('发货明细已生成；当前仍为 DRAFT');
    expect(pageSource).toContain('本次为幂等重放；已刷新发货明细');
    expect(pageSource).toContain('发货明细已存在，本次为幂等重放');
  });

  it('rejects stale detail responses and clears the object identity on close', () => {
    expect(pageSource).toContain('let detailRequestVersion = 0');
    expect(pageSource).toContain(
      'const requestVersion = ++detailRequestVersion',
    );
    expect(pageSource).toContain('requestVersion !== detailRequestVersion');
    expect(pageSource).toContain('response.id !== id');
    expect(pageSource).toContain(
      'function handleDetailOpenChange(next: boolean)',
    );
    expect(pageSource).toContain('detail.value = undefined');
    expect(pageSource).toContain('@update:open="handleDetailOpenChange"');
  });

  it('keeps an exact readiness command key for timeout replay and guards re-entry', () => {
    expect(pageSource).toContain('pendingReadinessCommand');
    expect(pageSource).toContain('ensureShipmentReadinessCommand(');
    expect(pageSource).toContain('idempotencyKey: command.idempotencyKey');
    expect(pageSource).toMatch(
      /async function startReadiness\(\) \{\s*if \(readinessSubmitting\.value\) return;/,
    );
    expect(pageSource).toMatch(
      /async function regenerateReadiness\(\) \{\s*if \(readinessSubmitting\.value\) return;/,
    );
  });
});
