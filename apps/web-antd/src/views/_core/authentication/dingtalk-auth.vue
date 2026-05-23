<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { preferences } from '@vben/preferences';
import { useAccessStore, useUserStore } from '@vben/stores';

import { message, Spin } from 'ant-design-vue';

import { dingtalkLogin } from '#/api/fdmdingtalk/auth';
import { useAuthStore } from '#/store';

/**
 * 钉钉 OAuth2 网页授权回调页（路径 A 专用）
 *
 * 登记到钉钉开放平台 → 应用开发 → 登录与分享 → 回调域名 的那个 URL，就是
 *   {当前域名}/user/auth
 *
 * 例：http://8.148.31.191/user/auth
 *
 * 流程：钉钉登录页授权 → 钉钉带 ?code=xxx&state=xxx 跳到这里
 *      → 调后端 /admin-api/fdmdingtalk/auth/dingtalk-login
 *      → 拿到 accessToken/refreshToken → 拉用户信息 → 进首页
 */
defineOptions({ name: 'DingTalkAuth' });

const route = useRoute();
const router = useRouter();
const accessStore = useAccessStore();
const userStore = useUserStore();
const authStore = useAuthStore();

const status = ref<'error' | 'loading'>('loading');
const errorMsg = ref('');

onMounted(async () => {
  const code = route.query.code as string | undefined;
  const state = route.query.state as string | undefined;
  const redirect = (route.query.redirect as string) || '/';

  if (!code) {
    status.value = 'error';
    errorMsg.value = '缺少 code 参数，无法继续登录';
    message.error(errorMsg.value);
    setTimeout(() => router.replace('/auth/login'), 2000);
    return;
  }

  try {
    const res = await dingtalkLogin({ code, state });
    if (!res?.accessToken) {
      throw new Error('后端未返回 accessToken');
    }
    accessStore.setAccessToken(res.accessToken);
    accessStore.setRefreshToken(res.refreshToken);

    // 拉用户信息 + 权限
    await authStore.fetchUserInfo();
    const userInfo = userStore.userInfo;

    message.success('钉钉登录成功');
    // 跳到首页（或 ?redirect= 指定的页面）
    const target = redirect.startsWith('/')
      ? redirect
      : userInfo?.homePath || preferences.app.defaultHomePath;
    window.location.href = target;
  } catch (err: any) {
    status.value = 'error';
    errorMsg.value = err?.message || '钉钉登录失败';
    message.error(errorMsg.value);
    setTimeout(() => router.replace('/auth/login'), 2500);
  }
});
</script>

<template>
  <div class="dingtalk-callback">
    <Spin v-if="status === 'loading'" tip="正在通过钉钉登录..." size="large" />
    <div v-else class="error">
      <p>登录失败：{{ errorMsg }}</p>
      <p>2 秒后返回登录页…</p>
    </div>
  </div>
</template>

<style scoped>
.dingtalk-callback {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
}
.error {
  color: #ff4d4f;
  text-align: center;
  line-height: 1.8;
}
</style>
