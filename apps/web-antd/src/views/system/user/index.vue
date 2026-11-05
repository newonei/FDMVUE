<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { SystemDeptApi } from '#/api/system/dept';
import type { SystemUserApi } from '#/api/system/user';

import { ref } from 'vue';

import { confirm, DocAlert, Page, useVbenModal } from '@vben/common-ui';
import { DICT_TYPE } from '@vben/constants';
import { getDictLabel } from '@vben/hooks';
import { downloadFileFromBlobPart, isEmpty } from '@vben/utils';

import { Card, message, Modal } from 'ant-design-vue';

import { ACTION_ICON, TableAction, useVbenVxeGrid } from '#/adapter/vxe-table';
import { syncDingTalkUsers } from '#/api/fdmdingtalk/settings';
import {
  deleteUser,
  deleteUserList,
  exportUser,
  getUserPage,
  updateUserStatus,
} from '#/api/system/user';
import { $t } from '#/locales';
import { DeptTreeSelect } from '#/views/system/dept/components';

import { useGridColumns, useGridFormSchema } from './data';
import AssignRoleForm from './modules/assign-role-form.vue';
import Form from './modules/form.vue';
import ImportForm from './modules/import-form.vue';
import ResetPasswordForm from './modules/reset-password-form.vue';

const [FormModal, formModalApi] = useVbenModal({
  connectedComponent: Form,
  destroyOnClose: true,
});

const [ResetPasswordModal, resetPasswordModalApi] = useVbenModal({
  connectedComponent: ResetPasswordForm,
  destroyOnClose: true,
});

const [AssignRoleModal, assignRoleModalApi] = useVbenModal({
  connectedComponent: AssignRoleForm,
  destroyOnClose: true,
});

const [ImportModal, importModalApi] = useVbenModal({
  connectedComponent: ImportForm,
  destroyOnClose: true,
});

/** 刷新表格 */
function handleRefresh() {
  gridApi.query();
}

/** 导出表格 */
async function handleExport() {
  const data = await exportUser(await gridApi.formApi.getValues());
  downloadFileFromBlobPart({ fileName: '用户.xls', source: data });
}

/** 选择部门 */
const searchDeptId = ref<number | undefined>(undefined);
async function handleDeptSelect(dept?: SystemDeptApi.Dept) {
  searchDeptId.value = dept?.id;
  handleRefresh();
}

/** 创建用户 */
function handleCreate() {
  formModalApi.setData(null).open();
}

/** 导入用户 */
function handleImport() {
  importModalApi.open();
}

/** 从钉钉同步全部员工 */
const syncingDingTalk = ref(false);
async function handleSyncDingTalk() {
  try {
    await confirm(
      '将按钉钉通讯录同步全部在职员工：没有账号的按手机号自动创建（账号即手机号，通过钉钉登录），已有账号更新部门。建议先在钉钉设置里同步部门。',
    );
  } catch {
    return;
  }
  syncingDingTalk.value = true;
  try {
    const result = await syncDingTalkUsers();
    const summary = `新建 ${result.created} 个，更新部门 ${result.updated} 个，跳过 ${result.skipped} 个，失败 ${result.failed} 个`;
    const notes = (result.messages ?? []).filter((msg) =>
      /[\u4E00-\u9FA5]|failed/.test(msg),
    );
    if (notes.length > 0) {
      Modal.info({
        title: '钉钉同步完成',
        content: [summary, ...notes].join('\n'),
        width: 560,
        style: { whiteSpace: 'pre-line' },
      });
    } else {
      message.success(`钉钉同步完成：${summary}`);
    }
    handleRefresh();
  } finally {
    syncingDingTalk.value = false;
  }
}

/** 编辑用户 */
function handleEdit(row: SystemUserApi.User) {
  formModalApi.setData(row).open();
}

/** 删除用户 */
async function handleDelete(row: SystemUserApi.User) {
  const hideLoading = message.loading({
    content: $t('ui.actionMessage.deleting', [row.username]),
    duration: 0,
  });
  try {
    await deleteUser(row.id!);
    message.success($t('ui.actionMessage.deleteSuccess', [row.username]));
    handleRefresh();
  } finally {
    hideLoading();
  }
}

/** 批量删除用户 */
async function handleDeleteBatch() {
  await confirm($t('ui.actionMessage.deleteBatchConfirm'));
  const hideLoading = message.loading({
    content: $t('ui.actionMessage.deletingBatch'),
    duration: 0,
  });
  try {
    await deleteUserList(checkedIds.value);
    checkedIds.value = [];
    message.success($t('ui.actionMessage.deleteSuccess'));
    handleRefresh();
  } finally {
    hideLoading();
  }
}

const checkedIds = ref<number[]>([]);
function handleRowCheckboxChange({
  records,
}: {
  records: SystemUserApi.User[];
}) {
  checkedIds.value = records.map((item) => item.id!);
}

/** 重置密码 */
function handleResetPassword(row: SystemUserApi.User) {
  resetPasswordModalApi.setData(row).open();
}

/** 分配角色 */
function handleAssignRole(row: SystemUserApi.User) {
  assignRoleModalApi.setData(row).open();
}

/** 更新用户状态 */
async function handleStatusChange(
  newStatus: number,
  row: SystemUserApi.User,
): Promise<boolean | undefined> {
  try {
    await confirm(
      `你要将${row.username}的状态切换为【${getDictLabel(DICT_TYPE.COMMON_STATUS, newStatus)}】吗？`,
    );
  } catch {
    return false;
  }
  // 更新用户状态
  await updateUserStatus(row.id!, newStatus);
  // 提示并返回成功
  message.success($t('ui.actionMessage.operationSuccess'));
  return true;
}

const [Grid, gridApi] = useVbenVxeGrid({
  formOptions: {
    schema: useGridFormSchema(),
  },
  gridOptions: {
    columns: useGridColumns(handleStatusChange),
    height: 'auto',
    keepSource: true,
    proxyConfig: {
      ajax: {
        query: async ({ page }, formValues) => {
          return await getUserPage({
            pageNo: page.currentPage,
            pageSize: page.pageSize,
            ...formValues,
            deptId: searchDeptId.value,
          });
        },
      },
    },
    rowConfig: {
      keyField: 'id',
      isHover: true,
    },
    toolbarConfig: {
      refresh: true,
      search: true,
    },
  } as VxeTableGridOptions<SystemUserApi.User>,
  gridEvents: {
    checkboxAll: handleRowCheckboxChange,
    checkboxChange: handleRowCheckboxChange,
  },
});
</script>

<template>
  <Page auto-content-height>
    <template #doc>
      <DocAlert title="用户体系" url="https://doc.iocoder.cn/user-center/" />
      <DocAlert title="三方登陆" url="https://doc.iocoder.cn/social-user/" />
      <DocAlert
        title="Excel 导入导出"
        url="https://doc.iocoder.cn/excel-import-and-export/"
      />
    </template>

    <FormModal @success="handleRefresh" />
    <ResetPasswordModal @success="handleRefresh" />
    <AssignRoleModal @success="handleRefresh" />
    <ImportModal @success="handleRefresh" />

    <div class="flex h-full w-full">
      <!-- 左侧部门树 -->
      <Card class="mr-4 h-full w-1/6">
        <DeptTreeSelect @select="handleDeptSelect" />
      </Card>
      <!-- 右侧用户列表 -->
      <div class="w-5/6">
        <Grid table-title="用户列表">
          <template #toolbar-tools>
            <TableAction
              :actions="[
                {
                  label: $t('ui.actionTitle.create', ['用户']),
                  type: 'primary',
                  icon: ACTION_ICON.ADD,
                  auth: ['system:user:create'],
                  onClick: handleCreate,
                },
                {
                  label: $t('ui.actionTitle.export'),
                  type: 'primary',
                  icon: ACTION_ICON.DOWNLOAD,
                  auth: ['system:user:export'],
                  onClick: handleExport,
                },
                {
                  label: $t('ui.actionTitle.import', ['用户']),
                  type: 'primary',
                  icon: ACTION_ICON.UPLOAD,
                  auth: ['system:user:import'],
                  onClick: handleImport,
                },
                {
                  label: '从钉钉同步',
                  type: 'primary',
                  icon: 'lucide:refresh-cw',
                  loading: syncingDingTalk,
                  auth: ['system:user:create'],
                  onClick: handleSyncDingTalk,
                },
                {
                  label: $t('ui.actionTitle.deleteBatch'),
                  type: 'primary',
                  danger: true,
                  icon: ACTION_ICON.DELETE,
                  disabled: isEmpty(checkedIds),
                  auth: ['system:user:delete'],
                  onClick: handleDeleteBatch,
                },
              ]"
            />
          </template>
          <template #actions="{ row }">
            <TableAction
              :actions="[
                {
                  label: $t('common.edit'),
                  type: 'link',
                  icon: ACTION_ICON.EDIT,
                  auth: ['system:user:update'],
                  onClick: handleEdit.bind(null, row),
                },
                {
                  label: $t('common.delete'),
                  type: 'link',
                  danger: true,
                  icon: ACTION_ICON.DELETE,
                  auth: ['system:user:delete'],
                  popConfirm: {
                    title: $t('ui.actionMessage.deleteConfirm', [row.username]),
                    confirm: handleDelete.bind(null, row),
                  },
                },
              ]"
              :drop-down-actions="[
                {
                  label: '分配角色',
                  type: 'link',
                  auth: ['system:permission:assign-user-role'],
                  onClick: handleAssignRole.bind(null, row),
                },
                {
                  label: '重置密码',
                  type: 'link',
                  auth: ['system:user:update-password'],
                  onClick: handleResetPassword.bind(null, row),
                },
              ]"
            />
          </template>
        </Grid>
      </div>
    </div>
  </Page>
</template>
