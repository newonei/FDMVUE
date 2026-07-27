<script lang="ts" setup>
import type { SystemDeptApi } from '#/api/system/dept';
import type { SystemRoleApi } from '#/api/system/role';

import { computed, ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';
import { SystemDataScopeEnum, SystemRoleTypeEnum } from '@vben/constants';

import { Alert, Form, message, Select, Switch, Tag } from 'ant-design-vue';

import { assignDeptRole, getDeptRoleConfig } from '#/api/fdm-authz';
import { getSimpleRoleList } from '#/api/system/role';
import { $t } from '#/locales';

const emit = defineEmits(['success']);

const department = ref<SystemDeptApi.Dept>();
const roles = ref<SystemRoleApi.Role[]>([]);
const roleIds = ref<number[]>([]);
const initialRoleIds = ref<number[]>([]);
const includeChildren = ref(false);
const affectedUserCount = ref(0);

const roleOptions = computed(() =>
  roles.value.map((role) => ({
    label: `${role.name}（${role.code}）`,
    value: role.id!,
  })),
);

const selectedHighRiskRoles = computed(() =>
  roles.value.filter(
    (role) =>
      role.id !== undefined &&
      roleIds.value.includes(role.id) &&
      role.dataScope === SystemDataScopeEnum.ALL,
  ),
);

const addedRoles = computed(() =>
  roles.value.filter(
    (role) =>
      role.id !== undefined &&
      roleIds.value.includes(role.id) &&
      !initialRoleIds.value.includes(role.id),
  ),
);

const removedRoles = computed(() =>
  roles.value.filter(
    (role) =>
      role.id !== undefined &&
      initialRoleIds.value.includes(role.id) &&
      !roleIds.value.includes(role.id),
  ),
);

function resetState() {
  department.value = undefined;
  roles.value = [];
  roleIds.value = [];
  initialRoleIds.value = [];
  includeChildren.value = false;
  affectedUserCount.value = 0;
}

const [Modal, modalApi] = useVbenModal({
  async onConfirm() {
    if (!department.value?.id) {
      return;
    }
    modalApi.lock();
    try {
      await assignDeptRole({
        deptId: department.value.id,
        includeChildren: includeChildren.value,
        roleIds: roleIds.value,
      });
      await modalApi.close();
      emit('success');
      message.success($t('ui.actionMessage.operationSuccess'));
    } finally {
      modalApi.unlock();
    }
  },
  async onOpenChange(isOpen: boolean) {
    if (!isOpen) {
      resetState();
      return;
    }
    const data = modalApi.getData<SystemDeptApi.Dept>();
    if (!data?.id) {
      return;
    }
    resetState();
    department.value = data;
    modalApi.lock();
    try {
      const [roleList, config] = await Promise.all([
        getSimpleRoleList(),
        getDeptRoleConfig(data.id),
      ]);
      roles.value = roleList.filter(
        (role) => role.type === SystemRoleTypeEnum.CUSTOM,
      );
      roleIds.value = [...(config.roleIds ?? [])];
      initialRoleIds.value = [...roleIds.value];
      includeChildren.value = config.includeChildren ?? false;
      affectedUserCount.value = config.affectedUserCount ?? 0;
    } finally {
      modalApi.unlock();
    }
  },
});
</script>

<template>
  <Modal class="w-[600px]" title="配置部门角色">
    <div class="mx-4">
      <Alert
        class="mb-4"
        description="角色会自动授予当前及以后加入该部门的用户；用户离开部门后自动失效，个人角色不受影响。"
        message="部门角色继承规则"
        show-icon
        type="info"
      />

      <Form layout="vertical">
        <Form.Item label="部门">
          <div class="font-medium">{{ department?.name }}</div>
        </Form.Item>
        <Form.Item label="部门角色">
          <Select
            v-model:value="roleIds"
            allow-clear
            mode="multiple"
            option-filter-prop="label"
            :options="roleOptions"
            placeholder="请选择要自动授予的自定义角色"
          />
          <div class="mt-2 text-xs text-gray-500">
            仅允许配置自定义角色；相同角色由个人和部门同时授予时只生效一次。
          </div>
        </Form.Item>
        <Form.Item label="包含下级部门">
          <div class="flex items-center gap-3">
            <Switch v-model:checked="includeChildren" />
            <span class="text-gray-500">
              {{
                includeChildren
                  ? '当前部门及所有下级部门都会继承'
                  : '仅当前部门继承（默认）'
              }}
            </span>
          </div>
        </Form.Item>
      </Form>

      <div class="mb-4 rounded-md border border-gray-200 p-3">
        <div>
          当前已生效配置影响用户：
          <span class="text-base font-semibold">{{ affectedUserCount }}</span>
          人
        </div>
        <div class="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <span v-if="addedRoles.length === 0 && removedRoles.length === 0">
            角色未变更
          </span>
          <template v-else>
            <Tag
              v-for="role in addedRoles"
              :key="`add-${role.id}`"
              color="green"
            >
              新增：{{ role.name }}
            </Tag>
            <Tag
              v-for="role in removedRoles"
              :key="`remove-${role.id}`"
              color="orange"
            >
              移除：{{ role.name }}
            </Tag>
          </template>
        </div>
      </div>

      <Alert
        v-if="selectedHighRiskRoles.length > 0"
        :description="`角色「${selectedHighRiskRoles.map((role) => role.name).join('、')}」拥有全部数据权限，授予部门后相关用户可访问全量业务数据，请确认授权范围。`"
        message="高风险权限"
        show-icon
        type="error"
      />
    </div>
  </Modal>
</template>
