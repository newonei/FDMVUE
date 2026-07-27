<script lang="ts" setup>
import type { FdmAuthzApi } from '#/api/fdm-authz';
import type { SystemUserApi } from '#/api/system/user';

import { ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';

import { Alert, message, Tag } from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';
import { getUserRoleDetail } from '#/api/fdm-authz';
import { assignUserRole } from '#/api/system/permission';
import { $t } from '#/locales';

import { useAssignRoleFormSchema } from '../data';

const emit = defineEmits(['success']);
const inheritedRoles = ref<FdmAuthzApi.InheritedRole[]>([]);
const [Form, formApi] = useVbenForm({
  commonConfig: {
    componentProps: {
      class: 'w-full',
    },
    formItemClass: 'col-span-2',
    labelWidth: 80,
  },
  layout: 'horizontal',
  schema: useAssignRoleFormSchema(),
  showDefaultActions: false,
});

const [Modal, modalApi] = useVbenModal({
  async onConfirm() {
    const { valid } = await formApi.validate();
    if (!valid) {
      return;
    }
    modalApi.lock();
    // 提交表单
    const values = await formApi.getValues();
    try {
      await assignUserRole({
        userId: values.id,
        roleIds: values.directRoleIds ?? [],
      });
      // 关闭并提示
      await modalApi.close();
      emit('success');
      message.success($t('ui.actionMessage.operationSuccess'));
    } finally {
      modalApi.unlock();
    }
  },
  async onOpenChange(isOpen: boolean) {
    if (!isOpen) {
      inheritedRoles.value = [];
      return;
    }
    // 加载数据
    const data = modalApi.getData<SystemUserApi.User>();
    if (!data || !data.id) {
      return;
    }
    modalApi.lock();
    try {
      const detail = await getUserRoleDetail(data.id);
      inheritedRoles.value = detail.inheritedRoles ?? [];
      // 设置到 values
      await formApi.setValues({
        ...data,
        directRoleIds: detail.directRoleIds ?? [],
      });
    } finally {
      modalApi.unlock();
    }
  },
});
</script>

<template>
  <Modal title="分配角色">
    <Form class="mx-4" />
    <div class="mx-4 mt-4">
      <Alert
        class="mb-3"
        description="继承角色由部门配置自动维护，员工调离来源部门后会自动失效，无法在这里修改。"
        message="部门继承角色（只读）"
        show-icon
        type="info"
      />
      <div v-if="inheritedRoles.length > 0" class="flex flex-wrap gap-2">
        <Tag
          v-for="role in inheritedRoles"
          :key="`${role.deptId}-${role.roleId}`"
          color="blue"
        >
          {{ role.roleName }} · 来自{{ role.deptName }}
        </Tag>
      </div>
      <div v-else class="text-sm text-gray-500">暂无部门继承角色</div>
    </div>
  </Modal>
</template>
