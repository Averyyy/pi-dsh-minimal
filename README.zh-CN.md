# pi-dsh-minimal

[English](./README.md)

[![npm](https://img.shields.io/npm/v/pi-dsh-minimal.svg)](https://www.npmjs.com/package/pi-dsh-minimal)
[![pi.dev](https://img.shields.io/badge/pi.dev-package-111111)](https://pi.dev/packages/pi-dsh-minimal)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

这是一个 [Pi](https://pi.dev) 扩展：按模型把 DeepSeek V4 映射到实测过的
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 表面。

| 模型 | 配置 | 做什么 |
| --- | --- | --- |
| **V4 Pro** | [anchored-standard](https://github.com/xiaobright/dsh-anchored-standard) | 首轮：官方双工具 schema。之后：恢复 Pi 原来的工具。 |
| **V4 Flash** | [router-standard weak](https://github.com/yjh051108/dsh-router-standard) + [mode-boost](https://github.com/yjh051108/dsh-mode-boost) | weak 自路由 persona + 近场分类/收敛引导。工具保持 Pi 原样。 |

> V4 Pro 会过拟合**首轮工具 schema**。官方极简（`bash` + `str_replace_editor`）
> 思维链首行是 **We need…** / **I need…**；工具一变丰富就会落到 **Let me…**。
> 首轮锚定之后轨迹不会翻，所以后面可以把 Pi 的完整工具还回去。
>
> V4 Flash **没有** Pro 那么吃 schema。它吃的是 persona 和引导：按任务选思考
> 深度，并且想完能收敛。两工具锚定不是 Flash 该拧的旋钮。

```sh
pi install npm:pi-dsh-minimal
```

这是社区项目，并非 DeepSeek 或 Pi 官方预设，也不代表 DeepSeek 的认可或背书。

## V4 Pro — 锚定后晋升

默认触发：模型名/id 包含 `deepseek-v4-pro`（`deepseek-v4-flash` 不会进这个配置）。

| 阶段 | 何时 | 表面 |
| --- | --- | --- |
| 引导（第 1 次请求） | 新会话，或压缩后的第一次请求 | 系统提示词 = `You are a helpful software engineer assistant.` 工具 = 官方持久 `bash` + `str_replace_editor`。 |
| 晋升（之后的请求） | 第一次持久的 **助手消息** 或 **工具调用**（`promoteOn: either`） | 仍是官方 persona。**恢复 Pi 原来的工具。** |
| 压缩之后 | `session_compact` | 回到引导面，直到出现新的晋升信号。 |

`/dsh promote either|tool-call|assistant-message` 改晋升信号。
`tool-call` 下如果首答是纯文字，会话会一直停在双工具。

## V4 Flash — weak + mode-boost

默认触发：模型名/id 包含 `deepseek-v4-flash`。

| 部分 | 行为 |
| --- | --- |
| Persona | 实测 Flash weak 文本：先判断 build/fix，带回顾/反跑题锚，以及 `Think deeply first, then produce.` |
| 工具 | **不改。** Flash 不做首轮双工具收窄。 |
| 引导 | 接到每条真实用户消息后面。第 1–2 轮：分类。第 3 轮起：「这是新任务，重新分类」。简单任务走快速提交尾；复杂任务走有向深度尾（Flash 不加决策闭环后缀）。 |
| 寒暄让位 | `你好` / `hello` / 短句无任务：不换 persona、不加引导。 |
| 路由 | 默认 `weak`（模型自己分类）。`/dsh routing auto` 用关键词分类器；`spec` / `react` 强制一个带。 |

## 安装

```sh
pi install npm:pi-dsh-minimal
```

从 git 安装：

```sh
pi install git:github.com/Averyyy/pi-dsh-minimal
```

重启 Pi（或 `/reload`）。新建会话，选 DeepSeek V4 Pro 或 V4 Flash。

本地检出：

```sh
pi -e /path/to/pi-dsh-minimal
```

## 设置

`/dsh` 打开设置界面（交互方式对齐 `pi-codex-conversion` 的 `/codex`）：

| 页 | 内容 |
| --- | --- |
| General | 启用、对所有模型触发、Pro 晋升条件、Flash 路由、状态栏 |
| Models | Pro pattern（默认 `deepseek-v4-pro`）和 Flash pattern（默认 `deepseek-v4-flash`） |
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
/dsh flash-match <pat>    添加 Flash 触发
/dsh flash-unmatch <pat>  删除 Flash 触发
/dsh promote either|tool-call|assistant-message
/dsh routing weak|auto|spec|react
```

配置文件：`~/.pi/agent/pi-dsh-minimal.json`。

```json
{
  "enabled": true,
  "statusLine": true,
  "useOnAllModels": false,
  "modelPatterns": ["deepseek-v4-pro"],
  "flashPatterns": ["deepseek-v4-flash"],
  "promoteOn": "either",
  "flashRouting": "weak"
}
```

状态栏：Pro 引导期是 `dsh anchored`，晋升后是 `dsh anchored • promoted`，
Flash 是 `dsh flash`。

## 如何验证

**Pro**

1. 启用扩展并选择 DeepSeek V4 Pro。
2. 发一个小的改文件任务（`main.py` 打印 hello，改成 world）。
3. 第一段 thinking 应以 `We need…` / `I need…` 开头，而不是 `Let me…`。
4. 第一次请求应只暴露 `bash` 和 `str_replace_editor`。
5. 第一次助手回复或工具调用之后，后续请求应看到 Pi 原来的工具。

**Flash**

1. 选择 DeepSeek V4 Flash。
2. 真实编码任务应拿到 Flash weak persona，以及 `Router: classify this task…` 尾巴。
3. `你好` 应保持 Pi 原来的提示词和工具。

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
- Flash 引导走 `context` 钩子（近场注入，不是多出来的一轮用户消息）。
- 扩展不发起网络请求，也不增加遥测。

## 相关项目

| 项目 | 宿主 | 表面 |
| --- | --- | --- |
| [dsh-anchored-standard](https://github.com/xiaobright/dsh-anchored-standard) | DeepSeek Harness | 两阶段：先极简锚定，再晋升 Standard |
| [dsh-routing-suite](https://github.com/yjh051108/dsh-routing-suite) | DeepSeek Harness | Flash weak 路由 + mode-boost |
| [pi-deepseek-anchor](https://github.com/kxh4892636/pi-deepseek-anchor) | Pi | 上述两阶段 preset 的 Pi 移植 |
| [pi-dsh](https://github.com/fatwang2/pi-dsh) | Pi | 在 Pi 里把 DSH 当成 provider 跑 |
| **pi-dsh-minimal** | Pi | Pro 锚定晋升 + Flash weak/mode-boost |

## 许可证

MIT。工具描述、schema、编辑器回包字符串和 Flash 路由文本源自 DeepSeek
Harness / dsh-anchored-standard / dsh-mode-boost（MIT）。见
[NOTICE](./NOTICE)。
