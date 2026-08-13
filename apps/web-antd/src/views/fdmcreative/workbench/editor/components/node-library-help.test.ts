import { describe, expect, it } from 'vitest';

import { CREATIVE_NODE_CATALOG } from '../graph/catalog';
import { getNodeLibraryHelp } from './node-library-help';

describe('node library help', () => {
  it('provides complete usage guidance for every node in the catalog', () => {
    for (const node of CREATIVE_NODE_CATALOG) {
      const help = getNodeLibraryHelp(node);
      expect(help.purpose, node.type).not.toHaveLength(0);
      expect(help.inputs, node.type).not.toHaveLength(0);
      expect(help.outputs, node.type).not.toHaveLength(0);
      expect(help.scenarios, node.type).not.toHaveLength(0);
      expect(help.tip, node.type).not.toHaveLength(0);
    }
  });

  it('marks required inputs and keeps source nodes understandable', () => {
    const imageToImage = CREATIVE_NODE_CATALOG.find(
      (node) => node.type === 'image-to-image',
    )!;
    const creativeBrief = CREATIVE_NODE_CATALOG.find(
      (node) => node.type === 'creative-brief',
    )!;

    expect(getNodeLibraryHelp(imageToImage).inputs).toContain(
      '参考图片（必需）',
    );
    expect(getNodeLibraryHelp(creativeBrief).inputs[0]).toContain(
      '无需上游输入',
    );
  });

  it('search guidance includes practical language for common nodes', () => {
    const videoCompose = CREATIVE_NODE_CATALOG.find(
      (node) => node.type === 'video-compose',
    )!;
    const help = getNodeLibraryHelp(videoCompose);

    expect(help.scenarios.join(' ')).toContain('分镜合片');
    expect(help.tip).toContain('视频规格统一');
  });
});
