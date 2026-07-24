<script lang="ts" setup>
import type { JixiaoApi } from '#/api/fdmperformance';
import type { SystemUserApi } from '#/api/system/user';

import { computed, onMounted, reactive, ref } from 'vue';

import {
  Button,
  Form,
  Input,
  message,
  Select,
  Space,
  Switch,
} from 'ant-design-vue';

import { getSetting, saveSetting } from '#/api/fdmperformance';
import { getSimpleUserList } from '#/api/system/user';

import PerformanceShell from '../shared/PerformanceShell.vue';

defineOptions({ name: 'FdmPerformanceSettings' });

const loading = ref(false);
const users = ref<SystemUserApi.User[]>([]);
const form = reactive<JixiaoApi.Setting>({
  bossUserId: undefined,
  detailUrlPrefix: '',
  dingtalkTaskReminderEnabled: true,
  dingtalkTodoEnabled: false,
  generalManagerUserId: undefined,
  hrUserIds: [],
});

const userOptions = computed(() =>
  users.value.map((item) => ({
    label: `${item.nickname || item.username} (${item.id})`,
    value: item.id,
  })),
);

async function load() {
  loading.value = true;
  try {
    const [setting, userList] = await Promise.all([
      getSetting(),
      getSimpleUserList(),
    ]);
    users.value = userList;
    Object.assign(form, {
      bossUserId: setting.bossUserId,
      detailUrlPrefix: setting.detailUrlPrefix,
      dingtalkTaskReminderEnabled: setting.dingtalkTaskReminderEnabled ?? true,
      dingtalkTodoEnabled: setting.dingtalkTodoEnabled,
      generalManagerUserId: setting.generalManagerUserId,
      hrUserIds: setting.hrUserIds || [],
    });
  } finally {
    loading.value = false;
  }
}

async function submit() {
  await saveSetting(form);
  message.success('设置已保存');
  await load();
}

onMounted(load);
</script>

<template>
  <PerformanceShell title="系统设置">
    <div class="settings-panel">
      <Form layout="vertical">
        <Form.Item label="绩效 HR">
          <Select
            v-model:value="form.hrUserIds"
            mode="multiple"
            show-search
            :filter-option="false"
            :options="userOptions"
            placeholder="选择可处理人事审核的 HR"
          />
        </Form.Item>
        <div class="form-grid">
          <Form.Item label="老板">
            <Select
              v-model:value="form.bossUserId"
              allow-clear
              show-search
              :filter-option="false"
              :options="userOptions"
            />
          </Form.Item>
          <Form.Item label="总经理">
            <Select
              v-model:value="form.generalManagerUserId"
              allow-clear
              show-search
              :filter-option="false"
              :options="userOptions"
            />
          </Form.Item>
        </div>
        <div class="form-grid">
          <Form.Item label="钉钉流程节点提醒">
            <Switch v-model:checked="form.dingtalkTaskReminderEnabled" />
          </Form.Item>
          <Form.Item label="钉钉行动计划与复盘待办">
            <Switch v-model:checked="form.dingtalkTodoEnabled" />
          </Form.Item>
        </div>
        <Form.Item label="绩效详情 URL 前缀">
          <Input
            v-model:value="form.detailUrlPrefix"
            placeholder="如 https://oa.example.com"
          />
        </Form.Item>
        <Space>
          <Button :loading="loading" type="primary" @click="submit">
            保存设置
          </Button>
        </Space>
      </Form>
    </div>
  </PerformanceShell>
</template>

<style scoped>
.settings-panel {
  max-width: 780px;
  padding: 16px;
  background: #fff;
  border: 1px solid #edf0f4;
  border-radius: 8px;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

@media (max-width: 760px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
