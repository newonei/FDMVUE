import { describe, expect, it } from 'vitest';

import { CREATIVE_NODE_CATALOG, getCreativeNodeVisual } from './catalog';

describe('compact canvas node visuals', () => {
  it('keeps the dense 300-node canvas within the redesigned footprint', () => {
    const visuals = CREATIVE_NODE_CATALOG.map((node) =>
      getCreativeNodeVisual(node.type),
    );

    expect(Math.max(...visuals.map((visual) => visual.width))).toBe(196);
    expect(Math.max(...visuals.map((visual) => visual.height))).toBe(176);
    expect(getCreativeNodeVisual('creative-brief')).toMatchObject({
      height: 92,
      width: 168,
    });
    expect(getCreativeNodeVisual('video-compose')).toMatchObject({
      height: 176,
      width: 196,
    });
  });
});
