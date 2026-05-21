import { createApp, watchEffect } from 'vue';
import VueDOMPurifyHTML from 'vue-dompurify-html';

import { registerAccessDirective } from '@vben/access';
import { registerLoadingDirective } from '@vben/common-ui/es/loading';
import { preferences } from '@vben/preferences';
import { initStores } from '@vben/stores';
import '@vben/styles';
import '@vben/styles/antd';

import { useTitle } from '@vueuse/core';

import { $t, setupI18n } from '#/locales';
import { setupFormCreate } from '#/plugins/form-create';

import { initComponentAdapter } from './adapter/component';
import { initSetupVbenForm } from './adapter/form';
import App from './app.vue';
import { router } from './router';

async function bootstrap(namespace: string) {
  // 初始化组件适配器
  await initComponentAdapter();

  // 初始化表单组件
  await initSetupVbenForm();

  // // 设置弹窗的默认配置
  // setDefaultModalProps({
  //   fullscreenButton: false,
  // });
  // // 设置抽屉的默认配置
  // setDefaultDrawerProps({
  //   zIndex: 1020,
  // });

  const app = createApp(App);
  app.use(VueDOMPurifyHTML);

  // 注册v-loading指令
  registerLoadingDirective(app, {
    loading: 'loading', // 在这里可以自定义指令名称，也可以明确提供false表示不注册这个指令
    spinning: 'spinning',
  });

  // 国际化 i18n 配置
  await setupI18n(app);

  // 配置 pinia-store
  await initStores(app, { namespace });

  // 安装权限指令
  registerAccessDirective(app);

  // 初始化 tippy
  const { initTippy } = await import('@vben/common-ui/es/tippy');
  initTippy(app);

  // 配置路由及路由守卫
  app.use(router);

  // formCreate
  setupFormCreate(app);

  // 配置Motion插件
  const { MotionPlugin } = await import('@vben/plugins/motion');
  app.use(MotionPlugin);

  // 动态更新标题
  watchEffect(() => {
    if (preferences.app.dynamicTitle) {
      const routeTitle = router.currentRoute.value.meta?.title;
      const pageTitle =
        (routeTitle ? `${$t(routeTitle)} - ` : '') + preferences.app.name;
      useTitle(pageTitle);
    }
  });

  // 屏蔽 AntDV Tooltip/Popconfirm 底层 vc-trigger 在 onBeforeMount 阶段（非
  // render 阶段）访问 arrowContent 插槽所触发的 Vue 响应式跟踪警告。
  // 这是 AntDV 的框架内部 bug，不影响功能；但在表格右侧固定列（每行含
  // Popconfirm 按钮）场景下，鼠标 hover 会以 60 fps 触发重绘，导致该警告
  // 每秒输出 1000+ 次，console.warn 构建堆栈字符串的开销会使页面明显卡顿。
  // warnHandler 仅在开发模式下生效，生产构建中 Vue 警告已被编译器移除。
  app.config.warnHandler = (msg) => {
    if (
      msg.includes('"arrowContent"') &&
      msg.includes('outside of the render function')
    ) {
      return;
    }
    console.warn(`[Vue warn]: ${msg}`);
  };

  app.mount('#app');
}

export { bootstrap };
