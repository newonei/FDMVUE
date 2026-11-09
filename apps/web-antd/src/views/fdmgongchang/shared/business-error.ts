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
