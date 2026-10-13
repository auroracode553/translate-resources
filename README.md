# 译境离线资源

独立管理正文翻译模型、Argos 备用模型与语言词库。应用查询代码及 Python / llama 运行时留在 translate-pc；本仓库不启动应用、不安装依赖、不自动下载、不上传发布。

## 目录

- `data/models`：混元 GGUF 模型。
- `data/nltk_data/corpora`：各语言 SQLite 词库与 WordNet 原始归档。
- `data/argos-packages`：Argos 双向备用模型。
- `scripts/create-catalog.mjs`：生成版本、大小与附件名称清单。
- `scripts/prepare-release.mjs`：按清单复制附件，不压缩、不上传。
- `resource-catalog.json`：应用读取的版本接口；大文件不进入 Git。
- `SOURCES.md`、原资源清单：来源、版本与上游许可链接。

## 本地开发

相邻 translate-pc 开发版默认引用本项目 `data`。也可在应用设置中选择其他资源根目录。无需复制模型和词库回应用目录。手动导入时按清单的 `path` 放置资源；Release 附件名称需还原为相应路径和文件名。

## 独立发布

1. 修改 package.json 的资源版本；与应用版本独立。
2. 为资源仓库创建远程 Git 仓库。只提交脚本、说明及清单，data 和 release-assets 已忽略。
3. 设置环境变量 RESOURCE_DOWNLOAD_BASE_URL 为实际版本附件基础地址，再运行 `npm run catalog`。例如 `https://github.com/OWNER/translate-resources/releases/download/v1.0.0`。可替换为国内 HTTPS 对象存储 / 镜像，文件名须一致。
4. 明确需要准备附件时运行 `npm run prepare-release`；会额外占用一份资源空间。
5. 审核 SOURCES.md 的来源和上游再分发条件，手动创建对应版本 Release，将 release-assets/<版本> 的文件上传。每个附件小于 2 GiB；按清单名称分别上传，不能把全部资源合成一个大附件。
6. 在应用设置中填写 resource-catalog.json 的 HTTPS 地址，点击刷新，再按需下载。旧应用可使用随附清单和指定下载基础地址；资源格式变化时更新 schemaVersion 并同步应用。

下载地址尚未配置，当前没有可用远程 Release。GitHub 可用性因网络环境而异；Gitee 附件容量需在选定平台核实。清单是可信配置，只使用自己管理的 HTTPS 地址。失败或取消的当前文件临时副本会清理，已下载完成的文件保留并在重试时跳过。
