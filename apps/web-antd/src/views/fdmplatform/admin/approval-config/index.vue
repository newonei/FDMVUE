<script setup lang="ts">
import type { TableColumnsType } from 'ant-design-vue';

import type { ApprovalConfig } from '#/api/fdmplatform/approval-config';

import { computed, onMounted, ref } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';

import {
  Alert,
  Button,
  Card,
  Input,
  InputNumber,
  message,
  Select,
  Space,
  Spin,
  Switch,
  Table,
} from 'ant-design-vue';

import {
  getApprovalConfigs,
  saveApprovalConfigs,
} from '#/api/fdmplatform/approval-config';
import { getSimpleRoleList } from '#/api/system/role';
import { getSimpleUserList } from '#/api/system/user';

import { errorText } from '../../data';
import {
  actionTypes,
  configError,
  configPayload,
  moveNode,
  newNode,
  nodeTypes,
} from './model';

defineOptions({ name: 'FdmPlatformApprovalConfig' });

const { hasAccessByCodes } = useAccess();
const canUpdate = computed(() =>
  hasAccessByCodes(['fdmplatform:approval-config:update']),
);
const configs = ref<ApprovalConfig[]>([]);
const userOptions = ref<{ label: string; value: number }[]>([]);
const roleOptions = ref<{ label: string; value: number }[]>([]);
const pageError = ref('');
const loading = ref(false);
const saving = ref(false);
const columns: TableColumnsType = [
  { title: '节点名称', key: 'name', width: 150 },
  { title: '审批人类型', key: 'type', width: 180 },
  { title: '审批人', key: 'people' },
  { title: '多人时', key: 'actionType', width: 190 },
  { title: '人民币低于此金额跳过', key: 'minAmount', width: 170 },
  { title: '操作', key: 'operation', width: 150 },
];

async function load() {
  loading.value = true;
  pageError.value = '';
  try {
    const [saved, users, roles] = await Promise.all([
      getApprovalConfigs(),
      getSimpleUserList(),
      getSimpleRoleList(),
    ]);
    configs.value = saved;
    userOptions.value = users.map((user) => ({
      label: user.nickname,
      value: user.id as number,
    }));
    roleOptions.value = roles.map((role) => ({
      label: role.name,
      value: role.id as number,
    }));
  } catch (error) {
    pageError.value = errorText(error);
  } finally {
    loading.value = false;
  }
}

async function save() {
  pageError.value = configError(configs.value);
  if (pageError.value) return;
  saving.value = true;
  try {
    configs.value = await saveApprovalConfigs(configPayload(configs.value));
    message.success('已保存，新提交的单据按这个流程审批');
  } catch (error) {
    pageError.value = errorText(error);
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <Page auto-content-height>
    <Alert
      message="审批流程只在这里配置，不用进钉钉 OA 后台。"
      description="启用时系统自动在钉钉建好模板；每张单提交时按下面的节点算出审批人并发给钉钉，审批人在钉钉里处理。改动只影响之后提交的单据。未启用的单据保持现有流程。"
      type="info"
      show-icon
      style="margin-bottom: 12px"
    />
    <Alert
      v-if="pageError"
      :message="pageError"
      type="error"
      show-icon
      style="margin-bottom: 12px"
    />
    <Spin :spinning="loading">
      <Card
        v-for="config in configs"
        :key="config.docType"
        :title="config.name"
        size="small"
        style="margin-bottom: 12px"
      >
        <template #extra>
          <Space>
            <span>走钉钉审批</span>
            <Switch v-model:checked="config.enabled" :disabled="!canUpdate" />
          </Space>
        </template>
        <Space wrap style="margin-bottom: 12px">
          <span>人民币低于此金额免审批</span>
          <InputNumber
            :disabled="!canUpdate"
            :min="0"
            :value="config.minAmount ?? undefined"
            placeholder="留空都审批"
            string-mode
            style="width: 160px"
            @update:value="config.minAmount = $event"
          />
          <span class="muted">外币单据总是审批。</span>
          <span class="muted">
            钉钉模板：{{ config.processCode ?? '保存启用时自动创建' }}
          </span>
        </Space>
        <Table
          :columns="columns"
          :data-source="config.nodes"
          :pagination="false"
          :row-key="(_: unknown, index?: number) => index ?? 0"
          :scroll="{ x: 1000 }"
          size="small"
        >
          <template #bodyCell="{ column, record, index }">
            <Input
              v-if="column.key === 'name'"
              v-model:value="record.name"
              :disabled="!canUpdate"
              :placeholder="`审批${index + 1}`"
            />
            <Select
              v-else-if="column.key === 'type'"
              v-model:value="record.type"
              :disabled="!canUpdate"
              :options="nodeTypes"
              style="width: 100%"
            />
            <template v-else-if="column.key === 'people'">
              <span v-if="record.type === 'DEPT_LEADER'" class="muted">
                从申请人部门往上找第一个负责人，找不到时跳过
              </span>
              <Select
                v-else-if="record.type === 'USERS'"
                v-model:value="record.userIds"
                :disabled="!canUpdate"
                :options="userOptions"
                mode="multiple"
                option-filter-prop="label"
                placeholder="选择审批人"
                style="width: 100%"
              />
              <Select
                v-else
                v-model:value="record.roleId"
                :disabled="!canUpdate"
                :options="roleOptions"
                option-filter-prop="label"
                placeholder="选择角色"
                show-search
                style="width: 100%"
              />
            </template>
            <template v-else-if="column.key === 'actionType'">
              <span v-if="record.type === 'DEPT_LEADER'" class="muted">—</span>
              <Select
                v-else
                v-model:value="record.actionType"
                :disabled="!canUpdate"
                :options="actionTypes"
                style="width: 100%"
              />
            </template>
            <InputNumber
              v-else-if="column.key === 'minAmount'"
              v-model:value="record.minAmount"
              :disabled="!canUpdate"
              :min="0"
              placeholder="总是经过"
              string-mode
              style="width: 100%"
            />
            <Space
              v-else-if="column.key === 'operation' && canUpdate"
              :size="4"
            >
              <Button
                :disabled="index === 0"
                size="small"
                type="link"
                @click="config.nodes = moveNode(config.nodes, index, -1)"
              >
                上移
              </Button>
              <Button
                :disabled="index === config.nodes.length - 1"
                size="small"
                type="link"
                @click="config.nodes = moveNode(config.nodes, index, 1)"
              >
                下移
              </Button>
              <Button
                danger
                size="small"
                type="link"
                @click="config.nodes.splice(index, 1)"
              >
                删除
              </Button>
            </Space>
          </template>
        </Table>
        <Button
          v-if="canUpdate"
          size="small"
          style="margin-top: 8px"
          @click="config.nodes.push(newNode())"
        >
          添加节点
        </Button>
      </Card>
    </Spin>
    <Button v-if="canUpdate" :loading="saving" type="primary" @click="save">
      保存
    </Button>
  </Page>
</template>

<style scoped>
.muted {
  color: var(--ant-color-text-secondary, #8c8c8c);
}
</style>
