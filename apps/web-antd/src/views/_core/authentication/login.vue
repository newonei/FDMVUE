<script lang="ts" setup>
import type { VbenFormSchema } from '@vben/common-ui';

import type { AuthApi } from '#/api/core/auth';

import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';

import { AuthenticationLogin, Verification, z } from '@vben/common-ui';
import { isCaptchaEnable, isTenantEnable } from '@vben/hooks';
import { $t } from '@vben/locales';
import { preferences } from '@vben/preferences';
import { useAccessStore } from '@vben/stores';

import {
  checkCaptcha,
  getCaptcha,
  getTenantByWebsite,
  getTenantSimpleList,
  socialAuthRedirect,
} from '#/api/core/auth';
import { useAuthStore } from '#/store';
import {
  buildDingTalkOAuthUrl,
  isInDingTalk,
  performDingTalkWorkbenchLogin,
} from '#/utils/dingtalk';

defineOptions({ name: 'Login' });

const { query } = useRoute();
const authStore = useAuthStore();
const accessStore = useAccessStore();
const tenantEnable = isTenantEnable();
const captchaEnable = isCaptchaEnable();

const loginRef = ref();
const verifyRef = ref();

const captchaType = 'blockPuzzle'; // 验证码类型：'blockPuzzle' | 'clickWord'

/** 获取租户列表，并默认选中 */
const tenantList = ref<AuthApi.TenantResult[]>([]); // 租户列表
async function fetchTenantList() {
  if (!tenantEnable) {
    return;
  }
  try {
    // 获取租户列表、域名对应租户
    const websiteTenantPromise = getTenantByWebsite(window.location.hostname);
    tenantList.value = await getTenantSimpleList();

    // 选中租户：域名 > store 中的租户 > 首个租户
    let tenantId: null | number = null;
    const websiteTenant = await websiteTenantPromise;
    if (websiteTenant?.id) {
      tenantId = websiteTenant.id;
    }
    // 如果没有从域名获取到租户，尝试从 store 中获取
    if (!tenantId && accessStore.tenantId) {
      tenantId = accessStore.tenantId;
    }
    // 如果还是没有租户，使用列表中的第一个
    if (!tenantId && tenantList.value?.[0]?.id) {
      tenantId = tenantList.value[0].id;
    }

    // 设置选中的租户编号
    accessStore.setTenantId(tenantId);
    loginRef.value.getFormApi().setFieldValue('tenantId', tenantId?.toString());
  } catch (error) {
    console.error('获取租户列表失败:', error);
  }
}

/** 处理登录 */
async function handleLogin(values: any) {
  // 如果开启验证码，则先验证验证码
  if (captchaEnable) {
    verifyRef.value.show();
    return;
  }
  // 无验证码，直接登录
  await authStore.authLogin('username', values);
}

/** 验证码通过，执行登录 */
async function handleVerifySuccess({ captchaVerification }: any) {
  try {
    await authStore.authLogin('username', {
      ...(await loginRef.value.getFormApi().getValues()),
      captchaVerification,
    });
  } catch (error) {
    console.error('Error in handleLogin:', error);
  }
}

/** 处理第三方登录 */
const redirect = query?.redirect;

/** 是否正在执行钉钉免登（用于显示全屏遮罩） */
const dingtalkAutoLoading = ref(false);

async function handleThirdLogin(type: number) {
  if (type <= 0) {
    return;
  }

  // 钉钉（type=20）走独立链路：钉钉客户端内免登，外部浏览器 OAuth
  if (type === 20) {
    await handleDingTalkLogin();
    return;
  }

  try {
    // 计算 redirectUri
    // tricky: type、redirect 需要先 encode 一次，否则钉钉回调会丢失。配合 social-login.vue#getUrlValue() 使用
    const redirectUri = `${
      location.origin
    }/auth/social-login?${encodeURIComponent(
      `type=${type}&redirect=${redirect || '/'}`,
    )}`;

    // 进行跳转
    window.location.href = await socialAuthRedirect(type, redirectUri);
  } catch (error) {
    console.error('第三方登录处理失败:', error);
  }
}

/** 钉钉登录入口：内部走免登，外部走 OAuth */
async function handleDingTalkLogin() {
  try {
    if (isInDingTalk()) {
      dingtalkAutoLoading.value = true;
      const token = await performDingTalkWorkbenchLogin();
      if (!token) return;
      accessStore.setAccessToken(token.accessToken);
      accessStore.setRefreshToken(token.refreshToken);
      // 用 location.href 强刷，触发守卫重新加载权限和动态路由
      const target = (redirect as string) || preferences.app.defaultHomePath;
      window.location.href = decodeURIComponent(target);
      return;
    }

    // 外部浏览器：跳钉钉 OAuth
    const redirectUri = `${location.origin}/user/auth?redirect=${encodeURIComponent(
      (redirect as string) || '/',
    )}`;
    window.location.href = buildDingTalkOAuthUrl(redirectUri);
  } catch (e) {
    console.error('钉钉登录失败:', e);
  } finally {
    dingtalkAutoLoading.value = false;
  }
}

/** 钉钉工作台进入时自动免登（无需用户点击） */
async function tryDingTalkAutoLogin() {
  if (accessStore.accessToken) return;
  if (!isInDingTalk()) return;
  dingtalkAutoLoading.value = true;
  try {
    const token = await performDingTalkWorkbenchLogin();
    if (!token) return;
    accessStore.setAccessToken(token.accessToken);
    accessStore.setRefreshToken(token.refreshToken);
    const target = (redirect as string) || preferences.app.defaultHomePath;
    window.location.href = decodeURIComponent(target);
  } catch (e) {
    // 失败仅 warn，降级到手动登录页
    console.warn('钉钉工作台免登失败，降级为手动登录', e);
  } finally {
    dingtalkAutoLoading.value = false;
  }
}

/** 组件挂载时获取租户信息 + 尝试钉钉免登 */
onMounted(async () => {
  await fetchTenantList();
  await tryDingTalkAutoLogin();
});

const formSchema = computed((): VbenFormSchema[] => {
  return [
    {
      component: 'VbenSelect',
      componentProps: {
        options: tenantList.value.map((item) => ({
          label: item.name,
          value: item.id.toString(),
        })),
        placeholder: $t('authentication.tenantTip'),
      },
      fieldName: 'tenantId',
      label: $t('authentication.tenant'),
      rules: z.string().min(1, { message: $t('authentication.tenantTip') }),
      dependencies: {
        triggerFields: ['tenantId'],
        if: tenantEnable,
        trigger(values) {
          if (values.tenantId) {
            accessStore.setTenantId(Number(values.tenantId));
          }
        },
      },
    },
    {
      component: 'VbenInput',
      componentProps: {
        placeholder: $t('authentication.usernameTip'),
      },
      fieldName: 'username',
      label: $t('authentication.username'),
      rules: z
        .string()
        .min(1, { message: $t('authentication.usernameTip') })
        .default(import.meta.env.VITE_APP_DEFAULT_USERNAME),
    },
    {
      component: 'VbenInputPassword',
      componentProps: {
        placeholder: $t('authentication.passwordTip'),
      },
      fieldName: 'password',
      label: $t('authentication.password'),
      rules: z
        .string()
        .min(1, { message: $t('authentication.passwordTip') })
        .default(import.meta.env.VITE_APP_DEFAULT_PASSWORD),
    },
  ];
});
</script>

<template>
  <div>
    <AuthenticationLogin
      ref="loginRef"
      :form-schema="formSchema"
      :loading="authStore.loginLoading"
      @submit="handleLogin"
      @third-login="handleThirdLogin"
    />
    <Verification
      ref="verifyRef"
      v-if="captchaEnable"
      :captcha-type="captchaType"
      :check-captcha-api="checkCaptcha"
      :get-captcha-api="getCaptcha"
      :img-size="{ width: '400px', height: '200px' }"
      mode="pop"
      @on-success="handleVerifySuccess"
    />

    <!-- 钉钉工作台自动免登的全屏遮罩 -->
    <div
      v-if="dingtalkAutoLoading"
      class="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white/95 dark:bg-gray-900/95"
    >
      <div
        class="border-primary mb-4 h-12 w-12 animate-spin rounded-full border-4 border-t-transparent"
      ></div>
      <p class="text-base text-gray-700 dark:text-gray-200">正在钉钉免登...</p>
    </div>
  </div>
</template>
