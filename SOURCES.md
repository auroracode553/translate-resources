# 离线词库来源与许可

版本检查日期：2026-10-07。具体数据库行数、源文件 SHA-256 和校验方式见同目录 `dictionary-resources.json`，数据库自身的 metadata 表也保留来源和摘要。

| 资源 | 来源与许可 | 用途 |
| --- | --- | --- |
| CC-CEDICT | [MDBG 下载页](https://www.mdbg.net/chinese/dictionary?page=cedict)，社区贡献者；CC BY-SA 4.0 | 直接汉英查询、简繁词形、拼音。改动或衍生数据遵循同一许可，保留来源署名。 |
| 中文、英语维基词典 | Wiktionary / Wiktextract / [Kaikki](https://kaikki.org/dictionary/rawdata.html)；CC BY-SA、GFDL，参见各语言词典版权页 | 中文原词条、汉英译法、英英释义、例句、词形、关系、词源。精简及压缩转换不改变该数据许可；保留来源及引文。 |
| ECDICT 完整版 | [skywind3000/ECDICT](https://github.com/skywind3000/ECDICT)，当前 master 的 stardict.7z；仓库 MIT，许可说明参见上游仓库 | 英汉义项、词组、词形、专业标签及频率字段；库内标记不意味着获得牛津或柯林斯完整商业词典授权。 |
| Open English WordNet 2025+ | [OEWN 下载页](https://en-word.net/downloads)，Open English WordNet community，派生自 Princeton WordNet；CC BY 4.0 | 最新已发布的英语语义主库；本地 SQLite 为格式转换，保留原始定义和词汇关系。 |
| Princeton WordNet 3.0、OMW 1.4 | [NLTK 官方数据索引](https://raw.githubusercontent.com/nltk/nltk_data/gh-pages/index.xml)，Princeton WordNet 原许可、OMW 各组件原许可（均在源压缩包内） | 中文义项的版本兼容映射及既有词法功能依赖。新版 OEWN 不复用其 offset；仅定义精确匹配时继承 OMW 中文义项。 |
| 公版韦氏 1913 | [Gutenberg 29765](https://www.gutenberg.org/ebooks/29765)，[JSON 来源](https://github.com/ssvivian/WebstersDictionary)；许可说明参见上游来源 | 仅历史版查阅。源 JSON 已与当前上游逐文件哈希核对；不能描述为现代 Merriam-Webster 的最新内容。 |

本机真人录音的逐条署名和许可继续见 `PRONUNCIATION-NOTICES.md` 及录音索引。本次不下载或使用未经授权的商业词典。

## 模型来源

混元模型：腾讯 [Hy-MT2-1.8B-GGUF](https://huggingface.co/tencent/Hy-MT2-1.8B-GGUF)，Apache-2.0；版本和上游校验见 hunyuan-resources.json。模型上游许可链接见该仓库文件页。

Argos 模型：来源与版本见各模型 metadata.json 和 [Argos 模型索引](https://github.com/argosopentech/argospm-index)。发布前逐项核对索引及模型上游许可、署名要求；不要因应用代码许可推定数据许可。此处不额外保存独立许可证副本。
