# 桌面工作台网页登录交换

本切片在 `apps/web-antd` 增加 `/auth/workbench` 公开入口，接收桌面主进程取得的一次性网页登录票据。当前生产配置为 `VITE_ROUTER_HISTORY=history`、`VITE_BASE=/`，固定入口为 `https://web.hbfdm.com/auth/workbench#ticket=…&verifier=…`。该页面不复用钉钉扫码回调 `/user/auth` 或 OAuth 同意页 `/auth/sso-login`。

## 登录契约

1. `index.html` 最前面的同步引导读取 fragment，立即用 `history.replaceState(null, '', '/auth/workbench')` 清除 URL 中的票据与 verifier。值只保留在一次性内存槽，`main.ts` 取走后删除全局入口；不写入 storage、history state、日志或统计。此入口不加载百度统计脚本。
2. 页面先清除旧员工的 access/refresh token、登录租户、访问租户、用户/角色/权限、已生成路由与持久标签页。使用无共享拦截器的 `fetch`，一次 POST `/admin-api/fdmmcp/portal/exchange`，JSON 为 `{ticket, codeVerifier}`。禁止携带旧 `Authorization`、`tenant-id`、`visit-tenant-id` 和 Cookie，不跟随重定向，不自动重试。
3. 成功响应为 `CommonResult.data = {accessToken, refreshToken, userId, expiresTime, tenantId}`。ID 必须为正整数，`expiresTime` 为未来的 Unix 毫秒时间。响应是独立的网页令牌，兼容现有 `default` system OAuth client 的刷新链路；任何 MCP 令牌都不进入网页。
4. 页面只用新网页 token 和响应租户请求 `/admin-api/system/auth/get-permission-info`，不发送 `visit-tenant-id`。返回的 `user.id` 必须和票据交换的 `userId` 一致，再复用 `authStore.fetchUserInfo` 的角色、权限、菜单赋值，成功后 `router.replace('/')`。
5. 票据失效、权限 401、身份不符、网络失败、20 秒超时或页面离开时均保守失败，清理身份。页面显示固定提示“工作台登录未完成，请返回飞德慕工作台重新打开首页。”；不跳扫码页、不回显服务端错误或敏感信息。刷新后的 URL 已无 fragment，不再次兑换；返回客户端重新打开才能申请新票据。

普通登录页和普通网页登录后的刷新逻辑保持原有行为。`fetchUserInfo` 新增可选的权限加载函数，仅该入口使用隔离的请求，避免普通 401 拦截器将失败流程转去扫码页面。

## 配套边界与部署

- FDMServer 负责 `fdm.web` 明确授权、PKCE 校验、短时票据原子消费、可信 MCP tenant/user 与员工权限的重新核对，以及网页会话的准确注销。网页不接受客户端自行声明的员工或租户，不使用手机号重新匹配或创建账号。旧 `fdm.read` 会话不会在前端升级。
- 桌面主进程只加载固定 HTTPS origin 和该入口，冻结当前员工/租户身份，换号或退出使原页面失效。网页正常业务 API 继续按服务端角色和权限执行。
- 部署需同时具备网页包、服务端票据/兑换 API 及 nginx 对相应 API 的准确转发；前端 history 路由需 `try_files … /index.html`。本切片只生成代码与本地构建产物，未部署生产、未更新 `main`、未进行真实员工登录。
- `/auth/workbench` 入口失败应由客户端显示网页连接失败，不能将 `/auth/login` 等扫码或认证页视为免登成功。

## 验证记录（2026-11-01）

- `pnpm exec vitest run apps/web-antd/src/utils/workbench-login.test.ts apps/web-antd/src/utils/dingtalk-config.test.ts packages/stores/src/modules/access.test.ts`：49/49，3 个文件；其中新增 24 项覆盖引导顺序、一次性读取、非法/重复参数、匿名兑换请求、固定错误、权限身份不符、身份切换顺序和迟到结果。首轮 2 项失败为测试环境对 `import.meta.url` 的 URL 转换，改为明确的测试工作区文件路径后通过。
- `pnpm --filter @vben/web-antd run typecheck`、`pnpm --filter @vben/web-antd run build`、受影响文件 oxfmt、`node scripts/check-fdm-boundaries.mjs`、`git diff --check` 通过。构建保留既有其他组件的 `:deep` CSS 警告，无新增构建错误。
- Ego 浏览器使用本机 production 包和隔离 API fixture，通过五组行为：成功显示模拟员工并进入首页；旧身份下兑换失败后旧会话清除；权限 401 原地失败且无 refresh/扫码；刷新不重复消费；非法 fragment 清除且零 HTTP。兑换请求经 fixture 核对无旧 Authorization/tenant/visit-tenant/Cookie。未访问生产或真实账号。
- Ego 当时窗口最小化，截图工具返回 viewport=0，未将该次行为验证记为视觉验收。完整桌面容器的最终视觉和前后端组合验收由桌面集成任务单独记录。
