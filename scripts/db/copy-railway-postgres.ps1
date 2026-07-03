$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Assert-CommandExists {
    param([Parameter(Mandatory = $true)][string]$Name)

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "PostgreSQL command line tools не найдены. Установите PostgreSQL для Windows и отметьте Command Line Tools."
    }
}

function Assert-ExternalRailwayUrl {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$ConnectionString
    )

    if ([string]::IsNullOrWhiteSpace($ConnectionString)) {
        throw "$Name не задан."
    }

    if ($ConnectionString -match 'railway\.internal') {
        throw "Нужен DATABASE_PUBLIC_URL через внешний Railway proxy, а не internal railway URL."
    }
}

function Invoke-SafePsql {
    param(
        [Parameter(Mandatory = $true)][string]$ConnectionString,
        [Parameter(Mandatory = $true)][string]$Sql
    )

    & psql $ConnectionString -At -c $Sql
    if ($LASTEXITCODE -ne 0) {
        throw 'PostgreSQL command failed.'
    }
}

function Get-TableCount {
    param(
        [Parameter(Mandatory = $true)][string]$ConnectionString,
        [Parameter(Mandatory = $true)][string]$TableName
    )

    $exists = Invoke-SafePsql -ConnectionString $ConnectionString -Sql "select to_regclass('public.$TableName') is not null;"
    $existsValue = ($exists | Select-Object -First 1).ToString().Trim()
    if ($existsValue -ne 't') {
        return $null
    }

    $count = Invoke-SafePsql -ConnectionString $ConnectionString -Sql "select count(*) from public.$TableName;"
    $countValue = ($count | Select-Object -First 1).ToString().Trim()
    return [int64]$countValue
}

Assert-CommandExists -Name 'pg_dump'
Assert-CommandExists -Name 'pg_restore'
Assert-CommandExists -Name 'psql'

Assert-ExternalRailwayUrl -Name 'OLD_DATABASE_URL' -ConnectionString $env:OLD_DATABASE_URL
Assert-ExternalRailwayUrl -Name 'NEW_DATABASE_URL' -ConnectionString $env:NEW_DATABASE_URL

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$backupsDir = Join-Path $repoRoot 'backups'
if (-not (Test-Path -LiteralPath $backupsDir)) {
    New-Item -ItemType Directory -Path $backupsDir | Out-Null
}

Write-Host 'Checking connection to old database...'
& psql $env:OLD_DATABASE_URL -c 'select now();'
if ($LASTEXITCODE -ne 0) {
    throw 'Failed to connect to old database.'
}

Write-Host 'Checking connection to new database...'
& psql $env:NEW_DATABASE_URL -c 'select now();'
if ($LASTEXITCODE -ne 0) {
    throw 'Failed to connect to new database.'
}

Write-Host 'Listing tables in old database...'
& psql $env:OLD_DATABASE_URL -c '\dt'
if ($LASTEXITCODE -ne 0) {
    throw 'Failed to list tables in old database.'
}

$timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$dumpPath = Join-Path $backupsDir "shifttracker_backup_$timestamp.dump"

Write-Host 'Creating dump of old database...'
& pg_dump -Fc --no-owner --no-acl --verbose -f $dumpPath $env:OLD_DATABASE_URL
if ($LASTEXITCODE -ne 0) {
    throw 'Failed to create dump.'
}

$confirmation = Read-Host 'Restore dump into NEW_DATABASE_URL? This can delete existing tables in the new database. Type YES to continue.'
if ($confirmation -ne 'YES') {
    Write-Host 'Copy cancelled.'
    exit 1
}

Write-Host 'Running restore into new database...'
& pg_restore --clean --if-exists --no-owner --no-acl --verbose -d $env:NEW_DATABASE_URL $dumpPath
if ($LASTEXITCODE -ne 0) {
    throw 'Failed to restore dump into new database.'
}

Write-Host 'Listing tables in new database...'
& psql $env:NEW_DATABASE_URL -c '\dt'
if ($LASTEXITCODE -ne 0) {
    throw 'Failed to list tables in new database.'
}

$tables = @('users', 'venues', 'shifts', 'expenses', 'audit_logs', 'adjustments')
$countLines = New-Object System.Collections.Generic.List[string]

foreach ($table in $tables) {
    $oldCount = Get-TableCount -ConnectionString $env:OLD_DATABASE_URL -TableName $table
    $newCount = Get-TableCount -ConnectionString $env:NEW_DATABASE_URL -TableName $table

    if ($null -eq $oldCount -or $null -eq $newCount) {
        $countLines.Add(("{0}: table not found, skipped" -f $table))
        continue
    }

    $status = if ($oldCount -eq $newCount) { 'OK' } else { 'MISMATCH' }
    $countLines.Add(("{0}: old={1} new={2} {3}" -f $table, $oldCount, $newCount, $status))
}

Write-Host ''
Write-Host 'Counts summary:'
foreach ($line in $countLines) {
    Write-Host $line
}

Write-Host ''
Write-Host "Dump file path: $dumpPath"
Write-Host 'Restore status: success'
Write-Host 'Next steps:'
Write-Host '1. In the new Railway app service, set DATABASE_URL to the new database.'
Write-Host '2. Prefer the reference variable form ${{ Postgres.DATABASE_URL }}.'
Write-Host '3. Move BOT_TOKEN, BOT_USERNAME, SECRET_KEY, WEBAPP_URL and other runtime variables.'
Write-Host '4. Check /api/health.'
Write-Host '5. Check the Telegram Mini App.'
Write-Host '6. Keep the old Railway project until the new deploy is fully verified by hand.'
