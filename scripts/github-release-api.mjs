// GitHub API 与流式附件上传；凭据仅通过调用参数保存在内存中。
import https from 'node:https'
import { createReadStream } from 'node:fs'

export function createGithubReleaseApi({ token, repository }) {
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repository)) throw new Error('仓库名称无效')
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2026-03-10',
    'User-Agent': 'translate-resources-release',
  }

  async function request(route, { method = 'GET', body, allowNotFound = false } = {}) {
    const response = await fetch(`https://api.github.com/repos/${repository}${route}`, {
      method, headers: { ...headers, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(60000),
    })
    if (allowNotFound && response.status === 404) return null
    if (response.status === 204) return null
    const result = await response.json()
    if (!response.ok) throw new Error(`GitHub HTTP ${response.status}：${result.message || '请求失败'}`)
    return result
  }

  async function assets(releaseId) {
    const result = []
    for (let page = 1; ; page++) {
      const values = await request(`/releases/${releaseId}/assets?per_page=100&page=${page}`)
      result.push(...values)
      if (values.length < 100) return result
    }
  }

  function upload(uploadUrl, file, onProgress) {
    const url = new URL(uploadUrl.replace(/\{.*\}$/, ''))
    if (url.protocol !== 'https:' || url.hostname !== 'uploads.github.com') throw new Error('上传地址不属于 GitHub')
    url.searchParams.set('name', file.name)
    return new Promise((resolve, reject) => {
      let stream
      let sent = 0
      const request = https.request(url, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/octet-stream', 'Content-Length': file.size },
      }, response => {
        let text = ''
        response.setEncoding('utf8')
        response.on('data', chunk => { text += chunk })
        response.on('error', reject)
        response.on('end', () => {
          try {
            const value = JSON.parse(text)
            if (response.statusCode !== 201) throw new Error(`附件上传 HTTP ${response.statusCode}：${value.message || '失败'}`)
            if (value.state !== 'uploaded' || value.size !== file.size) throw new Error('GitHub 返回的附件大小或状态不符')
            resolve(value)
          } catch (error) { stream?.destroy(); request.destroy(); reject(error) }
        })
      })
      request.setTimeout(120000, () => request.destroy(new Error('上传连接两分钟无数据，停止本次尝试')))
      request.on('error', error => { stream?.destroy(); reject(error) })
      stream = createReadStream(file.path)
      stream.on('error', error => request.destroy(error))
      stream.on('data', chunk => { sent += chunk.length; onProgress(sent) })
      stream.pipe(request)
    })
  }
  return { request, assets, upload }
}
