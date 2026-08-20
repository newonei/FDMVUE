import type { FdmCreativeApi } from '#/api/fdmcreative';

import { describe, expect, it } from 'vitest';

import {
  clampClipStart,
  frameToTimecode,
  getTimelineMediaIssues,
  isCancelableDramaPostTask,
  isRetryableDramaAudioTask,
  isRetryableDramaComposition,
  reorderAndReflowVideoTrack,
} from './drama-timeline-utils';

describe('drama timeline helpers', () => {
  it('derives display time from persisted frames and clamps independent tracks to the programme bounds', () => {
    expect(frameToTimecode(25, 24)).toBe('00:01:01');
    expect(frameToTimecode(24 * 3600, 24)).toBe('01:00:00:00');

    const clip = { durationFrames: 12 } as FdmCreativeApi.DramaTimelineClip;
    expect(clampClipStart(clip, -4, 48)).toBe(0);
    expect(clampClipStart(clip, 100, 48)).toBe(36);
  });

  it('reorders a video programme and explicitly reflows every clip frame boundary', () => {
    const clips = [
      {
        clipId: 'a',
        durationFrames: 24,
        startFrame: 0,
        transition: 'NONE',
        transitionFrames: 0,
      },
      {
        clipId: 'b',
        durationFrames: 24,
        startFrame: 18,
        transition: 'FADE',
        transitionFrames: 6,
      },
      {
        clipId: 'c',
        durationFrames: 12,
        startFrame: 36,
        transition: 'NONE',
        transitionFrames: 0,
      },
    ] as FdmCreativeApi.DramaTimelineClip[];

    const reflowed = reorderAndReflowVideoTrack(clips, 'c', 0);

    expect(reflowed.map((clip) => clip.clipId)).toEqual(['c', 'a', 'b']);
    expect(reflowed.map((clip) => clip.startFrame)).toEqual([0, 12, 30]);
    expect(reflowed[0]).toMatchObject({
      transition: 'NONE',
      transitionFrames: 0,
    });
    expect(reflowed[2]).toMatchObject({
      transition: 'FADE',
      transitionFrames: 6,
    });
  });

  it('reports missing or mismatched project media without treating subtitle text as media', () => {
    const timeline = {
      durationFrames: 48,
      fps: 24,
      height: 720,
      schemaVersion: 1,
      tracks: [
        {
          clips: [
            {
              assetId: 10,
              clipId: 'video-1',
              durationFrames: 48,
              startFrame: 0,
            },
          ],
          trackId: 'video',
          type: 'VIDEO',
        },
        {
          clips: [{ clipId: 'dialogue-1', durationFrames: 12, startFrame: 0 }],
          trackId: 'dialogue',
          type: 'DIALOGUE',
        },
        {
          clips: [
            {
              assetId: 20,
              clipId: 'music-1',
              durationFrames: 48,
              startFrame: 0,
            },
          ],
          trackId: 'music',
          type: 'MUSIC',
        },
        {
          clips: [
            {
              clipId: 'subtitle-1',
              durationFrames: 12,
              startFrame: 0,
              text: '你好',
            },
          ],
          trackId: 'subtitle',
          type: 'SUBTITLE',
        },
      ],
      width: 1280,
    } as FdmCreativeApi.DramaTimeline;
    const assets = [
      { id: 10, kind: 'VIDEO', name: '镜头.mp4' },
      { id: 20, kind: 'IMAGE', name: '错误图片.png' },
    ] as FdmCreativeApi.CreativeAsset[];

    expect(getTimelineMediaIssues(timeline, assets)).toEqual([
      expect.objectContaining({ clipId: 'dialogue-1', expectedKind: 'AUDIO' }),
      expect.objectContaining({ clipId: 'music-1', expectedKind: 'AUDIO' }),
    ]);
  });

  it('keeps cancel and retry affordances disjoint for unified post-production tasks', () => {
    expect(isCancelableDramaPostTask('RUNNING')).toBe(true);
    expect(isCancelableDramaPostTask('FAILED')).toBe(false);
    expect(isRetryableDramaAudioTask('STALE')).toBe(true);
    expect(isRetryableDramaAudioTask('RUNNING')).toBe(false);
    expect(isRetryableDramaComposition('FAILED')).toBe(true);
    expect(isRetryableDramaComposition('CANCELED')).toBe(false);
  });
});
