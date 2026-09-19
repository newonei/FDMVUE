<script setup lang="ts">
import type { FormInstance } from 'ant-design-vue';
import type { FdmcaiwuEcProfitApi as Api } from '#/api/fdmcaiwu/ec-profit';
import { reactive, ref, watch } from 'vue';
import {
  Form,
  FormItem,
  Input,
  InputNumber,
  message,
  Modal,
  Switch,
} from 'ant-design-vue';
import {
  createFinanceGroup,
  updateFinanceGroup,
} from '#/api/fdmcaiwu/ec-profit';
const props = defineProps<{ open: boolean; group?: Api.Group }>();
const emit = defineEmits<{ 'update:open': [open: boolean]; saved: [] }>();
const formRef = ref<FormInstance>();
const saving = ref(false);
const form = reactive<Api.GroupCreate>({
  code: '',
  name: '',
  departmentCode: '',
  departmentName: '',
  sort: 0,
  enabled: true,
});
watch(
  () => [props.open, props.group] as const,
  ([open]) => {
    if (!open) return;
    Object.assign(
      form,
      props.group
        ? {
            code: props.group.code,
            name: props.group.name,
            departmentCode: props.group.departmentCode,
            departmentName: props.group.departmentName,
            sort: props.group.sort,
            enabled: props.group.enabled,
          }
        : {
            code: '',
            name: '',
            departmentCode: '',
            departmentName: '',
            sort: 0,
            enabled: true,
          },
    );
    formRef.value?.clearValidate();
  },
);
async function save() {
  if (saving.value) return;
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }
  saving.value = true;
  try {
    const data = {
      ...form,
      code: form.code.trim(),
      name: form.name.trim(),
      departmentCode: form.departmentCode.trim(),
      departmentName: form.departmentName.trim(),
    };
    if (props.group)
      await updateFinanceGroup({
        ...data,
        id: props.group.id,
        expectedVersion: props.group.version,
      });
    else await createFinanceGroup(data);
    message.success('财务小组已保存');
    emit('update:open', false);
    emit('saved');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Modal
    :open="open"
    :title="group ? '编辑财务小组' : '新增财务小组'"
    :confirm-loading="saving"
    :closable="!saving"
    :keyboard="!saving"
    :mask-closable="!saving"
    :cancel-button-props="{ disabled: saving }"
    ok-text="保存小组"
    @cancel="emit('update:open', false)"
    @ok="save"
  >
    <Form ref="formRef" :model="form" layout="vertical" class="pt-3">
      <div class="grid grid-cols-2 gap-x-4">
        <FormItem
          label="财务部门代码"
          name="departmentCode"
          :rules="[
            { required: true, whitespace: true, message: '填写财务部门代码' },
          ]"
          ><Input
            v-model:value="form.departmentCode"
            :maxlength="64"
            :disabled="saving" /></FormItem
        ><FormItem
          label="财务部门名称"
          name="departmentName"
          :rules="[
            { required: true, whitespace: true, message: '填写财务部门名称' },
          ]"
          ><Input
            v-model:value="form.departmentName"
            :maxlength="100"
            :disabled="saving" /></FormItem
        ><FormItem
          label="小组代码"
          name="code"
          :rules="[
            { required: true, whitespace: true, message: '填写小组代码' },
          ]"
          ><Input
            v-model:value="form.code"
            :maxlength="64"
            :disabled="saving || !!group" /></FormItem
        ><FormItem
          label="小组名称"
          name="name"
          :rules="[
            { required: true, whitespace: true, message: '填写小组名称' },
          ]"
          ><Input
            v-model:value="form.name"
            :maxlength="100"
            :disabled="saving" /></FormItem
        ><FormItem
          label="排序"
          name="sort"
          :rules="[
            {
              required: true,
              type: 'number',
              min: 0,
              message: '填写大于等于 0 的排序值',
            },
          ]"
          ><InputNumber
            v-model:value="form.sort"
            :min="0"
            :precision="0"
            :disabled="saving"
            class="!w-full" /></FormItem
        ><FormItem label="启用"
          ><Switch v-model:checked="form.enabled" :disabled="saving"
        /></FormItem>
      </div>
      <p class="mb-0 text-xs leading-6 text-muted-foreground">
        财务部门和小组独立于聚水潭分组。改名或停用不修改历史月报；停用前须先处理仍然生效的店铺归属。
      </p>
    </Form>
  </Modal>
</template>
