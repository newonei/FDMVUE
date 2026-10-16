/** Only the native bridge and the unsigned enterprise login API are loaded. */
export async function requestCardAuthCode(corpId: string, _clientId: string) {
  const [, { requestAuthCode$ }] = await Promise.all([
    import('dingtalk-jsapi/platform'),
    import('dingtalk-jsapi/api/runtime/permission/requestAuthCode'),
  ]);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      requestAuthCode$({ corpId }),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error('钉钉免登超时，请重试')),
          20_000,
        );
      }),
    ]);
    if (!result?.code) throw new Error('钉钉未返回免登码，请重试');
    return result.code;
  } catch {
    throw new Error('钉钉免登失败，请确认当前企业和应用可见范围后重试');
  } finally {
    clearTimeout(timeout);
  }
}
