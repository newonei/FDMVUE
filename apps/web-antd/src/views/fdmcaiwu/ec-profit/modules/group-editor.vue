<script setup lang="ts">
import type { FormInstance } from 'ant-design-vue';
import type { FdmcaiwuEcProfitApi as Api } from '#/api/fdmcaiwu/ec-profit';

import { computed, reactive, ref, watch } from 'vue';

import {
  Alert,
  Form,
  FormItem,
  Input,
  InputNumber,
  message,
  Modal,
  Select,
  Switch,
  Tag,
} from 'ant-design-vue';

import {
  applyShopAssignments,
  createFinanceGroup,
  previewShopAssignments,
  updateFinanceGroup,
} from '#/api/fdmcaiwu/ec-profit';

import { assignmentApply } from '../config-model';

/**
 * 电商分组 = 分组名称 + 哪些店铺在这个组。与财务核算无关，不需要部门和代码；
 * 店铺加入/移出按所选月份起生效；店铺第一次配置的分组也用于之前月份的查看。
 */
const props = defineProps<{
  group?: Api.Group;
  groups: Api.Group[];
  month: string;
  open: boolean;
  shops: Api.AssignmentShop[];
}>();
const emit = defineEmits<{ 'update:open': [open: boolean]; saved: [] }>();

const formRef = ref<FormInstance>();
const saving = ref(false);
const form = reactive({
  name: '',
  shopIds: [] as string[],
  sort: 0,
  enabled: true,
});

/** 当前（所选月份）在该组的店铺 */
const members = computed(() =>
  props.group
    ? props.shops
        .filter((shop) => shop.included && shop.groupId === props.group!.id)
        .map((shop) => shop.shopId)
    : [],
);
watch(
  () => [props.open, props.group] as const,
  ([open]) => {
    if (!open) return;
    Object.assign(form, {
      name: props.group?.name ?? '',
      shopIds: [...members.value],
      sort: props.group?.sort ?? props.groups.length,
      enabled: props.group?.enabled ?? true,
    });
    formRef.value?.clearValidate();
  },
);

const shopById = computed(() => new Map(props.shops.map((shop) => [shop.shopId, shop])));
const shopOptions = computed(() =>
  props.shops.map((shop) => {
    const other =
      shop.included && shop.groupId && shop.groupId !== props.group?.id
        ? `（现属 ${shop.groupName}）`
        : '';
    return {
      label: `${shop.shopName}${shop.platformCode ? ` · ${shop.platformCode}` : ''}${other}`,
      value: shop.shopId,
    };
  }),
);
const added = computed(() => form.shopIds.filter((id) => !members.value.includes(id)));
const removed = computed(() => members.value.filter((id) => !form.shopIds.includes(id)));
const movedFromOther = computed(() =>
  added.value
    .map((id) => shopById.value.get(id))
    .filter((shop) => shop?.included && shop.groupId && shop.groupId !== props.group?.id),
);
const disabling = computed(() => !!props.group && props.group.enabled && !form.enabled);

function nameRule(_rule: unknown, value: string) {
  const name = value?.trim();
  if (!name) return Promise.reject(new Error('填写分组名称'));
  const duplicated = props.groups.some(
    (group) => group.id !== props.group?.id && group.name.trim().toLowerCase() === name.toLowerCase(),
  );
  return duplicated ? Promise.reject(new Error('已有同名分组')) : Promise.resolve();
}

/** 预览后按原样提交，保证提交的就是服务端核对过的版本；每批最多 200 家。 */
async function moveShops(shopIds: string[], groupId?: number) {
  for (let index = 0; index < shopIds.length; index += 200) {
    const request: Api.AssignmentRequest = {
      effectiveMonth: props.month,
      shopIds: shopIds.slice(index, index + 200),
      included: true,
      ...(groupId ? { groupId } : {}),
    };
    const preview = await previewShopAssignments(request);
    await applyShopAssignments(assignmentApply(request, preview, crypto.randomUUID()));
  }
}

async function save() {
  if (saving.value) return;
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }
  saving.value = true;
  let groupId = props.group?.id;
  try {
    const base = { name: form.name.trim(), sort: form.sort ?? 0 };
    if (props.group) {
      // 停用前先把组内店铺全部移出，否则服务端会因「仍有生效店铺」拒绝停用
      if (disabling.value && members.value.length > 0) await moveShops(members.value);
      await updateFinanceGroup({
        ...props.group,
        ...base,
        enabled: form.enabled,
        expectedVersion: props.group.version,
      });
    } else {
      groupId = await createFinanceGroup({
        ...base,
        code: '',
        departmentCode: '',
        departmentName: '',
        enabled: true,
      });
    }
    if (form.enabled) {
      if (added.value.length > 0) await moveShops(added.value, groupId);
      if (removed.value.length > 0) await moveShops(removed.value);
    }
    message.success(props.group ? '分组已保存' : `已新增分组「${base.name}」`);
    emit('update:open', false);
    emit('saved');
  } catch {
    // 分组本身可能已保存；刷新后让用户看到真实状态再决定是否重试
    if (!props.group && groupId) {
      message.warning('分组已创建，但部分店铺未能加入，请刷新后重试');
      emit('update:open', false);
      emit('saved');
    }
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Modal
    :open="open"
    :title="group ? `编辑分组「${group.name}」` : '新增分组'"
    :width="620"
    :confirm-loading="saving"
    :closable="!saving"
    :keyboard="!saving"
    :mask-closable="!saving"
    :cancel-button-props="{ disabled: saving }"
    ok-text="保存"
    @cancel="emit('update:open', false)"
    @ok="save"
  >
    <Form ref="formRef" :model="form" layout="vertical" class="pt-3">
      <FormItem label="分组名称" name="name" :rules="[{ validator: nameRule, trigger: 'blur' }]">
        <Input
          v-model:value="form.name"
          :maxlength="100"
          :disabled="saving"
          placeholder="例如：一组古米梵、抖音组"
        />
      </FormItem>
      <FormItem>
        <template #label>
          <span>组内店铺</span>
          <span class="ml-2 text-xs font-normal text-muted-foreground"
            >已选 {{ form.shopIds.length }} 家 · {{ month }} 起生效</span
          >
        </template>
        <Select
          v-model:value="form.shopIds"
          mode="multiple"
          :options="shopOptions"
          :disabled="saving || !form.enabled"
          option-filter-prop="label"
          placeholder="搜索并选择店铺"
          :max-tag-count="12"
          allow-clear
        />
      </FormItem>
      <div class="grid grid-cols-2 gap-x-4">
        <FormItem label="排序" name="sort">
          <InputNumber
            v-model:value="form.sort"
            :min="0"
            :precision="0"
            :disabled="saving"
            class="!w-full"
          />
        </FormItem>
        <FormItem v-if="group" label="启用">
          <Switch v-model:checked="form.enabled" :disabled="saving" />
        </FormItem>
      </div>
      <Alert
        v-if="added.length || removed.length || disabling"
        type="info"
        show-icon
        class="mb-2"
      >
        <template #message>
          <div class="space-y-1 text-sm">
            <div v-if="disabling">
              停用后该组不再接收店铺；组内 {{ members.length }} 家店铺将改为「未分组」。
            </div>
            <template v-else>
              <div v-if="added.length">
                加入 {{ added.length }} 家
                <template v-if="movedFromOther.length"
                  >，其中 {{ movedFromOther.length }} 家从其他分组移入</template
                >
              </div>
              <div v-if="removed.length">
                移出 {{ removed.length }} 家（改为「未分组」）：
                <Tag v-for="id in removed" :key="id" class="!mb-1">{{
                  shopById.get(id)?.shopName
                }}</Tag>
              </div>
            </template>
          </div>
        </template>
      </Alert>
      <p class="mb-0 text-xs leading-6 text-muted-foreground">
        分组只决定哪些店铺算一个组，月度毛利和年度对比都按这里的分组汇总。变更从 {{ month }} 起生效；店铺第一次配置的分组也用于之前的月份。
      </p>
    </Form>
  </Modal>
</template>
