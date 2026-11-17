/** Keep gateway HTML out of notices and identify the failing request stage. */
export function normalizePrintPrepError(
  value: string,
  status?: number,
): string {
  const text = value.trim();
  const gatewayHtml = /<(?:!doctype|html|head|body|h1|center)\b/iu.test(text);
  if (status === 502 || status === 503 || status === 504 || gatewayHtml) {
    const code = status || Number(text.match(/\b(502|503|504)\b/u)?.[1]);
    if (code === 504) {
      return '制版后端响应超时（HTTP 504）。如已取得任务 ID，请稍后查询任务状态，避免重复提交生成。';
    }
    return `制版后端暂时无法连接${code ? `（HTTP ${code}）` : ''}。请确认 Python 制版服务已启动且代理可访问 192.168.10.144:8090；如已有任务 ID，请先查询任务状态。`;
  }
  return text || (status ? `请求失败（HTTP ${status}）` : '制版请求失败');
}
