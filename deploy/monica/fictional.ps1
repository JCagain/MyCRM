param([switch]$Build)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$env:Path = "$env:LOCALAPPDATA\Programs\nodejs;$env:Path"
$env:DOCKER_CONFIG = Join-Path $repo '.monica-tools/docker'
New-Item -ItemType Directory -Force -Path $env:DOCKER_CONFIG | Out-Null
$compose = Join-Path $env:LOCALAPPDATA 'Programs/DockerDesktop/resources/cli-plugins/docker-compose.exe'
if (-not (Test-Path -LiteralPath $compose)) { $compose = (Get-Command docker-compose -ErrorAction Stop).Source }
$arguments = @('--env-file', (Join-Path $PSScriptRoot 'fictional.env'), '-f', (Join-Path $PSScriptRoot 'compose.fictional.yaml'))
Push-Location $repo
try {
    & node deploy/monica/generate-fixture.mjs
    if ($LASTEXITCODE) { throw 'Fictional fixture generation failed.' }
    $env:C2V_HANDOFF_DIRECTORY = Join-Path $repo '.monica-tools/handoff'
    & node --test card2vcf/tests/browser/integration.test.mjs
    if ($LASTEXITCODE) { throw 'Converter browser handoff failed.' }
    if ($Build) {
        & $compose @arguments build app
        if ($LASTEXITCODE) { throw 'Fictional image build failed.' }
    }
    & $compose @arguments up -d db
    if ($LASTEXITCODE) { throw 'Fictional database startup failed.' }
    & $compose @arguments run --rm --entrypoint sh app -c 'php artisan migrate --force && php artisan organization:backfill && vendor/bin/phpunit -c phpunit.organization.xml && php tests/Browser/committed-import.php'
    if ($LASTEXITCODE) { throw 'Monica compatibility verification failed.' }
    & $compose @arguments up -d app
    if ($LASTEXITCODE) { throw 'Fictional browser app startup failed.' }
    & $compose @arguments exec -T app php tests/Browser/seed.php
    if ($LASTEXITCODE) { throw 'Fictional browser fixture setup failed.' }
    & node deploy/monica/browser.mjs
    if ($LASTEXITCODE) { throw 'Monica browser verification failed.' }
} finally {
    Remove-Item Env:C2V_HANDOFF_DIRECTORY -ErrorAction SilentlyContinue
    Pop-Location
}
