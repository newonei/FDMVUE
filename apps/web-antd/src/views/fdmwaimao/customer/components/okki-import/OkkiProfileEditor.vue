<script lang="ts" setup>
import type { FdmWaimaoCustomerApi } from '#/api/fdmwaimao/customer';

import { IconifyIcon } from '@vben/icons';

import { Input, Tag, Textarea } from 'ant-design-vue';

import OkkiContactList from './OkkiContactList.vue';

const props = defineProps<{
  disabled?: boolean;
  errors: Record<string, string>;
  modelValue: FdmWaimaoCustomerApi.CustomerProfileDraft;
  origin: 'LOCAL' | 'OKKI';
}>();

const emit = defineEmits<{
  'update:modelValue': [value: FdmWaimaoCustomerApi.CustomerProfileDraft];
}>();

type ProfileField = Exclude<
  keyof FdmWaimaoCustomerApi.CustomerProfileDraft,
  'contacts'
>;

function updateField(field: ProfileField, value: unknown) {
  emit('update:modelValue', {
    ...props.modelValue,
    [field]: String(value ?? ''),
  });
}

function updateContacts(
  contacts: FdmWaimaoCustomerApi.CustomerProfileContactDraft[],
) {
  emit('update:modelValue', { ...props.modelValue, contacts });
}
</script>

<template>
  <section class="profile-editor" aria-labelledby="fdm-profile-heading">
    <div class="profile-editor__heading">
      <div>
        <div class="profile-editor__title-line">
          <h4 id="fdm-profile-heading">FDM 入库资料</h4>
          <Tag color="blue">可编辑</Tag>
          <Tag v-if="origin === 'LOCAL'" color="green">现有本地资料</Tag>
        </div>
        <p>
          {{
            origin === 'LOCAL'
              ? '已回填现有 FDM 客户资料，修改后保存到本地。'
              : '已用 OKKI 资料生成草稿，可在导入前补充或修正。'
          }}
        </p>
      </div>
      <span class="profile-editor__ownership">
        <IconifyIcon icon="lucide:pen-line" aria-hidden="true" />
        保存后的手工值不会被普通 OKKI 刷新覆盖
      </span>
    </div>

    <div class="profile-editor__grid">
      <label
        class="profile-field profile-field--wide"
        :class="{ 'profile-field--error': errors.name }"
      >
        <span>客户名称 <i>*</i></span>
        <Input
          :disabled="disabled"
          :maxlength="255"
          :value="modelValue.name"
          placeholder="请输入写入 FDM 的客户名称"
          show-count
          @update:value="updateField('name', $event)"
        />
        <small v-if="errors.name">{{ errors.name }}</small>
      </label>

      <label
        class="profile-field"
        :class="{ 'profile-field--error': errors.shortName }"
      >
        <span>客户简称</span>
        <Input
          :disabled="disabled"
          :maxlength="255"
          :value="modelValue.shortName || ''"
          placeholder="选填"
          @update:value="updateField('shortName', $event)"
        />
        <small v-if="errors.shortName">{{ errors.shortName }}</small>
      </label>

      <label
        class="profile-field"
        :class="{ 'profile-field--error': errors.countryName }"
      >
        <span>国家 / 地区名称</span>
        <Input
          :disabled="disabled"
          :maxlength="128"
          :value="modelValue.countryName || ''"
          placeholder="例如 France"
          @update:value="updateField('countryName', $event)"
        />
        <small v-if="errors.countryName">{{ errors.countryName }}</small>
      </label>

      <label
        class="profile-field"
        :class="{ 'profile-field--error': errors.countryCode }"
      >
        <span>国家 / 地区编码</span>
        <Input
          :disabled="disabled"
          :maxlength="32"
          :value="modelValue.countryCode || ''"
          placeholder="例如 FR"
          @update:value="updateField('countryCode', $event)"
        />
        <small v-if="errors.countryCode">{{ errors.countryCode }}</small>
      </label>

      <label
        class="profile-field"
        :class="{ 'profile-field--error': errors.countryRegionRaw }"
      >
        <span>地区原文</span>
        <Input
          :disabled="disabled"
          :maxlength="255"
          :value="modelValue.countryRegionRaw || ''"
          placeholder="选填，可保留 OKKI 原始地区文本"
          @update:value="updateField('countryRegionRaw', $event)"
        />
        <small v-if="errors.countryRegionRaw">
          {{ errors.countryRegionRaw }}
        </small>
      </label>

      <label
        class="profile-field"
        :class="{ 'profile-field--error': errors.companyPhone }"
      >
        <span>公司电话</span>
        <Input
          :disabled="disabled"
          :maxlength="128"
          :value="modelValue.companyPhone || ''"
          placeholder="电话号码"
          @update:value="updateField('companyPhone', $event)"
        >
          <template #addonBefore>
            <Input
              class="profile-field__area-code"
              :disabled="disabled"
              :maxlength="32"
              :value="modelValue.companyTelAreaCode || ''"
              placeholder="区号"
              @update:value="updateField('companyTelAreaCode', $event)"
            />
          </template>
        </Input>
        <small v-if="errors.companyPhone">{{ errors.companyPhone }}</small>
        <small v-else-if="errors.companyTelAreaCode">
          {{ errors.companyTelAreaCode }}
        </small>
      </label>

      <label
        class="profile-field"
        :class="{ 'profile-field--error': errors.homepage }"
      >
        <span>公司网址</span>
        <Input
          :disabled="disabled"
          :maxlength="512"
          :value="modelValue.homepage || ''"
          placeholder="https://example.com"
          @update:value="updateField('homepage', $event)"
        />
        <small v-if="errors.homepage">{{ errors.homepage }}</small>
      </label>

      <label
        class="profile-field"
        :class="{ 'profile-field--error': errors.fax }"
      >
        <span>传真</span>
        <Input
          :disabled="disabled"
          :maxlength="128"
          :value="modelValue.fax || ''"
          placeholder="选填"
          @update:value="updateField('fax', $event)"
        />
        <small v-if="errors.fax">{{ errors.fax }}</small>
      </label>

      <label
        class="profile-field profile-field--wide"
        :class="{ 'profile-field--error': errors.address }"
      >
        <span>详细地址</span>
        <Input
          :disabled="disabled"
          :maxlength="512"
          :value="modelValue.address || ''"
          placeholder="选填"
          @update:value="updateField('address', $event)"
        />
        <small v-if="errors.address">{{ errors.address }}</small>
      </label>

      <label
        class="profile-field profile-field--wide"
        :class="{ 'profile-field--error': errors.remark }"
      >
        <span>客户备注</span>
        <Textarea
          :auto-size="{ minRows: 2, maxRows: 5 }"
          :disabled="disabled"
          :maxlength="2000"
          :value="modelValue.remark || ''"
          placeholder="可补充本地业务备注"
          show-count
          @update:value="updateField('remark', $event)"
        />
        <small v-if="errors.remark">{{ errors.remark }}</small>
      </label>
    </div>

    <OkkiContactList
      :contacts="modelValue.contacts"
      :disabled="disabled"
      :errors="errors"
      @update:contacts="updateContacts"
    />
  </section>
</template>

<style scoped>
.profile-editor {
  display: grid;
  gap: 16px;
  padding: 16px;
  background: var(--ant-color-bg-container);
  border: 1px solid var(--ant-color-primary-border);
  border-radius: 12px;
  box-shadow: 0 5px 18px rgb(22 119 255 / 5%);
}

.profile-editor__heading {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  justify-content: space-between;
}

.profile-editor__title-line {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  align-items: center;
}

.profile-editor__title-line h4,
.profile-editor__heading p {
  margin: 0;
}

.profile-editor__title-line h4 {
  font-size: 14px;
  line-height: 22px;
}

.profile-editor__title-line :deep(.ant-tag) {
  margin: 0;
  font-size: 11px;
}

.profile-editor__heading p {
  margin-top: 3px;
  font-size: 12px;
  color: var(--ant-color-text-secondary);
}

.profile-editor__ownership {
  display: flex;
  flex: none;
  gap: 6px;
  align-items: center;
  padding: 6px 9px;
  font-size: 11px;
  color: var(--ant-color-primary);
  background: var(--ant-color-primary-bg);
  border-radius: 7px;
}

.profile-editor__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 13px 16px;
}

.profile-field {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.profile-field > span {
  font-size: 12px;
  font-weight: 550;
  color: var(--ant-color-text-secondary);
}

.profile-field > span i {
  font-style: normal;
  color: var(--ant-color-error);
}

.profile-field--wide {
  grid-column: 1 / -1;
}

.profile-field > small {
  font-size: 11px;
  line-height: 16px;
  color: var(--ant-color-error);
}

.profile-field--error :deep(.ant-input),
.profile-field--error :deep(.ant-input-affix-wrapper),
.profile-field--error :deep(.ant-input-group-addon) {
  border-color: var(--ant-color-error);
}

.profile-field__area-code {
  width: 70px;
  border: 0;
  box-shadow: none;
}

@media (max-width: 720px) {
  .profile-editor__heading {
    display: grid;
  }

  .profile-editor__ownership {
    width: fit-content;
  }

  .profile-editor__grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .profile-field--wide {
    grid-column: auto;
  }
}
</style>
