<#
.SYNOPSIS
  Inspects on-disk state after the hand-run and prints a report to paste back.

.DESCRIPTION
  READ-ONLY. This script changes nothing. Run it BEFORE teardown.ps1, while
  the evidence is still on disk.

  It answers the questions a human cannot reliably eyeball:
    - did Helm actually write the file, and is the result valid JSON?
    - how many backups did it take, are their names distinct, and does each
      hold a DIFFERENT payload (the C2 same-millisecond fix)?
    - which fixtures survived, and which did Beachcomber move out?
    - is the blocking fixture still present (it must be, if blocking worked)?

  Pipe it to a file and paste that into the session:
      .\evaluate.ps1 | Tee-Object -FilePath .\evaluate-output.txt
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$StateFile = Join-Path $PSScriptRoot '.handrun-state.json'
if (-not (Test-Path $StateFile)) { throw "No $StateFile. Run setup.ps1 first." }
$state = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json

$ClaudeHome = $state.claudeHome
$line = ('-' * 70)

function Write-Section { param([string]$T) Write-Host ''; Write-Host $T -ForegroundColor Cyan; Write-Host $line }

Write-Host ''
Write-Host '=== Orcastrate Electron hand-run: evaluation ===' -ForegroundColor Green
Write-Host "Generated  : $((Get-Date).ToString('o'))"
Write-Host "Claude home: $ClaudeHome"

# ------------------------------------------------------------- settings.json
Write-Section 'A. Helm write path -- did it write, and is the result sane?'

$live = Join-Path $ClaudeHome 'settings.json'
if (-not (Test-Path $live)) {
    Write-Host 'settings.json : MISSING  <-- unexpected; Helm should never delete it' -ForegroundColor Red
} else {
    $raw = Get-Content -LiteralPath $live -Raw
    Write-Host "settings.json : present, $($raw.Length) bytes"
    try {
        $parsed = $raw | ConvertFrom-Json
        Write-Host 'parses as JSON: YES'
        Write-Host "top-level keys: $(($parsed.PSObject.Properties.Name) -join ', ')"
        $marker = $parsed.env.OC_HANDRUN
        Write-Host "env.OC_HANDRUN: $(if ($null -ne $marker) { $marker } else { '<absent>' })"
        Write-Host '  (baseline seeded this as "baseline"; a different value means Helm wrote)'
        # Trailing newline is part of the serializer's contract.
        $endsWithNewline = $raw.EndsWith("`n")
        Write-Host "ends with newline: $(if ($endsWithNewline) { 'YES' } else { 'NO  <-- serializer appends one' })"
    } catch {
        Write-Host "parses as JSON: NO  <-- $($_.Exception.Message)" -ForegroundColor Red
        Write-Host '  If you deliberately left a malformed file in place, this is expected.'
    }
}

# ----------------------------------------------------------------- backups
Write-Section 'B. Helm backups -- distinctness is the C2 same-millisecond fix'

$backups = @(Get-ChildItem -LiteralPath $ClaudeHome -Filter 'settings.json.*.bak' -ErrorAction SilentlyContinue |
             Sort-Object Name)

if ($backups.Count -eq 0) {
    Write-Host 'No Helm backup files found.'
    Write-Host '  Expected at least one if you saved over an EXISTING settings.json.'
    Write-Host '  (A save that CREATES the file takes no backup -- that is correct.)'
} else {
    Write-Host "Backup count : $($backups.Count)"
    Write-Host ''
    $rows = foreach ($b in $backups) {
        $content = Get-Content -LiteralPath $b.FullName -Raw
        $sha = (Get-FileHash -LiteralPath $b.FullName -Algorithm SHA256).Hash
        [pscustomobject]@{
            Name     = $b.Name
            Bytes    = $b.Length
            Sha8     = $sha.Substring(0, 8)
            Suffixed = if ($b.Name -match '\.\d+\.bak$') { 'yes' } else { 'no' }
            Marker   = try { ($content | ConvertFrom-Json).env.OC_HANDRUN } catch { '<unparseable>' }
        }
    }
    $rows | Format-Table -AutoSize | Out-String | Write-Host

    $distinctNames = ($backups.Name | Select-Object -Unique).Count
    $distinctShas  = ($rows.Sha8    | Select-Object -Unique).Count
    Write-Host "Distinct names   : $distinctNames of $($backups.Count)"
    Write-Host "Distinct payloads: $distinctShas of $($backups.Count)"
    if ($distinctNames -lt $backups.Count) {
        Write-Host 'NAME COLLISION -- this is the defect C2 fixed. Report it.' -ForegroundColor Red
    }
    if ($rows | Where-Object Suffixed -eq 'yes') {
        Write-Host ''
        Write-Host 'At least one backup carries a .N. ordinal suffix -- that is the' -ForegroundColor Green
        Write-Host 'same-millisecond collision path firing. Worth noting in results.' -ForegroundColor Green
    }
}

# -------------------------------------------------------- beachcomber state
Write-Section 'C. Beachcomber fixtures -- what survived, what was moved out'

$expected = @(
    @{ Root = 'projects';        Name = $state.encodedBlocked; Note = 'POD-BLOCKED fixture -- must SURVIVE if blocking worked' },
    @{ Root = 'projects';        Name = 'oc-test-recorded';    Note = 'recorded cwd' },
    @{ Root = 'projects';        Name = 'oc-test-orphan';      Note = 'orphan marker' },
    @{ Root = 'projects';        Name = 'oc-test-bulky';       Note = 'size column' },
    @{ Root = 'shell-snapshots'; Name = $state.encodedBlocked; Note = 'R4 guard -- same name, non-projects root' },
    @{ Root = 'shell-snapshots'; Name = 'oc-test-decoy';       Note = 'plain decoy' },
    @{ Root = 'file-history';    Name = $state.encodedBlocked; Note = 'R4 guard' },
    @{ Root = 'file-history';    Name = 'oc-test-decoy';       Note = 'plain decoy' },
    @{ Root = 'paste-cache';     Name = $state.encodedBlocked; Note = 'R4 guard' },
    @{ Root = 'paste-cache';     Name = 'oc-test-decoy';       Note = 'plain decoy' }
)

$survived = 0; $gone = 0
$table = foreach ($e in $expected) {
    $p = Join-Path (Join-Path $ClaudeHome $e.Root) $e.Name
    $present = Test-Path $p
    if ($present) { $survived++ } else { $gone++ }
    [pscustomobject]@{
        Root    = $e.Root
        Entry   = $e.Name
        State   = if ($present) { 'present' } else { 'MOVED OUT' }
        Meaning = $e.Note
    }
}
$table | Format-Table -AutoSize -Wrap | Out-String | Write-Host
Write-Host "Present: $survived    Moved out: $gone"

$blockedPath = Join-Path (Join-Path $ClaudeHome 'projects') $state.encodedBlocked
Write-Host ''
if (Test-Path $blockedPath) {
    Write-Host 'The Pod-blocked projects fixture is STILL PRESENT.' -ForegroundColor Green
    Write-Host '  Consistent with blocking having worked -- but only meaningful if you'
    Write-Host '  actually tried to select it while a Pod held C:\oc-test\blocked-repo.'
} else {
    Write-Host 'The Pod-blocked projects fixture is GONE.' -ForegroundColor Red
    Write-Host '  If a Pod was running at C:\oc-test\blocked-repo when you trashed it,' -ForegroundColor Red
    Write-Host '  that is a SAFETY FAILURE and the most important finding of the run.' -ForegroundColor Red
    Write-Host '  Recover it from the recycle bin and record exactly what you did.' -ForegroundColor Red
}

# --------------------------------------------------------------- reference
Write-Section 'D. Reference values the test plan asserts against'

Write-Host "Pod cwd            : $($state.blockedRepo)"
Write-Host "Encoded dir name   : $($state.encodedBlocked)"
Write-Host "Lossy decode/guess : $($state.decodedGuess)"
Write-Host ''
Write-Host 'In the Beachcomber row for the encoded entry, the path shown SHOULD be'
Write-Host 'the lossy decode (the guess), under a "Path not verified" notice that'
Write-Host 'appears ABOVE it. If the notice is below the path, T5 regressed.'

Write-Section 'E. Paste everything above into the session for evaluation'
Write-Host ''
