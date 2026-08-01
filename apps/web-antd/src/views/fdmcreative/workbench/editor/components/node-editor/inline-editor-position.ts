export interface RectLike {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
}

export interface InlineEditorPosition {
  anchorLeft: number;
  left: number;
  placement: 'bottom' | 'top';
  top: number;
  visible: boolean;
  width: number;
}

interface InlineEditorPositionOptions {
  bottomOffset?: number;
  canvasRect: RectLike;
  editorHeight: number;
  obstacleGap?: number;
  obstacleRects?: RectLike[];
  preferredWidth?: number;
  safeArea?: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * Places the editor as a stable bottom dock in viewport pixels. It deliberately
 * stays outside the X6 transform tree: zooming, panning or dragging a node must
 * never scale the form or make a large form chase the selected card.
 */
export function calculateInlineEditorPosition({
  bottomOffset = 42,
  canvasRect,
  editorHeight,
  obstacleGap = 48,
  obstacleRects = [],
  preferredWidth = 700,
  safeArea = 16,
}: InlineEditorPositionOptions): InlineEditorPosition {
  const availableWidth = Math.max(0, canvasRect.width - safeArea * 2);
  const width = Math.min(preferredWidth, availableWidth);
  const maxLeft = canvasRect.width - width - safeArea;
  let left = clamp((canvasRect.width - width) / 2, safeArea, maxLeft);
  const top = clamp(
    canvasRect.height - editorHeight - bottomOffset,
    safeArea,
    canvasRect.height - editorHeight - safeArea,
  );

  const dockLeft = () => canvasRect.left + left;
  const dockRight = () => dockLeft() + width;
  const dockTop = canvasRect.top + top;
  const dockBottom = dockTop + editorHeight;
  for (const obstacle of obstacleRects) {
    const overlapsVertically =
      dockBottom > obstacle.top && dockTop < obstacle.bottom;
    if (!overlapsVertically) continue;
    if (
      dockRight() > obstacle.left - obstacleGap &&
      dockLeft() < obstacle.right
    ) {
      const obstacleIsRight =
        obstacle.left + obstacle.width / 2 >=
        canvasRect.left + canvasRect.width / 2;
      left = obstacleIsRight
        ? obstacle.left - canvasRect.left - obstacleGap - width
        : obstacle.right - canvasRect.left + obstacleGap;
      left = clamp(left, safeArea, maxLeft);
    }
  }

  return {
    anchorLeft: width / 2,
    left,
    placement: 'bottom',
    top,
    visible: canvasRect.width > 0 && canvasRect.height > 0,
    width,
  };
}
