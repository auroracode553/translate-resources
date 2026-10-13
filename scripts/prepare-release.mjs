// 准备四个资源附件；不编译应用、不联网、不上传。
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { prepareResourceAsset, writeReleaseCatalog, releaseDocuments } from './release-files.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const catalogPath = path.join(root, 'resource-catalog.json')
const catalog = JSON.parse(await fs.readFile(catalogPath, 'utf8'))
if (catalog.schemaVersion !== 2 || !catalog.downloadBaseUrl || new URL(catalog.downloadBaseUrl).protocol !== 'https:') throw new Error('请先生成清单并填写 HTTPS 发布地址')
const destination = path.join(root, 'release-assets', catalog.version)
await fs.mkdir(destination, { recursive: true })
for (const item of catalog.packages) {
  await prepareResourceAsset({ root, destination, descriptor: item.download, files: item.files })
}
await writeReleaseCatalog({ root, destination, catalog })
// 仅清理本版本准备目录中旧的派生附件；data 中原始资源始终保留。
const keep = new Set([...releaseDocuments, ...catalog.packages.map(item => item.download.asset)])
for (const entry of await fs.readdir(destination, { withFileTypes: true })) {
  if (entry.isFile() && !keep.has(entry.name)) await fs.unlink(path.join(destination, entry.name))
}
console.log(`已准备 ${catalog.packages.length} 个资源附件及来源清单：${destination}`)
