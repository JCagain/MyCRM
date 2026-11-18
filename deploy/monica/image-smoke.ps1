$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$env:Path = "$env:LOCALAPPDATA\Programs\nodejs;$env:Path"
$env:DOCKER_CONFIG = Join-Path $repo '.monica-tools/docker'
$compose = Join-Path $env:LOCALAPPDATA 'Programs/DockerDesktop/resources/cli-plugins/docker-compose.exe'
if (-not (Test-Path -LiteralPath $compose)) { $compose = (Get-Command docker-compose -ErrorAction Stop).Source }
$name = 'monica-fictional-image-smoke'
$previousUrl = $env:MONICA_FICTIONAL_URL
Push-Location $repo
try {
    & $compose --env-file deploy/monica/fictional.env -f deploy/monica/compose.fictional.yaml exec -T app php tests/Browser/seed.php
    if ($LASTEXITCODE) { throw 'Fictional fixture setup failed.' }
    & $compose --env-file deploy/monica/fictional.env -f deploy/monica/compose.fictional.yaml stop app
    if ($LASTEXITCODE) { throw 'Fictional app stop failed.' }
    & docker --config $env:DOCKER_CONFIG run --detach --rm --name $name --network monica-fictional_default --publish 127.0.0.1:8081:80 `
        --env APP_ENV=testing --env APP_KEY=base64:NTrXToqFZJlv48dgPc+kNpc3SBt333TfDnF1mDShsBg= --env APP_URL=http://127.0.0.1:8081 `
        --env DB_CONNECTION=mysql --env DB_HOST=db --env DB_DATABASE=fictional --env DB_USERNAME=fictional --env DB_PASSWORD=fictional-test-only `
        --env CACHE_DRIVER=array --env SESSION_DRIVER=file --env QUEUE_CONNECTION=sync --env MAIL_MAILER=array --env LOG_CHANNEL=stderr `
        --env REQUIRES_SUBSCRIPTION=false --env APP_SIGNUP_DOUBLE_OPTIN=false `
        --volume monica-fictional_fictional-storage:/var/www/html/storage --entrypoint apache2-foreground monica-local:4.1.2-organization-v1
    if ($LASTEXITCODE) { throw 'Fictional image startup failed.' }
    & docker --config $env:DOCKER_CONFIG inspect --format '{{json .HostConfig.PortBindings}}' $name
    $env:MONICA_FICTIONAL_URL = 'http://127.0.0.1:8081'
    & node deploy/monica/browser.mjs
    if ($LASTEXITCODE) { throw 'Packaged image browser verification failed.' }
} catch {
    & docker --config $env:DOCKER_CONFIG logs --tail 50 $name
    throw
} finally {
    & docker --config $env:DOCKER_CONFIG stop $name
    & $compose --env-file deploy/monica/fictional.env -f deploy/monica/compose.fictional.yaml up -d app
    $env:MONICA_FICTIONAL_URL = $previousUrl
    Pop-Location
}
