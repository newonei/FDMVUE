import { describe, expect, it } from 'vitest';

import {
  createEmptyDramaScript,
  mergePromptText,
  selectPromptReference,
} from './drama-script-utils';

describe('drama script editor helpers', () => {
  it('starts a new script with a scene entity that the first story scene can reference', () => {
    const script = createEmptyDramaScript('雨夜咖啡馆');

    expect(script.schemaVersion).toBe(1);
    expect(script.title).toBe('雨夜咖啡馆');
    expect(script.storyScenes[0]?.sceneEntityKey).toBe(
      script.scenes[0]?.entityKey,
    );
  });

  it('deduplicates appended prompt-library references and keeps replace explicit', () => {
    expect(selectPromptReference([1, 2], 2, 'append')).toEqual([1, 2]);
    expect(selectPromptReference([1, 2], 3, 'append')).toEqual([1, 2, 3]);
    expect(selectPromptReference([1, 2], 3, 'replace')).toEqual([3]);
  });

  it('uses prompt-library text safely for entity prompts without losing append intent', () => {
    expect(mergePromptText('电影感人像', '暖色边缘光', 'append')).toBe(
      '电影感人像\n\n暖色边缘光',
    );
    expect(mergePromptText('电影感人像', '水墨风格', 'replace')).toBe(
      '水墨风格',
    );
  });
});
