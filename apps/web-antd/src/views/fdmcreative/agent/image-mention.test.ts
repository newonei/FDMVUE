import { describe, expect, it } from 'vitest';

import {
  buildImageMentionCandidates,
  findImageMentionContext,
  hasImageMention,
  insertImageMention,
  reindexImageMentionsAfterRemoval,
} from './image-mention';

const assets = [
  { id: 1, name: '白色耳机正面图' },
  { id: 2, name: '蓝色纹样参考' },
];

describe('image mentions', () => {
  it('opens a mention context after @ directly following Chinese text', () => {
    const value = '请参考@白色';

    expect(findImageMentionContext(value, value.length)).toEqual({
      end: value.length,
      query: '白色',
      start: 3,
    });
  });

  it('filters selected images by token, ordinal, and asset name', () => {
    expect(buildImageMentionCandidates(assets, '蓝色')).toEqual([
      expect.objectContaining({ index: 2, token: '@图片2' }),
    ]);
    expect(buildImageMentionCandidates(assets, '图片1')).toEqual([
      expect.objectContaining({ index: 1, token: '@图片1' }),
    ]);
  });

  it('replaces the unfinished query with a server-compatible image token', () => {
    const value = '请用@白色生成主图';
    const context = findImageMentionContext('请用@白色', '请用@白色'.length)!;
    const candidate = buildImageMentionCandidates(assets, '白色')[0]!;

    expect(insertImageMention(value, context, candidate)).toEqual({
      cursor: 6,
      value: '请用@图片1生成主图',
    });
  });

  it('keeps later tokens bound to the same image after an unused reference is removed', () => {
    const prompt = '使用 @图片1、@图片3 和 @图片10';

    expect(hasImageMention(prompt, 1)).toBe(true);
    expect(hasImageMention(prompt, 2)).toBe(false);
    expect(reindexImageMentionsAfterRemoval(prompt, 2)).toBe(
      '使用 @图片1、@图片2 和 @图片9',
    );
  });
});
