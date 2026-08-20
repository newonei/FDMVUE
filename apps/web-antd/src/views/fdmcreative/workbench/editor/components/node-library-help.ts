import type { CreativeNodeTemplate } from '../graph/catalog';

export interface NodeLibraryHelp {
  inputs: string[];
  outputs: string[];
  purpose: string;
  scenarios: string[];
  tip: string;
}

interface HelpOverride {
  scenarios: string[];
  tip: string;
}

const PORT_LABELS: Record<string, string> = {
  artifacts: '成果集合',
  asset: '媒体素材',
  audio: '单条音频',
  audios: '有序音频集合',
  brief: '创作需求 / 品牌资料',
  context: '上下文提示词',
  first: '前一个视频',
  'first-frame': '首帧图片',
  image: '单张图片',
  images: '图片集合',
  input: '上游提示词',
  item: '图片或视频方案',
  'last-frame': '尾帧图片',
  plan: 'AI 内容规划',
  prompt: '提示词',
  prompts: '候选提示词',
  reference: '参考图片',
  second: '后一个视频',
  timeline: '视频时间线',
  video: '单个视频',
  videos: '视频集合',
};

const OUTPUT_LABELS: Record<string, string> = {
  artifacts: '统一成果集合',
  asset: '处理后的媒体素材',
  'ordered-audios': '有序音频集合',
  brief: '创作需求',
  image: '选中的单张图片',
  item: '单项图片 / 视频方案',
  'ordered-images': '有序图片集合',
  'ordered-videos': '有序视频集合',
  plan: 'AI 内容规划结果',
  prompt: '提示词文本',
  'result-prompt': '当前轮次提示词',
  'selected-images': '当前轮次图片',
  'selected-videos': '当前轮次视频',
  timeline: '视频时间线',
  video: '选中的单个视频',
};

const PORT_TYPE_LABELS: Record<string, string> = {
  'artifact-set': '成果集合',
  'audio-asset': '音频素材',
  'audio-list': '音频集合',
  'content-plan': 'AI 内容规划',
  'creative-brief': '创作需求',
  'image-asset': '图片素材',
  'image-list': '图片集合',
  'image-plan-item': '图片方案',
  'prompt-text': '提示词文本',
  timeline: '视频时间线',
  'video-asset': '视频素材',
  'video-list': '视频集合',
  'video-plan-item': '视频方案',
};

const HELP: Record<string, HelpOverride> = {
  'audio-collection': {
    scenarios: ['背景音乐与配音整理', '明确混音轨道顺序'],
    tip: '按连线保存顺序输出 AUDIO_LIST；需要固定顺序时在“音频混音”中填写显式源节点列表。',
  },
  'audio-extract': {
    scenarios: ['从实拍视频分离原声', '复用视频对白或环境音'],
    tip: '输入视频必须有可读音轨；无音轨、坏文件和超过限制的文件会在服务端失败，不会生成空音频。',
  },
  'audio-generate': {
    scenarios: ['角色配音', '旁白', '产品音效'],
    tip: '选择支持 TEXT_TO_AUDIO 的音频模型；音色、语速等只会显示已声明的模型 Schema 参数。',
  },
  'audio-input': {
    scenarios: ['上传配乐', '导入录音', '复用项目音效'],
    tip: '只选择 AUDIO 素材。播放器仅在你主动点击后播放，执行仍从私有资产库读取。',
  },
  'audio-mix': {
    scenarios: ['旁白与背景音乐混音', '多条音效合成'],
    tip: '先使用“音频集合”表达顺序；混音不会根据节点在画布上的位置推断轨道先后。',
  },
  'audio-normalize': {
    scenarios: ['统一不同录音响度', '输出前规范化配音'],
    tip: '目标响度、采样率、声道和输出格式均由受控 FFmpeg 校验；不要把供应商参数填到这里。',
  },
  'audio-trim': {
    scenarios: ['裁剪配音', '制作循环音效', '去除录音空白'],
    tip: '结束时间可留空并由开始时间与时长推算；淡入和淡出总和不能超过裁剪时长。',
  },
  'artifact-collection': {
    scenarios: ['图片和视频混合交付', '多条生成分支统一汇总'],
    tip: '只连接真正需要交付的内容，中间预览素材通常不用接入。',
  },
  'asset-library-output': {
    scenarios: ['团队素材沉淀', '批量生成结果归档'],
    tip: '建议放在流程末端，并先确认成果名称和项目归属。',
  },
  'brand-input': {
    scenarios: ['电商主图', '品牌广告', '同品牌批量内容生产'],
    tip: '写清“必须出现”和“绝对不能出现”的要求，再连接到规划或提示词节点。',
  },
  'content-planner': {
    scenarios: ['分镜规划', '一套多图内容', '图像与视频混合方案'],
    tip: '先把总需求写具体，生成后仍要检查数量、顺序和镜头连续性。',
  },
  'creative-brief': {
    scenarios: ['工作流起点', '为规划器或提示词生成器补充业务背景'],
    tip: '推荐按“做什么、给谁看、什么风格、必须包含、需要避免”填写。',
  },
  'first-last-frame-to-video': {
    scenarios: ['产品转场', '角色动作衔接', '两个关键画面之间的过渡'],
    tip: '首尾帧的主体、画幅和视角越一致，生成的运动通常越稳定。',
  },
  'image-collection': {
    scenarios: ['多参考图输入', '组图输出', '循环结果汇总'],
    tip: '连线顺序会影响集合顺序；只需要一张时再接“图片选择”。',
  },
  'image-edit': {
    scenarios: ['换背景', '局部重绘', '商品图风格调整'],
    tip: '明确写出“保留什么、修改什么”，可减少主体和构图漂移。',
  },
  'image-generate': {
    scenarios: ['文生图', '按方案批量出图', '带参考图的通用生成'],
    tip: '纯文生图只接提示词；需要强参考图约束时优先用“参考图生图”。',
  },
  'image-input': {
    scenarios: ['图生图', '图片编辑', '图生视频', '视频首尾帧'],
    tip: '先检查图片方向和清晰度，临时外链可能在执行时失效。',
  },
  'image-loop': {
    scenarios: ['批量风格变体', '多商品逐个出图', '多轮参考图生成'],
    tip: '先用 2 轮验证下游流程；轮次过多会明显增加耗时和模型费用。',
  },
  'image-plan-item': {
    scenarios: ['把 AI 总规划拆给多个图片生成节点'],
    tip: '它通常由内容规划自动创建；单独使用时必须连接“AI 内容规划”。',
  },
  'image-resize': {
    scenarios: ['平台尺寸适配', '统一组图规格', '生成前整理参考图'],
    tip: 'FIT 保留完整画面，FILL 可能裁掉边缘；执行前确认目标宽高。',
  },
  'image-select': {
    scenarios: ['选择视频首尾帧', '从批量结果中取固定位置图片'],
    tip: '序号从 1 开始；上游集合数量改变后要确认序号仍有效。',
  },
  'image-to-image': {
    scenarios: ['商品一致性出图', '角色一致性', '参考构图或风格'],
    tip: '说明每张参考图的用途；参考图越多不一定越好，保留最关键的即可。',
  },
  'image-to-video': {
    scenarios: ['商品图动态化', '海报转短视频', '单帧角色动画'],
    tip: '提示词重点描述主体怎么动、镜头怎么走，不必重复图片已有内容。',
  },
  output: {
    scenarios: ['下载成品', '执行结果验收', '保存前最终检查'],
    tip: '流程末端应连接成果输出，否则成功后也不便集中查找最终结果。',
  },
  'prompt-generator': {
    scenarios: ['需求扩写', '参考图描述', '统一下游提示词格式'],
    tip: '生成结果不理想时，先减少互相冲突的上游信息。',
  },
  'prompt-input': {
    scenarios: ['直接文生图 / 文生视频', '多个节点共享基础提示词'],
    tip: '双击添加后在右侧填写内容，不要把模型参数混进提示词正文。',
  },
  'prompt-template': {
    scenarios: ['固定格式拼接', '给批量任务增加统一前缀或后缀'],
    tip: '保留模板变量；结果为空时先检查对应输入是否已连线。',
  },
  'random-prompt': {
    scenarios: ['随机风格', '随机动作或场景', '快速探索创意'],
    tip: '一行一个完整候选；随机结果不适合要求严格复现的任务。',
  },
  'video-compose': {
    scenarios: ['分镜合片', '多段短视频拼接', '批量片段交付'],
    tip: '上游规格不一致时先经过“视频规格统一”，可减少合成失败。',
  },
  'video-audio-merge': {
    scenarios: ['视频配音', '替换原声', '给视频添加背景音乐'],
    tip: '明确选择替换、保留混合或 Duck，以及最短/最长时长策略；服务端会探测视频和外部音频。',
  },
  'music-generate': {
    scenarios: ['背景音乐', '情绪配乐', '短片音乐草稿'],
    tip: '需要单独配置支持 TEXT_TO_MUSIC 的音乐模型路由；不会混用普通语音 route。',
  },
  'video-frame-extract': {
    scenarios: ['制作首尾帧', '提取封面', '将视频画面作为生图参考'],
    tip: '指定时间不能超过视频时长，压缩严重的视频可能抽到模糊帧。',
  },
  'video-generate': {
    scenarios: ['文生视频', '按分镜逐段生成', '无首帧约束的创意探索'],
    tip: '明确主体动作、镜头运动和时长；要保持主体时改用“图生视频”。',
  },
  'video-input': {
    scenarios: ['已有视频再加工', '混合 AI 片段和实拍片段'],
    tip: '大文件先确认上传完成；不同来源的视频建议先统一规格。',
  },
  'video-loop': {
    scenarios: ['多片段逐个处理', '批量视频变体', '重复同一后期流程'],
    tip: '视频任务通常较慢，先用少量轮次验证，不要盲目重复执行。',
  },
  'video-normalize': {
    scenarios: ['不同模型视频混剪', '实拍与 AI 视频合成'],
    tip: '整条时间线使用相同宽高和帧率；放大低清视频不会增加真实细节。',
  },
  'video-plan-item': {
    scenarios: ['把 AI 分镜规划拆给多个视频生成节点'],
    tip: '它通常由内容规划自动创建；调整时注意与前后镜头的连续性。',
  },
  'video-select': {
    scenarios: ['从循环结果中选择片段', '固定选择某个镜头'],
    tip: '序号从 1 开始；上游数量可能变化时选择首个或末个更稳妥。',
  },
  'video-timeline': {
    scenarios: ['分镜排序', '多路视频分支汇总'],
    tip: '这里负责组织顺序，不会自动统一视频规格。',
  },
  'video-transition': {
    scenarios: ['镜头衔接', '减少硬切的突兀感'],
    tip: '两个视频最好先统一规格，转场时长不能超过参与重叠的片段。',
  },
  'video-trim': {
    scenarios: ['去除片头片尾', '截取精彩片段', '控制合成节奏'],
    tip: '开始时间和持续时长不能超出原视频，先预览原片可减少空片段。',
  },
};

function getPortLabel(
  id: string,
  type: string,
  required: boolean,
  output = false,
) {
  const configuredLabel = (output ? OUTPUT_LABELS : PORT_LABELS)[id];
  const label =
    id === 'asset'
      ? (PORT_TYPE_LABELS[type] ?? configuredLabel ?? id)
      : (configuredLabel ?? PORT_TYPE_LABELS[type] ?? id);
  return required ? `${label}（必需）` : `${label}（可选）`;
}

export function getNodeLibraryHelp(
  node: CreativeNodeTemplate,
): NodeLibraryHelp {
  const custom = HELP[node.type];
  const inputs = node.ports
    .filter((port) => port.direction === 'INPUT')
    .map((port) => getPortLabel(port.id, port.type, Boolean(port.required)));
  const outputs = node.ports
    .filter((port) => port.direction === 'OUTPUT')
    .map((port) =>
      getPortLabel(port.id, port.type, false, true).replace('（可选）', ''),
    );

  return {
    inputs:
      inputs.length > 0
        ? inputs
        : ['无需上游输入，在右侧属性面板填写或选择内容'],
    outputs: outputs.length > 0 ? outputs : ['无下游输出（工作流终点）'],
    purpose: node.description,
    scenarios: custom?.scenarios ?? ['按节点说明连接到工作流中使用'],
    tip: custom?.tip ?? '添加节点后，请在右侧属性面板检查必填项和连接状态。',
  };
}
