// 显式指定变更文件，只准备它们所属分组的补丁；未改资源固定引用旧 Release。
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assetUrl, prepareResourceAsset, validateResourcePath, writeReleaseCatalog } from './release-files.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3)
const version = option('version')
const selected = (option('files') || '').split(',').filter(Boolean)
const dryRun = process.argv.includes('--dry-run')
const preview = process.argv.includes('--preview')
if (!version || !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version) || !selected.length) throw new Error('请指定 --version=1.0.1 和 --files=相对路径,相对路径；--dry-run 只查看计划')
const current = JSON.parse(await fs.readFile(path.join(root, 'resource-catalog.json'), 'utf8'))
// 优先读不可变的已准备版本快照，避免本地重新生成清单覆盖基准文件大小。
const snapshot = path.join(root, 'release-assets', current.version, 'resource-catalog.json')
const baseline = await fs.readFile(snapshot, 'utf8').then(JSON.parse).catch(() => current)
if (![2, 3, 4].includes(baseline.schemaVersion) || version === baseline.version
  || baseline.packages.some(item => [item.version, item.download.version, ...(item.patches || []).map(patch => patch.version)].includes(version))) throw new Error('增量版本必须使用新的版本号')
const catalog = structuredClone(baseline)
catalog.schemaVersion = Math.max(3, baseline.schemaVersion)
catalog.version = version
catalog.downloadBaseUrl = baseline.downloadBaseUrl.replace(/\/v[^/]+\/?$/, `/v${version}`)
if (catalog.downloadBaseUrl === baseline.downloadBaseUrl) throw new Error('请先配置按版本保存的 Release 地址')
for (const item of catalog.packages) {
  item.version ||= baseline.version
  item.download.url = assetUrl(item.download, baseline)
  item.download.version ||= item.version
  item.download.files ||= structuredClone(item.files)
  for (const patch of item.patches || []) patch.url = assetUrl(patch, baseline)
}
for (const relative of selected) {
  validateResourcePath(relative)
  if (!catalog.packages.some(item => item.files.some(file => file.path === relative))) throw new Error(`未知资源文件：${relative}`)
}
const destination = path.join(root, 'release-assets', preview ? `.preview-${version}` : version)
const changes = []
for (const item of catalog.packages) {
  const changed = item.files.filter(file => selected.includes(file.path))
  if (!changed.length) continue
  for (const file of changed) file.size = (await fs.stat(path.join(root, 'data', file.path))).size
  item.version = version
  const descriptor = { asset: item.download.format === 'file' ? path.basename(changed[0].path) : `${item.id}-patch-${version}.zip`,
    format: item.download.format, version, size: 0, files: structuredClone(changed) }
  descriptor.url = `${catalog.downloadBaseUrl}/${descriptor.asset}`
  if (descriptor.format === 'file') item.download = descriptor
  else (item.patches ||= []).push(descriptor)
  changes.push({ id: item.id, descriptor, files: changed })
}
console.log(JSON.stringify({ version, baseVersion: baseline.version, dryRun, changed: changes.map(change => ({ package: change.id, asset: change.descriptor.asset, files: change.files.map(file => file.path), uncompressedMiB: Number((change.files.reduce((sum, file) => sum + file.size, 0) / 1024 ** 2).toFixed(2)) })), reusedPackages: catalog.packages.length - changes.length }, null, 2))
if (dryRun) process.exit(0)
for (const change of changes) await prepareResourceAsset({ root, destination, descriptor: change.descriptor, files: change.files })
await writeReleaseCatalog({ root, destination, catalog, updateCurrent: !preview })
// data 是本机正在编辑的当前版本，记录版本后开发应用仍可直接引用该目录。
const installed = Object.fromEntries(catalog.packages.map(item => [item.id, { version: item.version }]))
if (!preview) await fs.writeFile(path.join(root, 'data', '.offline-resource-state.json'), JSON.stringify({ packages: installed }, null, 2) + '\n')
console.log(`只准备 ${changes.length} 个变更附件，其余附件继续引用旧版本；尚未上传：${destination}`)
