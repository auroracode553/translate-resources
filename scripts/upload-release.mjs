// 只上传已准备好的资源附件；不编译、不打包、不推送 Git 源码。
import fs from 'node:fs/promises'
import path from 'node:path'
import readline from 'node:readline'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { createGithubReleaseApi } from './github-release-api.mjs'
import { assetUrl, resourceDownloads, releaseDocuments } from './release-files.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repositoryArgument = process.argv.find(value => value.startsWith('--repository='))
const repository = repositoryArgument?.slice('--repository='.length)
const replaceDraft = process.argv.includes('--replace-draft')
if (!repository) throw new Error('请用 --repository=OWNER/REPOSITORY 指定仓库')
let token = process.env.GH_TOKEN || ''
if (!token) {
  console.log('等待本次 GitHub 认证（输入不回显）。')
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true)
    process.stdin.resume()
    token = await new Promise((resolve, reject) => {
      let value = ''
      const restore = () => {
        process.stdin.off('data', receive)
        process.stdin.setRawMode(false)
        process.stdin.pause()
      }
      const receive = data => {
        value += data.toString('utf8')
        if (value.includes('\u0003')) { restore(); reject(new Error('已取消认证')); return }
        if (/[\r\n]/.test(value)) { restore(); resolve(value.split(/[\r\n]/)[0].trim()) }
      }
      process.stdin.on('data', receive)
    })
  } else {
    const input = readline.createInterface({ input: process.stdin, terminal: false })
    token = String((await Promise.race([
      once(input, 'line').then(value => value[0]),
      once(input, 'close').then(() => { throw new Error('标准输入已关闭，请提供本次凭据') }),
    ]))).trim()
    input.close()
  }
}
if (!token) throw new Error('未提供 GitHub token')
const api = createGithubReleaseApi({ token, repository })
const catalog = JSON.parse(await fs.readFile(path.join(root, 'resource-catalog.json'), 'utf8'))
const tag = `v${catalog.version}`
const baseUrl = `https://github.com/${repository}/releases/download/${tag}`
if (catalog.downloadBaseUrl !== baseUrl) throw new Error('清单下载地址与本次发布仓库/版本不一致')
const expectedNames = [
  ...resourceDownloads(catalog).filter(descriptor => assetUrl(descriptor, catalog) === `${baseUrl}/${descriptor.asset}`).map(descriptor => ({ name: descriptor.asset, size: descriptor.size })),
  ...releaseDocuments.map(name => ({ name })),
]
const reused = resourceDownloads(catalog).filter(descriptor => assetUrl(descriptor, catalog) !== `${baseUrl}/${descriptor.asset}`)
const files = []
for (const item of expectedNames) {
  if (path.basename(item.name) !== item.name) throw new Error('附件名称无效')
  const filename = path.join(root, 'release-assets', catalog.version, item.name)
  const info = await fs.stat(filename)
  if (!info.isFile() || info.size >= 2 * 1024 ** 3 || (item.size !== undefined && item.size !== info.size)) throw new Error(`附件大小无效：${item.name}`)
  files.push({ name: item.name, size: info.size, path: filename })
}
files.sort((left, right) => left.size - right.size)
const body = [
  `译境离线资源 ${catalog.version}，包含混元 Hy-MT2、Argos 中英双向模型及全部语言词库。`,
  '', '资源按能力分组：Windows 离线引擎、混元 GGUF 模型、英文语言包、中文语言包、Argos 中英双向备用模型。',
  '语言包和 Argos 包为 ZIP，保留原目录结构，解压到资源根目录；应用设置也可以下载后自动解压。完整离线功能请取得全部资源组。',
  `本次仅上传 ${files.length - releaseDocuments.length} 个新增资源附件，复用 ${reused.length} 个旧版本附件。应用根据清单安装基准与必要补丁，无需重复下载未变化资源。`,
  '', `清单：${baseUrl}/resource-catalog.json`,
  `附件下载基础地址：${baseUrl}`,
  '', '来源、版本及上游许可链接见 SOURCES.md、dictionary-resources.json 和 hunyuan-resources.json。',
].join('\n')
let progressTimer
try {
  const repo = await api.request('')
  const referenced = new Map()
  for (const descriptor of reused) {
    const url = new URL(assetUrl(descriptor, catalog))
    const prefix = `/${repository}/releases/download/`
    if (url.protocol !== 'https:' || url.hostname !== 'github.com' || !url.pathname.startsWith(prefix)) throw new Error('发布复用附件时，需引用本仓库已发布的 GitHub Release')
    const [oldTag, name] = url.pathname.slice(prefix.length).split('/').map(decodeURIComponent)
    if (!referenced.has(oldTag)) {
      const prior = await api.request(`/releases/tags/${encodeURIComponent(oldTag)}`)
      if (prior.draft) throw new Error(`引用的基准版本尚未发布：${oldTag}`)
      referenced.set(oldTag, await api.assets(prior.id))
    }
    const priorAsset = referenced.get(oldTag).find(asset => asset.name === name)
    if (priorAsset?.state !== 'uploaded' || priorAsset.size !== descriptor.size) throw new Error(`旧附件不可用：${name}`)
  }
  let release = await api.request(`/releases/tags/${encodeURIComponent(tag)}`, { allowNotFound: true })
  if (!release) release = (await api.request('/releases?per_page=100')).find(item => item.tag_name === tag)
  if (!release) release = await api.request('/releases', { method: 'POST', body: {
    tag_name: tag, target_commitish: repo.default_branch, name: `译境离线资源 ${catalog.version}`, body, draft: true, prerelease: false,
  } })
  console.log(JSON.stringify({ phase: 'release-ready', tag, url: release.html_url, draft: release.draft, files: files.length }))
  let initialAssets = await api.assets(release.id)
  if (replaceDraft) {
    if (!release.draft) throw new Error('只允许重整未发布的草稿附件')
    for (const asset of initialAssets) {
      const file = files.find(item => item.name === asset.name)
      const legacy = /^(argos-packages|nltk_data|models)--/.test(asset.name)
      if (legacy || (file && (asset.state !== 'uploaded' || asset.size !== file.size))) {
        await api.request(`/releases/assets/${asset.id}`, { method: 'DELETE' })
        console.log(JSON.stringify({ phase: 'replaced-draft-asset', name: asset.name }))
      }
    }
    initialAssets = await api.assets(release.id)
  }
  const existing = new Map(initialAssets.map(item => [item.name, item]))
  let completed = 0
  let completedBytes = 0
  let next = 0
  let failure = null
  const current = new Map()
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0)
  progressTimer = setInterval(() => console.log(JSON.stringify({
    phase: 'progress', completed, total: files.length,
    sentGiB: Number(((completedBytes + [...current.values()].reduce((sum, item) => sum + item.sent, 0)) / 1024 ** 3).toFixed(3)),
    totalGiB: Number((totalBytes / 1024 ** 3).toFixed(3)),
    current: [...current.values()].map(item => ({ name: item.name, percent: Number((item.sent * 100 / item.size).toFixed(1)) })),
  })), 15000)

  async function uploadFile(file) {
    const prior = existing.get(file.name)
    if (prior?.state === 'uploaded' && prior.size === file.size) return
    if (prior) throw new Error(`已有同名附件与本地不一致，停止以避免覆盖：${file.name}`)
    let lastError
    for (let attempt = 1; attempt <= 3; attempt++) {
      current.set(file.name, { ...file, sent: 0 })
      try {
        await api.upload(release.upload_url, file, sent => { current.get(file.name).sent = sent })
        return
      } catch (error) {
        lastError = error
        const result = (await api.assets(release.id)).find(item => item.name === file.name)
        if (result?.state === 'uploaded' && result.size === file.size) return
        // GitHub 网络失败可能留下零字节 starter；只清理本次创建的失败附件。
        if (result?.state === 'starter' && result.size === 0 && !existing.has(file.name)) {
          await api.request(`/releases/assets/${result.id}`, { method: 'DELETE' }).catch(() => undefined)
        } else if (result) throw new Error(`附件上传失败且状态异常：${file.name}`)
        if (attempt < 3) {
          console.log(JSON.stringify({ phase: 'retry', name: file.name, attempt }))
          await new Promise(resolve => setTimeout(resolve, 2000 * attempt))
        }
      }
    }
    throw lastError
  }

  async function worker() {
    while (!failure && next < files.length) {
      const file = files[next++]
      try {
        await uploadFile(file)
        current.delete(file.name)
        completed++
        completedBytes += file.size
        console.log(JSON.stringify({ phase: 'uploaded', completed, total: files.length, name: file.name, bytes: file.size }))
      } catch (error) { current.delete(file.name); failure = error }
    }
  }
  await Promise.all(Array.from({ length: 4 }, () => worker()))
  if (failure) throw failure
  const uploaded = await api.assets(release.id)
  for (const file of files) {
    const remote = uploaded.find(item => item.name === file.name)
    if (remote?.state !== 'uploaded' || remote.size !== file.size) throw new Error(`发布前检查失败：${file.name}`)
  }
  release = await api.request(`/releases/${release.id}`, { method: 'PATCH', body: { draft: false, body } })
  console.log(JSON.stringify({ phase: 'published', url: release.html_url, tag, files: files.length, bytes: totalBytes, manifest: baseUrl + '/resource-catalog.json' }))
} catch (error) {
  console.error('上传未完成：' + String(error.message).replaceAll(token, '[REDACTED]'))
  process.exitCode = 1
} finally {
  clearInterval(progressTimer)
  token = ''
}
