<script lang="ts" setup>
import type { FdmWaimaoCustomerApi } from '#/api/fdmwaimao/customer';

import { IconifyIcon } from '@vben/icons';

import {
  Avatar,
  Button,
  Checkbox,
  Input,
  Popconfirm,
  Tag,
} from 'ant-design-vue';

import { cleanOkkiText } from './display';

const props = defineProps<{
  contacts: FdmWaimaoCustomerApi.CustomerProfileContactDraft[];
  disabled?: boolean;
  errors: Record<string, string>;
}>();

const emit = defineEmits<{
  'update:contacts': [
    contacts: FdmWaimaoCustomerApi.CustomerProfileContactDraft[],
  ];
}>();

type ContactField = Exclude<
  keyof FdmWaimaoCustomerApi.CustomerProfileContactDraft,
  'draftKey' | 'externalContactKey' | 'id' | 'primaryFlag' | 'source'
>;

function contactKey(
  contact: FdmWaimaoCustomerApi.CustomerProfileContactDraft,
  index: number,
) {
  return (
    contact.id ||
    contact.externalContactKey ||
    contact.draftKey ||
    `contact-${index}`
  );
}

function contactName(
  contact: FdmWaimaoCustomerApi.CustomerProfileContactDraft,
) {
  return cleanOkkiText(contact.name) || '新联系人';
}

function updateField(index: number, field: ContactField, value: unknown) {
  emit(
    'update:contacts',
    props.contacts.map((contact, currentIndex) =>
      currentIndex === index
        ? { ...contact, [field]: String(value ?? '') }
        : contact,
    ),
  );
}

function updatePrimary(index: number, checked: boolean) {
  emit(
    'update:contacts',
    props.contacts.map((contact, currentIndex) => {
      let primaryFlag = contact.primaryFlag;
      if (checked) {
        primaryFlag = currentIndex === index;
      } else if (currentIndex === index) {
        primaryFlag = false;
      }
      return { ...contact, primaryFlag };
    }),
  );
}

function addContact() {
  const draftKey =
    globalThis.crypto?.randomUUID?.() ??
    `draft-${Date.now()}-${props.contacts.length}`;
  emit('update:contacts', [
    ...props.contacts,
    {
      draftKey,
      email: '',
      linkedin: '',
      name: '',
      phone: '',
      position: '',
      primaryFlag: props.contacts.length === 0,
      source: 'LOCAL',
      telAreaCode: '',
      wechat: '',
      whatsapp: '',
    },
  ]);
}

function removeContact(index: number) {
  emit(
    'update:contacts',
    props.contacts.filter((_, currentIndex) => currentIndex !== index),
  );
}

function errorAt(index: number, field: string) {
  return props.errors[`contacts.${index}.${field}`];
}
</script>

<template>
  <section class="contact-editor" aria-labelledby="fdm-contact-heading">
    <div class="contact-editor__heading">
      <div>
        <h4 id="fdm-contact-heading">联系人</h4>
        <p>联系人同样可以补充、修改或移除；新增项将作为 FDM 本地联系人保存。</p>
        <small v-if="errors.contacts" class="contact-editor__error">
          {{ errors.contacts }}
        </small>
      </div>
      <div class="contact-editor__heading-actions">
        <span>{{ contacts.length }} 位</span>
        <Button
          :disabled="disabled || contacts.length >= 100"
          size="small"
          @click="addContact"
        >
          <template #icon><IconifyIcon icon="lucide:user-plus" /></template>
          新增联系人
        </Button>
      </div>
    </div>

    <div v-if="contacts.length" class="contact-editor__list">
      <article
        v-for="(contact, index) in contacts"
        :key="contactKey(contact, index)"
        class="contact-card"
      >
        <header class="contact-card__header">
          <div class="contact-card__identity">
            <Avatar :size="36">
              {{ contactName(contact).slice(0, 1).toUpperCase() }}
            </Avatar>
            <div>
              <strong>{{ contactName(contact) }}</strong>
              <Tag :color="contact.source === 'LOCAL' ? 'green' : 'blue'">
                {{ contact.source === 'LOCAL' ? 'FDM 本地' : 'OKKI 回填' }}
              </Tag>
            </div>
          </div>
          <div class="contact-card__actions">
            <Checkbox
              :checked="contact.primaryFlag"
              :disabled="disabled"
              @update:checked="updatePrimary(index, Boolean($event))"
            >
              主联系人
            </Checkbox>
            <Popconfirm
              cancel-text="取消"
              ok-text="移除"
              title="从本次保存的联系人集合中移除？"
              @confirm="removeContact(index)"
            >
              <Button
                danger
                :disabled="disabled"
                size="small"
                type="text"
                aria-label="移除联系人"
              >
                <template #icon><IconifyIcon icon="lucide:trash-2" /></template>
              </Button>
            </Popconfirm>
          </div>
        </header>

        <div class="contact-card__grid">
          <label
            class="contact-field"
            :class="{ 'contact-field--error': errorAt(index, 'name') }"
          >
            <span>姓名</span>
            <Input
              :disabled="disabled"
              :maxlength="128"
              :value="contact.name || ''"
              placeholder="联系人姓名"
              @update:value="updateField(index, 'name', $event)"
            />
            <small v-if="errorAt(index, 'name')">
              {{ errorAt(index, 'name') }}
            </small>
          </label>

          <label
            class="contact-field"
            :class="{ 'contact-field--error': errorAt(index, 'position') }"
          >
            <span>职位</span>
            <Input
              :disabled="disabled"
              :maxlength="128"
              :value="contact.position || ''"
              placeholder="选填"
              @update:value="updateField(index, 'position', $event)"
            />
            <small v-if="errorAt(index, 'position')">
              {{ errorAt(index, 'position') }}
            </small>
          </label>

          <label
            class="contact-field"
            :class="{ 'contact-field--error': errorAt(index, 'email') }"
          >
            <span>邮箱</span>
            <Input
              :disabled="disabled"
              :maxlength="320"
              :value="contact.email || ''"
              placeholder="name@example.com"
              @update:value="updateField(index, 'email', $event)"
            />
            <small v-if="errorAt(index, 'email')">
              {{ errorAt(index, 'email') }}
            </small>
          </label>

          <label
            class="contact-field"
            :class="{
              'contact-field--error':
                errorAt(index, 'phone') || errorAt(index, 'telAreaCode'),
            }"
          >
            <span>电话</span>
            <div class="contact-phone">
              <Input
                class="contact-phone__area"
                :disabled="disabled"
                :maxlength="32"
                :value="contact.telAreaCode || ''"
                placeholder="区号"
                @update:value="updateField(index, 'telAreaCode', $event)"
              />
              <Input
                :disabled="disabled"
                :maxlength="128"
                :value="contact.phone || ''"
                placeholder="电话号码"
                @update:value="updateField(index, 'phone', $event)"
              />
            </div>
            <small v-if="errorAt(index, 'phone')">
              {{ errorAt(index, 'phone') }}
            </small>
            <small v-else-if="errorAt(index, 'telAreaCode')">
              {{ errorAt(index, 'telAreaCode') }}
            </small>
          </label>

          <label
            class="contact-field"
            :class="{ 'contact-field--error': errorAt(index, 'whatsapp') }"
          >
            <span>WhatsApp</span>
            <Input
              :disabled="disabled"
              :maxlength="255"
              :value="contact.whatsapp || ''"
              placeholder="选填"
              @update:value="updateField(index, 'whatsapp', $event)"
            />
            <small v-if="errorAt(index, 'whatsapp')">
              {{ errorAt(index, 'whatsapp') }}
            </small>
          </label>

          <label
            class="contact-field"
            :class="{ 'contact-field--error': errorAt(index, 'wechat') }"
          >
            <span>微信</span>
            <Input
              :disabled="disabled"
              :maxlength="255"
              :value="contact.wechat || ''"
              placeholder="选填"
              @update:value="updateField(index, 'wechat', $event)"
            />
            <small v-if="errorAt(index, 'wechat')">
              {{ errorAt(index, 'wechat') }}
            </small>
          </label>

          <label
            class="contact-field contact-field--wide"
            :class="{ 'contact-field--error': errorAt(index, 'linkedin') }"
          >
            <span>LinkedIn</span>
            <Input
              :disabled="disabled"
              :maxlength="512"
              :value="contact.linkedin || ''"
              placeholder="个人主页或账号"
              @update:value="updateField(index, 'linkedin', $event)"
            />
            <small v-if="errorAt(index, 'linkedin')">
              {{ errorAt(index, 'linkedin') }}
            </small>
          </label>
        </div>
      </article>
    </div>

    <div v-else class="contact-editor__empty">
      <span aria-hidden="true"><IconifyIcon icon="lucide:users" /></span>
      <div>
        <strong>当前没有联系人</strong>
        <p>可以继续保存公司，也可以先新增一位联系人。</p>
      </div>
      <Button :disabled="disabled" size="small" @click="addContact">
        新增联系人
      </Button>
    </div>
  </section>
</template>

<style scoped>
.contact-editor {
  display: grid;
  gap: 12px;
  padding-top: 16px;
  border-top: 1px solid var(--ant-color-border-secondary);
}

.contact-editor__heading {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
}

.contact-editor__heading h4,
.contact-editor__heading p,
.contact-editor__empty p {
  margin: 0;
}

.contact-editor__heading h4 {
  font-size: 14px;
  line-height: 22px;
}

.contact-editor__heading p {
  margin-top: 2px;
  font-size: 12px;
  color: var(--ant-color-text-tertiary);
}

.contact-editor__error {
  display: block;
  margin-top: 3px;
  font-size: 11px;
  color: var(--ant-color-error);
}

.contact-editor__heading-actions {
  display: flex;
  flex: none;
  gap: 9px;
  align-items: center;
}

.contact-editor__heading-actions > span {
  padding: 3px 9px;
  font-size: 12px;
  color: var(--ant-color-text-secondary);
  background: var(--ant-color-fill-quaternary);
  border-radius: 999px;
}

.contact-editor__list {
  display: grid;
  gap: 10px;
}

.contact-card {
  padding: 14px;
  background: var(--ant-color-fill-quaternary);
  border: 1px solid var(--ant-color-border-secondary);
  border-radius: 10px;
}

.contact-card__header,
.contact-card__identity,
.contact-card__actions {
  display: flex;
  align-items: center;
}

.contact-card__header {
  gap: 12px;
  justify-content: space-between;
  margin-bottom: 12px;
}

.contact-card__identity {
  gap: 9px;
  min-width: 0;
}

.contact-card__identity :deep(.ant-avatar) {
  flex: none;
  font-weight: 650;
  color: var(--ant-color-primary);
  background: var(--ant-color-primary-bg);
}

.contact-card__identity > div {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  align-items: center;
  min-width: 0;
}

.contact-card__identity strong {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
  white-space: nowrap;
}

.contact-card__identity :deep(.ant-tag) {
  margin: 0;
  font-size: 11px;
}

.contact-card__actions {
  flex: none;
  gap: 4px;
  font-size: 12px;
}

.contact-card__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 11px 14px;
}

.contact-field {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.contact-field > span {
  font-size: 11px;
  font-weight: 550;
  color: var(--ant-color-text-secondary);
}

.contact-field > span i {
  font-style: normal;
  color: var(--ant-color-error);
}

.contact-field--wide {
  grid-column: 1 / -1;
}

.contact-field > small {
  font-size: 11px;
  color: var(--ant-color-error);
}

.contact-field--error :deep(.ant-input) {
  border-color: var(--ant-color-error);
}

.contact-phone {
  display: grid;
  grid-template-columns: 82px minmax(0, 1fr);
  gap: 7px;
}

.contact-editor__empty {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 16px;
  color: var(--ant-color-text-secondary);
  background: var(--ant-color-fill-quaternary);
  border: 1px dashed var(--ant-color-border);
  border-radius: 10px;
}

.contact-editor__empty > span {
  display: grid;
  flex: none;
  place-items: center;
  width: 38px;
  height: 38px;
  font-size: 18px;
  color: var(--ant-color-primary);
  background: var(--ant-color-primary-bg);
  border-radius: 10px;
}

.contact-editor__empty > div {
  flex: 1;
}

.contact-editor__empty strong {
  font-size: 13px;
  color: var(--ant-color-text);
}

.contact-editor__empty p {
  margin-top: 3px;
  font-size: 12px;
}

@media (max-width: 720px) {
  .contact-editor__heading,
  .contact-card__header {
    align-items: flex-start;
  }

  .contact-card__grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .contact-field--wide {
    grid-column: auto;
  }

  .contact-editor__empty {
    align-items: flex-start;
  }
}

@media (max-width: 480px) {
  .contact-editor__heading,
  .contact-card__header,
  .contact-editor__empty {
    display: grid;
  }

  .contact-card__actions {
    justify-content: space-between;
  }
}
</style>
