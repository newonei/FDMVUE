/** 接口报错时的业务错误码和说明。 */
export function businessError(error: unknown) {
  const e = error as {
    code?: number | string;
    data?: { code?: number; msg?: string };
    message?: string;
    msg?: string;
    response?: { data?: { code?: number; msg?: string } };
  };
  const data = e?.response?.data ?? e?.data;
  return {
    code: Number(data?.code ?? e?.code ?? 0),
    msg: String(data?.msg ?? e?.msg ?? e?.message ?? '提交失败'),
  };
}

/** 对有明确业务拒绝的事务与未收到可靠响应的提交，给出不同的核对办法。 */
export function reportFailureText(error: unknown, replaySafe: boolean) {
  const { code, msg } = businessError(error);
  if (Number.isInteger(code) && code >= 1_000_000_000) {
    return `本次提交未新增报工。${msg}。可在任务管理查看累计产量与关联工序单。`;
  }
  const next = replaySafe ? '保留当前数量在本页重试，将沿用同一次报工标识。' : '请先核对原工序单的本次产出，再决定是否补报。';
  return `报工结果待核实（${msg}）。请在任务管理或车间工序单核对已报数量。${next}`;
}
