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

  // 屏蔽 AntDV Tooltip/Popconfirm 底层 vc-trigger 在非 render 阶段访问插槽
  // 所触发的 Vue 响应式跟踪误报。ecinvoiceapply 的 VXE 自动尺寸计算会放大
  // default/element 警告，console.warn 构建大量堆栈会使开发页面明显卡顿。
  // 下列已确认的 AntDV 插槽仅在该路由过滤，避免掩盖其他页面真正的问题。
  // warnHandler 仅在开发模式下生效，生产构建中 Vue 警告已被编译器移除。
  const ecInvoiceApplySlotWarningPattern =
    /Slot "(?:clearIcon|default|downHandler|element|empty|upHandler)" invoked outside of the render function/;
  app.config.warnHandler = (msg) => {
    const isOutsideRenderSlotWarning = msg.includes(
      'outside of the render function',
    );
    const isEcInvoiceApplySlotWarning =
      router.currentRoute.value.path === '/dev/ecinvoiceapply' &&
      ecInvoiceApplySlotWarningPattern.test(msg);
    if (
      isOutsideRenderSlotWarning &&
      (msg.includes('"arrowContent"') || isEcInvoiceApplySlotWarning)
    ) {
      return;
    }
    console.warn(`[Vue warn]: ${msg}`);
  };

  app.mount('#app');
}

export { bootstrap };
