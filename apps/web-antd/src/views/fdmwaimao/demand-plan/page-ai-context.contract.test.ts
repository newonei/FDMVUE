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

  it('passes pending attachment IDs to direct and AI materialized creates', () => {
    const directCreateBlock = formSource.slice(
      formSource.indexOf('async function createDirectDraft('),
      formSource.indexOf('function ensureAttachmentsReady()'),
    );
    expect(directCreateBlock).toMatch(
      /createDemandPlanDirect\(\{[\s\S]*attachmentIds:\s*attachments\.value\.map\(\(attachment\) => attachment\.id\)/,
    );

    const saveBlock = formSource.slice(
      formSource.indexOf('async function saveDraft('),
      formSource.indexOf('async function confirmPlan()'),
    );
    const createBlock = saveBlock.slice(
      saveBlock.indexOf('const request = buildDemandPlanMaterializeReq('),
    );
    expect(createBlock).toMatch(
      /request\.attachmentIds\s*=\s*attachments\.value\.map\([\s\S]*attachment\.id/,
    );
    expect(createBlock).toContain('createDemandPlan(request)');
  });

  it('keeps attachment IDs out of the edit update request', () => {
    const saveBlock = formSource.slice(
      formSource.indexOf('async function saveDraft('),
      formSource.indexOf('async function confirmPlan()'),
    );
    const updateBlock = saveBlock.slice(
      saveBlock.indexOf('if (editing.value)'),
      saveBlock.indexOf('const request = buildDemandPlanMaterializeReq('),
    );

    expect(updateBlock).toContain('buildDemandPlanUpdateReq(form.value)');
    expect(updateBlock).toContain('updateDemandPlan(request)');
    expect(updateBlock).not.toContain('attachmentIds');
  });
});
