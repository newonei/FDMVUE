import type { Page } from 'playwright/test';

import { expect, test } from 'playwright/test';

interface SerializedWorkflow {
  edges: Array<{
    id: string;
    sourceNodeId: string;
    sourcePortId: string;
    targetNodeId: string;
    targetPortId: string;
  }>;
  nodes: Array<{ id: string; type: string }>;
}

async function readFixtureWorkflow(page: Page) {
  return page.evaluate(() => {
    const value = document.body.dataset.workflowDefinition;
    if (!value) throw new Error('fixture workflow definition is missing');
    return JSON.parse(value) as SerializedWorkflow;
  });
}

test('renders a native X6 mixed-media workflow without an iframe', async ({
  page,
}) => {
  await page.goto('/e2e/fixtures/fdmcreative-workbench.html');
  const documentBody = page.locator('html > body');
  await expect(documentBody).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('svg').first()).toBeVisible();
  expect(await page.locator('.creative-node').count()).toBeGreaterThanOrEqual(
    5,
  );
  await expect(page.locator('#summary')).toHaveText('6:5|0:0|6:5');
  await expect(documentBody).toHaveAttribute(
    'data-node-bounds-aligned',
    'true',
  );
  await expect(documentBody).toHaveAttribute('data-foreign-body-reset', 'true');
  await expect(documentBody).toHaveAttribute('data-node-height-limits', 'true');
  await expect(documentBody).toHaveAttribute('data-node-count', '300');
  await expect(documentBody).toHaveAttribute(
    'data-node-limit-enforced',
    'true',
  );
  await expect(documentBody).toHaveAttribute('data-zoom-responsive', 'true');
  await expect(page.locator('iframe')).toHaveCount(0);
});

test('opens one fixed-size inline editor and closes it with all supported gestures', async ({
  page,
}) => {
  await page.goto('/e2e/fixtures/fdmcreative-workbench.html');
  const documentBody = page.locator('html > body');
  await expect(documentBody).toHaveAttribute('data-ready', 'true');

  await expect(page.locator('.property-panel')).toHaveCount(0);
  await expect(page.getByTestId('prompt-dock')).toBeVisible();

  const videoNode = page
    .locator('.creative-node[data-node-type="video-generate"]')
    .first();
  await videoNode.click();

  const editor = page.getByTestId('node-inline-editor');
  await expect(editor).toHaveCount(1);
  await expect(editor).toBeVisible();
  await expect(page.getByTestId('prompt-dock')).toHaveCount(0);
  await expect(documentBody).toHaveAttribute('data-selected-cell-count', '1');

  const boxBeforeViewportChange = await editor.boundingBox();
  const widthBeforeZoom = boxBeforeViewportChange?.width;
  expect(widthBeforeZoom).toBeGreaterThanOrEqual(699);
  expect(widthBeforeZoom).toBeLessThanOrEqual(701);
  await page.getByTestId('zoom-out').click();
  await expect(editor).toBeVisible();
  const boxAfterZoom = await editor.boundingBox();
  const widthAfterZoom = boxAfterZoom?.width;
  expect(
    Math.abs((widthAfterZoom ?? 0) - (widthBeforeZoom ?? 0)),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs((boxAfterZoom?.x ?? 0) - (boxBeforeViewportChange?.x ?? 0)),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs((boxAfterZoom?.y ?? 0) - (boxBeforeViewportChange?.y ?? 0)),
  ).toBeLessThanOrEqual(1);

  const nodeBox = await videoNode.boundingBox();
  if (!nodeBox) throw new Error('selected node is not visible');
  await page.mouse.move(nodeBox.x + nodeBox.width / 2, nodeBox.y + 20);
  await page.mouse.down();
  await page.mouse.move(nodeBox.x + nodeBox.width / 2 + 80, nodeBox.y + 70, {
    steps: 6,
  });
  await page.mouse.up();
  const boxAfterNodeDrag = await editor.boundingBox();
  expect(
    Math.abs((boxAfterNodeDrag?.x ?? 0) - (boxBeforeViewportChange?.x ?? 0)),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs((boxAfterNodeDrag?.y ?? 0) - (boxBeforeViewportChange?.y ?? 0)),
  ).toBeLessThanOrEqual(1);

  await editor.locator('.editor-header .header-action').last().click();
  await expect(editor).toHaveCount(0);
  await expect(page.getByTestId('prompt-dock')).toBeVisible();
  await expect(documentBody).toHaveAttribute('data-selected-cell-count', '0');

  await videoNode.click();
  await expect(editor).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(editor).toHaveCount(0);
  await expect(documentBody).toHaveAttribute('data-selected-cell-count', '0');

  await videoNode.click();
  await expect(editor).toBeVisible();
  await page.locator('.graph-canvas .x6-graph-svg').click({
    force: true,
    position: { x: 8, y: 8 },
  });
  await expect(editor).toHaveCount(0);
  await expect(page.getByTestId('prompt-dock')).toBeVisible();
});

test('creates and connects a selected node after dropping a real X6 port on blank canvas', async ({
  page,
}) => {
  await page.goto(
    '/e2e/fixtures/fdmcreative-workbench.html?scenario=quick-connect',
  );
  const documentBody = page.locator('html > body');
  await expect(documentBody).toHaveAttribute('data-ready', 'true');

  const before = await readFixtureWorkflow(page);
  expect(before.nodes).toHaveLength(6);
  expect(before.edges).toHaveLength(5);

  const sourcePort = page
    .locator(
      '.graph-canvas [data-cell-id="content-planner"] .x6-port-body[port="plan"]',
    )
    .first();
  const sourceBox = await sourcePort.boundingBox();
  const canvasBox = await page
    .locator('.graph-canvas .x6-graph-svg')
    .first()
    .boundingBox();
  if (!sourceBox || !canvasBox) {
    throw new Error('quick-connect source port or canvas is not visible');
  }

  const dropPoint = {
    x: canvasBox.x + canvasBox.width - 48,
    y: canvasBox.y + canvasBox.height - 72,
  };
  await page.mouse.move(
    sourceBox.x + sourceBox.width / 2,
    sourceBox.y + sourceBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(dropPoint.x, dropPoint.y, { steps: 12 });
  await page.mouse.up();

  const picker = page.getByTestId('quick-connect-menu');
  await expect(picker).toBeVisible();
  await expect(page.getByTestId('quick-connect-search')).toBeFocused();
  await expect(
    page.getByTestId('quick-connect-option-image-plan-item'),
  ).toBeVisible();
  await expect(
    page.getByTestId('quick-connect-option-video-plan-item'),
  ).toBeVisible();
  await expect(page.getByTestId('quick-connect-option-video-trim')).toHaveCount(
    0,
  );
  await expect(documentBody).toHaveAttribute('data-node-count', '6');
  await expect(documentBody).toHaveAttribute('data-edge-count', '5');
  expect(await readFixtureWorkflow(page)).toEqual(before);

  await page.getByTestId('quick-connect-option-image-plan-item').click();
  await expect(picker).toHaveCount(0);
  await expect(documentBody).toHaveAttribute('data-node-count', '7');
  await expect(documentBody).toHaveAttribute('data-edge-count', '6');
  await expect(documentBody).toHaveAttribute('data-selected-cell-count', '1');

  const afterCreate = await readFixtureWorkflow(page);
  const beforeNodeIds = new Set(before.nodes.map((node) => node.id));
  const createdNode = afterCreate.nodes.find(
    (node) => !beforeNodeIds.has(node.id),
  );
  expect(createdNode).toMatchObject({ type: 'image-plan-item' });
  expect(afterCreate.edges).toContainEqual(
    expect.objectContaining({
      sourceNodeId: 'content-planner',
      sourcePortId: 'plan',
      targetNodeId: createdNode?.id,
      targetPortId: 'plan',
    }),
  );

  await page.getByTestId('quick-connect-undo').click();
  await expect(documentBody).toHaveAttribute('data-node-count', '6');
  await expect(documentBody).toHaveAttribute('data-edge-count', '5');
  expect(await readFixtureWorkflow(page)).toEqual(before);

  await page.getByTestId('quick-connect-redo').click();
  await expect(documentBody).toHaveAttribute('data-node-count', '7');
  await expect(documentBody).toHaveAttribute('data-edge-count', '6');
  const afterRedo = await readFixtureWorkflow(page);
  expect(afterRedo.nodes).toContainEqual(createdNode);
  expect(afterRedo.edges).toContainEqual(
    expect.objectContaining({
      sourceNodeId: 'content-planner',
      sourcePortId: 'plan',
      targetNodeId: createdNode?.id,
      targetPortId: 'plan',
    }),
  );
});
