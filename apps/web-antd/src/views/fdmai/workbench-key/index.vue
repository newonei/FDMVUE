<script lang="ts" setup>
import type { TableColumnsType } from 'ant-design-vue';

import type { FdmAiWorkbenchApi } from '#/api/fdmai';
import type { SystemUserApi } from '#/api/system/user';

import { computed, onMounted, reactive, ref } from 'vue';

import { useAccess } from '@vben/access';
import { formatDateTime } from '@vben/utils';

import {
  Alert,
  Button,
  Form,
  FormItem,
  Input,
  message,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
} from 'ant-design-vue';

import {
  getFdmAiWorkbenchKeyPage,
  getFdmAiWorkbenchSettings,
  removeFdmAiWorkbenchKey,
  setFdmAiWorkbenchKey,
} from '#/api/fdmai';
import { getSimpleUserList } from '#/api/system/user';

import AiCenterShell from '../shared/AiCenterShell.vue';

defineOptions({ name: 'FdmAiWorkbenchKey' });

type Key = FdmAiWorkbenchApi.Key;

const { hasAccessByCodes } = useAccess();
const canUpdate = hasAccessByCodes(['fdmai:workbench:update']);

const loading = ref(false);
const rows = ref<Key[]>([]);
const total = ref(0);
const query = reactive({
  pageNo: 1,
  pageSize: 20,
  userId: undefined as number | undefined,
});
const settings = ref<FdmAiWorkbenchApi.Settings>();
const employees = ref<SystemUserApi.User[]>([]);

const formOpen = ref(false);
const submitting = ref(false);
const replacing = ref(false);
const form = reactive({
  apiKey: '',
  userId: undefined as number | undefined,
});

const employeeOptions = computed(() =>
  employees.value.map((user) => ({
    label: user.nickname,
    value: user.id,
  })),
);

const columns: TableColumnsType<Key> = [
  { dataIndex: 'nickname', key: 'nickname', title: '员工' },
  { dataIndex: 'maskedKey', key: 'maskedKey', title: 'Key' },
  { dataIndex: 'updateTime', key: 'updateTime', title: '最近设置时间' },
  { key: 'actions', title: '操作', width: 150 },
];

async function load() {
  loading.value = true;
  try {
    const page = await getFdmAiWorkbenchKeyPage({ ...query });
    rows.value = page.list;
    total.value = page.total;
  } finally {
    loading.value = false;
  }
}

function search() {
  query.pageNo = 1;
  void load();
}

function openForm(row?: Key) {
  replacing.value = Boolean(row);
  form.apiKey = '';
  form.userId = row?.userId;
  formOpen.value = true;
}

async function submit() {
  if (!form.userId || !form.apiKey.trim()) {
    message.warning('请选择员工并填写 Key');
    return;
  }
  submitting.value = true;
  try {
    await setFdmAiWorkbenchKey({
      apiKey: form.apiKey.trim(),
      userId: form.userId,
    });
    form.apiKey = '';
    formOpen.value = false;
    message.success('已保存');
    await load();
  } finally {
    submitting.value = false;
  }
}

async function remove(row: Key) {
  await removeFdmAiWorkbenchKey(row.userId);
  message.success('已移除');
  await load();
}

function onPageChange(page: { current?: number; pageSize?: number }) {
  query.pageNo = page.current ?? 1;
  query.pageSize = page.pageSize ?? 20;
  void load();
}

onMounted(async () => {
  await load();
  const [loadedSettings, users] = await Promise.all([
    getFdmAiWorkbenchSettings(),
    getSimpleUserList(),
  ]);
  settings.value = loadedSettings;
  employees.value = users;
});
</script>

<template>
  <AiCenterShell
    description="给员工设置桌面工作台使用的 Key。员工用钉钉登录工作台后自动可用，不需要自己粘贴。"
    title="工作台 AI Key"
  >
    <template #actions>
      <Button v-if="canUpdate" type="primary" @click="openForm()">
        设置 Key
      </Button>
    </template>

    <Alert
      v-if="settings && !settings.enabled"
      message="工作台 AI 尚未启用，设置的 Key 暂时不会生效。"
      show-icon
      type="warning"
    />

    <Space wrap>
      <Select
        v-model:value="query.userId"
        :options="employeeOptions"
        allow-clear
        option-filter-prop="label"
        placeholder="员工"
        show-search
        style="width: 180px"
        @change="search"
      />
      <Button @click="load">刷新</Button>
    </Space>

    <Table
      :columns="columns"
      :data-source="rows"
      :loading="loading"
      :pagination="{
        current: query.pageNo,
        pageSize: query.pageSize,
        showSizeChanger: true,
        total,
      }"
      row-key="id"
      size="small"
      @change="onPageChange"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'nickname'">
          <div>{{ record.nickname ?? `用户 ${record.userId}` }}</div>
          <div class="muted">{{ record.deptName ?? '' }}</div>
        </template>
        <template v-else-if="column.key === 'maskedKey'">
          <code>{{ record.maskedKey }}</code>
        </template>
        <template v-else-if="column.key === 'updateTime'">
          {{ record.updateTime ? formatDateTime(record.updateTime) : '-' }}
        </template>
        <template v-else-if="column.key === 'actions'">
          <Space v-if="canUpdate" :size="4">
            <Button size="small" type="link" @click="openForm(record as Key)">
              更换
            </Button>
            <Popconfirm
              title="移除后员工不能再领取这枚 Key，但它在网关上仍然有效，要彻底停用请到网关后台撤销。确定移除？"
              @confirm="remove(record as Key)"
            >
              <Button danger size="small" type="link">移除</Button>
            </Popconfirm>
          </Space>
        </template>
      </template>
    </Table>

    <Modal
      v-model:open="formOpen"
      :confirm-loading="submitting"
      :title="replacing ? '更换 Key' : '设置 Key'"
      ok-text="保存"
      @ok="submit"
    >
      <Form layout="vertical">
        <FormItem label="员工" required>
          <Select
            v-model:value="form.userId"
            :disabled="replacing"
            :options="employeeOptions"
            option-filter-prop="label"
            placeholder="选择员工"
            show-search
          />
        </FormItem>
        <FormItem
          :extra="`填 ${settings?.gateway ?? '公司网关'} 上为这名员工创建的 Key。保存时只检查格式，不会验证 Key 能否使用。保存后不再显示完整 Key。`"
          label="Key"
          required
        >
          <Input.Password
            v-model:value="form.apiKey"
            autocomplete="new-password"
            placeholder="粘贴 Key"
          />
        </FormItem>
      </Form>
    </Modal>
  </AiCenterShell>
</template>

<style scoped>
.muted {
  font-size: 12px;
  color: var(--ant-color-text-secondary, #8c8c8c);
}
</style>
