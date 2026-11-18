$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$env:DOCKER_CONFIG = Join-Path $repo '.monica-tools/docker'
$backup = Join-Path $repo '.monica-tools/rehearsal'
New-Item -ItemType Directory -Force -Path $backup | Out-Null
$project = 'monica-rehearsal-' + (Get-Date -Format 'yyyyMMddHHmmss')
$compose = Join-Path $env:LOCALAPPDATA 'Programs/DockerDesktop/resources/cli-plugins/docker-compose.exe'
if (-not (Test-Path -LiteralPath $compose)) { $compose = (Get-Command docker-compose -ErrorAction Stop).Source }
$base = @('--env-file', (Join-Path $PSScriptRoot 'fictional.env'), '-f', (Join-Path $PSScriptRoot 'compose.rehearsal.yaml'), '--project-name', $project)
function Invoke-RehearsalCompose {
    & $compose @base @args
    if ($LASTEXITCODE) { throw 'Fictional rehearsal command failed.' }
}
Push-Location $repo
try {
    Invoke-RehearsalCompose up -d db recovery-db
    Invoke-RehearsalCompose run --rm legacy -c 'php artisan migrate --force && php /tmp/rehearsal/check.php seed'
    Invoke-RehearsalCompose exec -T db mariadb-dump --user=fictional --password=fictional-test-only --single-transaction --routines --triggers --events "--result-file=/backups/$project.sql" fictional
    Invoke-RehearsalCompose run --rm legacy /tmp/rehearsal/backup-storage.sh "/backups/$project.tgz"
    foreach ($extension in @('sql','tgz')) { if ((Get-Item -LiteralPath (Join-Path $backup "$project.$extension")).Length -eq 0) { throw 'Empty fictional backup.' } }
    Invoke-RehearsalCompose run --rm upgraded -c 'php artisan migrate --force && php artisan organization:backfill && php artisan organization:backfill && php /tmp/rehearsal/check.php upgraded'
    Invoke-RehearsalCompose exec -T recovery-db sh /tmp/rehearsal/restore-db.sh "/backups/$project.sql"
    Invoke-RehearsalCompose run --rm recovery /tmp/rehearsal/restore-storage.sh "/backups/$project.tgz"
    Invoke-RehearsalCompose run --rm recovery -c 'php /tmp/rehearsal/check.php restored'
    Write-Output "Fictional upgrade and matching database/storage rollback passed: $project"
} finally {
    & $compose @base down
    Pop-Location
}
