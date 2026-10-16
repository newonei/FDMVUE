<script setup lang="ts">
import type { CardDetail } from './model';

import { onMounted, ref } from 'vue';

import { formatDingTalkCardTime } from '../../utils/dingtalk-card-time';
import { CardApiError, createCardApi } from './api';
import { requestCardAuthCode } from './auth';
import {
  cardSessionKey,
  createCardSession,
  detailStatusLabel,
  parseCardId,
  readCardSession,
} from './model';

const detail = ref<CardDetail>();
const loading = ref(false);
const stage = ref('正在读取通知');
const pageError = ref('');
const inDingTalk = /DingTalk/i.test(navigator.userAgent);
const appConfig = (
  window as Window & {
    _VBEN_ADMIN_PRO_APP_CONF_?: { VITE_GLOB_API_URL?: string };
  }
)._VBEN_ADMIN_PRO_APP_CONF_;
const api = createCardApi(
  appConfig?.VITE_GLOB_API_URL ||
    import.meta.env.VITE_GLOB_API_URL ||
    '/admin-api',
);

async function loadDetail() {
  if (loading.value) return;
  pageError.value = '';
  detail.value = undefined;
  loading.value = true;
  try {
    const id = parseCardId(window.location.search);
    if (!inDingTalk) throw new Error('请在钉钉客户端内打开这条通知');
    stage.value = '正在确认企业';
    const tenantId = await api.resolveTenant(window.location.hostname);
    const config = await api.publicConfig(tenantId);
    if (!config.enabled || !config.corpId || !config.clientId) {
      throw new Error('当前企业尚未启用钉钉应用，请联系管理员');
    }
    const sessionKey = cardSessionKey(tenantId, config);
    let cached;
    try {
      cached = readCardSession(sessionStorage, sessionKey);
    } catch {
      /* Login works when storage is unavailable. */
    }
    if (cached) {
      stage.value = '正在加载通知';
      try {
        detail.value = await api.detail(tenantId, cached.accessToken, id);
        return;
      } catch (error) {
        if (!(error instanceof CardApiError) || error.code !== 401) throw error;
        try {
          sessionStorage.removeItem(sessionKey);
        } catch {
          /* No persistent session is needed. */
        }
      }
    }
    stage.value = '正在钉钉免登';
    const code = await requestCardAuthCode(config.corpId, config.clientId);
    const login = await api.login(tenantId, config.corpId, code);
    const session = createCardSession(login.accessToken, login.expiresTime);
    try {
      sessionStorage.setItem(sessionKey, JSON.stringify(session));
    } catch {
      /* Continue with the current in-memory token. */
    }
    stage.value = '正在加载通知';
    detail.value = await api.detail(tenantId, session.accessToken, id);
  } catch (error) {
    pageError.value =
      error instanceof Error ? error.message : '加载失败，请稍后重试';
  } finally {
    loading.value = false;
  }
}

onMounted(loadDetail);
</script>

<template>
  <main class="detail-shell">
    <header class="brand">
      <span class="brand-mark" aria-hidden="true">钉</span><span>飞德慕 · 企业通知</span>
    </header>
    <article v-if="detail" class="notification">
      <div class="notification-meta">
        <span
          class="status"
          :class="[{ confirmed: detail.status === 'ACKNOWLEDGED' }]"
          >{{ detailStatusLabel(detail.status) }}</span><time>{{ formatDingTalkCardTime(detail.createTime) }}</time>
      </div>
      <h1>{{ detail.title }}</h1>
      <div class="notification-content">{{ detail.content }}</div>
      <footer v-if="detail.acknowledgedAt" class="receipt">
        已于 {{ formatDingTalkCardTime(detail.acknowledgedAt) }} 确认知晓
      </footer>
      <footer v-else class="receipt">
        可返回钉钉卡片，点击“我已知晓”完成确认。
      </footer>
      <button
        class="refresh"
        type="button"
        :disabled="loading"
        @click="loadDetail"
      >
        刷新状态
      </button>
    </article>
    <section v-else class="state-panel" aria-live="polite">
      <template v-if="loading">
        <span class="spinner" aria-hidden="true"></span>
        <h1>{{ stage }}</h1>
        <p>即将显示通知内容</p>
      </template>
      <template v-else>
        <span class="state-icon" aria-hidden="true">!</span>
        <h1>{{ inDingTalk ? '暂时无法显示通知' : '请在钉钉内打开' }}</h1>
        <p>{{ pageError }}</p>
        <button v-if="inDingTalk" type="button" @click="loadDetail">
          重新加载
        </button>
      </template>
    </section>
    <p class="privacy-note">仅通知收件人可查看此内容</p>
  </main>
</template>

<style>
html {
  color-scheme: light;
}

body.dingtalk-card-page {
  min-width: 280px;
  margin: 0;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC',
    'Microsoft YaHei', sans-serif;
  color: #19314f;
  background: #f4f7fb;
}

.detail-shell {
  width: min(100% - 32px, 720px);
  padding: 28px 0;
  margin: 0 auto;
}

.brand {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 22px;
  font-size: 14px;
  color: #52657c;
}

.brand-mark {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  font-weight: 700;
  color: white;
  background: #1677ff;
  border-radius: 9px;
}

.notification,
.state-panel {
  padding: 30px;
  background: white;
  border: 1px solid #e6edf5;
  border-radius: 16px;
  box-shadow: 0 8px 32px #1b4e8610;
}

.notification-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  font-size: 12px;
  color: #7b8b9d;
}

.status {
  padding: 4px 9px;
  color: #2468b8;
  background: #eaf2ff;
  border-radius: 6px;
}

.status.confirmed {
  color: #24834d;
  background: #e8f7ef;
}

h1 {
  margin: 20px 0;
  font-size: 24px;
  line-height: 1.5;
  color: #172b4d;
  overflow-wrap: anywhere;
}

.notification-content {
  font-size: 16px;
  line-height: 1.9;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.receipt {
  padding-top: 20px;
  margin-top: 30px;
  font-size: 13px;
  line-height: 1.8;
  color: #76869b;
  border-top: 1px solid #edf1f6;
}

button {
  padding: 10px 18px;
  margin-top: 22px;
  font: inherit;
  font-size: 14px;
  color: white;
  cursor: pointer;
  background: #1677ff;
  border: none;
  border-radius: 8px;
}

button:disabled {
  cursor: wait;
  opacity: 0.6;
}

button.refresh {
  color: #2169ba;
  background: #edf4fe;
}

.state-panel {
  padding-block: 50px;
  text-align: center;
}

.state-panel h1 {
  font-size: 20px;
}

.state-panel p {
  line-height: 1.8;
  color: #718198;
  overflow-wrap: anywhere;
}

.state-icon {
  display: inline-grid;
  place-items: center;
  width: 44px;
  height: 44px;
  font-size: 25px;
  color: #1677ff;
  background: #edf4fe;
  border-radius: 50%;
}

.privacy-note {
  margin-top: 20px;
  font-size: 12px;
  color: #8b99ab;
  text-align: center;
}

.spinner {
  display: inline-block;
  width: 28px;
  height: 28px;
  border: 3px solid #dfebfc;
  border-top-color: #1677ff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (width <= 480px) {
  .detail-shell {
    padding-top: 20px;
  }

  .notification,
  .state-panel {
    padding: 24px 20px;
  }

  h1 {
    font-size: 22px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation: none;
  }
}
</style>
