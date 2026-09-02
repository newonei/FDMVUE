import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const formSource = readFileSync(
  resolve(
    process.cwd(),
    process.cwd().endsWith(String.raw`apps\web-antd`) ||
      process.cwd().endsWith('apps/web-antd')
      ? 'src/views/fdmwaimao/demand-plan/form/index.vue'
      : 'apps/web-antd/src/views/fdmwaimao/demand-plan/form/index.vue',
  ),
  'utf8',
);

describe('demand-plan page AI object identity', () => {
  it('uses only the persisted demand-plan id as the page business id', () => {
    const contextBlock = formSource.slice(
      formSource.indexOf('useFdmWaimaoAiContext(() => ({'),
      formSource.indexOf('type DemandGenerationCommand'),
    );

    expect(contextBlock).toContain('businessId: planId.value');
    expect(contextBlock).not.toContain(
      'businessId: planId.value || createOrderId.value',
    );
    expect(contextBlock).toContain("surfaceKey: 'demand-plan'");
  });
});
