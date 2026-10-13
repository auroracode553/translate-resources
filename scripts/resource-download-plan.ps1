# 资源版本与增量下载计划；不计算文件哈希。
function Get-ResourceVersions([string]$Root) {
    $taskVersions = @{}
    $taskStateFile = Join-Path $Root '.offline-resource-state.json'
    if (Test-Path -LiteralPath $taskStateFile) {
        $taskState = Get-Content -LiteralPath $taskStateFile -Raw -Encoding UTF8 | ConvertFrom-Json
        foreach ($taskProperty in $taskState.packages.PSObject.Properties) { $taskVersions[$taskProperty.Name] = $taskProperty.Value }
    }
    return $taskVersions
}

function Save-ResourceVersion([string]$Root, [string]$Id, [string]$Version) {
    $taskVersions = Get-ResourceVersions $Root
    $taskVersions[$Id] = @{version=$Version}
    New-Item -ItemType Directory -Path $Root -Force | Out-Null
    $taskStateFile = Join-Path $Root '.offline-resource-state.json'
    $taskStateTemporary = $taskStateFile + '.' + [Guid]::NewGuid().ToString('N') + '.download'
    try {
        @{packages=$taskVersions} | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $taskStateTemporary -Encoding UTF8
        Move-Item -LiteralPath $taskStateTemporary -Destination $taskStateFile -Force
    } finally { if (Test-Path -LiteralPath $taskStateTemporary) { Remove-Item -LiteralPath $taskStateTemporary } }
}

function Get-ResourceDownloadPlan([string]$Root, $Package, [string]$CatalogVersion, [string]$InstalledVersion) {
    $taskVersion = if ($Package.version) { $Package.version } else { $CatalogVersion }
    $taskStates = @{}
    foreach ($taskFile in $Package.files) {
        $taskPath = Get-ResourcePath $Root $taskFile.path
        $taskStates[$taskFile.path] = (Test-Path -LiteralPath $taskPath -PathType Leaf) -and (Get-Item -LiteralPath $taskPath).Length -eq $taskFile.size
    }
    $taskPatches = @($Package.patches | Where-Object { $_ })
    if (-not @($taskStates.Values | Where-Object { -not $_ }).Count -and ($InstalledVersion -eq $taskVersion -or (-not $InstalledVersion -and -not $taskPatches.Count))) { return }
    $taskBase = $Package.download
    $taskBaseVersion = if ($taskBase.version) { $taskBase.version } else { $taskVersion }
    if (-not $taskPatches.Count) { return $taskBase }
    $taskLatest = @()
    for ($taskIndex=0; $taskIndex -lt $taskPatches.Count; $taskIndex++) {
        $taskLaterPaths = @($taskPatches | Select-Object -Skip ($taskIndex+1) | ForEach-Object { $_.files.path })
        if (@($taskPatches[$taskIndex].files | Where-Object { $_.path -notin $taskLaterPaths }).Count) { $taskLatest += $taskPatches[$taskIndex] }
    }
    $taskPatchPaths = @($taskPatches | ForEach-Object { $_.files.path })
    if (@($Package.files | Where-Object { -not $taskStates[$_.path] -and $_.path -notin $taskPatchPaths }).Count) { return @($taskBase) + $taskLatest }
    $taskRevisions = @($taskBaseVersion) + @($taskPatches | ForEach-Object { $_.version })
    $taskRevisionIndex = [Array]::IndexOf($taskRevisions, $InstalledVersion)
    $taskPending = if ($taskRevisionIndex -ge 0) { @($taskPatches | Select-Object -Skip $taskRevisionIndex) } else { $taskPatches }
    foreach ($taskFile in $Package.files) {
        if ($taskStates[$taskFile.path]) { continue }
        $taskLast = @($taskPatches | Where-Object { @($_.files | Where-Object { $_.path -eq $taskFile.path -and $_.size -eq $taskFile.size }).Count } | Select-Object -Last 1)
        if (-not $taskLast.Count) { return @($taskBase) + $taskLatest }
        if ($taskLast[0] -notin $taskPending) { $taskPending += $taskLast[0] }
    }
    $taskAffected = @{}
    foreach ($taskPatch in $taskPatches) {
        if (($taskPatch -in $taskPending -and $taskPatch -in $taskLatest) -or @($taskPatch.files | Where-Object { $taskAffected.ContainsKey($_.path) }).Count) {
            foreach ($taskFile in $taskPatch.files) { $taskAffected[$taskFile.path] = $true }
            Write-Output $taskPatch
        }
    }
}
