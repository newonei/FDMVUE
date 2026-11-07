<script setup lang="ts">
import type { FdmAiCheckApi } from '#/api/fdmaicheck';

import { computed, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import {
  AutoComplete,
  Button,
  Checkbox,
  Empty,
  Input,
  message,
  Modal,
  Popconfirm,
  Select,
  Switch,
} from 'ant-design-vue';

import {
  applyGroup,
  groupItems,
  ITEM_SEVERITY_LABELS,
  ITEM_SEVERITY_OPTIONS,
  manyFalsePositives,
  newItem,
  UNGROUPED,
} from './model';

/**
 * 检查点列表：一行一个，显示名称、不通过时的等级、近 30 天结果条和开关；点一行才展开看或编辑，一次只展开一个。
 * 分组可整组收起，也可一键全部展开、收起；系统规则单独一组，只读。
 * 分组和检查点用同一个箭头：朝右是收起，朝下是展开。
 */
const props = defineProps<{
  editing: boolean;
  ruleItems?: FdmAiCheckApi.RuleItem[];
  stats: Record<string, FdmAiCheckApi.ItemStats>;
}>();
const items = defineModel<FdmAiCheckApi.Item[]>('items', { required: true });

const openIndex = ref<number>();
const collapsed = ref<Set<string>>(new Set());
const groups = computed(() => groupItems(items.value));
const groupNames = computed(() =>
  [...new Set(items.value.map((i) => i.group?.trim()).filter(Boolean))].map(
    (value) => ({ value: value as string }),
  ),
);

watch(
  () => props.editing,
  () => {
    openIndex.value = undefined;
  },
);

function statsOf(item: FdmAiCheckApi.Item) {
  return item.code ? props.stats[item.code] : undefined;
}

function pct(n: number, total: number) {
  return `${total > 0 ? ((n / total) * 100).toFixed(1) : 0}%`;
}

function toggleRow(index: number) {
  openIndex.value = openIndex.value === index ? undefined : index;
}

function toggleGroup(name: string) {
  const next = new Set(collapsed.value);
  if (next.has(name)) next.delete(name);
  else next.add(name);
  collapsed.value = next;
}

const RULES = '__rules';
const allNames = computed(() => [
  ...groups.value.map((g) => g.name),
  ...(props.ruleItems?.length ? [RULES] : []),
]);
const allCollapsed = computed(
  () =>
    allNames.value.length > 0 &&
    allNames.value.every((n) => collapsed.value.has(n)),
);

function toggleAll() {
  collapsed.value = allCollapsed.value ? new Set() : new Set(allNames.value);
  if (!allCollapsed.value) openIndex.value = undefined;
}

function add(group?: string) {
  items.value.push(newItem(group));
  openIndex.value = items.value.length - 1;
  if (group) {
    const next = new Set(collapsed.value);
    next.delete(group);
    collapsed.value = next;
  }
}

/** 新建、编辑分组的弹窗：填名称，勾选这组包含哪些检查点。 */
const groupEdit = ref<{
  from: null | string;
  name: string;
  selected: Set<number>;
}>();

function openGroup(from: null | string = null) {
  const selected = new Set<number>();
  if (from)
    for (const [index, item] of items.value.entries())
      if (item.group?.trim() === from) selected.add(index);
  groupEdit.value = { from, name: from ?? '', selected };
}

function toggleMember(index: number, checked: boolean) {
  const edit = groupEdit.value;
  if (!edit) return;
  const next = new Set(edit.selected);
  if (checked) next.add(index);
  else next.delete(index);
  edit.selected = next;
}

function confirmGroup() {
  const edit = groupEdit.value;
  if (!edit) return;
  const name = edit.name.trim();
  const problem = applyGroup(items.value, edit.from, name, edit.selected);
  if (problem) {
    message.warning(problem);
    return;
  }
  groupEdit.value = undefined;
  const next = new Set(collapsed.value);
  next.delete(name);
  collapsed.value = next;
  // 一个都没选：新建一个空检查点放进这组，分组才留得住
  if (edit.selected.size === 0) add(name);
}

function remove(index: number) {
  items.value.splice(index, 1);
  openIndex.value = undefined;
}

defineExpose({ add, openGroup });
</script>

<template>
  <div class="cl">
    <div class="cl-row cl-head">
      <span class="cl-head-name">
        检查点
        <button
          v-if="allNames.length > 1"
          type="button"
          class="cl-all"
          @click="toggleAll"
        >
          <IconifyIcon
            :icon="
              allCollapsed
                ? 'lucide:chevrons-up-down'
                : 'lucide:chevrons-down-up'
            "
          />
          {{ allCollapsed ? '全部展开' : '全部收起' }}
        </button>
      </span>
      <span>不通过时</span>
      <span class="cl-stat-col">近 30 天</span>
      <span>启用</span>
    </div>
    <template v-for="group in groups" :key="group.name">
      <div class="cl-group">
        <button
          type="button"
          class="cl-group-btn"
          :aria-expanded="!collapsed.has(group.name)"
          @click="toggleGroup(group.name)"
        >
          <IconifyIcon
            icon="lucide:chevron-right"
            class="cl-chevron"
            :class="{ open: !collapsed.has(group.name) }"
          />
          <span class="cl-group-name">{{ group.name }}</span>
          <span class="cl-count">{{ group.rows.length }}</span>
        </button>
        <Button
          v-if="editing && group.name !== UNGROUPED"
          size="small"
          type="link"
          @click="openGroup(group.name)"
        >
          编辑分组
        </Button>
        <Button
          v-if="editing"
          size="small"
          type="link"
          @click="add(group.name === UNGROUPED ? undefined : group.name)"
        >
          在这组添加
        </Button>
      </div>
      <template v-if="!collapsed.has(group.name)">
        <template v-for="{ item, index } in group.rows" :key="index">
          <div
            class="cl-row"
            :class="[{ off: !item.enabled, open: openIndex === index }]"
            role="button"
            tabindex="0"
            :aria-expanded="openIndex === index"
            @click="toggleRow(index)"
            @keydown.enter.prevent="toggleRow(index)"
            @keydown.space.prevent="toggleRow(index)"
          >
            <span class="cl-name">
              <IconifyIcon
                icon="lucide:chevron-right"
                class="cl-chevron"
                :class="{ open: openIndex === index }"
              />
              <span class="cl-name-text">{{ item.name || '（未命名）' }}</span>
              <span v-if="manyFalsePositives(statsOf(item))" class="cl-fp">误报 {{ statsOf(item)!.falsePositive }} 次</span>
            </span>
            <span>
              <span class="cl-sev" :class="`sev-${item.severity}`">
                {{ ITEM_SEVERITY_LABELS[item.severity] }}
              </span>
            </span>
            <span class="cl-stat-col">
              <span
                v-if="statsOf(item)?.total"
                class="cl-mini"
                :title="`近 30 天检查 ${statsOf(item)!.total} 次`"
              >
                <i
                  class="p"
                  :style="{
                    width: pct(statsOf(item)!.pass, statsOf(item)!.total),
                  }"
                ></i>
                <i
                  class="f"
                  :style="{
                    width: pct(statsOf(item)!.fail, statsOf(item)!.total),
                  }"
                ></i>
                <i
                  class="w"
                  :style="{
                    width: pct(statsOf(item)!.warn, statsOf(item)!.total),
                  }"
                ></i>
              </span>
              <span v-else class="cl-muted">还没有记录</span>
            </span>
            <span @click.stop @keydown.stop>
              <Switch
                v-model:checked="item.enabled"
                size="small"
                :disabled="!editing"
              />
            </span>
          </div>
          <div v-if="openIndex === index" class="cl-editor">
            <template v-if="editing">
              <div class="cl-fields">
                <label class="cl-field">
                  <span>名称</span>
                  <Input
                    v-model:value="item.name"
                    :maxlength="50"
                    placeholder="例如：附件和合同对不上"
                  />
                </label>
                <label class="cl-field">
                  <span>分组</span>
                  <AutoComplete
                    v-model:value="item.group"
                    :options="groupNames"
                    :maxlength="20"
                    placeholder="例如：附件、价格、条款"
                  />
                </label>
                <label class="cl-field">
                  <span>不通过时</span>
                  <Select
                    v-model:value="item.severity"
                    :options="ITEM_SEVERITY_OPTIONS"
                  />
                </label>
                <label class="cl-field wide">
                  <span>检查什么</span>
                  <Input.TextArea
                    v-model:value="item.description"
                    :rows="2"
                    :maxlength="1000"
                    placeholder="例如：逐个对比附件和合同的金额、数量、单价、规格、交期"
                  />
                </label>
                <label class="cl-field">
                  <span>不通过的情况</span>
                  <Input.TextArea
                    v-model:value="item.failWhen"
                    :rows="2"
                    :maxlength="500"
                    :disabled="item.severity === 'INFO'"
                    :placeholder="
                      item.severity === 'INFO'
                        ? '只提醒的检查点不会判不通过'
                        : '例如：规格、数量、单价有任何一处不同'
                    "
                  />
                </label>
                <label class="cl-field">
                  <span>只提醒的情况</span>
                  <Input.TextArea
                    v-model:value="item.warnWhen"
                    :rows="2"
                    :maxlength="500"
                    placeholder="例如：只有大小写、空格不同"
                  />
                </label>
              </div>
              <div class="cl-editor-foot">
                <Popconfirm title="删除这个检查点？" @confirm="remove(index)">
                  <Button size="small" danger type="link">删除</Button>
                </Popconfirm>
              </div>
            </template>
            <template v-else>
              <p v-if="item.description">
                <b>检查什么：</b>{{ item.description }}
              </p>
              <p v-if="item.failWhen && item.severity !== 'INFO'">
                <b>不通过的情况：</b>{{ item.failWhen }}
              </p>
              <p v-if="item.warnWhen">
                <b>只提醒的情况：</b>{{ item.warnWhen }}
              </p>
              <p
                v-if="!item.description && !item.failWhen && !item.warnWhen"
                class="cl-muted"
              >
                没有写说明，AI 只按名称判断
              </p>
            </template>
            <div v-if="statsOf(item)" class="cl-stats">
              <span>近 30 天检查 {{ statsOf(item)!.total }} 次</span>
              <span class="p">通过 {{ statsOf(item)!.pass }}</span>
              <span class="f">不通过 {{ statsOf(item)!.fail }}</span>
              <span class="w">有疑问 {{ statsOf(item)!.warn }}</span>
              <span>不适用 {{ statsOf(item)!.notApplicable }}</span>
              <span>缺资料 {{ statsOf(item)!.unknown }}</span>
              <span :class="{ f: manyFalsePositives(statsOf(item)) }">
                误报 {{ statsOf(item)!.falsePositive }}
              </span>
            </div>
          </div>
        </template>
      </template>
    </template>
    <Empty
      v-if="items.length === 0"
      class="cl-empty"
      description="没有检查点，AI 只按通用要求检查"
    />
    <template v-if="ruleItems?.length">
      <div class="cl-group">
        <button
          type="button"
          class="cl-group-btn"
          :aria-expanded="!collapsed.has(RULES)"
          @click="toggleGroup(RULES)"
        >
          <IconifyIcon
            icon="lucide:chevron-right"
            class="cl-chevron"
            :class="{ open: !collapsed.has(RULES) }"
          />
          <span class="cl-group-name">系统规则</span>
          <span class="cl-count">{{ ruleItems.length }}</span>
          <span class="cl-muted">固定，不能改</span>
        </button>
      </div>
      <div v-if="!collapsed.has(RULES)" class="cl-rules">
        <span v-for="r in ruleItems" :key="r.code" class="cl-rule">
          {{ r.name }}
          <span v-if="stats[r.code]?.total" class="cl-muted">· 不通过 {{ stats[r.code]!.fail + stats[r.code]!.warn }}/{{
              stats[r.code]!.total
            }}</span>
        </span>
      </div>
    </template>
    <Modal
      :open="!!groupEdit"
      :title="groupEdit?.from ? '编辑分组' : '新建分组'"
      ok-text="确定"
      @ok="confirmGroup"
      @cancel="groupEdit = undefined"
    >
      <template v-if="groupEdit">
        <label class="cl-field">
          <span>分组名称</span>
          <Input
            v-model:value="groupEdit.name"
            :maxlength="20"
            placeholder="例如：附件、价格、合同一致"
          />
        </label>
        <div class="cl-pick-head">
          勾选放进这组的检查点（已选 {{ groupEdit.selected.size }} 个）；
          一个都不选会新建一个空检查点
        </div>
        <div class="cl-pick">
          <Checkbox
            v-for="(item, index) in items"
            :key="index"
            :checked="groupEdit.selected.has(index)"
            @update:checked="(v: boolean) => toggleMember(index, v)"
          >
            {{ item.name || `第 ${index + 1} 个（未命名）` }}
            <span
              v-if="item.group?.trim() && item.group.trim() !== groupEdit.from"
              class="cl-pick-group"
            >
              现在在「{{ item.group.trim() }}」
            </span>
          </Checkbox>
        </div>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.cl {
  overflow: hidden;
  border: 1px solid var(--ant-color-border-secondary, #f0f0f0);
  border-radius: 8px;
}

.cl-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 80px 140px 44px;
  gap: 10px;
  align-items: center;
  padding: 7px 12px;
  font-size: 13px;
  cursor: pointer;
  border-top: 1px solid var(--ant-color-border-secondary, #f0f0f0);
}

.cl-row:hover,
.cl-row.open {
  background: var(--ant-color-fill-quaternary, rgb(0 0 0 / 2%));
}

.cl-row:focus-visible {
  outline: 2px solid var(--ant-color-primary, #1677ff);
  outline-offset: -2px;
}

.cl-head {
  font-size: 12px;
  color: var(--ant-color-text-tertiary, #8c8c8c);
  cursor: default;
  background: var(--ant-color-fill-quaternary, rgb(0 0 0 / 2%));
  border-top: 0;
}

.cl-head:hover {
  background: var(--ant-color-fill-quaternary, rgb(0 0 0 / 2%));
}

.cl-row.off .cl-name {
  color: var(--ant-color-text-quaternary, #bfbfbf);
}

.cl-name {
  display: flex;
  gap: 6px;
  align-items: center;
  min-width: 0;
}

.cl-name-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cl-head-name {
  display: flex;
  gap: 10px;
  align-items: center;
  padding-inline-start: 20px;
}

.cl-all {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  padding: 0;
  font: inherit;
  color: var(--ant-color-primary, #1677ff);
  cursor: pointer;
  background: none;
  border: 0;
}

/* 分组、检查点共用：朝右收起，朝下展开 */
.cl-chevron {
  flex: none;
  width: 14px;
  height: 14px;
  color: var(--ant-color-text-tertiary, #8c8c8c);
  transition: transform 0.2s;
}

.cl-chevron.open {
  transform: rotate(90deg);
}

.cl-fp {
  margin-inline-start: 6px;
  font-size: 11px;
  color: var(--ant-color-error, #ff4d4f);
}

.cl-sev {
  padding: 0 6px;
  font-size: 12px;
  line-height: 20px;
  border-radius: 4px;
}

.sev-HIGH {
  color: var(--ant-color-error, #ff4d4f);
  background: var(--ant-color-error-bg, #fff2f0);
}

.sev-WARNING {
  color: var(--ant-color-warning-text, #d48806);
  background: var(--ant-color-warning-bg, #fffbe6);
}

.sev-INFO {
  color: var(--ant-color-text-secondary, #595959);
  background: var(--ant-color-fill-tertiary, rgb(0 0 0 / 4%));
}

.cl-mini {
  display: inline-flex;
  width: 100%;
  height: 6px;
  overflow: hidden;
  vertical-align: middle;
  background: var(--ant-color-fill-secondary, rgb(0 0 0 / 6%));
  border-radius: 3px;
}

.cl-mini i {
  display: block;
  height: 100%;
}

.cl-mini .p {
  background: var(--ant-color-success, #52c41a);
}

.cl-mini .f {
  background: var(--ant-color-error, #ff4d4f);
}

.cl-mini .w {
  background: var(--ant-color-warning, #faad14);
}

.cl-muted {
  font-size: 12px;
  color: var(--ant-color-text-tertiary, #8c8c8c);
}

.cl-group {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px 0 0;
  background: var(--ant-color-fill-tertiary, rgb(0 0 0 / 4%));
  border-top: 1px solid var(--ant-color-border-secondary, #f0f0f0);
}

.cl-group-btn {
  display: flex;
  flex: 1;
  gap: 6px;
  align-items: center;
  min-height: 32px;
  padding: 4px 12px;
  font: inherit;
  font-size: 13px;
  color: var(--ant-color-text-secondary, #595959);
  text-align: left;
  cursor: pointer;
  background: none;
  border: 0;
}

.cl-group-btn:hover .cl-chevron,
.cl-row:hover .cl-chevron {
  color: var(--ant-color-text, #262626);
}

.cl-group-btn:focus-visible {
  outline: 2px solid var(--ant-color-primary, #1677ff);
  outline-offset: -2px;
}

.cl-group-name {
  font-weight: 600;
}

.cl-count {
  min-width: 20px;
  padding: 0 6px;
  font-size: 12px;
  line-height: 18px;
  color: var(--ant-color-text-tertiary, #8c8c8c);
  text-align: center;
  background: var(--ant-color-bg-container, #fff);
  border-radius: 9px;
}

.cl-editor {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px 10px 32px;
  background: var(--ant-color-fill-quaternary, rgb(0 0 0 / 2%));
  border-top: 1px dashed var(--ant-color-border-secondary, #f0f0f0);
}

.cl-editor p {
  margin: 0;
  color: var(--ant-color-text-secondary, #595959);
  overflow-wrap: anywhere;
}

.cl-fields {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px 12px;
}

.cl-field {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.cl-field > span {
  font-size: 12px;
  color: var(--ant-color-text-tertiary, #8c8c8c);
}

.cl-field.wide {
  grid-column: 1 / -1;
}

.cl-editor-foot {
  display: flex;
  justify-content: flex-end;
}

.cl-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 12px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--ant-color-text-tertiary, #8c8c8c);
}

.cl-stats .p {
  color: var(--ant-color-success, #52c41a);
}

.cl-stats .f {
  color: var(--ant-color-error, #ff4d4f);
}

.cl-stats .w {
  color: var(--ant-color-warning-text, #d48806);
}

.cl-rules {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 12px;
  border-top: 1px solid var(--ant-color-border-secondary, #f0f0f0);
}

.cl-rule {
  padding: 1px 8px;
  font-size: 12px;
  background: var(--ant-color-fill-quaternary, rgb(0 0 0 / 2%));
  border: 1px solid var(--ant-color-border-secondary, #f0f0f0);
  border-radius: 12px;
}

.cl-empty {
  padding: 16px 0;
}

@media (max-width: 900px) {
  .cl-row {
    grid-template-columns: minmax(0, 1fr) 70px 44px;
  }

  .cl-stat-col {
    display: none;
  }

  .cl-fields {
    grid-template-columns: minmax(0, 1fr);
  }
}

.cl-pick-head {
  margin: 12px 0 6px;
  font-size: 12px;
  color: var(--ant-color-text-tertiary, #8c8c8c);
}

.cl-pick {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 360px;
  overflow-y: auto;
}

.cl-pick :deep(.ant-checkbox-wrapper) {
  margin-inline-start: 0;
}

.cl-pick-group {
  margin-inline-start: 6px;
  font-size: 12px;
  color: var(--ant-color-text-tertiary, #8c8c8c);
}
</style>
