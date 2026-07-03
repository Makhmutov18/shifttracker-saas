param(
    [Parameter(Mandatory = $true)]
    [string]$DumpPath
)

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

Assert-ExternalRailwayUrl -Name 'NEW_DATABASE_URL' -ConnectionString $env:NEW_DATABASE_URL

if ([string]::IsNullOrWhiteSpace($DumpPath)) {
    throw 'DumpPath parameter is required.'
}

if (-not (Test-Path -LiteralPath $DumpPath)) {
    throw "Файл dump не найден: $DumpPath"
}

Write-Host 'Checking connection to new database...'
Invoke-SafePsql -ConnectionString $env:NEW_DATABASE_URL -Sql 'select now();'

$confirmation = Read-Host 'Restore dump into NEW_DATABASE_URL? This can delete existing tables in the new database. Type YES to continue.'
if ($confirmation -ne 'YES') {
    Write-Host 'Restore cancelled.'
    exit 1
}

Write-Host 'Running restore...'
& pg_restore --clean --if-exists --no-owner --no-acl --verbose -d $env:NEW_DATABASE_URL $DumpPath
if ($LASTEXITCODE -ne 0) {
    throw 'Failed to restore dump.'
}

Write-Host 'Listing tables in new database...'
& psql $env:NEW_DATABASE_URL -c '\dt'
if ($LASTEXITCODE -ne 0) {
    throw 'Failed to list tables in new database.'
}

Write-Host ''
Write-Host 'Restore completed successfully.'
Write-Host 'Check the application on the new Railway project after the migration.'
