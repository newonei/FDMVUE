import { resolvePreview } from '#/components/file-preview/formats';

export type FilePreviewKind = Exclude<
  ReturnType<typeof resolvePreview>['kind'],
  'unsupported'
>;

export function filePreviewKind(name?: string): FilePreviewKind | undefined {
  const { kind } = resolvePreview(name ?? '');
  return kind === 'unsupported' ? undefined : kind;
}
