export interface ImageMentionAsset {
  id: number;
  name?: string;
}

export interface ImageMentionCandidate<TAsset extends ImageMentionAsset> {
  asset: TAsset;
  index: number;
  label: string;
  token: string;
}

export interface ImageMentionContext {
  end: number;
  query: string;
  start: number;
}

export interface ImageMentionInsertion {
  cursor: number;
  value: string;
}

const IMAGE_MENTION_TOKEN_PATTERN = /@图片([1-9]\d*)/gu;

/**
 * Finds an unfinished @ reference immediately before the caret. The server accepts @图片N
 * anywhere in a prompt, so this deliberately supports Chinese text directly before the marker.
 */
export function findImageMentionContext(
  value: string,
  caret: number,
): ImageMentionContext | undefined {
  const end = Math.min(Math.max(caret, 0), value.length);
  const prefix = value.slice(0, end);
  const match = /@([^@\s]*)$/u.exec(prefix);
  if (!match) return undefined;

  const query = match[1] || '';
  return {
    end,
    query,
    start: end - query.length - 1,
  };
}

export function buildImageMentionCandidates<TAsset extends ImageMentionAsset>(
  assets: readonly TAsset[],
  query: string,
): Array<ImageMentionCandidate<TAsset>> {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return assets
    .map((asset, index) => ({
      asset,
      index: index + 1,
      label: `图片${index + 1}`,
      token: `@图片${index + 1}`,
    }))
    .filter((candidate) => {
      if (!normalizedQuery) return true;
      return [candidate.asset.name, candidate.label, candidate.token].some(
        (value) => value?.toLocaleLowerCase().includes(normalizedQuery),
      );
    });
}

export function insertImageMention(
  value: string,
  context: ImageMentionContext,
  candidate: ImageMentionCandidate<ImageMentionAsset>,
): ImageMentionInsertion {
  const suffix = value.slice(context.end);
  const separator = suffix ? '' : ' ';
  const replacement = `${candidate.token}${separator}`;
  return {
    cursor: context.start + replacement.length,
    value: `${value.slice(0, context.start)}${replacement}${suffix}`,
  };
}

export function hasImageMention(value: string, index: number): boolean {
  if (!Number.isInteger(index) || index < 1) return false;
  return new RegExp(`@图片${index}(?!\\d)`, 'u').test(value);
}

/**
 * Reference images are sent to the provider in their selected order. If an
 * unreferenced image is removed, shift later tokens so they still point at the
 * same image instead of silently changing their meaning.
 */
export function reindexImageMentionsAfterRemoval(
  value: string,
  removedIndex: number,
): string {
  if (!Number.isInteger(removedIndex) || removedIndex < 1) return value;
  return value.replace(IMAGE_MENTION_TOKEN_PATTERN, (token, indexText) => {
    const index = Number(indexText);
    return index > removedIndex ? `@图片${index - 1}` : token;
  });
}
