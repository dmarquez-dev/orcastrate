<#
.SYNOPSIS
  Restores your real settings and removes every fixture the hand-run created.

.DESCRIPTION
  Reads .handrun-state.json and undoes exactly what setup.ps1 recorded doing.

  It will ONLY delete paths that setup.ps1 recorded creating, and it re-checks
  each one against the oc-test naming rule before removing it. A path that does
  not match is reported and left alone -- if this script and reality disagree,
  reality wins.

  Run with -WhatIf to see the plan without doing anything.
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [switch]$KeepFixtures
)

$ErrorActionPreference = 'Stop'

$StateFile = Join-Path $PSScriptRoot '.handrun-state.json'

Write-Host ''
Write-Host '=== Orcastrate Electron hand-run: teardown ===' -ForegroundColor Cyan
Write-Host ''

if (-not (Test-Path $StateFile)) {
    throw "No $StateFile. Either setup.ps1 never ran, or teardown already completed."
}

$state = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json

# ------------------------------------------------------- 1. restore settings
Write-Host '[1/3] Restoring your real settings files' -ForegroundColor Yellow

foreach ($name in @('settings.json', 'settings.local.json')) {
    $live   = Join-Path $state.claudeHome $name
    $backup = $state.backups.$name

    if ($backup) {
        if (-not (Test-Path $backup)) {
            Write-Host "      !! backup missing for $name ($backup)" -ForegroundColor Red
            Write-Host "         LEAVING the current file in place. Restore by hand." -ForegroundColor Red
            continue
        }
        if ($PSCmdlet.ShouldProcess($live, "restore from $(Split-Path $backup -Leaf)")) {
            Copy-Item -LiteralPath $backup -Destination $live -Force
            Write-Host "      restored $name"
        }
    } else {
        # It did not exist before the run. If the run created one, it is ours.
        if (Test-Path $live) {
            if ($PSCmdlet.ShouldProcess($live, 'remove (did not exist before the run)')) {
                Remove-Item -LiteralPath $live -Force
                Write-Host "      removed $name (it did not exist before the run)"
            }
        } else {
            Write-Host "      $name still absent, as before the run"
        }
    }
}

# --------------------------------------------------------- 2. remove fixtures
if ($KeepFixtures) {
    Write-Host '[2/3] -KeepFixtures given: leaving all seeded directories in place' -ForegroundColor Yellow
} else {
    Write-Host '[2/3] Removing seeded fixtures' -ForegroundColor Yellow

    # Guardrail: a recorded path is only removable if it is under C:\oc-test\,
    # or its leaf name is oc-test-* , or its leaf is the encoded blocked name.
    function Test-Removable {
        param([string]$Path)
        $leaf = Split-Path $Path -Leaf
        if ($Path -like 'C:\oc-test\*' -or $Path -eq 'C:\oc-test') { return $true }
        if ($leaf -like 'oc-test-*')                                { return $true }
        if ($leaf -eq $state.encodedBlocked)                        { return $true }
        return $false
    }

    # Deepest first, so a parent is never removed before its children are gone.
    $ordered = @($state.created) | Sort-Object -Property Length -Descending

    foreach ($path in $ordered) {
        if (-not (Test-Path $path)) { continue }

        if (-not (Test-Removable $path)) {
            Write-Host "      REFUSED (name does not match the fixture rule): $path" -ForegroundColor Red
            continue
        }
        # Never remove a root that setup only ensured-exists and that now holds
        # entries we did not create.
        $leaf = Split-Path $path -Leaf
        if ($leaf -in @('shell-snapshots', 'file-history', 'paste-cache', 'projects')) {
            Write-Host "      SKIP root directory $leaf (never removed by teardown)" -ForegroundColor DarkYellow
            continue
        }

        if ($PSCmdlet.ShouldProcess($path, 'remove')) {
            Remove-Item -LiteralPath $path -Recurse -Force
            Write-Host "      removed $path"
        }
    }

    if ((Test-Path 'C:\oc-test') -and $PSCmdlet.ShouldProcess('C:\oc-test', 'remove if empty')) {
        if (-not (Get-ChildItem -LiteralPath 'C:\oc-test' -Force)) {
            Remove-Item -LiteralPath 'C:\oc-test' -Force
            Write-Host '      removed C:\oc-test (empty)'
        } else {
            Write-Host '      C:\oc-test still has contents; left in place' -ForegroundColor DarkYellow
        }
    }
}

# ------------------------------------------------------------- 3. leftovers
Write-Host '[3/3] Checking for leftovers the run may have produced' -ForegroundColor Yellow

$backupsLeft = Get-ChildItem -LiteralPath $state.claudeHome -Filter 'settings.json.*.bak' -ErrorAction SilentlyContinue
if ($backupsLeft) {
    Write-Host "      Helm wrote $($backupsLeft.Count) backup file(s) beside your settings:" -ForegroundColor Cyan
    $backupsLeft | ForEach-Object { Write-Host "        $($_.Name)" }
    Write-Host '      These are Helm''s own output and are EVIDENCE. Delete them yourself once' -ForegroundColor Cyan
    Write-Host '      you have recorded the results; teardown will not touch them.' -ForegroundColor Cyan
} else {
    Write-Host '      No Helm backup files found beside your settings.'
}

Write-Host ''
Write-Host 'Recycle bin: anything Beachcomber moved is still recoverable there.' -ForegroundColor Cyan
Write-Host 'Teardown does not empty it and does not restore from it.'
Write-Host ''

if (-not $WhatIfPreference) {
    Rename-Item -LiteralPath $StateFile -NewName ".handrun-state.done.$(Get-Date -Format 'yyyyMMdd-HHmmss').json"
    Write-Host '=== Teardown complete ===' -ForegroundColor Green
} else {
    Write-Host '=== -WhatIf: nothing was changed ===' -ForegroundColor Green
}
Write-Host ''
