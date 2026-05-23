import type { AuthApi } from '#/api/core/auth';

import { useAccessStore } from '@vben/stores';

import { getTenantByWebsite } from '#/api/core/auth';
import { dingtalkMiniLogin } from '#/api/fdmdingtalk/auth';

/**
 * 钉钉登录的环境检测与 JSAPI 封装。
 *
 * 三种登录路径：
 *  - A: 外部浏览器 OAuth2 网页授权（跳转 login.dingtalk.com）
 *  - B: 钉钉工作台 / H5 微应用 免登（dd.requestAuthCode）
 *  - C: 钉钉小程序免登（dd.getAuthCode，本工具暂未涵盖小程序）
 *
 * 本文件只关心 A 的 URL 构造 与 B 的完整流程；C 留给小程序工程自己接。
 */

interface DingTalkConfig {
  corpId: string;
  clientId: string;
}

interface DingTalkAuthResult {
  code: string;
}

/**
 * 读取钉钉应用配置（corpId + clientId）。
 * 优先环境变量 VITE_APP_DINGTALK_CORP_ID / VITE_APP_DINGTALK_CLIENT_ID。
 */
export function getDingTalkConfig(): DingTalkConfig {
  return {
    corpId: import.meta.env.VITE_APP_DINGTALK_CORP_ID || '',
    clientId: import.meta.env.VITE_APP_DINGTALK_CLIENT_ID || '',
  };
}

/** 当前是否处于钉钉客户端环境（PC / 手机客户端 / 内置浏览器） */
export function isInDingTalk(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /DingTalk/i.test(navigator.userAgent);
}

/**
 * 确保 tenantId 已写入 accessStore。
 *
 * 规则：
 *  - 多租户未启用 → 直接 true
 *  - accessStore 已有 tenantId → 直接 true
 *  - VITE_APP_DEFAULT_LOGIN_TENANT 配了 → 调 getTenantByWebsite/by-name 拿 ID
 *  - 否则 false（让调用方决定弹窗 / 中止）
 */
export async function ensureDingTalkTenantId(): Promise<boolean> {
  const tenantEnable = import.meta.env.VITE_APP_TENANT_ENABLE === 'true';
  if (!tenantEnable) return true;

  const accessStore = useAccessStore();
  if (accessStore.tenantId) return true;

  // 1) 先按当前域名拿
  try {
    const t = await getTenantByWebsite(window.location.hostname);
    if (t?.id) {
      accessStore.setTenantId(t.id);
      return true;
    }
  } catch {
    /* 忽略，继续兜底 */
  }

  // 2) 没配默认租户就放弃，调用方自己决定怎么提示
  const defaultTenant = import.meta.env.VITE_APP_DEFAULT_LOGIN_TENANT;
  if (!defaultTenant) return false;

  // 留给业务方接 getTenantByName；这里只演示拿不到就 false
  return false;
}

/**
 * 调钉钉 JSAPI 获取免登 code。
 *
 * 先尝试新版 dd.requestAuthCode（dingtalk-jsapi 2.x），失败再降级到老版
 * dd.runtime.permission.requestAuthCode。
 */
export async function requestDingTalkAuthCode(
  corpId: string,
  clientId: string,
): Promise<string> {
  // 动态 import，避免外部浏览器加载 dingtalk-jsapi 报错
  // @ts-expect-error - 第三方库无类型定义
  const ddModule = await import('dingtalk-jsapi');
  const dd = ddModule.default || ddModule;

  // 新版（钉钉 PC 客户端 / 钉钉浏览器内部应用）
  if (typeof dd.requestAuthCode === 'function') {
    return new Promise<string>((resolve, reject) => {
      dd.requestAuthCode({
        corpId,
        clientId,
        onSuccess: (result: DingTalkAuthResult) => resolve(result.code),
        onFail: (err: unknown) => reject(err),
      });
    });
  }

  // 老版降级
  return new Promise<string>((resolve, reject) => {
    dd.ready(() => {
      dd.runtime.permission.requestAuthCode({
        corpId,
        onSuccess: (result: DingTalkAuthResult) => resolve(result.code),
        onFail: (err: unknown) => reject(err),
      });
    });
    dd.error?.((err: unknown) => reject(err));
  });
}

/**
 * 完整的"钉钉工作台免登"流程（路径 B）。
 *
 * - 不在钉钉客户端内 → 返回 null（调用方降级到 OAuth 或表单登录）
 * - 多租户处理失败 → throw
 * - JSAPI / 后端接口失败 → throw
 *
 * 成功返回 { accessToken, refreshToken, ... }。
 */
export async function performDingTalkWorkbenchLogin(): Promise<AuthApi.LoginResult | null> {
  if (!isInDingTalk()) return null;

  const ok = await ensureDingTalkTenantId();
  if (!ok) {
    throw new Error('租户未配置，无法走钉钉免登');
  }

  const { corpId, clientId } = getDingTalkConfig();
  if (!corpId || !clientId) {
    throw new Error(
      '钉钉 corpId / clientId 未配置，请检查 VITE_APP_DINGTALK_* 环境变量',
    );
  }

  const code = await requestDingTalkAuthCode(corpId, clientId);
  return await dingtalkMiniLogin({ code, corpId });
}

/**
 * 构造钉钉 OAuth2 授权 URL（路径 A 用，前端跳转用）
 */
export function buildDingTalkOAuthUrl(redirectUri: string, state?: string) {
  const { corpId, clientId } = getDingTalkConfig();
  if (!corpId || !clientId) {
    throw new Error('钉钉 corpId / clientId 未配置');
  }
  const params = new URLSearchParams({
    redirect_uri: redirectUri,
    response_type: 'code',
    client_id: clientId,
    scope: 'openid corpid',
    prompt: 'consent',
    state: state ?? Math.random().toString(36).slice(2),
    corpId,
  });
  return `https://login.dingtalk.com/oauth2/auth?${params.toString()}`;
}
