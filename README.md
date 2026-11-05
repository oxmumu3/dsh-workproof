<h1 align="center">DSH Workproof</h1>

<p align="center"><b>发送前的那一步：让 Agent 说“我做完了”的时候，你能查、能追溯。</b></p>

<p align="center">
  <img alt="Harness 0.2.x" src="https://img.shields.io/badge/DeepSeek%20Harness-0.2.x-111?style=flat-square">
  <img alt="MIT" src="https://img.shields.io/badge/MIT-%E5%BC%80%E6%BA%90-111?style=flat-square">
</p>

<p align="center"><sub>界面为合成测试材料，不是真实用户数据。</sub></p>

作者：牛村木木山。两个可独立安装的社区插件，非官方产品。

来自两个反复出现的问题：**成果究竟在哪、改完还是原来的验收版本吗？** 以及 **文章里的判断有来源支持，还是只是模型说得有道理？**

## 两个插件，一个动作

| 插件 | 它回答什么 | 它不做什么 |
|---|---|---|
| [交付回执](packages/dsh-delivery-receipts/README.zh.md) | 这一轮产出了哪些文件、版本变没变、我声明做过的检查和文件证据是否对得上 | 不把哈希当质量证明，不冒充测试，不替你发送或发布 |
| [研究证据账本](packages/dsh-evidence-ledger/README.zh.md) | 哪些是事实断言、哪些是推断和建议、各自挂在哪条来源上、反证和未决问题在哪 | 不自动抓取来源，不判断真伪，不把有引用当成已核验 |

<p align="center">
  <img src="docs/screenshots/delivery-receipts-light.png" alt="交付回执：当前文件、版本和检查证据放在同一处" width="100%">
</p>

<p align="center"><sub>交付回执：登记、哈希、检查记录和验收状态在同一处。</sub></p>

<p align="center">
  <img src="docs/screenshots/evidence-ledger-dark.png" alt="研究证据账本：论点和结构性提示分开" width="100%">
</p>

<p align="center"><sub>研究证据账本：论点和结构性提示分开，“已审阅”不抹去反证。</sub></p>

## 三步用起来

1. **装。** 在 Harness「插件 → 添加插件」里分别填 `@oxmumu3/dsh-delivery-receipts` 和 `@oxmumu3/dsh-evidence-ledger`，安装后立即启用。两个插件互相独立，按需装。
2. **要。** 生成文章、报告或代码后，对 Agent 说：
   > 请用 delivery_receipt 登记本轮成果，列出相对路径，把声明做过的检查和文件证据分开；不要替我验收。
3. **看。** 在已有普通会话里打开对应标签页，逐项看文件、哈希和证据；重新检查发现文件变化后，旧的接受状态会显示为过期。

研究场景换成：

> 用 evidence_ledger 整理本轮研究：分别记录事实断言、推断和建议，关联来源及定位，保留反证与待解决问题；不要把有引用写成已核验。

空白会话不显示会话标签，先有一轮对话再打开。网页版也可用命令行：

```bash
dsh plugin --profile web add @oxmumu3/dsh-delivery-receipts
dsh plugin --profile web add @oxmumu3/dsh-evidence-ledger
```

## 现成的验收清单

不想从零想检查项时，直接抄[三份清单](docs/templates/acceptance-checklists.md)（文章 / 代码 / 研究）：每一条都要求「声明」和「证据」分开，没有证据的条目写“未验证”，不许用推断补。

## 它不会替你做的事

- **哈希不是质量证明。** 只说明文件没变，不说明写得好、跑得通、测过。
- **“已审阅”不是“没有反证”。** 账本保留反证和未决问题，选定论点的导出范围不等于它们不存在。
- **导出不等于外发。** 生成的是本地 Markdown；标题、路径、论点、链接是否敏感仍要你自己检查。
- **本地优先不等于沙箱。** 宿主插件拥有宿主进程权限；账本的隐私省略只作用于导出的 Markdown，所属会话仍能读完整账本。
- **不新增模型调用、遥测、后台扫描或自动上传。** 安装时包管理器可能下载依赖。

## 安装与兼容

- 两个包在 npm：`@oxmumu3/dsh-delivery-receipts`、`@oxmumu3/dsh-evidence-ledger`，当前 `0.1.3-preview.3`；也可从 [Releases](https://github.com/oxmumu3/dsh-workproof/releases) 下载带 `SHA256SUMS` 的 `.tgz` 离线安装。
- 兼容候选在既有四个准确 SDK 版本上增加官方 `0.2.2-rc.1`；rc.1 使用 Cordis 4.1.0 与 Node 24.22.1。产品运行时代码不变，验证使用合成本地数据、官方服务与隔离 CLI Host。
- 候选包、公开发布、社区分发和读者实际安装是不同状态，详见[验证记录](docs/verification.md)。
- 桌面版：先完成正在运行的任务，再从插件页粘贴 npm 精确包名和版本，装完点「立即启用」；两个插件分别安装。详见[桌面安装指引](docs/desktop-install.md)。

## 开发与复现

```sh
npm ci --ignore-scripts
npm run check
npm test
npm run test:host
npm run test:release
npm run check:official
```

`check:official` 读取官方 npm `latest`，遇到未测试的新版本会失败；完成隔离 SDK/Host 验证后才可扩展 `compatibility-manifest.json` 与包声明。

设计与验收范围：[交付回执](docs/superpowers/specs/2026-10-04-delivery-receipts-design.md) · [研究证据账本](docs/superpowers/specs/2026-10-04-evidence-ledger-design.md)。欢迎带最小合成复现来提 Issue，不要上传密钥、内部资料或原始聊天记录。

## 设计思考

[《DeepSeek Harness 要走向极客玩具还是大众普惠？》](https://mp.weixin.qq.com/s/RIAYNqo8OsUVx2JpR8MPyA)

MIT。Local-first plugins that keep agent claims, observable artifacts and human review distinct.
