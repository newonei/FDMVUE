import type { RouteRecordRaw } from 'vue-router';

import { LOGIN_PATH } from '@vben/constants';
import { preferences } from '@vben/preferences';

import { $t } from '#/locales';

const BasicLayout = () => import('#/layouts/basic.vue');
const AuthPageLayout = () => import('#/layouts/auth.vue');
/** 全局404页面 */
const fallbackNotFoundRoute: RouteRecordRaw = {
  component: () => import('#/views/_core/fallback/not-found.vue'),
  meta: {
    hideInBreadcrumb: true,
    hideInMenu: true,
    hideInTab: true,
    title: '404',
  },
  name: 'FallbackNotFound',
  path: '/:path(.*)*',
};

/** 基本路由，这些路由是必须存在的 */
const coreRoutes: RouteRecordRaw[] = [
  /**
   * 根路由
   * 使用基础布局，作为所有页面的父级容器，子级就不必配置BasicLayout。
   * 此路由必须存在，且不应修改
   */
  {
    component: BasicLayout,
    meta: {
      hideInBreadcrumb: true,
      title: 'Root',
    },
    name: 'Root',
    path: '/',
    redirect: preferences.app.defaultHomePath,
    children: [],
  },
  {
    component: AuthPageLayout,
    meta: {
      hideInTab: true,
      title: 'Authentication',
    },
    name: 'Authentication',
    path: '/auth',
    redirect: LOGIN_PATH,
    children: [
      {
        name: 'Login',
        path: 'login',
        component: () => import('#/views/_core/authentication/login.vue'),
        meta: {
          title: $t('page.auth.login'),
        },
      },
      {
        name: 'CodeLogin',
        path: 'code-login',
        component: () => import('#/views/_core/authentication/code-login.vue'),
        meta: {
          title: $t('page.auth.codeLogin'),
        },
      },
      {
        name: 'QrCodeLogin',
        path: 'qrcode-login',
        component: () =>
          import('#/views/_core/authentication/qrcode-login.vue'),
        meta: {
          title: $t('page.auth.qrcodeLogin'),
        },
      },
      {
        name: 'ForgetPassword',
        path: 'forget-password',
        component: () =>
          import('#/views/_core/authentication/forget-password.vue'),
        meta: {
          title: $t('page.auth.forgetPassword'),
        },
      },
      {
        name: 'Register',
        path: 'register',
        component: () => import('#/views/_core/authentication/register.vue'),
        meta: {
          title: $t('page.auth.register'),
        },
      },
      {
        name: 'SocialLogin',
        path: 'social-login',
        component: () =>
          import('#/views/_core/authentication/social-login.vue'),
        meta: {
          title: $t('page.auth.login'),
        },
      },
      {
        name: 'SSOLogin',
        path: 'sso-login',
        component: () => import('#/views/_core/authentication/sso-login.vue'),
        meta: {
          title: $t('page.auth.login'),
        },
      },
    ],
  },
  /**
   * 用于 bpm 移动端流程表单 web-view 的嵌入
   */
  {
    component: () => import('#/views/bpm/form/mobile/index.vue'),
    meta: {
      hideInBreadcrumb: true,
      hideInMenu: true,
      hideInTab: true,
      ignoreAccess: true,
      title: '移动端流程表单展示',
    },
    name: 'BpmMobileFormPreview',
    path: '/bpm/mobile/form-preview',
  },
  /**
   * 钉钉 OAuth2 网页登录回调页（路径 A）。
   * 钉钉开放平台「OAuth2 重定向 URL」需配置为：{前端域名}/user/auth
   * meta.ignoreAccess 让守卫放行该路径，无需 token 即可访问。
   */
  {
    component: () =>
      import('#/views/_core/authentication/dingtalk-auth.vue'),
    meta: {
      hideInBreadcrumb: true,
      hideInMenu: true,
      hideInTab: true,
      ignoreAccess: true,
      title: '钉钉登录回调',
    },
    name: 'DingTalkAuth',
    path: '/user/auth',
  },
];

export { coreRoutes, fallbackNotFoundRoute };
