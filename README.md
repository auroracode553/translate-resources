# 译境离线资源

独立管理离线引擎、正文翻译模型、Argos 备用模型与语言词库。应用查询代码留在 translate-pc；Python / llama 放入本项目 `data/runtime/windows-x64/python`，首次使用离线功能下载一次。发布资源无需编译应用。远程仓库为 [auroracode553/translate-resources](https://github.com/auroracode553/translate-resources)，v1.0.1 只新增引擎附件，四个大资源包继续引用 [v1.0.0](https://github.com/auroracode553/translate-resources/releases/tag/v1.0.0)。

## 目录

- `data/models`：混元 GGUF 模型。
- `data/nltk_data/corpora`：各语言 SQLite 词库与 WordNet 原始归档。
- `data/argos-packages`：Argos 双向备用模型。
- `data/runtime/windows-x64/python`：嵌入式 Python、NLTK、Argos 依赖、llama CPU/Vulkan。
- `scripts/prepare-engine.mjs`：新增单个引擎 ZIP，复用已有模型和语言包。
- `scripts/create-catalog.mjs`：生成版本、大小与附件名称清单。
- `scripts/prepare-release.mjs`、`create-resource-zip.py`：准备一个模型文件和三个 ZIP，不上传。
- `scripts/restore-resources.ps1`：新电脑按清单恢复，支持 HTTPS 下载或本地 data 备份。
- `scripts/resource-archive.ps1`：用 Windows 内置 ZIP 支持按清单解压。
- `scripts/upload-release.mjs`、`github-release-api.mjs`：上传附件，确认大小及状态后发布 Release；凭据只保存在本次进程内存中。
- `resource-catalog.json`：应用读取的版本接口；大文件不进入 Git。
- `SOURCES.md`、原资源清单：来源、版本与上游许可链接。

## 本地开发

相邻 translate-pc 开发版默认引用本项目 `data`。也可在应用设置中选择其他资源根目录。无需复制模型和词库回应用目录。

换电脑克隆两个仓库后，在本项目执行 `npm run restore` 恢复五组资源；仅恢复运行库使用 `npm run restore -- -Packages engine`。恢复引擎使用 Windows 系统解压能力，无需预装 Python。大文件和发布 ZIP 都留在 Release，Git 只管理脚本与清单。原应用内 Python / llama 路径自动迁移，自定义外部程序路径保留。

## 附件拆分

| 附件 | 下载大小 | 解压占用 | 内容 |
| --- | ---: | ---: | --- |
| `engine-windows-x64-1.0.1.zip` | 77.38 MiB | 219.14 MiB | Python 3.14.8、词典读取依赖、Argos 推理依赖、llama CPU 与 Vulkan |
| `Hy-MT2-1.8B-Q4_K_M.gguf` | 1080.59 MiB | 1080.59 MiB | 正文翻译模型，保留全部现有支持语言 |
| `dictionary-en-1.0.0.zip` | 1115.51 MiB | 1919.41 MiB | ECDICT、英英维基词典、中文维基词典的英文词条、OEWN、WordNet、OMW、韦氏 |
| `dictionary-zh-1.0.0.zip` | 180.86 MiB | 230.08 MiB | 中文维基词典的中文词条、CC-CEDICT |
| `argos-1.0.0.zip` | 139.01 MiB | 165.22 MiB | 完整英译中、中译英备用模型 |

四个主要附件合计约 2.46 GiB，展开为 28 个原资源文件，未裁减内容。另附 `resource-catalog.json`、`SOURCES.md`、`dictionary-resources.json`、`hunyuan-resources.json` 四个小型清单与来源说明。

按查询词条的语言归类：英文包内仍有英汉释义和 WordNet 中文映射；中文包提供中文释义、拼音和汉英译法，同时装英文包可补全英文译法的反向释义。完整功能安装引擎及四组原资源。引擎 ZIP 不含模型或语言词库，应用升级与词库更新均可继续复用。

ZIP 内保留 `nltk_data/corpora/...` 和 `argos-packages/...` 路径。手动安装时将 ZIP 解压到 `data`，模型放入 `data/models/hy-mt2/`。应用设置和恢复脚本均自动完成这些操作，安装成功后不保留下载 ZIP。

## 独立发布

首次运行下述完整准备流程；以后只更新应用代码或资源脚本时走 Git，不重新准备或上传模型和词库。资源有变化时使用下方“增量发布”。

1. 修改 package.json 的资源版本；与应用版本独立。
2. 只提交脚本、说明及清单，data 和 release-assets 已忽略。
3. 更新清单 downloadBaseUrl 为实际版本地址，再运行 `npm run catalog`；环境变量 RESOURCE_DOWNLOAD_BASE_URL 可覆盖此地址。
4. 明确需要准备附件时运行 `npm run prepare-release`；调用 Python 标准库生成 ZIP，不安装依赖。会额外占用约一份下载附件空间。
5. 运行 `npm run upload-release -- --repository=auroracode553/translate-resources`，按提示输入本次凭据（不回显、不写文件），或通过环境变量 GH_TOKEN 提供。先上传到草稿，逐项确认状态和大小后发布。每个附件小于 2 GiB。
6. 初始语言清单 schemaVersion 为 2；当前含引擎的清单为 4，使用增量脚本维护。同步清单到应用 `resources/offline/resource-catalog.json`，或在设置中填写新清单地址。不要重新生成或覆盖已经发布的基准包。

当前清单基础地址为 `https://github.com/auroracode553/translate-resources/releases/download/v1.0.1`；模型和词库在各自描述中固定引用 v1.0.0。GitHub 可用性因网络环境而异，清单和附件可放同版本 HTTPS 镜像。失败或取消会清理本次临时文件，已有完整资源组直接复用。解压先在临时目录完成，确认条目及大小后再移入正式目录，不计算 SHA-256。

## 增量发布

初始四个附件是不可变的基准包，不要覆盖或删除。每个资源组有自己的版本和固定附件 URL；新清单可以直接引用旧 Release 的模型和语言包。整体清单版本变化不会导致这些文件重传。

只更新 CC-CEDICT 时：

```powershell
# 先查看实际会准备什么，不压缩、不修改清单、不上传：
npm run prepare-update -- --version=1.0.2 --files=nltk_data/corpora/cedict.sqlite --dry-run
# 生成实际补丁预览，不修改当前清单和 data 资源版本，不上传：
npm run prepare-update -- --version=1.0.2 --files=nltk_data/corpora/cedict.sqlite --preview
# 确认变更文件后准备补丁，再按原上传命令发布：
npm run prepare-update -- --version=1.0.2 --files=nltk_data/corpora/cedict.sqlite
npm run upload-release -- --repository=auroracode553/translate-resources
```

该示例只准备 `dictionary-zh-patch-1.0.2.zip` 和小型清单，模型、英文包、Argos 均引用 v1.0.0，引擎仍引用 v1.0.1；中文完整基准包也不重传。多个文件用逗号分隔，同一个语言包的变更合成一个补丁。大模型改版时仅上传新 GGUF，其余资源仍复用。

`--preview` 输出到 `release-assets/.preview-1.0.2`。可以运行 `npm run restore -- -ManifestPath release-assets/.preview-1.0.2/resource-catalog.json -Plan` 查看本机实际需要下载的附件，命令不下载资源。

增量清单使用 schemaVersion 3；含独立引擎时为 4，版本与补丁机制相同。`files` 是当前文件状态，`download` 固定指向基准包，`patches` 保存补丁版本、URL 和内容。应用和恢复脚本记录 `.offline-resource-state.json`，已有用户只取缺少的补丁，新电脑取基准包和必要补丁；已被后续补丁完整覆盖的旧补丁可跳过。开发时 data 仍直接使用，准备脚本记录本机资源版本。引擎更新也可只列出改变的 DLL 或 Python 文件，无需每次重传整个引擎。

希望跟随新资源版本时，在应用的“资源清单地址”填写 `https://github.com/auroracode553/translate-resources/releases/latest/download/resource-catalog.json`，刷新后只下载必要更新。离线使用可继续留空，读取随附清单。GitHub 直链连接失败时，应用通过官方公开附件 API 回退；恢复脚本同样支持该接口，不要求用户提供 Token，下载流不使用系统代理。

补丁粒度是整个资源文件：只改 15 MiB 的词库，就只上传该词库的压缩补丁；如果完整替换 1 GiB 的数据库或模型，该文件仍需上传一次。当前不做二进制差分，也不计算 SHA-256。修改资源时明确列出变更文件，避免把代码变动误当成资源更新。发布前更新对应来源记录，并将新清单同步到应用或在设置中指定新清单地址。

增量版本不要再修改 package.json 后运行 `catalog` 和 `prepare-release`，这些是初始完整基准准备流程；脚本会拒绝增量清单的全量准备。可以把 `.offline-resource-state.json` 从 data 备份一起带到新电脑。

## 存储与换电脑

Git 仓库只提交脚本、来源说明、版本和资源清单。data 和 release-assets 始终忽略；大模型与数据库不执行 git add，不放进源码历史。Git 克隆不是资源备份，发布前至少在移动硬盘或其他电脑保存完整 data。

如需国内镜像，将四个版本化附件按清单 `download.asset` 名称上传到 HTTPS 对象存储，并保留同版本 resource-catalog.json。对象存储按供应商规则计费。GitHub Release 单附件保持小于 2 GiB，参见 [GitHub Release 配额](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)。

新电脑把应用和资源仓库克隆到同一父目录，先从已发布附件恢复资源：

```powershell
cd D:\my_project\electron_project\translate-resources
npm run restore
# 若资源未发布，从旧电脑或移动硬盘的完整 data 目录复制：
npm run restore -- -LocalSource 'E:\备份\translate-resources\data'
# 只查看资源分组，不下载：
npm run restore -- -List
```

二选一执行下载或本地恢复即可。已存在且大小正确的文件直接复用；不计算 SHA-256。默认恢复所有组，可用 `-Packages hunyuan,dictionary-en` 指定组；完整功能需要全部组。`-BaseUrl` 可覆盖清单内的地址。

应用仓库运行 npm ci 和 npm run restore-runtime（需要开发用 Python 3.14 安装 wheel），然后 npm run dev。安装版用户无需恢复开发环境，直接在设置下载资源。现有真人发音已随应用源码的小型静态资源管理，克隆应用后即可取得。

上传脚本不推送 Git 源码。资源附件由 Release 分发，源码和说明是否已推送应单独检查；发布前仍需保留本地 data 备份。
