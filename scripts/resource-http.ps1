# GitHub 的公开附件经官方 API 下载，绕开网页域名连接不稳定的问题；不使用 Token。
function Invoke-ResourceHttp([Uri]$Uri, [hashtable]$Headers, [string]$OutFile = '') {
    Add-Type -AssemblyName System.Net.Http
    $taskHandler = [Net.Http.HttpClientHandler]::new()
    $taskHandler.UseProxy = $false
    $taskClient = [Net.Http.HttpClient]::new($taskHandler)
    $taskClient.Timeout = [TimeSpan]::FromSeconds(30)
    $taskClient.DefaultRequestHeaders.Add('User-Agent','translate-resources-download')
    foreach ($taskName in $Headers.Keys) { $taskClient.DefaultRequestHeaders.Add($taskName,[string]$Headers[$taskName]) }
    try {
        # 只限制连接和响应头等待；大文件正文按流读取，不占用几 GiB 内存。
        $taskResponse = $taskClient.GetAsync($Uri,[Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
        try {
            $taskResponse.EnsureSuccessStatusCode() | Out-Null
            if (-not $OutFile) { return $taskResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult() }
            $taskSource = $taskResponse.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
            try {
                $taskOutput = [IO.File]::Open($OutFile,[IO.FileMode]::Create)
                try { $taskSource.CopyTo($taskOutput) } finally { $taskOutput.Dispose() }
            } finally { $taskSource.Dispose() }
        } finally { $taskResponse.Dispose() }
    } finally { $taskClient.Dispose(); $taskHandler.Dispose() }
}

function Resolve-ResourceDownload([Uri]$Uri, [hashtable]$ReleaseCache) {
    $taskResolved = @{Uri=$Uri; Headers=@{}}
    if ($Uri.Host -ne 'github.com') { return $taskResolved }
    $taskIsLatest = $false
    if ($Uri.AbsolutePath -notmatch '^/([a-zA-Z0-9_.-]+)/([a-zA-Z0-9_.-]+)/releases/download/([^/]+)/([^/]+)$') {
        if ($Uri.AbsolutePath -notmatch '^/([a-zA-Z0-9_.-]+)/([a-zA-Z0-9_.-]+)/releases/latest/download/([^/]+)$') { return $taskResolved }
        $taskIsLatest = $true
    }
    $taskOwner = $Matches[1]
    $taskRepo = $Matches[2]
    $taskTag = if ($taskIsLatest) { 'latest' } else { $Matches[3] }
    $taskName = [Uri]::UnescapeDataString($(if ($taskIsLatest) { $Matches[3] } else { $Matches[4] }))
    $taskKey = "$taskOwner/$taskRepo/$taskTag"
    if (-not $ReleaseCache.ContainsKey($taskKey)) {
        $taskRoute = if ($taskIsLatest) { 'latest' } else { 'tags/' + $taskTag }
        $taskReleaseUri = "https://api.github.com/repos/$taskOwner/$taskRepo/releases/$taskRoute"
        $taskRelease = Invoke-ResourceHttp ([Uri]$taskReleaseUri) @{Accept='application/vnd.github+json'} | ConvertFrom-Json
        $ReleaseCache[$taskKey] = $taskRelease.assets
    }
    $taskAsset = $ReleaseCache[$taskKey] | Where-Object { $_.name -eq $taskName -and $_.state -eq 'uploaded' } | Select-Object -First 1
    if (-not $taskAsset) { throw ('未找到已发布附件：' + $taskName) }
    $taskApiUri = [Uri]$taskAsset.url
    if ($taskApiUri.Scheme -ne 'https' -or $taskApiUri.Host -ne 'api.github.com') { throw 'GitHub 附件接口地址无效' }
    return @{Uri=$taskApiUri; Headers=@{Accept='application/octet-stream'}}
}
