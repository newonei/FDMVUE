/** The request client can reject with a business response instead of an Error. */
export function creativeModelLoadError(error: unknown): string {
  let detail = '';
  if (error instanceof Error) {
    detail = error.message.trim();
  } else if (error && typeof error === 'object') {
    const response = error as { message?: unknown; msg?: unknown };
    const value = response.msg ?? response.message;
    if (typeof value === 'string') detail = value.trim();
  }
  return detail
    ? `模型目录加载失败：${detail}`
    : '模型目录加载失败，请检查创作权限和服务商路由';
}
