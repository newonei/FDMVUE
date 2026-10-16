import { describe, expect, it } from 'vitest';

import {
  buildDingTalkEntryUrls,
  buildDingTalkPlatformUrl,
  buildSettingsSavePayload,
  createEmptySettingsForm,
  isValidFrontendBaseUrl,
  settingsToForm,
} from './model';

describe('dingTalk settings form boundaries', () => {
  it('rejects every ASCII control character and space inside a base URL', () => {
    for (let code = 0; code <= 32; code++) {
      const url = `https://example.com/fdm${String.fromCodePoint(code)}path`;
      expect(isValidFrontendBaseUrl(url)).toBe(false);
      expect(buildDingTalkEntryUrls(url)).toBeUndefined();
    }
    expect(isValidFrontendBaseUrl('https://example.com/通知')).toBe(true);
  });

  it('omits an unchanged secret and never copies a server-side secret into the form', () => {
    const serverResponse = {
      ...createEmptySettingsForm(),
      appSecret: 'server-secret-must-not-be-used',
      appSecretConfigured: true,
      userMappingCount: 1,
      deptMappingCount: 2,
      todoMappingCount: 3,
      streamEnabled: false,
      streamRunning: false,
    };
    const form = settingsToForm(serverResponse);
    expect(form.appSecret).toBe('');
    expect(buildSettingsSavePayload(form)).not.toHaveProperty('appSecret');
  });

  it('only sends the new secret when the administrator enters one', () => {
    const form = { ...createEmptySettingsForm(), appSecret: ' new-secret ' };
    expect(buildSettingsSavePayload(form).appSecret).toBe('new-secret');
    expect(form.appSecret).toBe(' new-secret ');
    expect(
      buildSettingsSavePayload({ ...form, appSecret: '  ' }),
    ).not.toHaveProperty('appSecret');
  });

  it('normalizes base URLs without dropping an application path', () => {
    expect(buildDingTalkEntryUrls(' https://example.com/fdm/ ')).toEqual({
      homepage: 'https://example.com/fdm/auth/login',
      callback: 'https://example.com/fdm/user/auth',
      trustedDomain: 'example.com',
    });
  });

  it.each([
    'javascript:alert(1)',
    '//example.com',
    'https://user:secret@example.com',
    'https://example.com?token=secret',
    'https://example.com/#/app',
    'http:example.com',
    'https://example.com?',
    'https://example.com#',
    String.raw`https://example.com\path`,
    '',
  ])('rejects unsafe or ambiguous base URLs: %s', (value) => {
    expect(isValidFrontendBaseUrl(value)).toBe(false);
    expect(buildDingTalkEntryUrls(value)).toBeUndefined();
  });

  it('builds the requested application URL only from a UUID', () => {
    const uuid = '09c2e01a-6f87-48a7-a8b9-2f53ebce7137';
    const url = new URL(buildDingTalkPlatformUrl(uuid));
    expect(url.origin).toBe('https://open-dev.dingtalk.com');
    expect(url.searchParams.get('hash')).toBe(`#/app/${uuid}/dev`);
    expect(url.hash).toBe(`#/app/${uuid}/dev`);
    expect(buildDingTalkPlatformUrl('javascript:alert(1)')).toBe(
      'https://open-dev.dingtalk.com/',
    );
  });
});
