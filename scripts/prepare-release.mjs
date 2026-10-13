// 显式运行时将资源复制成 Release 附件，不创建安装包、不上传。
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const catalog = JSON.parse(await fs.readFile(path.join(root, 'resource-catalog.json'), 'utf8'))
if (!catalog.downloadBaseUrl || new URL(catalog.downloadBaseUrl).protocol !== 'https:') throw new Error('发布前请在清单填写实际 HTTPS 附件基础地址')
const destination = path.join(root, 'release-assets', catalog.version)
await fs.mkdir(destination, { recursive: true })
for (const item of catalog.packages) {
  for (const file of item.files) {
    if (!/^(models|nltk_data|argos-packages)\//.test(file.path) || file.path.split('/').some(part => !part || part === '..' || part === '.' || part.includes(':') || part.includes('\\')) || !/^[a-zA-Z0-9._-]+$/.test(file.asset)) throw new Error('清单路径无效')
    if (file.size >= 2 * 1024 ** 3) throw new Error(`附件超过 2 GiB：${file.path}`)
    const source = path.join(root, 'data', file.path)
    if ((await fs.stat(source)).size !== file.size) throw new Error(`资源已变更，请先更新清单：${file.path}`)
    await fs.copyFile(source, path.join(destination, file.asset))
  }
}
for (const filename of ['resource-catalog.json', 'SOURCES.md', 'dictionary-resources.json', 'hunyuan-resources.json']) {
  await fs.copyFile(path.join(root, filename), path.join(destination, filename))
}
console.log(`附件已准备：${destination}；请审核后手动创建 Release 并上传。`)
