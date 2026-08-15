<script lang="ts" setup>
import { computed, onMounted, ref, shallowRef } from 'vue';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import {
  Alert,
  Button,
  Card,
  Col,
  Row,
  Skeleton,
  Space,
  Tag,
} from 'ant-design-vue';

type FixedMarketType = 'DOMESTIC' | 'EXPORT';

interface FoundationModuleStatus {
  available: boolean;
  blockedCapabilities: string[];
  displayName: string;
  enabledCapabilities: string[];
  fixedMarketType?: FixedMarketType | null;
  moduleKey: string;
  stage: string;
}

interface RoadmapEntry {
  capability: string;
  description: string;
  title: string;
}

const props = defineProps<{
  description: string;
  expectedMarketType: FixedMarketType;
  expectedModuleKey: string;
  loadStatus: () => Promise<FoundationModuleStatus>;
  roadmap: readonly RoadmapEntry[];
  title: string;
}>();

const loading = ref(false);
const loadError = ref('');
const status = shallowRef<FoundationModuleStatus>();
let loadSequence = 0;

const enabledCapabilitySet = computed(
  () => new Set(status.value?.enabledCapabilities),
);

function marketTypeLabel(marketType?: FixedMarketType | null) {
  if (marketType === 'EXPORT') return 'EXPORT（外贸）';
  if (marketType === 'DOMESTIC') return 'DOMESTIC（内贸）';
  return '未固定';
}

function roadmapState(entry: RoadmapEntry) {
  return enabledCapabilitySet.value.has(entry.capability) ? '已启用' : '未启用';
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return '模块状态加载失败，请检查服务连接后重试。';
}

async function loadModuleStatus() {
  const sequence = ++loadSequence;
  loading.value = true;
  loadError.value = '';
  try {
    const result = await props.loadStatus();
    if (sequence !== loadSequence) return;
    if (result.moduleKey !== props.expectedModuleKey) {
      throw new Error(
        `模块标识不匹配：期望 ${props.expectedModuleKey}，实际 ${result.moduleKey}`,
      );
    }
    if (result.fixedMarketType !== props.expectedMarketType) {
      throw new Error(
        `产品方向不匹配：期望 ${props.expectedMarketType}，实际 ${result.fixedMarketType ?? '未设置'}`,
      );
    }
    status.value = result;
  } catch (error) {
    if (sequence !== loadSequence) return;
    status.value = undefined;
    loadError.value = errorMessage(error);
  } finally {
    if (sequence === loadSequence) {
      loading.value = false;
    }
  }
}

onMounted(() => {
  void loadModuleStatus();
});
</script>

<template>
  <Page auto-content-height>
    <div class="foundation-workbench">
      <header class="workbench-header">
        <div>
          <div class="header-eyebrow">CRM FOUNDATION</div>
          <h1>{{ title }}</h1>
          <p>{{ description }}</p>
        </div>
        <Button :loading="loading" @click="loadModuleStatus">
          <template #icon>
            <IconifyIcon icon="lucide:refresh-cw" />
          </template>
          刷新模块状态
        </Button>
      </header>

      <Card class="status-panel" :bordered="false">
        <Skeleton v-if="loading && !status" active :paragraph="{ rows: 4 }" />

        <div v-else-if="loadError" class="error-state">
          <Alert
            :description="loadError"
            message="暂时无法读取模块状态"
            show-icon
            type="error"
          />
          <Button type="primary" @click="loadModuleStatus">重新加载</Button>
        </div>

        <template v-else-if="status">
          <Alert
            :description="
              status.available
                ? '模块壳层已可访问；具体业务能力仍以服务端能力清单和后续里程碑为准。'
                : '模块尚未开放业务操作；当前页面仅提供状态核对和后续入口说明。'
            "
            :message="status.available ? '模块状态可用' : '模块尚未开放'"
            show-icon
            :type="status.available ? 'success' : 'warning'"
          />

          <Row :gutter="[16, 16]" class="status-grid">
            <Col :lg="8" :md="12" :xs="24">
              <div class="metric-card">
                <span>服务端模块</span>
                <strong>{{ status.displayName }}</strong>
                <small>{{ status.moduleKey }}</small>
              </div>
            </Col>
            <Col :lg="8" :md="12" :xs="24">
              <div class="metric-card">
                <span>当前阶段</span>
                <strong>{{ status.stage }}</strong>
                <small>{{
                  status.available ? 'AVAILABLE' : 'UNAVAILABLE'
                }}</small>
              </div>
            </Col>
            <Col :lg="8" :md="12" :xs="24">
              <div class="metric-card">
                <span>固定选品方向</span>
                <strong>{{ marketTypeLabel(status.fixedMarketType) }}</strong>
                <small>页面不提供方向切换</small>
              </div>
            </Col>
          </Row>

          <div class="capability-grid">
            <div>
              <h3>已声明能力</h3>
              <Space v-if="status.enabledCapabilities.length" wrap>
                <Tag
                  v-for="capability in status.enabledCapabilities"
                  :key="capability"
                  color="success"
                >
                  {{ capability }}
                </Tag>
              </Space>
              <span v-else class="empty-hint">暂无已启用业务能力</span>
            </div>
            <div>
              <h3>受阻能力</h3>
              <Space v-if="status.blockedCapabilities.length" wrap>
                <Tag
                  v-for="capability in status.blockedCapabilities"
                  :key="capability"
                  color="warning"
                >
                  {{ capability }}
                </Tag>
              </Space>
              <span v-else class="empty-hint">服务端未报告受阻能力</span>
            </div>
          </div>
        </template>
      </Card>

      <section class="roadmap-section">
        <div class="section-heading">
          <div>
            <h2>后续模块入口</h2>
            <p>
              已完成能力通过左侧独立菜单进入；其余能力待
              API、权限和验收完成后逐项启用。
            </p>
          </div>
          <Tag color="default">能力路线图</Tag>
        </div>

        <Row :gutter="[16, 16]">
          <Col
            v-for="entry in roadmap"
            :key="entry.capability"
            :lg="8"
            :md="12"
            :xs="24"
          >
            <Card class="roadmap-card">
              <template #title>{{ entry.title }}</template>
              <template #extra>
                <Tag
                  :color="
                    enabledCapabilitySet.has(entry.capability)
                      ? 'processing'
                      : 'default'
                  "
                >
                  {{ roadmapState(entry) }}
                </Tag>
              </template>
              <p>{{ entry.description }}</p>
              <Button block disabled>
                <template #icon>
                  <IconifyIcon
                    :icon="
                      enabledCapabilitySet.has(entry.capability)
                        ? 'lucide:panel-left-open'
                        : 'lucide:lock-keyhole'
                    "
                  />
                </template>
                {{
                  enabledCapabilitySet.has(entry.capability)
                    ? '请从左侧菜单进入'
                    : '等待后续里程碑'
                }}
              </Button>
            </Card>
          </Col>
        </Row>
      </section>
    </div>
  </Page>
</template>

<style scoped>
.foundation-workbench {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 8px 0 20px;
}

.workbench-header,
.section-heading {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  justify-content: space-between;
}

.workbench-header h1,
.section-heading h2,
.capability-grid h3 {
  margin: 0;
  color: hsl(var(--foreground));
}

.workbench-header h1 {
  margin-top: 4px;
  font-size: 24px;
  font-weight: 650;
}

.workbench-header p,
.section-heading p,
.roadmap-card p {
  margin: 6px 0 0;
  color: hsl(var(--muted-foreground));
}

.header-eyebrow {
  font-size: 11px;
  font-weight: 700;
  color: hsl(var(--primary));
  letter-spacing: 0.14em;
}

.status-panel {
  border: 1px solid hsl(var(--border));
}

.error-state {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: flex-start;
}

.status-grid {
  margin-top: 16px;
}

.metric-card {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 112px;
  padding: 16px;
  background: hsl(var(--muted) / 35%);
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
}

.metric-card span,
.metric-card small,
.empty-hint {
  color: hsl(var(--muted-foreground));
}

.metric-card strong {
  margin: 6px 0;
  font-size: 18px;
  color: hsl(var(--foreground));
}

.capability-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-top: 16px;
}

.capability-grid > div {
  min-height: 96px;
  padding: 16px;
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
}

.capability-grid h3 {
  margin-bottom: 10px;
  font-size: 14px;
}

.roadmap-section,
.section-heading {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-heading {
  flex-direction: row;
}

.roadmap-card {
  height: 100%;
}

.roadmap-card p {
  min-height: 44px;
  margin-bottom: 18px;
  line-height: 1.6;
}

@media (max-width: 768px) {
  .workbench-header,
  .section-heading {
    flex-direction: column;
  }

  .capability-grid {
    grid-template-columns: 1fr;
  }
}
</style>
