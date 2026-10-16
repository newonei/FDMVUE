import type { DingTalkSettingsApi } from '#/api/fdmdingtalk/settings';

export type SettingsForm = Required<DingTalkSettingsApi.SaveParams>;

export function settingsToForm(
  settings: DingTalkSettingsApi.Settings,
): SettingsForm {
  return {
    appName: settings.appName || '',
    corpId: settings.corpId || '',
    clientId: settings.clientId || '',
    agentId: settings.agentId || '',
    appSecret: '',
    enabled: settings.enabled,
    frontendBaseUrl: settings.frontendBaseUrl || '',
    developerAppId: settings.developerAppId || '',
    robotCode: settings.robotCode || '',
  };
}

export function createEmptySettingsForm(): SettingsForm {
  return {
    appName: '',
    corpId: '',
    clientId: '',
    agentId: '',
    appSecret: '',
    enabled: false,
    frontendBaseUrl: '',
    developerAppId: '',
    robotCode: '',
  };
}

export function buildSettingsSavePayload(
  form: SettingsForm,
): DingTalkSettingsApi.SaveParams {
  const { appSecret, ...fields } = form;
  return {
    appName: fields.appName.trim(),
    corpId: fields.corpId.trim(),
    clientId: fields.clientId.trim(),
    agentId: fields.agentId.trim(),
    enabled: fields.enabled,
    frontendBaseUrl: fields.frontendBaseUrl.trim().replace(/\/+$/, ''),
    developerAppId: fields.developerAppId.trim(),
    robotCode: fields.robotCode.trim(),
    ...(appSecret.trim() ? { appSecret: appSecret.trim() } : {}),
  };
}

/** A base URL must never carry credentials, a query, or a fragment. */
export function isValidFrontendBaseUrl(value: string): boolean {
  if (
    !/^https?:\/\//i.test(value) ||
    value.includes('?') ||
    value.includes('#') ||
    value.includes('\\') ||
    [...value].some((character) => (character.codePointAt(0) ?? 0) <= 32)
  ) {
    return false;
  }
  try {
    const url = new URL(value);
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      !!url.hostname &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

export function buildDingTalkEntryUrls(baseUrl: string) {
  const value = baseUrl.trim().replace(/\/+$/, '');
  if (!isValidFrontendBaseUrl(value)) return undefined;
  return {
    homepage: `${value}/auth/login`,
    callback: `${value}/user/auth`,
    trustedDomain: new URL(value).hostname,
  };
}

export function buildDingTalkPlatformUrl(developerAppId: string): string {
  const id = developerAppId.trim();
  if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id)) {
    return 'https://open-dev.dingtalk.com/';
  }
  const appPath = `/app/${id}/dev`;
  return `https://open-dev.dingtalk.com/fe/ai?hash=${encodeURIComponent(`#${appPath}`)}#${appPath}`;
}
