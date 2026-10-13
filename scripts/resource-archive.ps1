# 用 Windows 自带 ZIP 支持恢复清单里的文件，目标始终限定在资源目录内。
function Get-ResourcePath([string]$Root, [string]$Relative) {
    if ($Relative -notmatch '^(models|nltk_data|argos-packages|runtime)/' -or $Relative -match '(^|/)\.\.?(/|$)|[:\\]' -or $Relative.Contains('//')) { throw '资源路径无效' }
    $taskResolved = [IO.Path]::GetFullPath((Join-Path $Root $Relative))
    if (-not $taskResolved.StartsWith($Root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw '文件超出资源目录' }
    return $taskResolved
}

function Expand-ResourceArchive([string]$Archive, [string]$StagingRoot, [array]$Files) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $taskExpected = @{}
    foreach ($taskFile in $Files) {
        if ($taskExpected.ContainsKey($taskFile.path)) { throw '清单路径重复' }
        $taskExpected[$taskFile.path] = $taskFile.size
    }
    $taskZip = [IO.Compression.ZipFile]::OpenRead($Archive)
    try {
        if ($taskZip.Entries.Count -ne $Files.Count) { throw 'ZIP 文件与清单不一致' }
        $taskSeen = @{}
        foreach ($taskEntry in $taskZip.Entries) {
            $taskName = $taskEntry.FullName
            if (-not $taskExpected.ContainsKey($taskName) -or $taskSeen.ContainsKey($taskName) -or $taskEntry.Length -ne $taskExpected[$taskName] -or (($taskEntry.ExternalAttributes -shr 16) -band 61440) -eq 40960) { throw 'ZIP 条目无效' }
            $taskSeen[$taskName] = $true
            $taskTarget = Get-ResourcePath $StagingRoot $taskName
            New-Item -ItemType Directory -Path (Split-Path $taskTarget -Parent) -Force | Out-Null
            $taskSourceStream = $taskEntry.Open()
            try {
                $taskTargetStream = [IO.File]::Open($taskTarget, [IO.FileMode]::CreateNew)
                try { $taskSourceStream.CopyTo($taskTargetStream) } finally { $taskTargetStream.Dispose() }
            } finally { $taskSourceStream.Dispose() }
            if ((Get-Item -LiteralPath $taskTarget).Length -ne $taskExpected[$taskName]) { throw '文件解压不完整' }
        }
    } finally { $taskZip.Dispose() }
}
