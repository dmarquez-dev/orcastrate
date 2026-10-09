<#
.SYNOPSIS
  Prepares the Electron hand-run: backs up your real settings, seeds synthetic
  fixtures, and prints exactly what it did.

.DESCRIPTION
  SAFETY MODEL. This script touches your REAL ~/.claude. It obeys three rules:

    1. It CREATES and it COPIES. It never deletes anything.
    2. Everything it creates is named `oc-test-*` or lives under C:\oc-test\.
       Teardown removes only those names.
    3. It refuses to run twice without -Force, so a re-run cannot clobber a
       backup taken from an already-modified file.

  Run from anywhere. Run teardown.ps1 when the hand-run is finished.
#>
[CmdletBinding()]
param(
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

$ClaudeHome  = Join-Path $env:USERPROFILE '.claude'
$FixtureRoot = Join-Path $PSScriptRoot 'fixtures'
$StateFile   = Join-Path $PSScriptRoot '.handrun-state.json'
$BlockedRepo = 'C:\oc-test\blocked-repo'
$PlainRepo   = 'C:\oc-test\plain-repo'

# The Pod-blocking fixture's directory name is the ENCODING of the Pod cwd:
#   encodeCwdForProjects = cwd.replace(/[^A-Za-z0-9]/g, '-')
# C:\oc-test\blocked-repo  ->  C--oc-test-blocked-repo
# Its lossy DECODE is C:\oc\test\blocked\repo, which is NOT the real path --
# that mismatch is the entire point of the test.
$EncodedBlocked = ($BlockedRepo -replace '[^A-Za-z0-9]', '-')
$DecodedGuess   = 'C:\oc\test\blocked\repo'

Write-Host ''
Write-Host '=== Orcastrate Electron hand-run: setup ===' -ForegroundColor Cyan
Write-Host ''

if (-not (Test-Path $ClaudeHome)) {
    throw "No Claude Code home at $ClaudeHome. Run Claude Code at least once first."
}
if ((Test-Path $StateFile) -and -not $Force) {
    throw "Setup has already run (see $StateFile). Run teardown.ps1 first, or pass -Force."
}
if (-not (Test-Path $FixtureRoot)) {
    throw "Fixtures directory missing: $FixtureRoot"
}

$stamp   = Get-Date -Format 'yyyyMMdd-HHmmss'
$created = [System.Collections.Generic.List[string]]::new()
$state   = [ordered]@{
    createdAt      = (Get-Date).ToString('o')
    claudeHome     = $ClaudeHome
    encodedBlocked = $EncodedBlocked
    decodedGuess   = $DecodedGuess
    blockedRepo    = $BlockedRepo
    plainRepo      = $PlainRepo
    backups        = [ordered]@{}
    created        = @()
}

# ---------------------------------------------------------------- 1. backups
Write-Host '[1/4] Backing up your real settings files' -ForegroundColor Yellow

foreach ($name in @('settings.json', 'settings.local.json')) {
    $live = Join-Path $ClaudeHome $name
    if (Test-Path $live) {
        $backup = Join-Path $PSScriptRoot "backup-$name.$stamp.bak"
        Copy-Item -LiteralPath $live -Destination $backup -Force
        $state.backups[$name] = $backup
        Write-Host "      backed up $name -> $(Split-Path $backup -Leaf)"
    } else {
        $state.backups[$name] = $null
        Write-Host "      $name does not exist (noted; teardown will remove it if the run creates one)"
    }
}

# ------------------------------------------------------- 2. real directories
Write-Host '[2/4] Creating throwaway project directories' -ForegroundColor Yellow

foreach ($dir in @($BlockedRepo, $PlainRepo)) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        $created.Add($dir)
        Write-Host "      created $dir"
    } else {
        Write-Host "      $dir already exists (left alone)"
    }
}
# A file each, so the directories are not empty and a Pod has something to see.
foreach ($pair in @(@($BlockedRepo, 'README.md'), @($PlainRepo, 'README.md'))) {
    $f = Join-Path $pair[0] $pair[1]
    if (-not (Test-Path $f)) {
        Set-Content -LiteralPath $f -Value "# Orcastrate hand-run throwaway`nSafe to delete.`n" -Encoding utf8
    }
}

# ------------------------------------------------- 3. Beachcomber fixtures
Write-Host '[3/4] Seeding Beachcomber fixtures (all named oc-test-* or the encoded pair)' -ForegroundColor Yellow

function New-ProjectsEntry {
    param(
        [Parameter(Mandatory)][string]$DirName,
        [string]$RecordedCwd,          # $null => no cwd in the transcript
        [int]$SessionCount = 1,
        [int]$PadKb = 0
    )
    $dir = Join-Path (Join-Path $ClaudeHome 'projects') $DirName
    if (Test-Path $dir) {
        Write-Host "      SKIP projects\$DirName (already exists -- not overwriting)" -ForegroundColor DarkYellow
        return
    }
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
    $script:created.Add($dir)

    for ($i = 1; $i -le $SessionCount; $i++) {
        $lines = [System.Collections.Generic.List[string]]::new()
        # A leading record with NO cwd, to prove the reader skips to the first
        # cwd-bearing one rather than reading only line 1.
        $lines.Add('{"type":"summary","summary":"orcastrate hand-run fixture"}')
        if ($RecordedCwd) {
            $lines.Add((@{ type = 'user'; cwd = $RecordedCwd; sessionId = "oc-test-$i" } | ConvertTo-Json -Compress))
        } else {
            # Deliberately NO cwd anywhere -> pathSource falls back to the
            # decoded directory name, which is the guess the panel labels.
            $lines.Add('{"type":"user","sessionId":"oc-test-nocwd","message":"no cwd recorded here"}')
        }
        if ($PadKb -gt 0) {
            $filler = '{"type":"assistant","text":"' + ('x' * 1000) + '"}'
            for ($k = 0; $k -lt $PadKb; $k++) { $lines.Add($filler) }
        }
        Set-Content -LiteralPath (Join-Path $dir "oc-test-session-$i.jsonl") -Value ($lines -join "`n") -Encoding utf8
    }
    Write-Host "      projects\$DirName  ($SessionCount session file(s), cwd=$(if($RecordedCwd){$RecordedCwd}else{'<none>'}))"
}

# (a) THE POD-BLOCKING FIXTURE. Name is the encoding of $BlockedRepo and the
#     transcript records no cwd, so displayPath is the WRONG decoded guess.
#     Pre-C2 this entry would NOT have been blocked by a Pod at $BlockedRepo.
New-ProjectsEntry -DirName $EncodedBlocked -RecordedCwd $null -SessionCount 2

# (b) A recorded entry, blocked the old way, to prove the union still holds.
New-ProjectsEntry -DirName 'oc-test-recorded' -RecordedCwd $PlainRepo -SessionCount 1

# (c) A recorded entry whose cwd does NOT exist -> orphan marker.
New-ProjectsEntry -DirName 'oc-test-orphan' -RecordedCwd 'C:\oc-test\this-was-deleted' -SessionCount 1

# (d) A plain decoded-name entry with a bigger footprint, for the size column.
New-ProjectsEntry -DirName 'oc-test-bulky' -RecordedCwd $null -SessionCount 3 -PadKb 40

# (e) THE R4 GUARD. The SAME encoded name under a non-projects root. It must
#     NOT be blocked: the encoding comparison is gated on root === 'projects'
#     as well as on pathSource, and this is the half that would otherwise be
#     invisible.
foreach ($leaf in @('shell-snapshots', 'file-history', 'paste-cache')) {
    $root = Join-Path $ClaudeHome $leaf
    if (-not (Test-Path $root)) {
        New-Item -ItemType Directory -Path $root -Force | Out-Null
        $created.Add($root)
    }
    foreach ($entry in @($EncodedBlocked, 'oc-test-decoy')) {
        $target = Join-Path $root $entry
        if (Test-Path $target) {
            Write-Host "      SKIP $leaf\$entry (already exists)" -ForegroundColor DarkYellow
            continue
        }
        New-Item -ItemType Directory -Path $target -Force | Out-Null
        $created.Add($target)
        Set-Content -LiteralPath (Join-Path $target 'oc-test-payload.txt') `
                    -Value "orcastrate hand-run fixture`n" -Encoding utf8
        Write-Host "      $leaf\$entry"
    }
}

# ------------------------------------------------------- 4. Helm baseline
Write-Host '[4/4] Installing the Helm baseline settings file' -ForegroundColor Yellow

$baseline = Join-Path $FixtureRoot 'settings-baseline.json'
Copy-Item -LiteralPath $baseline -Destination (Join-Path $ClaudeHome 'settings.json') -Force
Write-Host "      ~/.claude/settings.json <- fixtures/settings-baseline.json"

$state.created = $created.ToArray()
$state | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $StateFile -Encoding utf8

Write-Host ''
Write-Host '=== Setup complete ===' -ForegroundColor Green
Write-Host ''
Write-Host 'Key facts the test plan depends on:' -ForegroundColor Cyan
Write-Host "  Pod cwd for the blocking test : $BlockedRepo"
Write-Host "  Its encoded directory name    : $EncodedBlocked"
Write-Host "  Its LOSSY decode (the guess)  : $DecodedGuess"
Write-Host ''
Write-Host '  Those two paths differ. That difference is what step E4 proves.' -ForegroundColor Cyan
Write-Host ''
Write-Host "State written to $StateFile"
Write-Host 'Now run:  npm run dev'
Write-Host ''
