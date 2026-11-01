# 官方 Desktop 安装 Workproof

本页原有 Desktop 操作与 UI 验证对应官方 **DeepSeek Harness 0.2.0-rc.2 与 0.2.1-rc.3**。兼容性预览 `0.1.3-preview.2` 新增官方 rc.4/rc.5 的隔离 CLI Host、工具/命令/存储验证；未重新声明这两个版本的 Desktop UI 验收，见[验证记录](releases/v0.1.3-preview.2.md)。实际检查始终使用独立测试 profile，不代表已改动你的日常 Desktop profile。下列输入均固定到本次兼容性版本。

## 安装

先完成正在运行的任务。两个插件互相独立，一次安装一个；归档下载与 `SHA256SUMS` 见 [Releases](https://github.com/oxmumu3/dsh-workproof/releases)。

1. 左侧栏 **插件 → 添加插件**。
2. 在 **包名或地址** 粘贴下面某一个完整 npm 包名和版本，点击 **安装**。这里填的是包名和版本，不是整条 `dsh plugin ...` 命令。
3. 安装完成后点击 **立即启用**。直接关闭安装对话框会保留为“已安装但未启用”。

交付回执：

```text
@oxmumu3/dsh-delivery-receipts@0.1.3-preview.2
```

研究证据账本：

```text
@oxmumu3/dsh-evidence-ledger@0.1.3-preview.2
```

Host 支持热重载时可以在线生效；只有提示下次启动后加载/生效时才完整退出再打开。macOS 的关闭窗口不是退出应用，可以用 **⌘Q** 完整退出。不要在还有任务运行时贸然退出。

进入已有普通对话，在会话顶部打开 **交付回执** 或 **研究证据账本** 标签。rc.2 的空白会话隐藏这些标签；只运行斜杠命令也不会离开空白状态。

## 常见边界

- 普通 CLI 文档里的 `web` 是示例 profile，不等于 Desktop 正在使用的 profile。桌面用户优先走应用内管理器，不要手工覆盖 profile 配置。
- 这两个包自身没有安装时脚本；若管理器要求授权某个依赖执行脚本，应先查看具体包与原因，不要一概批准。
- GitHub 下载失败，不等于 npm 镜像能代理 GitHub Release；可先在自己的浏览器下载并校验 `.tgz`，再在管理器输入该文件的实际本地绝对路径。不要因此关闭代理或修改系统网络设置。
- rc.2 的插件管理器尚不提供自动更新。以后升级插件按该版本提示卸载旧包后安装新包；Workproof 的隔离测试确认同名包卸载重装保留自身记录，但这不替代升级前备份。
- 不再需要时，在插件详情中选择卸载并确认。不要删除整个 Harness 数据目录来卸载插件。

依据：[官方插件管理器说明](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.0-rc.2/packages/client/ui-plugin-manager/README.zh.md#安装一个组合包)、[官方 Desktop 退出行为](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.0-rc.2/apps/desktop/README.zh.md#关闭窗口与退出)。安装测试的具体结果与局限见[验证记录](verification.md)。
