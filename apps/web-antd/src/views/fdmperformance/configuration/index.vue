<script lang="ts" setup>
import type { JixiaoApi } from '#/api/fdmperformance';
import type { SystemUserApi } from '#/api/system/user';
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  Alert,
  Button,
  Empty,
  message,
  Popconfirm,
  Select,
  Space,
  Spin,
} from 'ant-design-vue';
import {
  getManagementRelations,
  saveManagementRelations,
} from '#/api/fdmperformance';
import { getSimpleUserList } from '#/api/system/user';
import { usePerformanceAccess } from '../shared/access';
import PerformanceShell from '../shared/PerformanceShell.vue';
import { validateRelations } from './model';

defineOptions({ name: 'FdmPerformanceConfiguration' });
const router = useRouter();
const { access, accessLoading, loadAccess } = usePerformanceAccess();
const loading = ref(false);
const saving = ref(false);
const loaded = ref(false);
const loadError = ref(false);
const relations = ref<Partial<JixiaoApi.ManagementRelation>[]>([]);
const users = ref<SystemUserApi.User[]>([]);
const userOptions = computed(() =>
  users.value.map((user) => ({
    label: `${user.nickname || user.username} (${user.username || user.id})`,
    value: user.id,
  })),
);
const destinations = [
  {
    title: '指标库',
    description: '维护指标、评分标准与适用部门',
    path: '/fdmperformance/indicators',
  },
  {
    title: '考评表',
    description: '配置指标组合、人员与考核流程',
    path: '/fdmperformance/templates',
  },
  {
    title: '绩效 HR、老板与总经理',
    description: '配置人事审核人员、复盘通知对象与钉钉提醒',
    path: '/fdmperformance/settings',
  },
];
async function loadRelations() {
  loading.value = true;
  loaded.value = false;
  loadError.value = false;
  try {
    const [data, userList] = await Promise.all([
      getManagementRelations(),
      getSimpleUserList(),
    ]);
    relations.value = data;
    users.value = userList;
    loaded.value = true;
  } catch {
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}
async function submit() {
  if (!loaded.value || !access.value?.canConfigure) return;
  const error = validateRelations(relations.value);
  if (error) {
    message.warning(error);
    return;
  }
  saving.value = true;
  try {
    await saveManagementRelations(
      relations.value.map((row) => ({
        supervisorUserId: row.supervisorUserId!,
        managerUserId: row.managerUserId,
        userIds: row.userIds || [],
      })),
    );
    message.success('人员范围已保存；新发起考核将使用更新后的管理关系');
    await loadRelations();
  } finally {
    saving.value = false;
  }
}
onMounted(async () => {
  const capability = await loadAccess();
  if (capability.canConfigure) await loadRelations();
});
</script>

<template>
  <PerformanceShell
    title="配置中心"
    description="统一维护考核标准、人员范围与提醒设置。"
  >
    <Alert
      v-if="!accessLoading && access && !access.canConfigure"
      type="warning"
      message="仅绩效管理员可以维护配置。"
      show-icon
    />
    <template v-if="access?.canConfigure">
      <section class="destination-grid">
        <button
          v-for="item in destinations"
          :key="item.path"
          type="button"
          class="destination-card"
          @click="router.push(item.path)"
        >
          <strong>{{ item.title }} →</strong><span>{{ item.description }}</span>
        </button>
      </section>
      <section class="configuration-panel">
        <Alert
          v-if="loadError"
          type="error"
          message="人员范围加载失败，请重新加载后再编辑。"
          show-icon
        />
        <div class="panel-title">
          <div>
            <h2>主管、分管经理与可发起人员</h2>
            <p>
              经理查看分管主管发起的考核；历史记录按发起时归属保留。此处不授予系统角色。
            </p>
          </div>
          <Button :disabled="!loaded" @click="relations.push({ userIds: [] })"
            >添加人员范围</Button
          >
        </div>
        <Alert
          type="info"
          show-icon
          message="主管和经理均需拥有对应绩效角色。要让经理直接发起考核，也需为其添加一行可发起人员范围。"
        />
        <Spin :spinning="loading">
          <Empty
            v-if="loaded && !relations.length"
            class="empty"
            description="尚未配置人员范围"
          />
          <div
            v-for="(relation, index) in relations"
            :key="index"
            class="relation-row"
          >
            <label
              >发起主管 / 经理<Select
                v-model:value="relation.supervisorUserId"
                :options="userOptions"
                show-search
                option-filter-prop="label"
                placeholder="选择可发起人"
            /></label>
            <label
              >分管经理<Select
                v-model:value="relation.managerUserId"
                :options="userOptions"
                show-search
                allow-clear
                option-filter-prop="label"
                placeholder="可选，监督此人发起的考核"
            /></label>
            <label class="people-field"
              >可发起考核的人员<Select
                v-model:value="relation.userIds"
                mode="multiple"
                :options="userOptions"
                show-search
                option-filter-prop="label"
                placeholder="选择授权人员"
                :max-tag-count="3"
            /></label>
            <Popconfirm
              title="移除此行后，该人员将失去此处配置的发起范围；保存后生效。"
              @confirm="relations.splice(index, 1)"
              ><Button danger type="link">移除</Button></Popconfirm
            >
          </div>
        </Spin>
        <Space class="footer"
          ><Button
            :disabled="!loaded"
            :loading="saving"
            type="primary"
            @click="submit"
            >保存人员范围</Button
          ><Button :loading="loading" @click="loadRelations"
            >重新加载</Button
          ></Space
        >
      </section>
    </template>
  </PerformanceShell>
</template>

<style scoped>
.destination-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}
.destination-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 22px;
  text-align: left;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 12px;
  cursor: pointer;
}
.destination-card:hover {
  border-color: hsl(var(--primary));
}
.destination-card span,
.panel-title p {
  color: hsl(var(--muted-foreground));
  font-size: 12px;
}
.configuration-panel {
  padding: 22px;
  border: 1px solid hsl(var(--border));
  border-radius: 12px;
  background: hsl(var(--card));
}
.panel-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 14px;
}
.panel-title h2 {
  font-size: 17px;
  font-weight: 650;
  margin: 0;
}
.panel-title p {
  margin: 6px 0 0;
}
.relation-row {
  display: grid;
  grid-template-columns:
    minmax(150px, 1fr) minmax(160px, 1fr) minmax(200px, 2fr)
    auto;
  gap: 12px;
  align-items: end;
  padding: 18px 0;
  border-bottom: 1px solid hsl(var(--border));
}
.relation-row label {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12px;
}
.empty,
.footer {
  margin-top: 22px;
}
@media (max-width: 900px) {
  .destination-grid {
    grid-template-columns: 1fr;
  }
  .relation-row {
    grid-template-columns: 1fr 1fr;
  }
  .people-field {
    grid-column: 1/-1;
  }
  .panel-title {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
