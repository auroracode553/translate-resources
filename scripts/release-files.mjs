// 发布附件的文件操作，完整发布与增量发布共用。
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'

export const releaseDocuments = ['resource-catalog.json', 'SOURCES.md', 'dictionary-resources.json', 'hunyuan-resources.json']

export function validateResourcePath(relative) {
  if (!/^(models|nltk_data|argos-packages|runtime)\//.test(relative) || relative.split('/').some(part => !part || part === '..' || part === '.' || part.includes(':') || part.includes('\\'))) throw new Error('清单路径无效')
}

export function resourceDownloads(catalog) {
  return catalog.packages.flatMap(item => [item.download, ...(item.patches || [])])
}

export function assetUrl(descriptor, catalog) {
  return descriptor.url || `${catalog.downloadBaseUrl.replace(/\/$/, '')}/${descriptor.asset}`
}

export async function prepareResourceAsset({ root, destination, descriptor, files }) {
  if (!/^[a-zA-Z0-9._-]+$/.test(descriptor.asset)) throw new Error('附件名称无效')
  for (const file of files) {
    validateResourcePath(file.path)
    if ((await fs.stat(path.join(root, 'data', file.path))).size !== file.size) throw new Error(`资源已变更，请更新清单：${file.path}`)
  }
  await fs.mkdir(destination, { recursive: true })
  const target = path.join(destination, descriptor.asset)
  const temporary = target + '.download'
  try {
    if (descriptor.format === 'file') await fs.copyFile(path.join(root, 'data', files[0].path), temporary)
    else await new Promise((resolve, reject) => {
      const child = spawn(process.env.RESOURCE_PYTHON || (process.platform === 'win32' ? 'python' : 'python3'),
        ['-B', path.join(root, 'scripts', 'create-resource-zip.py'), path.join(root, 'data'), temporary], { stdio: ['pipe', 'inherit', 'inherit'], windowsHide: true })
      child.on('error', reject)
      child.on('exit', code => code === 0 ? resolve() : reject(new Error(`压缩失败：${descriptor.asset}`)))
      child.stdin.on('error', reject)
      child.stdin.end(JSON.stringify(files))
    })
    descriptor.size = (await fs.stat(temporary)).size
    if (descriptor.size >= 2 * 1024 ** 3) throw new Error(`附件达到 2 GiB 上限：${descriptor.asset}`)
    await fs.rename(temporary, target)
    console.log(`${descriptor.asset}：${(descriptor.size / 1024 ** 2).toFixed(2)} MiB`)
  } finally { await fs.rm(temporary, { force: true }) }
}

export async function writeReleaseCatalog({ root, destination, catalog, updateCurrent = true }) {
  await fs.writeFile(path.join(updateCurrent ? root : destination, 'resource-catalog.json'), JSON.stringify(catalog, null, 2) + '\n')
  for (const name of releaseDocuments) {
    if (!updateCurrent && name === 'resource-catalog.json') continue
    await fs.copyFile(path.join(root, name), path.join(destination, name))
  }
}
