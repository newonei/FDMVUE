import type { AuthApi } from '#/api/core/auth';

import { requestClient } from '#/api/request';

/**
 * 钉钉登录 API
 *
 * 后端模块：yudao-module-fdmdingtalk
 * 接口前缀：/admin-api/fdmdingtalk/auth/*
 *
 * 不走框架自带 /system/auth/social-login —— 这是飞德慕独立实现的
 * "按手机号匹配 system_users、不自动建号" 的钉钉登录链路。
 */
export namespace DingTalkAuthApi {
  /** OAuth2 网页登录请求体 */
  export interface OAuthLoginParams {
    code: string;
    state?: string;
  }

  /** 工作台 / 小程序 免登请求体 */
  export interface MiniLoginParams {
    code: string;
    corpId: string;
  }
}

/**
 * 路径 A：OAuth2 网页授权登录
 * - 外部浏览器跳转 login.dingtalk.com 后，回调页拿到 code 调用此接口
 */
export function dingtalkLogin(data: DingTalkAuthApi.OAuthLoginParams) {
  return requestClient.post<AuthApi.LoginResult>(
    '/fdmdingtalk/auth/dingtalk-login',
    data,
    {
      headers: { isEncrypt: false },
    },
  );
}

/**
 * 路径 B / C：钉钉工作台 / H5 微应用 / 小程序 免登
 * - 在钉钉客户端内由 dd.requestAuthCode / dd.getAuthCode 获取 code 后调用
 */
export function dingtalkMiniLogin(data: DingTalkAuthApi.MiniLoginParams) {
  return requestClient.post<AuthApi.LoginResult>(
    '/fdmdingtalk/auth/dingtalk-mini-login',
    data,
    {
      headers: { isEncrypt: false },
    },
  );
}
