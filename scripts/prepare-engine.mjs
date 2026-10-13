// 将已有运行库准备成独立资源附件；复用已发布模型和词库，不编译应用。
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assetUrl, prepareResourceAsset, writeReleaseCatalog } from './release-files.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const version = process.argv.find(value => value.startsWith('--version='))?.slice(10)
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) throw new Error('请指定新的 --version=1.0.1')
const current = JSON.parse(await fs.readFile(path.join(root, 'resource-catalog.json'), 'utf8'))
if (current.packages.some(item => item.id === 'engine')) throw new Error('引擎已加入清单，后续修改请使用 prepare-update')
if (current.version === version) throw new Error('不能覆盖已发布资源版本')
const catalog = structuredClone(current)
catalog.schemaVersion = 4
catalog.version = version
catalog.downloadBaseUrl = current.downloadBaseUrl.replace(/\/v[^/]+\/?$/, `/v${version}`)
if (catalog.downloadBaseUrl === current.downloadBaseUrl) throw new Error('请配置按版本保存的 Release 地址')
for (const item of catalog.packages) {
  item.version ||= current.version
  item.download.url = assetUrl(item.download, current)
  item.download.version ||= item.version
  item.download.files ||= structuredClone(item.files)
}
const files = []
async function enumerate(relative) {
  const info = await fs.lstat(path.join(root, 'data', relative))
  if (info.isSymbolicLink()) throw new Error(`引擎不接受符号链接：${relative}`)
  if (info.isDirectory()) {
    for (const name of (await fs.readdir(path.join(root, 'data', relative))).sort()) {
      if (name === '__pycache__' || /^(licen[cs]es?(?:\..*)?|.*-licen[cs]e\.txt)$/i.test(name)) continue
      await enumerate(`${relative}/${name}`)
    }
  } else if (!/\.(pyc|download)$/.test(relative)) files.push({ path: relative, size: info.size })
}
await enumerate('runtime/windows-x64/python')
// 少量空包标记文件也属于 Python 包结构，按零长度保留。
const descriptor = { asset: `engine-windows-x64-${version}.zip`, format: 'zip', version, size: 0,
  url: `${catalog.downloadBaseUrl}/engine-windows-x64-${version}.zip`, files: structuredClone(files) }
const engine = { id: 'engine', label: 'Windows 离线引擎', version,
  description: 'Python、NLTK、Argos 推理依赖和 llama CPU/Vulkan；首次使用离线功能下载一次，模型与词库另行选择。',
  download: descriptor, files }
catalog.packages.unshift(engine)
const destination = path.join(root, 'release-assets', version)
await prepareResourceAsset({ root, destination, descriptor, files })
await writeReleaseCatalog({ root, destination, catalog })
const installed = Object.fromEntries(catalog.packages.map(item => [item.id, { version: item.version }]))
await fs.writeFile(path.join(root, 'data', '.offline-resource-state.json'), JSON.stringify({ packages: installed }, null, 2) + '\n')
console.log(JSON.stringify({ version, engineFiles: files.length, engineMiB: Number((files.reduce((sum, file) => sum + file.size, 0) / 1024 ** 2).toFixed(2)), downloadMiB: Number((descriptor.size / 1024 ** 2).toFixed(2)), reused: current.packages.length }))
