# pi-dsh-minimal

[English](./README.md)

这是一个 [Pi](https://pi.dev) 扩展：把 Pi 的提示词和工具面映射成
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 官方
**minimal（极简模式）** 预设。

这是社区项目，并非 DeepSeek 或 Pi 官方预设，也不代表 DeepSeek 的认可或背书。

## 为什么这样做

DeepSeek V4 Pro 的模型卡在代码 Agent 任务上使用 DeepSeek Harness
**极简模式** 评测。社区实测（见
[`dsh-anchored-standard`](https://github.com/xiaobright/dsh-anchored-standard)）
表明 V4 Pro 会强烈过拟合 API 中可见的表面：

- 完整系统提示词 = `You are a helpful software engineer assistant.`
- 工具目录 = 持久 `bash` + `str_replace_editor`（官方 schema）

在这套表面上，思维链首行通常是 `We need…` / `I need…`；在 standard 系工具目录上
则会落到 `Let me…`。

`pi-codex-conversion` 在模型为 GPT 时把 Pi 的工具映射成 Codex 工具。本包装做
同类事情，只是针对 DeepSeek：当模型是 DeepSeek V4 Pro 时，把 Pi 的提示词和
工具换成官方 dsh minimal 表面。

这是 **全程** 极简模式（HF 评测配置），不是「先锚定再晋升到 Standard」的两阶段
preset。

## 激活后会改什么

| 表面 | 官方极简 |
| --- | --- |
| 系统提示词 | 精确等于 `You are a helpful software engineer assistant.`（`complete: true`）。Pi 的身份、工具指南、AGENTS.md 摘要、技能目录、日期/运行时上下文全部剥离。 |
| 工具 | 精确为 `bash` + `str_replace_editor`。线上 schema 与 dsh 一致（无 `strict`、无 `additionalProperties`）。 |
| `bash` | 持久 shell。cwd 与 export 的环境变量在多次调用间保留。 |
| `str_replace_editor` | 官方 `view` / `create` / `str_replace` / `insert`，要求绝对路径。 |
| 上下文压缩 | 不改 Pi 宿主自带的压缩。官方 preset 本身不挂载压缩插件。 |

未激活时恢复 Pi 原来的工具和提示词。

## 默认触发条件

扩展默认 **开启**，但只在当前模型名/id 匹配 **DeepSeek V4 Pro**
（`deepseek-v4-pro`、`DeepSeek V4 Pro`、`deepseek-v4-pro-0813` 等）时生效。
`deepseek-v4-flash` 不会匹配。

可在 TUI 设置里改，或用 `/dsh`。

## 安装

```sh
pi install npm:pi-dsh-minimal
```

从 git 安装：

```sh
pi install git:github.com/Averyyy/pi-dsh-minimal
```

重启 Pi（或 `/reload`）。新建会话并选择 DeepSeek V4 Pro。

本地检出：

```sh
pi -e /path/to/pi-dsh-minimal
```

## 设置

`/dsh` 打开设置界面（交互方式对齐 `pi-codex-conversion` 的 `/codex`）：

| 页 | 内容 |
| --- | --- |
| General | 启用、**对所有模型触发**、状态栏 |
| Models | 触发模式。默认 `deepseek-v4-pro`。可添加当前模型，或删除某条 pattern。 |
| About | GitHub / changelog / 模型卡 / issues |

命令：

```
/dsh                 打开设置
/dsh on|off          总开关
/dsh all             切换「对所有模型触发」
/dsh status          切换状态栏
/dsh models          打开 Models 页
/dsh match <pat>     添加触发 pattern
/dsh unmatch <pat>   删除触发 pattern
```

配置文件：`~/.pi/agent/pi-dsh-minimal.json`。

```json
{
  "enabled": true,
  "statusLine": true,
  "useOnAllModels": false,
  "modelPatterns": ["deepseek-v4-pro"]
}
```

## 如何验证

1. 启用扩展并选择 DeepSeek V4 Pro。
2. 发一个小的编码任务（例如 `Create /tmp/dsh-min.txt containing hello`）。
3. thinking 应以 `We need…` / `I need…` 开头，而不是 `Let me…`。
4. 模型应只调用 `bash` 和 `str_replace_editor`。

设置 `PI_DSH_MINIMAL_DUMP=/tmp/dsh-minimal-request.json` 可把改写后的系统提示词
和工具名写到文件。

```sh
npm test
npm run live:trajectory   # 需要已配置 DeepSeek V4 Pro
```

## 重要行为

- 第一次请求决定轨迹。工具 **schema 身份** 是决定变量；本包装会改写 provider
  请求，即使 TypeBox 本来会加上 `strict` / `additionalProperties`，模型看到的
  仍是官方双工具目录。
- `bash` 是持久进程，不是 Pi 自带的一次性 bash。`cd` 和 `export` 会保持到会话
  结束，或命令超时（300s）后 shell 被重置。
- `str_replace_editor` 要求 **绝对路径**，与 dsh 一致。
- 其他改写提示词的扩展仍可能在 `before_agent_start` 上竞争。payload 改写是
  线上请求的最后防线。
- 扩展不发起网络请求，也不增加遥测。
- 安装前请自行审阅文件。持久 bash 与 Pi 内置 shell 具有相同信任等级。

## 许可证

MIT。工具描述、schema 和编辑器回包字符串源自 DeepSeek Harness（MIT）。见
[NOTICE](./NOTICE)。
