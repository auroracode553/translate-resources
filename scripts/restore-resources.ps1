param(
    [string]$BaseUrl = '',
    [string]$ManifestUrl = '',
    [string]$ManifestPath = '',
    [string]$LocalSource = '',
    [string[]]$Packages = @(),
    [switch]$List,
    [switch]$Plan
)
$ErrorActionPreference = 'Stop'
$taskRepository = Split-Path $PSScriptRoot -Parent
$taskDataRoot = [IO.Path]::GetFullPath((Join-Path $taskRepository 'data'))
. (Join-Path $PSScriptRoot 'resource-archive.ps1')
. (Join-Path $PSScriptRoot 'resource-download-plan.ps1')
. (Join-Path $PSScriptRoot 'resource-http.ps1')
$taskReleaseCache = @{}
$Packages = @($Packages | ForEach-Object { $_.Split(',') } | Where-Object { $_ })

function Get-HttpsUri([string]$Value) {
    $taskUri = [Uri]$Value
    if (-not $taskUri.IsAbsoluteUri -or $taskUri.Scheme -ne 'https' -or $taskUri.UserInfo) { throw '下载地址必须是 HTTPS' }
    return $taskUri
}

if ($ManifestUrl -and $ManifestPath) { throw '清单地址和清单路径只能指定一个' }
if ($ManifestUrl) {
    $taskManifestDownload = Resolve-ResourceDownload (Get-HttpsUri $ManifestUrl) $taskReleaseCache
    $taskManifestText = Invoke-ResourceHttp $taskManifestDownload.Uri $taskManifestDownload.Headers
    $taskCatalog = $taskManifestText | ConvertFrom-Json
} else {
    $taskCatalogPath = if ($ManifestPath) { $ManifestPath } else { Join-Path $taskRepository 'resource-catalog.json' }
    $taskCatalog = Get-Content -LiteralPath $taskCatalogPath -Raw -Encoding UTF8 | ConvertFrom-Json
}
if ($taskCatalog.schemaVersion -notin 1,2,3,4 -or -not $taskCatalog.packages) { throw '资源清单格式不兼容' }
foreach ($taskPackage in $taskCatalog.packages) {
    if (-not $taskPackage.files) { throw '资源分组为空' }
    foreach ($taskFile in $taskPackage.files) {
        Get-ResourcePath $taskDataRoot $taskFile.path | Out-Null
        if ($taskFile.size -lt 0) { throw '资源文件大小无效' }
        if ($taskCatalog.schemaVersion -eq 1 -and $taskFile.asset -notmatch '^[a-zA-Z0-9._-]+$') { throw '附件名称无效' }
    }
    if ($taskCatalog.schemaVersion -ge 2) {
        foreach ($taskDescriptor in @($taskPackage.download) + @($taskPackage.patches | Where-Object { $_ })) {
            if ($taskDescriptor.asset -notmatch '^[a-zA-Z0-9._-]+$' -or $taskDescriptor.format -notin 'file','zip' -or $taskDescriptor.size -le 0) { throw '资源包未准备完成' }
            if ($taskDescriptor.url) { Get-HttpsUri $taskDescriptor.url | Out-Null }
            foreach ($taskMember in @($taskDescriptor.files | Where-Object { $_ })) {
                Get-ResourcePath $taskDataRoot $taskMember.path | Out-Null
                if ($taskMember.path -notin $taskPackage.files.path -or $taskMember.size -lt 0) { throw '补丁资源文件无效' }
            }
        }
    }
}
if ($Packages.Count -and @($Packages | Where-Object { $_ -notin $taskCatalog.packages.id }).Count) { throw '存在未知资源分组' }
if ($List) {
    $taskCatalog.packages | Where-Object { -not $Packages.Count -or $_.id -in $Packages } | ForEach-Object {
        $taskInstalledSize = ($_.files | Measure-Object size -Sum).Sum
        $taskDownloadSize = if ($_.download) { $_.download.size } else { $taskInstalledSize }
        [PSCustomObject]@{Id=$_.id; Resource=$_.label; DownloadMiB=[math]::Round($taskDownloadSize / 1MB, 2); InstalledMiB=[math]::Round($taskInstalledSize / 1MB, 2)}
    }
    return
}
if ($Plan) {
    $taskVersions = Get-ResourceVersions $taskDataRoot
    foreach ($taskPackage in $taskCatalog.packages) {
        if ($Packages.Count -and $taskPackage.id -notin $Packages) { continue }
        foreach ($taskDescriptor in @(Get-ResourceDownloadPlan $taskDataRoot $taskPackage $taskCatalog.version $taskVersions[$taskPackage.id].version)) {
            [PSCustomObject]@{Resource=$taskPackage.label; Asset=$taskDescriptor.asset; MiB=[math]::Round($taskDescriptor.size / 1MB, 2)}
        }
    }
    return
}
if (-not $BaseUrl) { $BaseUrl = $taskCatalog.downloadBaseUrl }
if (-not $LocalSource -and -not $BaseUrl) { throw '请使用 -BaseUrl 指定已发布附件地址，或使用 -LocalSource 指定旧电脑拷贝的 data 目录' }
if (-not $LocalSource) { $taskBaseUri = Get-HttpsUri ($BaseUrl.TrimEnd('/') + '/') }
$taskDownloaded = 0
$taskSkipped = 0
$taskVersions = Get-ResourceVersions $taskDataRoot
foreach ($taskPackage in $taskCatalog.packages) {
    if ($Packages.Count -and $taskPackage.id -notin $Packages) { continue }
    $taskPackageVersion = if ($taskPackage.version) { $taskPackage.version } else { $taskCatalog.version }
    if (-not $LocalSource -and $taskCatalog.schemaVersion -ge 2) {
        $taskPlan = @(Get-ResourceDownloadPlan $taskDataRoot $taskPackage $taskCatalog.version $taskVersions[$taskPackage.id].version)
        if (-not $taskPlan.Count) { $taskSkipped += $taskPackage.files.Count; continue }
        foreach ($taskDescriptor in $taskPlan) {
        $taskWork = [IO.Path]::GetFullPath((Join-Path $taskDataRoot ('.resource-download-' + [Guid]::NewGuid().ToString('N'))))
        if (-not $taskWork.StartsWith($taskDataRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw '临时路径超出资源目录' }
        New-Item -ItemType Directory -Path $taskWork -Force | Out-Null
        try {
            $taskArchive = Join-Path $taskWork $taskDescriptor.asset
            $taskMembers = if ($taskDescriptor.files) { @($taskDescriptor.files) } else { @($taskPackage.files) }
            Write-Host ($taskPackage.label + '：' + $taskDescriptor.asset)
            $taskDownloadUri = if ($taskDescriptor.url -and -not $PSBoundParameters.ContainsKey('BaseUrl')) { Get-HttpsUri $taskDescriptor.url } elseif ($taskDescriptor.url -and $taskDescriptor.version) {
                Get-HttpsUri (($BaseUrl.TrimEnd('/') -replace '/v[^/]+$','') + '/v' + $taskDescriptor.version + '/' + $taskDescriptor.asset)
            } else { [Uri]::new($taskBaseUri, $taskDescriptor.asset) }
            $taskResolvedDownload = Resolve-ResourceDownload $taskDownloadUri $taskReleaseCache
            Invoke-ResourceHttp $taskResolvedDownload.Uri $taskResolvedDownload.Headers $taskArchive
            if ((Get-Item -LiteralPath $taskArchive).Length -ne $taskDescriptor.size) { throw '资源包下载不完整' }
            if ($taskDescriptor.format -eq 'zip') {
                $taskStaging = Join-Path $taskWork 'unpacked'
                Expand-ResourceArchive $taskArchive $taskStaging $taskMembers
                foreach ($taskFile in $taskMembers) {
                    $taskTarget = Get-ResourcePath $taskDataRoot $taskFile.path
                    New-Item -ItemType Directory -Path (Split-Path $taskTarget -Parent) -Force | Out-Null
                    Move-Item -LiteralPath (Get-ResourcePath $taskStaging $taskFile.path) -Destination $taskTarget -Force
                }
            } else {
                if ($taskMembers.Count -ne 1 -or $taskMembers[0].size -ne $taskDescriptor.size) { throw '模型附件清单无效' }
                $taskTarget = Get-ResourcePath $taskDataRoot $taskMembers[0].path
                New-Item -ItemType Directory -Path (Split-Path $taskTarget -Parent) -Force | Out-Null
                Move-Item -LiteralPath $taskArchive -Destination $taskTarget -Force
            }
            $taskDownloaded += $taskMembers.Count
        } finally {
            # 删除前再次确认绝对路径，仅清理本次 UUID 临时目录。
            if ($taskWork.StartsWith($taskDataRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $taskWork)) { Remove-Item -LiteralPath $taskWork -Recurse -Force }
        }
        }
        Save-ResourceVersion $taskDataRoot $taskPackage.id $taskPackageVersion
        continue
    }
    foreach ($taskFile in $taskPackage.files) {
        $taskTarget = Get-ResourcePath $taskDataRoot $taskFile.path
        if ((Test-Path -LiteralPath $taskTarget -PathType Leaf) -and (Get-Item -LiteralPath $taskTarget).Length -eq $taskFile.size -and (-not $taskPackage.patches -or $taskVersions[$taskPackage.id].version -eq $taskPackageVersion)) { $taskSkipped++; continue }
        New-Item -ItemType Directory -Path (Split-Path $taskTarget -Parent) -Force | Out-Null
        $taskTemporary = $taskTarget + '.' + [Guid]::NewGuid().ToString('N') + '.download'
        try {
            Write-Host ($taskPackage.label + '：' + $taskFile.path)
            if ($LocalSource) {
                Copy-Item -LiteralPath (Join-Path $LocalSource $taskFile.path) -Destination $taskTemporary
            } else {
                $taskResolvedDownload = Resolve-ResourceDownload ([Uri]::new($taskBaseUri, $taskFile.asset)) $taskReleaseCache
                Invoke-ResourceHttp $taskResolvedDownload.Uri $taskResolvedDownload.Headers $taskTemporary
            }
            if ((Get-Item -LiteralPath $taskTemporary).Length -ne $taskFile.size) { throw '文件未下载完整，请重试' }
            Move-Item -LiteralPath $taskTemporary -Destination $taskTarget -Force
            $taskDownloaded++
        } finally {
            if (Test-Path -LiteralPath $taskTemporary) { Remove-Item -LiteralPath $taskTemporary }
        }
    }
    Save-ResourceVersion $taskDataRoot $taskPackage.id $taskPackageVersion
}
Write-Host "资源已就绪：新增 $taskDownloaded 个文件，复用 $taskSkipped 个文件；目录 $taskDataRoot"
