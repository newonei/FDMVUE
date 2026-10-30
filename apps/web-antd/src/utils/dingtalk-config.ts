export interface DingTalkLoginConfig {
  corpId: string;
  clientId: string;
}

interface PublicLoginConfig extends DingTalkLoginConfig {
  enabled: boolean;
}

/** Only an absent endpoint on an older server permits build-time configuration. */
export async function resolveDingTalkLoginConfig(
  fetchConfig: () => Promise<PublicLoginConfig>,
  legacyConfig: DingTalkLoginConfig,
): Promise<DingTalkLoginConfig> {
  let config: DingTalkLoginConfig;
  try {
    const current = await fetchConfig();
    if (current?.enabled === false) {
      throw new Error('当前企业已停用钉钉应用，请联系管理员');
    }
    if (current?.enabled !== true) {
      throw new Error('钉钉应用配置响应无效，请联系管理员');
    }
    config = current;
  } catch (error) {
    const status = (error as { response?: { status?: number } })?.response
      ?.status;
    if (status !== 404) throw error;
    config = legacyConfig;
  }
  if (!config.corpId?.trim() || !config.clientId?.trim()) {
    throw new Error(
      '钉钉 CorpId / ClientId 未配置，请在钉钉设置中完善应用连接',
    );
  }
  return { corpId: config.corpId.trim(), clientId: config.clientId.trim() };
}

/** Decode the login guard's redirect once, and accept only a local route. */
export function safeDingTalkRedirect(value: unknown, fallback = '/'): string {
  function localPath(candidate: unknown): string | undefined {
    if (typeof candidate !== 'string') return undefined;
    let path: string;
    try {
      path = decodeURIComponent(candidate);
    } catch {
      return undefined;
    }
    if (
      !path.startsWith('/') ||
      path.startsWith('//') ||
      path.includes('\\') ||
      [...path].some((character) => {
        const code = character.codePointAt(0) ?? 0;
        return code <= 31 || code === 127;
      })
    ) {
      return undefined;
    }
    return path;
  }
  return localPath(value) || localPath(fallback) || '/';
}
