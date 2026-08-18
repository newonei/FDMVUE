import type { FdmCreativeApi } from '#/api/fdmcreative';

import { describe, expect, it } from 'vitest';

import workflowFixture from './__fixtures__/p0-regression-workflow.json';
import { validateWorkflowDefinition } from './graph/workflow-utils';

describe('p0 workbench regression workflow fixture', () => {
  it('keeps the image, video, random-prompt, loop, collection and output paths valid', () => {
    const workflow = workflowFixture as FdmCreativeApi.WorkflowDefinition;
    const nodeTypes = new Set(workflow.nodes.map((node) => node.type));

    expect(workflow.schemaVersion).toBe(1);
    expect([...nodeTypes]).toEqual(
      expect.arrayContaining([
        'image-collection',
        'image-generate',
        'image-loop',
        'output',
        'random-prompt',
        'video-input',
        'video-loop',
      ]),
    );
    expect(validateWorkflowDefinition(workflow)).toBe(true);
  });
});
