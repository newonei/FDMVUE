import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const formSource = readFileSync(
  resolve(
    process.cwd(),
    'apps/web-antd/src/views/wms/order/shipment/modules/form.vue',
  ),
  'utf8',
);
const listSource = readFileSync(
  resolve(
    process.cwd(),
    'apps/web-antd/src/views/wms/order/shipment/index.vue',
  ),
  'utf8',
);

describe('wMS reservation-backed completion UI boundary', () => {
  it('uses the dedicated whole-attempt command without submitting editable facts', () => {
    const handler = formSource.match(
      /async function handleReservationBackedComplete\(\)[\s\S]*?\n}\n\n\/\*\* 作废出库单/,
    )?.[0];

    expect(handler).toBeTruthy();
    expect(handler).toContain(
      'completeReservationBackedShipmentOrders(command)',
    );
    expect(handler).toContain('ensureReservationCompletionCommand');
    expect(handler).not.toContain('updateShipmentOrder');
    expect(handler).not.toContain('buildSubmitData');
    expect(handler).not.toContain('formApi.validate');
  });

  it('renders reservation-backed orders read-only and hides legacy mutation actions', () => {
    expect(formSource).toContain(':disabled="isReservationBacked"');
    expect(formSource).toContain('ifShow: !isReservationBacked');
    expect(formSource).toContain(
      "auth: ['wms:shipment-order:complete-reservation']",
    );
    expect(formSource).toContain(
      ':show-confirm-button="isPrepareOrder && !isReservationBacked"',
    );
    expect(listSource).toContain('ifShow: row.reservationBacked === true');
    expect(listSource).toContain("'查看/整批完成'");
  });

  it('persists uncertain commands and rejects every legacy handler at function entry', () => {
    expect(formSource).toContain(
      'saveReservationCompletionCommand(browserSessionStorage(), command)',
    );
    expect(formSource).toContain('loadReservationCompletionCommand(');
    expect(formSource).toContain(
      'clearReservationCompletionCommand(browserSessionStorage(), formData.value)',
    );

    for (const functionName of ['handleFormComplete', 'handleFormCancel']) {
      const handler = formSource.match(
        new RegExp(`async function ${functionName}\\(\\) \\{[\\s\\S]*?\\n\\}`),
      )?.[0];
      expect(handler).toContain('if (isReservationBacked.value)');
    }
    const modalConfirm = formSource.match(
      /async onConfirm\(\) \{[\s\S]*?const \{ valid \}/,
    )?.[0];
    expect(modalConfirm).toContain('if (isReservationBacked.value)');
  });
});
