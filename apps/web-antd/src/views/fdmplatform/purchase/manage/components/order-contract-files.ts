import type { ProcurementFile } from '#/api/fdmplatform/procurement';

/** 导出版本全局递增；盖章件的上传时间不能用来判断最新采购单。 */
export function procurementFileGroups(
  exports: readonly ProcurementFile[],
  files: readonly ProcurementFile[],
) {
  const exportFiles = new Map(
    [...exports, ...files.filter((file) => file.kind !== 'SIGNED')].map(
      (file) => [file.id, file],
    ),
  );
  const time = (value: ProcurementFile['createdAt']) => {
    if (typeof value === 'number') return value;
    return value ? Number(value) || Date.parse(value) || 0 : 0;
  };
  const sorted = [...exportFiles.values()].toSorted(
    (a, b) =>
      (b.revision ?? 0) - (a.revision ?? 0) ||
      time(b.createdAt) - time(a.createdAt),
  );
  const signed = files.filter((file) => file.kind === 'SIGNED');
  return {
    versions: sorted.map((file) => ({
      export: file,
      signed: signed.filter((item) => item.exportId === file.id),
    })),
    unlinked: signed.filter((file) => !exportFiles.has(file.exportId ?? '')),
  };
}
