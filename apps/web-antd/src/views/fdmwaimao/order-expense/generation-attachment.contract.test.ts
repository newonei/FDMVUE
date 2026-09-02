import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const modalSource = readFileSync(
  resolve(
    process.cwd(),
    process.cwd().endsWith(String.raw`apps\web-antd`) ||
      process.cwd().endsWith('apps/web-antd')
      ? 'src/views/fdmwaimao/order-expense/components/OrderExpenseGenerationModal.vue'
      : 'apps/web-antd/src/views/fdmwaimao/order-expense/components/OrderExpenseGenerationModal.vue',
  ),
  'utf8',
);

describe('order-expense generation attachment contract', () => {
  it('passes pending attachment IDs to the READY materialize request', () => {
    const materializeBlock = modalSource.slice(
      modalSource.indexOf('async function materialize()'),
      modalSource.indexOf('watch('),
    );

    expect(materializeBlock).toMatch(
      /materializeOrderExpenseGeneration\(\{[\s\S]*attachmentIds:\s*attachments\.value\.map\(\(attachment\) => attachment\.id\)/,
    );
  });

  it('sorts attachment IDs into the materialize command fingerprint', () => {
    const materializeBlock = modalSource.slice(
      modalSource.indexOf('async function materialize()'),
      modalSource.indexOf('watch('),
    );

    expect(materializeBlock).toMatch(
      /getOrCreateExpenseCommand\([\s\S]*attachments\.value\s*\.map\(\(attachment\) => attachment\.id\)\s*\.toSorted\(\)\s*\.join\(','\)/,
    );
  });
});
