<script lang="ts" setup>
import type {
  WorkbenchProjectItem,
  WorkbenchQuickNavItem,
  WorkbenchTodoItem,
  WorkbenchTrendItem,
} from '@vben/common-ui';

import { ref } from 'vue';
import { useRouter } from 'vue-router';

import {
  AnalysisChartCard,
  WorkbenchHeader,
  WorkbenchProject,
  WorkbenchQuickNav,
  WorkbenchTodo,
  WorkbenchTrends,
} from '@vben/common-ui';
import { preferences } from '@vben/preferences';
import { useUserStore } from '@vben/stores';
import { openWindow } from '@vben/utils';

import AnalyticsVisitsSource from '../analytics/analytics-visits-source.vue';

const userStore = useUserStore();

interface WorkbenchToolGroup {
  items: WorkbenchProjectItem[];
  title: string;
}

const toolGroups: WorkbenchToolGroup[] = [
  {
    title: 'AI 办公',
    items: [
      {
        color: '#1d4ed8',
        content: '多 Agent 办公交付，适合方案、资料、运营和设计任务。',
        date: '办公 Agent',
        group: 'AI 办公',
        icon: 'carbon:workspace',
        title: 'WorkBuddy',
        url: 'https://copilot.tencent.com/work/',
      },
      {
        color: '#111827',
        content: '代码任务工作台，适合改代码、排查问题和生成脚本。',
        date: '代码开发',
        group: 'AI 办公',
        icon: 'carbon:terminal',
        title: 'Codex',
        url: 'https://chatgpt.com/codex',
      },
      {
        color: '#10a37f',
        content: '写作、分析、翻译、表格思路和方案梳理。',
        date: '通用助手',
        group: 'AI 办公',
        icon: 'simple-icons:openai',
        title: 'ChatGPT',
        url: 'https://chatgpt.com/',
      },
      {
        color: '#d97757',
        content: '长文档理解、代码解释、推理分析和文本打磨。',
        date: '深度分析',
        group: 'AI 办公',
        icon: 'carbon:bot',
        title: 'Claude',
        url: 'https://claude.ai/',
      },
      {
        color: '#7c3aed',
        content: '长上下文中文助手，适合文档、PPT、表格和研究。',
        date: '长文档',
        group: 'AI 办公',
        icon: 'carbon:document',
        title: 'Kimi',
        url: 'https://www.kimi.com/zh',
      },
      {
        color: '#2563eb',
        content: '中文推理与代码助手，支持文件阅读和内容创作。',
        date: '推理代码',
        group: 'AI 办公',
        icon: 'carbon:code',
        title: 'DeepSeek',
        url: 'https://chat.deepseek.com/',
      },
      {
        color: '#0f766e',
        content: 'AI 搜索、网页总结、PPT、录音纪要等办公场景。',
        date: '中文办公',
        group: 'AI 办公',
        icon: 'carbon:chart-relationship',
        title: '千问',
        url: 'https://www.qianwen.com/',
      },
      {
        color: '#22c55e',
        content: '文案、翻译、编程辅助、灵感和日常问答。',
        date: '内容创作',
        group: 'AI 办公',
        icon: 'carbon:chat',
        title: '豆包',
        url: 'https://www.doubao.com/',
      },
    ],
  },
  {
    title: '外贸工具',
    items: [
      {
        color: '#0f766e',
        content: '外贸邮件、报价、合同条款翻译和英文润色。',
        date: '翻译写作',
        group: '外贸工具',
        icon: 'carbon:language',
        title: 'DeepL',
        url: 'https://www.deepl.com/translator',
      },
      {
        color: '#0ea5e9',
        content: '查询美国进口记录，辅助找客户和竞品供应链。',
        date: '贸易数据',
        group: '外贸工具',
        icon: 'carbon:search-advanced',
        title: 'ImportYeti',
        url: 'https://www.importyeti.com/',
      },
      {
        color: '#334155',
        content: '全球贸易数据和买家、供应商关系洞察。',
        date: '贸易情报',
        group: '外贸工具',
        icon: 'carbon:earth',
        title: 'Panjiva',
        url: 'https://panjiva.com/',
      },
      {
        color: '#16a34a',
        content: '全球包裹查询，适合样品、售后和小包物流跟踪。',
        date: '物流追踪',
        group: '外贸工具',
        icon: 'carbon:delivery',
        title: '17TRACK',
        url: 'https://www.17track.net/',
      },
      {
        color: '#2563eb',
        content: '海运船舶位置、航线、船期和到港动态查询。',
        date: '船舶追踪',
        group: '外贸工具',
        icon: 'carbon:container-services',
        title: '船讯网',
        url: 'https://www.shipxy.com/',
      },
      {
        color: '#f97316',
        content: '国际货运报价、运价比较和订舱管理参考。',
        date: '运价订舱',
        group: '外贸工具',
        icon: 'carbon:currency',
        title: 'Freightos',
        url: 'https://www.freightos.com/',
      },
    ],
  },
  {
    title: '电商工具',
    items: [
      {
        color: '#0ea5e9',
        content: '公司现用 ERP，覆盖电商订单、库存、采购和售后。',
        date: '电商 ERP',
        group: '电商工具',
        icon: 'ion:cart-outline',
        title: '聚水潭',
        url: 'https://www.erp321.com/epaas',
      },
      {
        color: '#0f766e',
        content: '跨境多平台刊登、订单、采购、仓储和物流管理。',
        date: '跨境 ERP',
        group: '电商工具',
        icon: 'carbon:shopping-cart',
        title: '店小秘',
        url: 'https://www.dianxiaomi.com/',
      },
      {
        color: '#f59e0b',
        content: 'Amazon 价格历史、Buy Box、促销和竞品价格监控。',
        date: 'Amazon 数据',
        group: '电商工具',
        icon: 'carbon:chart-line',
        title: 'Keepa',
        url: 'https://keepa.com/',
      },
      {
        color: '#16a34a',
        content: 'Amazon 类目、销量、竞品、选品和市场机会分析。',
        date: 'Amazon 选品',
        group: '电商工具',
        icon: 'carbon:analytics',
        title: 'Jungle Scout',
        url: 'https://www.junglescout.com/',
      },
      {
        color: '#dc2626',
        content: '抖音直播、短视频、商品、达人和竞品数据分析。',
        date: '抖音电商',
        group: '电商工具',
        icon: 'carbon:video',
        title: '蝉妈妈',
        url: 'https://www.chanmama.com/',
      },
      {
        color: '#ef4444',
        content: '短视频、直播、达人、带货商品和行业趋势分析。',
        date: '内容电商',
        group: '电商工具',
        icon: 'carbon:chart-multitype',
        title: '飞瓜',
        url: 'https://www.feigua.cn/',
      },
      {
        color: '#111827',
        content: '抖音关键词热度、内容趋势和热点洞察。',
        date: '趋势洞察',
        group: '电商工具',
        icon: 'carbon:trend-up',
        title: '抖音指数',
        url: 'https://trendinsight.oceanengine.com/',
      },
      {
        color: '#7c3aed',
        content: '抖音、小红书直播电商和达人数据分析。',
        date: '达人监控',
        group: '电商工具',
        icon: 'carbon:data-vis-4',
        title: '灰豚',
        url: 'https://www.huitun.com/',
      },
    ],
  },
  {
    title: '内容设计',
    items: [
      {
        color: '#00c4cc',
        content: '品牌素材、广告图、海报、详情页和社媒内容设计。',
        date: '设计模板',
        group: '内容设计',
        icon: 'simple-icons:canva',
        title: 'Canva',
        url: 'https://www.canva.com/canva-ai/',
      },
      {
        color: '#ff0000',
        content: '商业安全的生成式图片、视频、音频和设计工具。',
        date: '生成设计',
        group: '内容设计',
        icon: 'simple-icons:adobe',
        title: 'Adobe Firefly',
        url: 'https://www.adobe.com/products/firefly.html',
      },
      {
        color: '#6366f1',
        content: '中文提示生成图片和视频，适合产品场景素材。',
        date: '图像视频',
        group: '内容设计',
        icon: 'carbon:image',
        title: '即梦',
        url: 'https://jimeng.jianying.com/',
      },
      {
        color: '#111827',
        content: '短视频剪辑、字幕、配音、成片和社媒发布素材。',
        date: '视频剪辑',
        group: '内容设计',
        icon: 'carbon:cut',
        title: '剪映',
        url: 'https://www.capcut.cn/',
      },
      {
        color: '#a259ff',
        content: '设计协作、原型、界面和产品视觉规范。',
        date: '设计原型',
        group: '内容设计',
        icon: 'simple-icons:figma',
        title: 'Figma',
        url: 'https://www.figma.com/',
      },
      {
        color: '#f97316',
        content: 'AI 演示、提案、报告和视觉文档生成。',
        date: 'PPT 文档',
        group: '内容设计',
        icon: 'carbon:presentation-file',
        title: 'Gamma',
        url: 'https://gamma.app/',
      },
    ],
  },
  {
    title: '销售客户',
    items: [
      {
        color: '#2563eb',
        content: '制造业客户、商机、拜访、合同和回款过程管理。',
        date: 'CRM',
        group: '销售客户',
        icon: 'simple-icons:civicrm',
        title: '纷享销客',
        url: 'https://www.fxiaoke.com/',
      },
      {
        color: '#0f766e',
        content: '营销获客、销售管理、伙伴管理和售后服务。',
        date: 'CRM',
        group: '销售客户',
        icon: 'carbon:user-multiple',
        title: '销售易',
        url: 'https://www.xiaoshouyi.com/',
      },
      {
        color: '#475569',
        content: '内部客户档案、商机跟进和报价资料沉淀。',
        date: '内部入口',
        group: '销售客户',
        icon: 'carbon:customer-service',
        title: '内部客户/报价',
        url: '/crm/customer',
      },
    ],
  },
  {
    title: '采购质检',
    items: [
      {
        color: '#0ea5e9',
        content: '内部供应商档案、联系方式、资质和合作记录。',
        date: '内部入口',
        group: '采购质检',
        icon: 'carbon:partnership',
        title: '供应商库',
        url: '/mes/md/vendor',
      },
      {
        color: '#16a34a',
        content: '材料价格、采购比价和成本变动记录占位入口。',
        date: '内部入口',
        group: '采购质检',
        icon: 'carbon:price',
        title: '材料价格表',
        url: '/analytics',
      },
      {
        color: '#f59e0b',
        content: '质检方案、指标、批次和检测结果资料入口。',
        date: '内部入口',
        group: '采购质检',
        icon: 'carbon:document-requirements',
        title: '质检报告',
        url: '/mes/qc/template',
      },
      {
        color: '#ef4444',
        content: '美国 CPSIA、Prop 65 等消费品测试和合规服务。',
        date: '合规测试',
        group: '采购质检',
        icon: 'carbon:certificate',
        title: 'SGS',
        url: 'https://www.sgs.com/en-us/services/cpsia-and-california-proposition-65',
      },
      {
        color: '#0f766e',
        content: '欧盟化学品法规，关注材料和出口合规要求。',
        date: '欧盟法规',
        group: '采购质检',
        icon: 'carbon:policy',
        title: 'REACH',
        url: 'https://environment.ec.europa.eu/topics/chemicals/reach-regulation_en',
      },
      {
        color: '#f97316',
        content: '加州 Prop 65 警示要求和产品化学品合规资源。',
        date: '美国法规',
        group: '采购质检',
        icon: 'carbon:warning',
        title: 'Prop 65',
        url: 'https://www.p65warnings.ca.gov/business-resources',
      },
    ],
  },
  {
    title: '数据看板',
    items: [
      {
        color: '#00d8ff',
        content: '内部经营分析入口，承接销售、库存、订单等看板。',
        date: '内部看板',
        group: '数据看板',
        icon: 'ion:bar-chart-outline',
        title: '内部分析页',
        url: '/analytics',
      },
      {
        color: '#f2c811',
        content: '微软 BI 报表，适合财务、销售、库存和经营驾驶舱。',
        date: 'BI',
        group: '数据看板',
        icon: 'simple-icons:powerbi',
        title: 'Power BI',
        url: 'https://www.microsoft.com/en-us/power-platform/products/power-bi',
      },
      {
        color: '#509ee3',
        content: '开源 BI，可自部署，适合内部数据库报表和查询。',
        date: '开源 BI',
        group: '数据看板',
        icon: 'carbon:dashboard',
        title: 'Metabase',
        url: 'https://www.metabase.com/',
      },
      {
        color: '#dc2626',
        content: '广告花费、订单转化、ROI 和投放复盘占位入口。',
        date: '内部看板',
        group: '数据看板',
        icon: 'carbon:chart-scatter',
        title: '广告 ROI',
        url: '/analytics',
      },
      {
        color: '#16a34a',
        content: '库存周转、毛利、采购成本和滞销预警占位入口。',
        date: '内部看板',
        group: '数据看板',
        icon: 'carbon:inventory-management',
        title: '库存毛利',
        url: '/analytics',
      },
    ],
  },
  {
    title: '协同流程',
    items: [
      {
        color: '#00b96b',
        content: '轻量业务系统、表格协作、自动化和 AI 工作流。',
        date: '协同表格',
        group: '协同流程',
        icon: 'carbon:table-built',
        title: '飞书多维表格',
        url: 'https://www.feishu.cn/product/base',
      },
      {
        color: '#1677ff',
        content: '表单、审批、报表、低代码应用和钉钉工作台。',
        date: '低代码',
        group: '协同流程',
        icon: 'carbon:flow',
        title: '钉钉宜搭',
        url: 'https://www.aliwork.com/',
      },
      {
        color: '#ea4b71',
        content: 'IT 自动化、接口编排、AI Agent 和内部任务流。',
        date: '自动化',
        group: '协同流程',
        icon: 'simple-icons:n8n',
        title: 'n8n',
        url: 'https://n8n.io/',
      },
      {
        color: '#0066ff',
        content: '微软自动化流程，连接 Office、表格、审批和通知。',
        date: '自动化',
        group: '协同流程',
        icon: 'carbon:workflow-automation',
        title: 'Power Automate',
        url: 'https://www.microsoft.com/en-us/power-platform/products/power-automate',
      },
    ],
  },
];

const quickNavItems: WorkbenchQuickNavItem[] = [
  {
    color: '#1fdaca',
    icon: 'ion:home-outline',
    title: '首页',
    url: '/',
  },
  {
    color: '#00d8ff',
    icon: 'ion:bar-chart-outline',
    title: '分析页',
    url: '/analytics',
  },
  {
    color: '#1d4ed8',
    icon: 'carbon:workspace',
    title: 'WorkBuddy',
    url: 'https://copilot.tencent.com/work/',
  },
  {
    color: '#111827',
    icon: 'carbon:terminal',
    title: 'Codex',
    url: 'https://chatgpt.com/codex',
  },
  {
    color: '#10a37f',
    icon: 'simple-icons:openai',
    title: 'ChatGPT',
    url: 'https://chatgpt.com/',
  },
  {
    color: '#0ea5e9',
    icon: 'ion:cart-outline',
    title: '聚水潭',
    url: 'https://www.erp321.com/epaas',
  },
];

const todoItems = ref<WorkbenchTodoItem[]>([
  {
    completed: false,
    content: `开发`,
    date: '2026-04-02 11:44:08',
    title: '123321312',
  },
]);
const trendItems: WorkbenchTrendItem[] = [
  {
    avatar: 'svg:avatar-1',
    content: `创建了项目`,
    date: '刚刚',
    title: 'Owen',
  },
  {
    avatar: 'svg:avatar-2',
    content: `关注了 <a>Owen</a> `,
    date: '1个小时前',
    title: 'Awen',
  },
];

const router = useRouter();

// 这是一个示例方法，实际项目中需要根据实际情况进行调整
// This is a sample method, adjust according to the actual project requirements
function navTo(nav: WorkbenchProjectItem | WorkbenchQuickNavItem) {
  if (nav.url?.startsWith('http')) {
    openWindow(nav.url);
    return;
  }
  if (nav.url?.startsWith('/')) {
    router.push(nav.url).catch((error) => {
      console.error('Navigation failed:', error);
    });
  } else {
    console.warn(`Unknown URL for navigation item: ${nav.title} -> ${nav.url}`);
  }
}
</script>

<template>
  <div class="p-5">
    <WorkbenchHeader
      :avatar="userStore.userInfo?.avatar || preferences.app.defaultAvatar"
    >
      <template #title>
        早安, {{ userStore.userInfo?.nickname }}, 开始您一天的工作吧！
      </template>
      <template #description> </template>
    </WorkbenchHeader>

    <div class="flex flex-col lg:flex-row">
      <div class="mr-4 w-full lg:w-3/5">
        <WorkbenchProject
          v-for="(group, index) in toolGroups"
          :key="group.title"
          :class="{ 'mt-5': index > 0 }"
          :items="group.items"
          :title="group.title"
          @click="navTo"
        />
        <WorkbenchTrends :items="trendItems" class="mt-5" title="最新动态" />
      </div>
      <div class="w-full lg:w-2/5">
        <WorkbenchQuickNav
          :items="quickNavItems"
          class="mt-5 lg:mt-0"
          title="快捷入口"
          @click="navTo"
        />
        <WorkbenchTodo :items="todoItems" class="mt-5" title="待办事项" />
        <AnalysisChartCard class="mt-5" title="访问来源">
          <AnalyticsVisitsSource />
        </AnalysisChartCard>
      </div>
    </div>
  </div>
</template>
