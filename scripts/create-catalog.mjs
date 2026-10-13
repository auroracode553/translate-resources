// 从本地资源生成版本、路径和大小清单，不压缩、不联网、不发布。
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const groups = [
  ['hunyuan', '混元 Hy-MT2 1.8B Q4_K_M', ['models/hy-mt2/Hy-MT2-1.8B-Q4_K_M.gguf']],
  ['ecdict', 'ECDICT 英汉词库', ['nltk_data/corpora/ecdict.zlib.sqlite']],
  ['wiktionary-en', '英语维基词典', ['nltk_data/corpora/wiktionary-en-en.zlib.sqlite']],
  ['wiktionary-zh', '中文维基词典', ['nltk_data/corpora/wiktionary-zh-zh.zlib.sqlite', 'nltk_data/corpora/wiktionary-zh-en.zlib.sqlite']],
  ['wordnet', 'WordNet 语义词库与中文映射', ['nltk_data/corpora/open-english-wordnet-2025.sqlite', 'nltk_data/corpora/wordnet.zip', 'nltk_data/corpora/omw-1.4.zip']],
  ['cedict', 'CC-CEDICT 汉英词库', ['nltk_data/corpora/cedict.sqlite']],
  ['webster', '韦氏 1913 历史词库', ['nltk_data/corpora/webster-1913.zlib.sqlite']],
  ['argos', 'Argos 中英双向备用模型', ['argos-packages']],
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
  return [{ path: relative, asset: relative.replaceAll('/', '--'), size: info.size }]
}

const metadata = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'))
const previous = await fs.readFile(path.join(root, 'resource-catalog.json'), 'utf8').then(JSON.parse).catch(() => ({}))
const packages = []
for (const [id, label, files] of groups) {
  packages.push({ id, label, files: (await Promise.all(files.map(enumerate))).flat() })
}
const catalog = { schemaVersion: 1, version: metadata.version, downloadBaseUrl: process.env.RESOURCE_DOWNLOAD_BASE_URL || previous.downloadBaseUrl || '', packages }
await fs.writeFile(path.join(root, 'resource-catalog.json'), JSON.stringify(catalog, null, 2) + '\n')
console.log(`已生成 ${packages.length} 组资源清单；资源文件不会提交到 Git。`)
