import { expect, test } from 'playwright/test';

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
