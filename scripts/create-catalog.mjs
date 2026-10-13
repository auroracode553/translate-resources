// 按词条语言生成清单；附件压缩大小由 prepare-release 补全。
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const groups = [
  ['hunyuan', '混元 Hy-MT2 1.8B Q4_K_M', '正文翻译模型，支持现有全部语言。', ['models/hy-mt2/Hy-MT2-1.8B-Q4_K_M.gguf']],
  ['dictionary-en', '英文语言包', '英英、英汉释义、例句、词形、词源、语义关系和 WordNet 中文映射。', [
    'nltk_data/corpora/ecdict.zlib.sqlite', 'nltk_data/corpora/wiktionary-en-en.zlib.sqlite',
    'nltk_data/corpora/wiktionary-zh-en.zlib.sqlite', 'nltk_data/corpora/open-english-wordnet-2025.sqlite',
    'nltk_data/corpora/wordnet.zip', 'nltk_data/corpora/omw-1.4.zip', 'nltk_data/corpora/webster-1913.zlib.sqlite',
  ]],
  ['dictionary-zh', '中文语言包', '中文释义、例句、拼音和汉英译法；同时安装英文包可补全英文译法的反向释义。', [
    'nltk_data/corpora/wiktionary-zh-zh.zlib.sqlite', 'nltk_data/corpora/cedict.sqlite',
  ]],
  ['argos', 'Argos 中英双向备用模型', '保留英译中与中译英两个完整备用模型。', ['argos-packages']],
]

async function enumerate(relative) {
  const absolute = path.join(root, 'data', relative)
  const info = await fs.lstat(absolute)
  if (info.isSymbolicLink()) throw new Error(`不接受符号链接：${relative}`)
  if (info.isDirectory()) {
    const children = (await fs.readdir(absolute)).sort()
    const nested = await Promise.all(children.filter(name => !/^(licen[cs]e|.*-licen[cs]e\.txt)$/i.test(name) && name !== '__pycache__')
      .map(name => enumerate(`${relative}/${name}`)))
    return nested.flat()
  }
  if (/\.(download|pyc|lock)$/.test(relative)) return []
  return [{ path: relative, size: info.size }]
}

const metadata = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'))
const previous = await fs.readFile(path.join(root, 'resource-catalog.json'), 'utf8').then(JSON.parse).catch(() => ({}))
if (previous.schemaVersion >= 3 || (previous.version && previous.version !== metadata.version)) throw new Error('后续资源版本请使用 npm run prepare-update -- --version=... --files=...，避免重新生成全量附件')
const packages = []
for (const [id, label, description, files] of groups) {
  const members = (await Promise.all(files.map(enumerate))).flat()
  const format = id === 'hunyuan' ? 'file' : 'zip'
  const asset = format === 'file' ? path.basename(members[0].path) : `${id}-${metadata.version}.zip`
  const old = previous.packages?.find(item => item.id === id)
  const sameFiles = JSON.stringify(old?.files) === JSON.stringify(members)
  const size = format === 'file' ? members[0].size : sameFiles && old?.download?.asset === asset ? old.download.size : 0
  packages.push({ id, label, description, download: { asset, format, size }, files: members })
}
const catalog = { schemaVersion: 2, version: metadata.version, downloadBaseUrl: process.env.RESOURCE_DOWNLOAD_BASE_URL || previous.downloadBaseUrl || '', packages }
await fs.writeFile(path.join(root, 'resource-catalog.json'), JSON.stringify(catalog, null, 2) + '\n')
console.log(`已生成 ${packages.length} 组资源清单；资源文件不会提交到 Git。`)
