/** 一行辅料用量：每做一件成品用多少，在哪道工序领（不填为工艺最后一道）。 */
export interface AuxUsageDraft {
  perUnit: null | number;
  process?: null | string;
  productCode?: null | string;
  productId: string;
  productName?: null | string;
  unit?: null | string;
}

/** 后端返回的辅料用量转成编辑用的草稿。 */
export function toAuxDrafts(
  usages?: Array<{
    perUnit: number | string;
    process?: null | string;
    productCode?: null | string;
    productId: string;
    productName?: null | string;
    unit?: null | string;
  }> | null,
): AuxUsageDraft[] {
  return (usages ?? []).map((u) => ({
    perUnit: Number(u.perUnit) || null,
    process: u.process ?? undefined,
    productCode: u.productCode,
    productId: u.productId,
    productName: u.productName,
    unit: u.unit,
  }));
}

/** 提交前的检查：每件用量要大于 0。返回第一条问题，没有返回空串。 */
export function auxProblem(rows: AuxUsageDraft[]) {
  const bad = rows.find((r) => !r.perUnit || r.perUnit <= 0);
  return bad ? `辅料「${bad.productName ?? ''}」的每件用量要大于 0` : '';
}

/** 提交给后端的辅料用量；工序不在工艺里的交给后端改为最后一道。 */
export function auxPayload(rows: AuxUsageDraft[]) {
  return rows.map((r) => ({
    perUnit: r.perUnit ?? 0,
    process: r.process || undefined,
    productId: r.productId,
  }));
}
