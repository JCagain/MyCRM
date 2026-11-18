# Monica build, verification and deployment

Status: fictional implementation/upgrade verification passed; live schema verification and production deployment pending.
Requirements and acceptance gates: [specification](MONICA-SPEC.md) and [plan](MONICA-PLAN.md).
Delivery evidence: [implementation record](IMPLEMENTATION.md#verification).

## Reproduce fictional verification

Install the converter's locked dependencies with `npm ci` in `card2vcf/` and install its Playwright browser if needed. Docker Desktop must be running. From the repository root in PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File deploy/monica/fictional.ps1 -Build
```

The [script](../deploy/monica/fictional.ps1) generates the shared fictional fixture, runs the converter browser handoff, builds the development image, starts the separate fictional database, migrates/backfills it and runs the [focused PHP suite](../monica/phpunit.organization.xml), committed-photo check and [Monica browser flow](../deploy/monica/browser.mjs). The execution-policy flag applies only to that process; it does not change the machine/user policy. Subsequent runs can omit `-Build` while editing mounted PHP/Blade sources. Dependency, configuration or build changes require rebuilding. The project uses explicit [fictional environment](../deploy/monica/fictional.env) and [Compose files](../deploy/monica/compose.fictional.yaml); it does not load root credentials or production volumes.

PHP 8.2, Sabre/vobject 4.5.4 and MariaDB 11 follow the pinned source/base image and existing database engine family. The base image retains upstream compiled frontend assets; the new controls use Blade and existing CSS. No frontend asset rebuild is required for these changes.

The helper sets an empty Docker configuration under ignored `.monica-tools/docker` and uses the Docker Desktop Compose executable directly when available. It does not change Docker's normal user configuration. The fictional project binds only `127.0.0.1:8081`, with named `monica-fictional` database/storage volumes. Stop it using the same explicit Compose files and `down`; omit `--volumes` to retain the fictional database.

## Prepare the application image

The [source provenance](../monica/UPSTREAM.md) records the upstream commit. Build the prepared image without changing running services:

```powershell
docker compose -f compose.yaml -f deploy/monica/compose.organization.yaml build app
```

The [override](../deploy/monica/compose.organization.yaml) changes the application image/build only. Port, environment, database image and production storage mounts remain defined by [the existing configuration](../compose.yaml). Building does not apply the override. Record the resulting immutable image ID/digest and the previously deployed image ID before a later deployment.

After fictional verification and the image build, test the packaged application without source bind mounts:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File deploy/monica/image-smoke.ps1
```

This [check](../deploy/monica/image-smoke.ps1) temporarily stops the fictional app, runs the packaged image on its `127.0.0.1:8081` port with only fictional database/storage, runs the browser flow, then stops the temporary container and restarts the development app. It does not invoke production Compose or load production credentials.

## Later upgrade procedure

These steps operate on production and are for the user's later deployment task. Do not apply the override until all plan exit checks pass and the user schedules the change.

1. Check source/version and schema metadata against the pinned baseline. Confirm migration history, actual MariaDB version and available disk space. Resolve differences before migration. Keep the current application image locally available.
2. Put the current app in maintenance mode with `php artisan down`. Stop scheduled jobs, queue workers and any external API/CardDAV writers. Ensure no process can write during backup, migration or recovery.
3. Complete a database dump and a storage archive **before** running the new image or migrations. Use a dated private directory outside Git and preserve the existing application key/configuration separately. Never paste backups or credentials into tool logs.
4. Use container-side `mariadb-dump --single-transaction --routines --triggers --events --result-file=/tmp/pre-upgrade.sql`, selecting the existing database/user and password from the database container's environment. Copy the file out with `docker cp`; this avoids PowerShell changing SQL encoding. Archive `/var/www/html/storage` with `tar` inside the app container, then copy the archive out. Check command exit codes, nonzero sizes and archive readability. Remove temporary container copies after successful transfer.
5. Restore **both** backups into an isolated rehearsal project using the same engine/image and original application key. Verify restoration and migration there without exposing the real data to an agent. A backup is not complete until restoration succeeds.
6. Stop the current app. Run the prepared image with the existing environment/storage, explicitly overriding its entrypoint to run `php artisan migrate --force` and `php artisan organization:backfill`. Keep all writers stopped. The backfill can be rerun after successful schema migration; interrupted MariaDB DDL requires assessment/restoration rather than blindly rerunning partial DDL.
7. Start the app with both Compose files, keeping maintenance mode enabled. Check health/login, migration status, work projections, company membership, method links, filters and representative fictional imports. Check existing photo storage access. User-owned real-data validation remains with the user.
8. Run `php artisan up`, restore scheduled jobs/workers and verify the intended loopback URL. Record deployed image, backup locations, time and checks privately.

## Recovery

If migration or validation fails, stop every writer and the new app. Restore the matching pre-upgrade database **and** storage archive, preserve their application key, then start the recorded old image using the original Compose configuration. Verify restoration before reopening writes. Do not connect the old application to migrated data or use destructive down-migrations: the organization migrations intentionally refuse them. Keep failed-state files private until the user decides their retention.

The [fictional rehearsal](../deploy/monica/rehearsal.ps1) creates a unique isolated project, seeds the pinned old image/schema, backs up both database and storage, upgrades to the custom image, repeats backfill and restores matching backups under the old image. Run it after building the prepared application image:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File deploy/monica/rehearsal.ps1
```

It stops its containers afterward and retains the fictional named volumes and ignored backups for review. It never loads production environment values or mounts. Evidence and the separately pending live-schema gate are recorded in the [implementation record](IMPLEMENTATION.md#verification).
