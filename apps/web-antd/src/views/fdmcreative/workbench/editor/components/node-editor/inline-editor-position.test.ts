import { describe, expect, it } from 'vitest';

import { calculateInlineEditorPosition } from './inline-editor-position';

const canvasRect = {
  bottom: 900,
  height: 900,
  left: 200,
  right: 1700,
  top: 0,
  width: 1500,
};

describe('calculateInlineEditorPosition', () => {
  it('keeps a fixed-size editor centered in the lower canvas dock', () => {
    const result = calculateInlineEditorPosition({
      canvasRect,
      editorHeight: 320,
    });

    expect(result).toMatchObject({
      anchorLeft: 350,
      left: 400,
      placement: 'bottom',
      top: 538,
      visible: true,
      width: 700,
    });
  });

  it('shifts left when a bottom-right task queue would cover the dock', () => {
    const result = calculateInlineEditorPosition({
      canvasRect,
      editorHeight: 320,
      obstacleRects: [
        {
          bottom: 884,
          height: 194,
          left: 1280,
          right: 1684,
          top: 690,
          width: 404,
        },
      ],
    });

    expect(result.left).toBe(332);
    expect(canvasRect.left + result.left + result.width).toBeLessThanOrEqual(
      1280 - 48,
    );
  });

  it('clamps its width and position on a narrow canvas', () => {
    const result = calculateInlineEditorPosition({
      canvasRect: {
        bottom: 700,
        height: 700,
        left: 190,
        right: 810,
        top: 0,
        width: 620,
      },
      editorHeight: 300,
    });

    expect(result).toMatchObject({
      anchorLeft: 294,
      left: 16,
      top: 358,
      visible: true,
      width: 588,
    });
  });
});
