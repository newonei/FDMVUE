import type { FdmCreativeApi } from '#/api/fdmcreative';

export function createEmptyDramaScript(
  projectName?: string,
): FdmCreativeApi.DramaScript {
  const sceneKey = 'scene-main';
  return {
    characters: [],
    props: [],
    scenes: [
      {
        description: '故事主场景',
        entityKey: sceneKey,
        name: '主场景',
        prompt: '',
        referenceAssetIds: [],
      },
    ],
    schemaVersion: 1,
    storyScenes: [
      {
        action: '填写本场核心动作与视觉事件。',
        dialogues: [],
        estimatedDurationSeconds: 15,
        narration: '',
        sceneEntityKey: sceneKey,
        sceneKey: 'story-scene-1',
        sceneNo: 1,
        title: '第一场',
      },
    ],
    synopsis: '',
    theme: '',
    title: projectName || '未命名短剧',
  };
}

export function selectPromptReference(
  currentIds: number[],
  promptId: number,
  mode: 'append' | 'replace',
): number[] {
  if (mode === 'replace') return [promptId];
  return [...new Set([...currentIds, promptId])];
}

export function mergePromptText(
  currentText: string,
  selectedText: string,
  mode: 'append' | 'replace',
): string {
  const current = currentText.trim();
  if (mode === 'replace' || !current) return selectedText;
  return `${current}\n\n${selectedText}`;
}
