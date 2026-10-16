<script lang="ts" setup>
import type { FormInstance, FormProps } from 'ant-design-vue';

import type { DingTalkSettingsApi } from '#/api/fdmdingtalk/settings';

import { computed, onMounted, reactive, ref } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';

import { useClipboard } from '@vueuse/core';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  Form,
  Input,
  message,
  Modal,
  Space,
  Spin,
  Switch,
  Tabs,
  Tag,
} from 'ant-design-vue';

import {
  checkDingTalkConnection,
  getDingTalkSettings,
  reconnectDingTalkStream,
  saveDingTalkSettings,
  syncDingTalkDepartments,
  syncDingTalkUserDepartments,
} from '#/api/fdmdingtalk/settings';

import InteractiveCards from './interactive-cards.vue';
import {
  buildDingTalkEntryUrls,
  buildDingTalkPlatformUrl,
  buildSettingsSavePayload,
  createEmptySettingsForm,
  isValidFrontendBaseUrl,
  settingsToForm,
} from './model';

defineOptions({ name: 'FdmDingtalkSettings' });

const { hasAccessByCodes } = useAccess();
const canUpdate = computed(() =>
  hasAccessByCodes(['fdmdingtalk:settings:update']),
);
const { copy } = useClipboard({ legacy: true });
const activeTab = ref('connection');
const formRef = ref<FormInstance>();
const form = reactive(createEmptySettingsForm());
const baseline = ref(JSON.stringify(form));
const saved = ref<DingTalkSettingsApi.Settings>();
const loading = ref(false);
const saving = ref(false);
const testing = ref(false);
const reconnecting = ref(false);
const syncing = ref<'departments' | 'users'>();
const pageError = ref('');
const connection = ref<DingTalkSettingsApi.ConnectionResult>();
const syncResult = ref<DingTalkSettingsApi.SyncResult>();
const syncLabel = ref('');
const dirty = computed(() => JSON.stringify(form) !== baseline.value);
const entryUrls = computed(() => buildDingTalkEntryUrls(form.frontendBaseUrl));
const platformUrl = computed(() =>
  buildDingTalkPlatformUrl(form.developerAppId),
);
const disabledActions = computed(
  () => !saved.value?.enabled || dirty.value || saving.value,
);

const rules: FormProps['rules'] = {
  appName: [{ required: true, whitespace: true, message: '请输入应用名称' }],
  corpId: [{ required: true, whitespace: true, message: '请输入企业 CorpId' }],
  clientId: [
    { required: true, whitespace: true, message: '请输入 AppKey / ClientId' },
  ],
  agentId: [
    {
      required: true,
      pattern: /^[1-9]\d{0,18}$/,
      message: '请输入有效的正整数 AgentId',
    },
  ],
  appSecret: [
    {
      validator: async (_rule, value) => {
        if (!saved.value?.appSecretConfigured && !String(value || '').trim()) {
          throw new Error('首次配置需要填写 AppSecret');
        }
      },
    },
  ],
  frontendBaseUrl: [
    {
      required: true,
      validator: async (_rule, value) => {
        if (!isValidFrontendBaseUrl(String(value || '').trim())) {
          throw new Error(
            '请输入 http(s) 系统地址，不能包含账号、查询参数或 #',
          );
        }
      },
    },
  ],
  developerAppId: [
    {
      pattern: /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i,
      message: '请输入开放平台地址中的应用 UUID',
    },
  ],
};

function errorText(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

async function loadSettings() {
  loading.value = true;
  pageError.value = '';
  try {
    const settings = await getDingTalkSettings();
    saved.value = settings;
    Object.assign(form, settingsToForm(settings));
    baseline.value = JSON.stringify(form);
    connection.value = undefined;
  } catch (error) {
    pageError.value = errorText(error, '读取钉钉配置失败，请稍后重试');
  } finally {
    loading.value = false;
  }
}

function refreshSettings() {
  if (dirty.value) {
    Modal.confirm({
      title: '重新读取已保存配置？',
      content: '当前尚未保存的修改将被清除。',
      okText: '重新读取',
      cancelText: '继续编辑',
      onOk: loadSettings,
    });
  } else {
    void loadSettings();
  }
}

async function saveSettings() {
  if (!canUpdate.value) return;
  try {
    await formRef.value?.validate();
  } catch {
    activeTab.value = 'connection';
    return;
  }
  saving.value = true;
  try {
    await saveDingTalkSettings(buildSettingsSavePayload(form));
    form.appSecret = '';
    message.success('钉钉配置已保存');
    await loadSettings();
  } finally {
    saving.value = false;
  }
}

async function testConnection() {
  if (dirty.value) {
    message.warning('请先保存修改，再测试当前应用连接');
    return;
  }
  testing.value = true;
  try {
    connection.value = await checkDingTalkConnection();
  } finally {
    testing.value = false;
  }
}

async function copyValue(value?: string) {
  if (!value) return;
  try {
    await copy(value);
    message.success('已复制');
  } catch {
    message.error('复制失败，请手动复制地址');
  }
}

function confirmSync(kind: 'departments' | 'users') {
  if (disabledActions.value) return;
  Modal.confirm({
    title:
      kind === 'departments' ? '从钉钉同步部门？' : '从钉钉同步用户部门关联？',
    content:
      kind === 'departments'
        ? '将按钉钉通讯录更新系统部门，包括调整部门层级与停用状态。请确认钉钉通讯录是本次同步的依据。'
        : '将更新已绑定用户的部门归属。尚未绑定的账号不会自动创建，请先核对员工手机号和钉钉绑定。',
    okText: '开始同步',
    cancelText: '取消',
    onOk: async () => {
      syncing.value = kind;
      try {
        syncLabel.value = kind === 'departments' ? '部门同步' : '用户部门同步';
        syncResult.value = await (kind === 'departments'
          ? syncDingTalkDepartments()
          : syncDingTalkUserDepartments());
        saved.value = await getDingTalkSettings();
        if (syncResult.value.failed > 0)
          message.warning('同步完成，部分记录失败，请查看结果');
        else message.success('同步完成');
      } finally {
        syncing.value = undefined;
      }
    },
  });
}

async function reconnectStream() {
  if (dirty.value) {
    message.warning('请先保存应用配置，再重新连接事件通道');
    return;
  }
  reconnecting.value = true;
  try {
    const running = await reconnectDingTalkStream();
    saved.value = await getDingTalkSettings();
    if (running) message.success('Stream 事件通道已连接');
    else message.warning('连接尚未就绪，请稍后刷新状态或检查服务端日志');
  } finally {
    reconnecting.value = false;
  }
}

async function refreshStreamOverview() {
  try {
    saved.value = await getDingTalkSettings();
  } catch (error) {
    pageError.value = errorText(error, '卡片配置已保存，但通道概览刷新失败，请刷新配置');
  }
}

onMounted(loadSettings);
</script>

<template>
  <Page>
    <div class="dingtalk-settings">
      <header class="settings-header">
        <div class="header-identity">
          <div class="app-mark" aria-hidden="true">钉</div>
          <div>
            <div class="eyebrow">企业应用 · 连接管理</div>
            <h1>钉钉设置</h1>
            <p>统一管理应用凭证、免登入口、通讯录与消息事件。</p>
          </div>
        </div>
        <Space wrap>
          <Button :disabled="loading || saving" @click="refreshSettings"
            >刷新配置</Button
          >
          <Button :href="platformUrl" target="_blank" rel="noopener noreferrer"
            >开放平台 ↗</Button
          >
        </Space>
      </header>

      <Alert
        v-if="pageError"
        class="mb-4"
        type="error"
        show-icon
        :message="pageError"
      />
      <Spin :spinning="loading">
        <div v-if="saved" class="settings-content">
          <div class="overview-grid">
            <Card size="small">
              <div class="metric-label">当前应用</div>
              <div class="metric-value app-name">
                {{ saved.appName || '待配置' }}
              </div>
              <Tag :color="saved.enabled ? 'green' : 'default'">{{
                saved.enabled ? '已启用' : '已停用'
              }}</Tag>
            </Card>
            <Card size="small">
              <div class="metric-label">应用凭证</div>
              <div class="metric-value">
                {{ saved.appSecretConfigured ? '已配置' : '待完善' }}
              </div>
              <span class="muted">AgentId {{ saved.agentId || '未填写' }}</span>
            </Card>
            <Card size="small">
              <div class="metric-label">已绑定员工 / 部门</div>
              <div class="metric-value">
                {{ saved.userMappingCount }} <span class="muted">/</span>
                {{ saved.deptMappingCount }}
              </div>
              <span class="muted">按当前企业统计绑定关系</span>
            </Card>
            <Card size="small">
              <div class="metric-label">Stream 事件通道</div>
              <div class="metric-value">
                {{
                  saved.streamRunning
                    ? '运行中'
                    : saved.streamEnabled
                      ? '未连接'
                      : '未启用'
                }}
              </div>
              <span class="muted">钉钉事件 / 卡片回调通道</span>
            </Card>
          </div>

          <Card
            class="configuration-card"
            :body-style="{ padding: '0 24px 24px' }"
          >
            <Tabs v-model:active-key="activeTab" size="large">
              <Tabs.TabPane key="connection" tab="应用连接">
                <div class="section-heading">
                  <h2>企业内部应用</h2>
                  <p>填写钉钉开放平台「凭证与基础信息」中的应用标识。</p>
                </div>
                <Form
                  ref="formRef"
                  :model="form"
                  :rules="rules"
                  layout="vertical"
                  :disabled="!canUpdate || saving"
                >
                  <div class="form-grid">
                    <Form.Item label="应用名称" name="appName"
                      ><Input
                        v-model:value="form.appName"
                        :maxlength="100"
                        placeholder="例如：FDM 企业协同"
                    /></Form.Item>
                    <Form.Item label="企业 CorpId" name="corpId"
                      ><Input
                        v-model:value="form.corpId"
                        placeholder="ding 开头的企业标识"
                    /></Form.Item>
                    <Form.Item label="AppKey / ClientId" name="clientId"
                      ><Input
                        v-model:value="form.clientId"
                        autocomplete="off"
                        placeholder="应用 AppKey"
                    /></Form.Item>
                    <Form.Item label="AgentId" name="agentId"
                      ><Input
                        v-model:value="form.agentId"
                        inputmode="numeric"
                        placeholder="应用的数字 AgentId"
                    /></Form.Item>
                    <Form.Item
                      label="AppSecret"
                      name="appSecret"
                      :extra="
                        saved.appSecretConfigured
                          ? '已保存密钥，留空保留原值；仅在更换密钥时填写。'
                          : '首次配置必填。密钥保存后不会回显。'
                      "
                    >
                      <Input.Password
                        v-model:value="form.appSecret"
                        autocomplete="new-password"
                        :placeholder="
                          saved.appSecretConfigured
                            ? '已配置，留空保留原密钥'
                            : '请输入 AppSecret'
                        "
                      />
                    </Form.Item>
                    <Form.Item
                      label="系统前端地址"
                      name="frontendBaseUrl"
                      extra="钉钉内可访问的系统地址，用于生成免登入口和回调 URL。"
                      ><Input
                        v-model:value="form.frontendBaseUrl"
                        placeholder="https://fdm.example.com"
                    /></Form.Item>
                    <Form.Item
                      label="开放平台应用 UUID"
                      name="developerAppId"
                      extra="来自开放平台 /app/ 后的 UUID，用于定位管理页面。"
                      ><Input
                        v-model:value="form.developerAppId"
                        placeholder="09c2e01a-6f87-48a7-a8b9-2f53ebce7137"
                    /></Form.Item>
                    <Form.Item
                      label="机器人 RobotCode"
                      name="robotCode"
                      extra="选填；应用机器人发送消息使用的机器人编码。"
                      ><Input
                        v-model:value="form.robotCode"
                        placeholder="开放平台机器人配置中的 RobotCode"
                    /></Form.Item>
                  </div>
                  <Form.Item label="应用状态" name="enabled"
                    ><Space
                      ><Switch v-model:checked="form.enabled" /><span
                        class="muted"
                        >{{
                          form.enabled
                            ? '启用钉钉应用及免登'
                            : '停用钉钉应用及免登'
                        }}</span
                      ></Space
                    ></Form.Item
                  >
                </Form>
                <div class="form-footer">
                  <Space wrap>
                    <Button
                      v-access:code="['fdmdingtalk:settings:update']"
                      type="primary"
                      :loading="saving"
                      :disabled="!dirty"
                      @click="saveSettings"
                      >保存配置</Button
                    >
                    <Button
                      v-access:code="['fdmdingtalk:settings:test']"
                      :loading="testing"
                      :disabled="
                        !saved.enabled || !saved.appSecretConfigured || saving
                      "
                      @click="testConnection"
                      >测试已保存连接</Button
                    >
                    <span v-if="dirty" class="pending-note"
                      >有尚未保存的修改，请先保存后测试。</span
                    >
                  </Space>
                </div>
                <Alert
                  v-if="connection"
                  class="mt-4"
                  show-icon
                  :type="connection.success ? 'success' : 'error'"
                  :message="
                    connection.success ? '应用凭证校验成功' : '应用连接校验失败'
                  "
                >
                  <template #description
                    ><div>{{ connection.message }}</div>
                    <div class="muted">
                      检查时间：{{
                        connection.checkedAt
                      }}。此检查验证获取访问令牌；AgentId、业务权限与消息送达需分别验证。
                    </div></template
                  >
                </Alert>
              </Tabs.TabPane>

              <Tabs.TabPane key="login" tab="免登入口">
                <div class="section-heading">
                  <h2>让员工从钉钉直接进入系统</h2>
                  <p>
                    登录读取本页已保存的应用配置；在钉钉内使用 JSAPI
                    免登，外部浏览器使用网页授权。
                  </p>
                </div>
                <Alert
                  class="mb-5"
                  type="info"
                  show-icon
                  message="以下地址根据当前表单生成，请先保存应用连接，再配置钉钉开放平台。"
                />
                <Descriptions v-if="entryUrls" bordered :column="1">
                  <Descriptions.Item label="应用首页 / 工作台入口"
                    ><div class="copy-row">
                      <code>{{ entryUrls.homepage }}</code
                      ><Button
                        size="small"
                        @click="copyValue(entryUrls?.homepage)"
                        >复制</Button
                      >
                    </div></Descriptions.Item
                  >
                  <Descriptions.Item label="OAuth2 重定向 URL"
                    ><div class="copy-row">
                      <code>{{ entryUrls.callback }}</code
                      ><Button
                        size="small"
                        @click="copyValue(entryUrls?.callback)"
                        >复制</Button
                      >
                    </div></Descriptions.Item
                  >
                  <Descriptions.Item label="前端域名"
                    ><div class="copy-row">
                      <code>{{ entryUrls.trustedDomain }}</code
                      ><Button
                        size="small"
                        @click="copyValue(entryUrls?.trustedDomain)"
                        >复制</Button
                      >
                    </div></Descriptions.Item
                  >
                </Descriptions>
                <Empty
                  v-else
                  description="请先在应用连接中填写有效的系统前端地址"
                />
                <div class="guidance-panel">
                  <h3>开放平台配置</h3>
                  <ol>
                    <li>在应用的访问地址中填写工作台入口。</li>
                    <li>
                      在登录与分享配置中登记 OAuth2 重定向
                      URL，域名与协议需一致。
                    </li>
                    <li>
                      确认员工在应用可见范围内，并具备对应系统账号和数据权限。
                    </li>
                  </ol>
                  <p>
                    免登成功会在当前页面完成路由跳转，保留原详情地址；首次进入仍需加载必要的用户权限和页面内容。
                  </p>
                </div>
              </Tabs.TabPane>

              <Tabs.TabPane key="directory" tab="通讯录绑定">
                <div class="section-heading">
                  <h2>账号与组织关系</h2>
                  <p>使用现有钉钉绑定关系，将企业组织与系统用户连接起来。</p>
                </div>
                <Descriptions bordered :column="{ xs: 1, sm: 1, md: 3 }">
                  <Descriptions.Item label="员工绑定">{{
                    saved.userMappingCount
                  }}</Descriptions.Item>
                  <Descriptions.Item label="部门绑定">{{
                    saved.deptMappingCount
                  }}</Descriptions.Item>
                  <Descriptions.Item label="待办关联">{{
                    saved.todoMappingCount
                  }}</Descriptions.Item>
                </Descriptions>
                <div class="guidance-panel">
                  <h3>同步前核对</h3>
                  <p>
                    员工登录按手机号匹配系统账号，不会自动创建新账号。先在系统维护员工账号，再核对钉钉应用的通讯录权限和可见范围。
                  </p>
                  <p>
                    部门同步会更新系统部门；用户部门同步只调整已绑定用户的部门归属。同步操作使用已保存的应用配置。
                  </p>
                </div>
                <Space class="mt-5" wrap>
                  <Button
                    v-access:code="['system:dept:update']"
                    :disabled="disabledActions || !!syncing"
                    :loading="syncing === 'departments'"
                    @click="confirmSync('departments')"
                    >同步钉钉部门</Button
                  >
                  <Button
                    v-access:code="['system:user:update']"
                    :disabled="disabledActions || !!syncing"
                    :loading="syncing === 'users'"
                    @click="confirmSync('users')"
                    >同步用户部门关联</Button
                  >
                  <span v-if="dirty" class="pending-note"
                    >请先保存应用配置。</span
                  >
                </Space>
                <Alert
                  v-if="syncResult"
                  class="mt-5"
                  :type="syncResult.failed ? 'warning' : 'success'"
                  show-icon
                  :message="`${syncLabel}结果`"
                >
                  <template #description
                    ><p>
                      新增 {{ syncResult.created }} · 更新
                      {{ syncResult.updated }} · 删除 {{ syncResult.deleted }} ·
                      停用 {{ syncResult.disabled }} · 跳过
                      {{ syncResult.skipped }} · 失败 {{ syncResult.failed }}
                    </p>
                    <ul
                      v-if="syncResult.messages?.length"
                      class="sync-messages"
                    >
                      <li
                        v-for="(item, index) in syncResult.messages"
                        :key="index"
                      >
                        {{ item }}
                      </li>
                    </ul></template
                  >
                </Alert>
              </Tabs.TabPane>

              <Tabs.TabPane key="messages" tab="消息与事件">
                <div class="section-heading">
                  <h2>已有消息通道与事件订阅</h2>
                  <p>
                    连接状态与业务权限分别核对，应用凭证校验不代表所有业务能力可用。
                  </p>
                </div>
                <div class="capability-grid">
                  <Card size="small" title="工作通知"
                    ><Tag color="blue">已接入</Tag>
                    <p>
                      支持图文 action_card 与详情链接，使用应用 AgentId。
                    </p></Card
                  >
                  <Card size="small" title="应用机器人"
                    ><Tag color="blue">已接入</Tag>
                    <p>
                      支持机器人单聊通知。RobotCode：<code>{{
                        saved.robotCode || '未单独配置'
                      }}</code>
                    </p></Card
                  >
                  <Card size="small" title="钉钉待办"
                    ><Tag color="blue">已接入</Tag>
                    <p>
                      已有待办创建与状态同步，当前企业关联
                      {{ saved.todoMappingCount }} 条。
                    </p></Card
                  >
                </div>
                <div class="event-panel">
                  <div>
                    <h3>
                      Stream 事件通道
                      <Tag :color="saved.streamRunning ? 'green' : 'default'">{{
                        saved.streamRunning
                          ? '运行中'
                          : saved.streamEnabled
                            ? '未连接'
                            : '未启用'
                      }}</Tag>
                    </h3>
                    <p>
                      通道由通讯录订阅配置或互动卡片开关启动。卡片回调模式仅处理卡片确认，不代表通讯录事件订阅已启用。修改应用凭证后，保存配置，再重新连接以使用新凭证。
                    </p>
                    <p v-if="!saved.streamEnabled" class="muted">
                      该企业当前未启用通道。可在互动卡片页签启用卡片回调，或由管理员在服务端部署配置中启用通讯录事件订阅。
                    </p>
                  </div>
                  <Button
                    v-access:code="['fdmdingtalk:settings:update']"
                    :disabled="!saved.streamEnabled || !saved.enabled || dirty"
                    :loading="reconnecting"
                    @click="reconnectStream"
                    >重新连接</Button
                  >
                </div>
              </Tabs.TabPane>

              <Tabs.TabPane key="cards" tab="互动卡片">
                <InteractiveCards
                  :key="`${saved.socialClientId}:${saved.clientId}:${saved.corpId}:${saved.robotCode}:${saved.enabled}`"
                  :app-dirty="dirty"
                  :app-enabled="saved.enabled"
                  :platform-url="platformUrl"
                  @settings-updated="refreshStreamOverview"
                />
              </Tabs.TabPane>
            </Tabs>
          </Card>
        </div>
        <Card v-else-if="!loading"
          ><Empty description="暂未读取到钉钉配置"
            ><Button type="primary" @click="loadSettings"
              >重新加载</Button
            ></Empty
          ></Card
        >
      </Spin>
    </div>
  </Page>
</template>

<style scoped>
.dingtalk-settings {
  max-width: 1320px;
  margin: 0 auto;
}
.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 24px;
  padding: 26px 28px;
  background: linear-gradient(115deg, #edf5ff, #fff 70%);
  border: 1px solid #dbeafe;
  border-radius: 14px;
}
.header-identity {
  display: flex;
  align-items: center;
  gap: 18px;
}
.app-mark {
  display: grid;
  flex-shrink: 0;
  width: 56px;
  height: 56px;
  place-items: center;
  color: white;
  background: #1677ff;
  border-radius: 14px;
  font-size: 26px;
  font-weight: 700;
  box-shadow: 0 6px 18px #1677ff26;
}
.eyebrow {
  margin-bottom: 4px;
  color: #537399;
  font-size: 12px;
  letter-spacing: 1px;
}
h1 {
  margin: 0;
  color: #172b4d;
  font-size: 24px;
  font-weight: 650;
}
.settings-header p {
  margin: 6px 0 0;
  color: #64748b;
}
.overview-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 20px;
}
.metric-label {
  color: #64748b;
  font-size: 13px;
}
.metric-value {
  margin: 10px 0 8px;
  color: #172b4d;
  font-size: 24px;
  font-weight: 600;
  line-height: 1.35;
}
.app-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.muted {
  color: #64748b;
  font-size: 12px;
}
.section-heading {
  margin: 10px 0 24px;
}
h2 {
  margin: 0 0 7px;
  color: #172b4d;
  font-size: 18px;
  font-weight: 600;
}
.section-heading p,
.guidance-panel p,
.event-panel p {
  margin: 0;
  color: #64748b;
  line-height: 1.8;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 32px;
  row-gap: 10px;
  max-width: 1020px;
}
.form-footer {
  margin-top: 10px;
  padding-top: 20px;
  border-top: 1px solid #eef2f6;
}
.pending-note {
  color: #b7791f;
  font-size: 12px;
}
.copy-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
code {
  overflow-wrap: anywhere;
  color: #285a99;
  font-size: 13px;
}
.guidance-panel {
  margin-top: 24px;
  padding: 20px 24px;
  background: #f8fafc;
  border-radius: 10px;
}
h3 {
  margin: 0 0 10px;
  color: #334155;
  font-size: 14px;
  font-weight: 600;
}
.guidance-panel ol {
  margin: 0 0 12px;
  padding-left: 20px;
  list-style: decimal;
  color: #64748b;
  line-height: 2;
}
.capability-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}
.capability-grid p {
  margin: 12px 0 0;
  color: #64748b;
  line-height: 1.8;
}
.event-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-top: 24px;
  padding: 22px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
}
.sync-messages {
  max-height: 240px;
  margin: 10px 0 0;
  overflow-y: auto;
  padding-left: 20px;
  list-style: disc;
}
@media (width <= 960px) {
  .overview-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .settings-header {
    align-items: flex-start;
    flex-direction: column;
  }
  .capability-grid {
    grid-template-columns: 1fr;
  }
}
@media (width <= 600px) {
  .settings-header {
    padding: 20px;
  }
  .header-identity {
    gap: 12px;
  }
  .form-grid {
    grid-template-columns: 1fr;
  }
  .event-panel {
    align-items: flex-start;
    flex-direction: column;
  }
  .copy-row {
    align-items: flex-start;
  }
  .metric-value {
    font-size: 20px;
  }
}
</style>
