# pi-dsh-minimal

[English](./README.md)

[![npm](https://img.shields.io/npm/v/pi-dsh-minimal.svg)](https://www.npmjs.com/package/pi-dsh-minimal)
[![pi.dev](https://img.shields.io/badge/pi.dev-package-111111)](https://pi.dev/packages/pi-dsh-minimal)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

## DeepSWE 实测(2026-08-16,全量 113 题)

官方 [DeepSWE v1.1](https://deepswe.datacurve.ai/) 全量:pi agent 跑在
官方任务容器内,`opencode-go/deepseek-v4-flash:max`,v0.3.1 默认配置,
官方 verifier 逐题判分。

| 配置 | 解出 | 说明 |
| --- | --- | --- |
| **V4 Flash + 本扩展 — 全量 113 题** | **69/113 = 61.1%** | 中位 24 分钟/题 |
| 官方榜 `deepseek-v4-flash [max]` | 53% | mini-swe-agent harness |
| 官方榜 `deepseek-v4-pro [max]` | 63% | 成本 ~2.4× |
| pi 原生 Flash(汇总 n=26) | 15/26 = 57.7% | 内部参照 |

解读:**比官方 Flash 榜高 8pp**,距 V4 Pro 只差 2pp(去掉唯一超时题后
69/112 = 61.6%)。对 pi 自身原生
表面的聚合提升更小(约 +3pp,n=26 噪声量级;最初的 10 题配对 A/B 是
9/10 vs 6/10,但未在大样本复现,应视为乐观样本)。失败画像:44 个未解
中 32 个只差 1-5 个测试,方向性全塌仅 4 题,超时仅 1 题。注意事项:
单次采样;agent 容器有网络(7/113 题抓取过上游仓库,全部剔除后
61.3%,最坏按污染计 57.5%,仍高于 53%)。完整数据:
`runs/deepswe/RESULTS-full.md`。

## 这是什么

这是一个 [Pi](https://pi.dev) 扩展：把 DeepSeek V4 模型映射到实测过的
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 表面。

| 模型 | 配置 | 做什么 |
| --- | --- | --- |
| **V4 Pro** | [anchored-standard](https://github.com/xiaobright/dsh-anchored-standard) | 首轮：官方双工具 schema。之后：恢复 Pi 原来的工具。 |
| **V4 Flash** | anchored-standard(v0.3.1 起) | 同样的引导——全量 DeepSWE v1.1 解出 61.1%,官方 Flash 榜为 53%。 |

> V4 Pro 会过拟合**首轮工具 schema**。官方极简（`bash` + `str_replace_editor`）
> 思维链首行是 **We need…** / **I need…**；工具一变丰富就会落到 **Let me…**。
> 首轮锚定之后轨迹不会翻，所以后面可以把 Pi 的完整工具还回去。
>
> **v0.2.x 的 Flash weak-routing 配置已在 v0.3.0 移除**——同一套 harness
> 实测无提升（见上表），且上游 P21 数据显示其近场引导在相关任务链上是
> 负收益。anchored-standard 引导没有引导文本，不存在该失败模式;
> v0.3.1 起对 Flash 默认开启。

```sh
pi install npm:pi-dsh-minimal
```

这是社区项目，并非 DeepSeek 或 Pi 官方预设，也不代表 DeepSeek 的认可或背书。

## V4 Pro / V4 Flash — 锚定后晋升

默认触发：模型名/id 包含 `deepseek-v4-pro` 或 `deepseek-v4-flash`
（v0.3.1 起两者都是）。其他模型一律不动，除非打开 `useOnAllModels`。
`/dsh unmatch deepseek-v4-flash` 可让 Flash 完全退出。

| 阶段 | 何时 | 表面 |
| --- | --- | --- |
| 引导（第 1 次请求） | 新会话，或压缩后的第一次请求 | 系统提示词 = `You are a helpful software engineer assistant.` 工具 = 官方持久 `bash` + `str_replace_editor`。 |
| 晋升（之后的请求） | 第一次持久的 **助手消息** 或 **工具调用**（`promoteOn: either`） | 仍是官方 persona。**恢复 Pi 原来的工具。** |
| 压缩之后 | `session_compact` | 回到引导面，直到出现新的晋升信号。 |

`/dsh promote either|tool-call|assistant-message` 改晋升信号。
`tool-call` 下如果首答是纯文字，会话会一直停在双工具。

## 为什么移除了 v0.2.x 的 Flash 配置

v0.2.0 移植过 dsh-routing-suite 的 weak 路由 + mode-boost（换 persona +
`Router: classify this task…` 引导）。移除依据，按权重排序：

1. **受控 DeepSWE A/B**（2026-08-16）：官方 DeepSWE v1.1 的 10 题 ×
   扩展开/关，同一 pi agent + `opencode-go/deepseek-v4-flash:max`，
   官方 verifier 判分。开 4/11、关 5/10，平均 partial 0.810 vs 0.901，
   McNemar p=1.0。每个 run 都验证过插件正常激活；失败尸检显示的是普通的
   实现走偏而非引导病态——即「无信号」，不是「移植坏了」。
2. **上游自己的相关链数据**（dsh-routing-suite P21）：近场引导在同文件
   演进链上是*负收益*（deep 46% vs baseline 63%），机制是引导让模型偏向
   分类而不是读已有代码。真实 SWE 会话正是这种形态。
3. **探针与分数的鸿沟**：已发表的 Flash「提升」（路由命中率、思考深度、
   收敛率）全部是 fixture 微任务探针；上游自己的 P2/P9 就注明简单任务
   分数饱和、困难任务上的分数级验证从未做过。

基线合理性：不开扩展时 pi 在该子集解出 50%，与官方 DeepSWE v1.1 榜
`deepseek-v4-flash [max]` 的 53%（mini-swe-agent harness）一致——
「无提升」不是 harness 伪影。

## 安装

```sh
pi install npm:pi-dsh-minimal
```

从 git 安装：

```sh
pi install git:github.com/Averyyy/pi-dsh-minimal
```

重启 Pi（或 `/reload`）。新建会话，选 DeepSeek V4 Pro。

本地检出：

```sh
pi -e /path/to/pi-dsh-minimal
```

## 设置

`/dsh` 打开设置界面（交互方式对齐 `pi-codex-conversion` 的 `/codex`）：

| 页 | 内容 |
| --- | --- |
| General | 启用、对所有模型触发、Pro 晋升条件、状态栏 |
| Models | Pro pattern（默认 `deepseek-v4-pro`） |
| About | GitHub / changelog / 模型卡 / issues |

命令：

```
/dsh                      打开设置
/dsh on|off               总开关
/dsh all                  切换「对所有模型触发」（未知模型走 Pro）
/dsh status               切换状态栏
/dsh models               打开 Models 页
/dsh match <pat>          添加 Pro 触发
/dsh unmatch <pat>        删除 Pro 触发
/dsh promote either|tool-call|assistant-message
```

配置文件：`~/.pi/agent/pi-dsh-minimal.json`。

```json
{
  "enabled": true,
  "statusLine": true,
  "useOnAllModels": false,
  "modelPatterns": ["deepseek-v4-pro", "deepseek-v4-flash"],
  "promoteOn": "either"
}
```

（v0.2.x 配置里的 `flashPatterns` / `flashRouting` 会被忽略。）

状态栏：Pro 引导期是 `dsh anchored`，晋升后是 `dsh anchored • promoted`。

## 如何验证

**Pro**

1. 启用扩展并选择 DeepSeek V4 Pro。
2. 发一个小的改文件任务（`main.py` 打印 hello，改成 world）。
3. 第一段 thinking 应以 `We need…` / `I need…` 开头，而不是 `Let me…`。
4. 第一次请求应只暴露 `bash` 和 `str_replace_editor`。
5. 第一次助手回复或工具调用之后，后续请求应看到 Pi 原来的工具。

**Flash**

与 Pro 完全相同的引导（首轮双工具 + 官方 persona；首个助手消息/工具
调用后晋升）。`/dsh unmatch deepseek-v4-flash` 可让 Flash 完全退出。

设置 `PI_DSH_MINIMAL_DUMP=/tmp/dsh-minimal-request.json` 可把改写后的表面
写到文件（含 `profile` 和 `promoted`）。

```sh
npm test
npm run live:trajectory   # 需要已配置 DeepSeek V4 Pro
```

## 重要行为

- Pro 的**第一次请求**决定轨迹。工具 **schema 身份** 是决定变量；本包装会改写
  provider 请求，即使 TypeBox 本来会加上 `strict` / `additionalProperties`，
  模型看到的仍是官方双工具目录。
- 晋升之后只继续强制官方 persona。工具回到 Pi 原来的那套（通常是 `read` /
  `bash` / `edit` / `write` / …）。
- 引导期内 `bash` 是持久进程。`cd` 和 `export` 会保持到晋升、会话结束，或
  300 秒超时重置。
- `str_replace_editor` 要求 **绝对路径**，与 dsh 一致。
- 扩展不发起网络请求，也不增加遥测。

## 相关项目

| 项目 | 宿主 | 表面 |
| --- | --- | --- |
| [dsh-anchored-standard](https://github.com/xiaobright/dsh-anchored-standard) | DeepSeek Harness | 两阶段：先极简锚定，再晋升 Standard |
| [dsh-routing-suite](https://github.com/yjh051108/dsh-routing-suite) | DeepSeek Harness | Flash weak 路由 + mode-boost（v0.2.0 已移除的 Flash 配置的来源） |
| [pi-deepseek-anchor](https://github.com/kxh4892636/pi-deepseek-anchor) | Pi | 上述两阶段 preset 的 Pi 移植 |
| [pi-dsh](https://github.com/fatwang2/pi-dsh) | Pi | 在 Pi 里把 DSH 当成 provider 跑 |
| **pi-dsh-minimal** | Pi | Pro 锚定晋升 |

## 许可证

MIT。工具描述、schema 和编辑器回包字符串源自 DeepSeek
Harness / dsh-anchored-standard（MIT）。见
[NOTICE](./NOTICE)。
