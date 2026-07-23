export const WORKBUDDY_CHAT_COMPLETIONS_URL =
  'https://ai.xin1.cc/v1/chat/completions';

export const WORKBUDDY_MODEL_IDS = [
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  'gpt-5.6-luna',
  'gpt-5.5',
] as const;

/**
 * Builds the one-click prompt locally in the browser. The API Key is not sent
 * to another FDM endpoint or stored in an additional reactive state value.
 */
export function buildWorkBuddyModelPrompt(apiKey: string) {
  return `请帮我在 Windows 版 WorkBuddy 中配置用户级自定义模型。

配置要求：

1. 配置文件路径：
   C:\\Users\\Administrator\\.workbuddy\\models.json

2. 操作前必须先读取现有 models.json：
   - 如果文件已存在，保留其他已有模型，不要覆盖或删除无关配置。
   - 如果以下模型已存在，则按模型 id 更新对应配置，避免产生重复条目。
   - 如果文件不存在，则创建该文件。

3. API 信息：
   - 接口地址：${WORKBUDDY_CHAT_COMPLETIONS_URL}
   - API Key：${apiKey}
   - 提供商：Custom
   - 接口是 OpenAI Chat Completions 兼容格式。

4. 需要配置以下四个模型：
   - ${WORKBUDDY_MODEL_IDS[0]}
   - ${WORKBUDDY_MODEL_IDS[1]}
   - ${WORKBUDDY_MODEL_IDS[2]}
   - ${WORKBUDDY_MODEL_IDS[3]}

5. 每个模型使用以下字段：
   - id：使用真实模型名称
   - name：与 id 相同
   - vendor："Custom"
   - url：使用上面的完整接口地址
   - apiKey：使用上面的 API Key
   - supportsToolCall：true
   - supportsImages：true
   - supportsReasoning：true
   - useCustomProtocol：true
   - reasoning.supportedEfforts：
     ["low", "medium", "high", "xhigh", "max"]

6. WorkBuddy 的 models.json 顶层应保持 JSON 数组格式，不要擅自改成其他结构。

7. 写入后进行验证：
   - JSON 可以正常解析；
   - 四个模型均存在且没有重复；
   - 所有模型的接口地址一致；
   - API Key 已正确写入；
   - useCustomProtocol 和 supportsToolCall 均为 true。

8. 安全要求：
   - 不要在最终回复中完整显示 API Key；
   - 不要把 API Key 写入日志、项目记忆或额外文件；
   - 最终只告诉我修改的文件、模型列表和验证结果。

完成后提醒我：
在 WorkBuddy 对话框下方的“模型选择器 → 自定义模型”中选择模型。如果没有立即显示，则从系统托盘完全退出 WorkBuddy 后重新打开。`;
}
