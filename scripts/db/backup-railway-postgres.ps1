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

    & psql $ConnectionString -c $Sql
    if ($LASTEXITCODE -ne 0) {
        throw 'PostgreSQL command failed.'
    }
}

Assert-CommandExists -Name 'pg_dump'
Assert-CommandExists -Name 'pg_restore'
Assert-CommandExists -Name 'psql'

Assert-ExternalRailwayUrl -Name 'OLD_DATABASE_URL' -ConnectionString $env:OLD_DATABASE_URL

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$backupsDir = Join-Path $repoRoot 'backups'
if (-not (Test-Path -LiteralPath $backupsDir)) {
    New-Item -ItemType Directory -Path $backupsDir | Out-Null
}

Write-Host 'Checking connection to old database...'
Invoke-SafePsql -ConnectionString $env:OLD_DATABASE_URL -Sql 'select now();'

Write-Host 'Listing tables in old database...'
& psql $env:OLD_DATABASE_URL -c '\dt'
if ($LASTEXITCODE -ne 0) {
    throw 'Failed to list tables in old database.'
}

$timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$dumpPath = Join-Path $backupsDir "shifttracker_backup_$timestamp.dump"

Write-Host 'Creating dump...'
& pg_dump -Fc --no-owner --no-acl --verbose -f $dumpPath $env:OLD_DATABASE_URL
if ($LASTEXITCODE -ne 0) {
    throw 'Failed to create dump.'
}

Write-Host ''
Write-Host "Dump created successfully: $dumpPath"
Write-Host 'Do not add the dump file to git.'
