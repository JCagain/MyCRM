# Implementation record

Updated: 2026-11-18. Maintenance rules: [AGENTS.md](../AGENTS.md).

## Status

| Scope | State | Evidence |
| --- | --- | --- |
| [Existing card2vcf specification](../card2vcf/SPEC.md), excluding its planned-integration section and explicitly future clauses | Implemented in source | Baseline commit `2a0e200`; subsequent changes in `207df4f`. |
| [card2vcf integration scope](../card2vcf/SPEC.md#planned-integration-with-modified-monica) | Converter implemented; actual downloads verified through the modified importer | [Converter handoff](../card2vcf/INTEGRATION-PLAN.md#verification-and-importer-handoff), [application integration tests](../monica/tests/Feature/OrganizationTest.php), [committed-photo check](../monica/tests/Browser/committed-import.php). Converter baseline committed in `2546ace`. |
| [Monica modification specification](MONICA-SPEC.md) | Implemented in source; fictional verification and live schema compatibility check passed; production deployment pending | [Plan](MONICA-PLAN.md), [pinned source](../monica/UPSTREAM.md), [reproducible verification](MONICA-RUNBOOK.md). The user approved metadata-only access; no real contact records or card files were inspected. |
| [Local deployment configuration](../compose.yaml) | Existing deployment unchanged; separate application-image override prepared | [Prepared override](../deploy/monica/compose.organization.yaml), [deployment/recovery runbook](MONICA-RUNBOOK.md). Public deployed source hashes match the pinned upstream baseline after LF normalization. |

## Monica implementation evidence

| Requirement | Implementation / verification |
| --- | --- |
| [Companies and jobs](MONICA-SPEC.md#companies-and-jobs), [multilingual entries](MONICA-SPEC.md#multilingual-entries) | [Additive migration/backfill](../monica/database/migrations/2026_11_17_000001_add_contact_organization.php), [work service](../monica/app/Services/Organization/Work.php), [existing work editor](../monica/resources/views/people/work/organization-editor.blade.php), [feature tests](../monica/tests/Feature/OrganizationTest.php). Legacy work/occupation API writers maintain the representative projection. |
| [Contact methods](MONICA-SPEC.md#contact-methods) | [Account defaults](../monica/app/Services/Organization/Defaults.php), [phone-reference lifecycle](../monica/app/Models/Contact/ContactField.php), [existing profile controls](../monica/resources/views/people/organization-methods.blade.php), feature and upstream contact-field suites. |
| [Import behavior](MONICA-SPEC.md#person-matching-and-vcf-import-behavior), [shared acceptance](MONICA-SPEC.md#shared-acceptance-checks) | [Normalizer](../monica/app/Services/VCard/OrganizationCard.php), [adapter](../monica/app/Services/VCard/ImportOrganization.php), [transactional importer](../monica/app/Services/VCard/ImportVCard.php), [owned review](../monica/app/Http/Controllers/OrganizationController.php), actual combined/ZIP-entry feature checks in both export modes and committed-photo verification. |
| [Categories and filters](MONICA-SPEC.md#tag-categories-and-filters), [ratings](MONICA-SPEC.md#closeness-and-importance), [batch editing](MONICA-SPEC.md#batch-editing-and-interface) | [List predicates](../monica/app/Services/Organization/PeopleQuery.php), [atomic batch service](../monica/app/Services/Organization/Batch.php), [settings](../monica/resources/views/settings/organization.blade.php), [people table](../monica/resources/views/people/organization-list.blade.php), feature and browser checks. |
| [Last contacted](MONICA-SPEC.md#past-interactions-and-last-contacted) | Derived query in PeopleQuery and Contact accessor; feature tests exercise calls, conversations, backdating, shared-activity participation/removal, deletion and profile touches. |

Implementation choices beyond the requirement text: pending company-review payloads are encrypted, owned by account/user and expire after one day; explicit batch requests are limited to 500 contact IDs. Extended WeChat/LinkedIn/WhatsApp imports use additive identity matching, including the explicit phone reference, consistent with the existing social collection policy. Absent properties retain their existing field-specific behavior; [characterization tests](../monica/tests/Feature/OrganizationTest.php) and the upstream importer suite are the executable reference. Neither Notes fallbacks nor interaction/rating/category values are parsed into additional imported records.

Direct compatibility fixes: an unchanged matched contact now remains the Replace target instead of creating a duplicate; name fallback now consumes parsed names and treats empty/NULL optional components consistently. UID → email → name precedence and first-match/Add-skip policy remain as specified. Company deletion repairs primary work references; legacy work/occupation edits are transactional. Avatar/file processing begins only after the contact graph commits.

## Direct card2vcf changes beyond the specification

The additions below are implemented in source. The specification remains authoritative for behavior it already describes.

### Review layout and batch actions

- Detach cards sits beside Combine. First met batch editing is in the selection area rather than the page header.
- Repeatable label/value/remove controls share a row. Reviewed and Delete person controls appear beside the Contact review title and again at the bottom.
- Mark selected reviewed applies to the full selection only if everyone has a main name and no unresolved extraction suggestions; otherwise none are approved.
- Delete selected confirms the number of people affected and removes only those selected. Deletion is confined to the session. Batch review and batch deletion each undo/redo as one operation.
- The export dialog reports blocked selections and offers Select all reviewed people and Go to selected person needing review.

Evidence: [UI markup](../card2vcf/public/index.html), [UI behavior](../card2vcf/public/app.mjs), [layout](../card2vcf/public/styles.css), [browser coverage](../card2vcf/tests/browser/workflow.test.mjs).

### Download names

The export dialog accepts a download basename, initially `contacts`, and adds the appropriate extension. The chosen name applies to the combined file or ZIP archive. Files inside a ZIP retain their individual contact-name/UID filenames. Invalid Windows filenames are rejected.

Evidence: [download handling](../card2vcf/public/app.mjs), [browser coverage](../card2vcf/tests/browser/workflow.test.mjs). Other export behavior is defined in [the spec](../card2vcf/SPEC.md#export).

### Editing and extraction details

Baseline details beyond the spec are documented in the historical plan: [Detach ownership](../card2vcf/PLAN.md#2-implement-the-session-model-and-reversible-operations), [generated-name removal](../card2vcf/PLAN.md#5-implement-name-handling-and-export), [rotation](../card2vcf/PLAN.md#3-build-the-minimal-review-workspace), and [retry behavior](../card2vcf/PLAN.md#4-connect-local-extraction-safely).

Images are sent at their original resolution unless rotated; there is no automatic image-size reduction.

Evidence: [UI behavior](../card2vcf/public/app.mjs), [domain behavior](../card2vcf/public/domain.mjs), [browser coverage](../card2vcf/tests/browser/workflow.test.mjs).

### Configuration

| Variable | Purpose / authoritative reference |
| --- | --- |
| `CARD2VCF_PORT` | App port; default in [implemented defaults](../card2vcf/SPEC.md#implemented-defaults). |
| `CARD2VCF_ENDPOINT` | Model API URL; default in [local model connection](../card2vcf/SPEC.md#local-model-connection). |
| `CARD2VCF_MODEL` | Requested model alias; default in [local model connection](../card2vcf/SPEC.md#local-model-connection). |
| `CARD2VCF_API_KEY` | Optional credential; setup in [quickstart](../card2vcf/QUICKSTART.md#optional-api-key). |
| `CARD2VCF_TIMEOUT_SECONDS` | Extraction timeout setting, documented range 1-300 seconds; default in [quickstart](../card2vcf/QUICKSTART.md). |

Check model performs a separate short request for the model list and checks the configured alias. Startup and use are documented in [quickstart](../card2vcf/QUICKSTART.md). Configuration is read when the app starts.

Evidence: [server](../card2vcf/server.mjs), [connection-check tests](../card2vcf/tests/server.test.mjs). Dependencies and test commands: [package manifest](../card2vcf/package.json).

## Verification

- Verified packaged image ID: `sha256:84acf0a5499ace1770489d03362ad2acca78f5adffcf600ab3072bbb8c0c370c`, local tag `monica-local:4.1.2-organization-v1`. This is a local build, not a published registry image or deployed production image.
- 2026-11-18 Monica verification: the [focused suite](../monica/phpunit.organization.xml) passed **104 tests, 320 assertions** against PHP 8.2.35 / Sabre 4.5.4 / isolated MariaDB 11. It includes the affected upstream importer, work, occupation, contact-field service/model suites and the new feature checks. Actual converter browser downloads and extracted ZIP entries passed the application importer in both modes, repeated Add/Replace, malformed metadata, company review, partial pairs, status/alias handling, ratings, batch/account isolation, phone lifecycle, interaction derivation and filtered pagination/last-contacted in both HTML and JSON. The [committed import check](../monica/tests/Browser/committed-import.php) separately passed avatar decoding, avatar reuse and rejected-card file isolation.
- 2026-11-18 browser checks: the converter handoff browser test and [Monica browser flow](../deploy/monica/browser.mjs) passed with fictional accounts only; the latter covers work link/unlink, method editing, category/tag creation, batch ratings, mixed filters, selection reset and 1440px/390px layouts. A malformed synthetic PNG in the handoff fixture was replaced with a valid fictional PNG so PHP image decoding is covered. The test helpers now return a failing process status for uncaught errors.
- 2026-11-18 deployment preparation: the [production image](../monica/Dockerfile.organization) built without dev dependencies. [Upgrade/recovery rehearsal](../deploy/monica/rehearsal.ps1) passed from the pinned old image/schema to the custom image, including two backfill reruns, preserved conflicting flat/occupation work, dates and tags, and restoration of the matching pre-upgrade database/storage under the old image. Project `monica-rehearsal-20261118091228` was stopped afterward; its fictional backups/volumes remain outside Git. No production migration or service switch occurred.
- 2026-11-18 baseline check: deployed public importer, Composer lockfile and occupation-migration SHA-256 hashes match upstream `32028ce3ce79cef38df5d27a297e5b20680f0065` after checkout line-ending normalization. Automatic approval review initially blocked live database metadata access. The user subsequently explicitly approved that limited check; its result follows.
- 2026-11-18 approved live schema check: live and fictional databases both report `11.8.9-MariaDB-ubu2404`. Compared column types/nullability/defaults across 15 existing relevant tables and checked for the five new organization tables, plus engines, collations and foreign-key definitions. No unexpected live-only columns or conflicting new table names were found. The fictional schema differs by the expected 40 added columns, the two planned nullable occupation columns, and four added foreign keys on existing tables. One unrelated pre-existing difference is `users.currency_id` defaulting to NULL live versus 2 in the fictional database; this feature does not modify it and it does not block the organization migrations. Shared existing engines/collations/foreign keys match. Queries read only version and `SHOW`/`information_schema` metadata, with no contact rows, card files, exports or backups read and no credential values printed. No production migration or service change was performed; backup and deployment remain later steps.
- 2026-11-18 final verification: `npm.cmd test` passed 26 tests, `npm.cmd run test:browser` passed all 5 browser tests and `npm.cmd run test:contract` passed the extended fixture through Sabre/vobject 4.5.4. The final packaged image also passed [the Monica browser flow without source mounts](../deploy/monica/image-smoke.ps1), then its temporary container stopped and the fictional development app restarted. All 176 checked documentation links/anchors resolved. The staged source/privacy check found no private data, exports, credentials or dependencies; all 40 staged whitespace findings are unchanged upstream lines, with none introduced by the feature changes.
- 2026-11-17 converter completion: `npm.cmd test` passed 26 unit/integration tests; `npm.cmd run test:browser` passed 5 browser tests. New [workflow coverage](../card2vcf/tests/browser/integration.test.mjs) exercises the metadata controls, status conflicts, history, fictional re-extraction, desktop/narrow layouts, reset and both modes in combined/ZIP downloads, with exact per-mode VCF equality and original-photo byte/order checks. `npm.cmd run test:contract` passed actual generated fictional output through Sabre/vobject 4.5.4 in a disposable, offline, read-only Monica 4.1.2 image; [shared semantic expectations](../card2vcf/tests/fixtures/integration-contract.mjs) also passed ical.js 2.2.1. The Docker image is pinned by digest in the [harness](../card2vcf/tests/contract/sabre.mjs). No production containers, private volumes, real model or database were accessed. Modified importer/shared acceptance remains pending.
- 2026-11-17 association fixes: `npm.cmd test` passed all 25 tests using fictional fixtures, including Detach/edit/Combine, Undo/Redo, structured export references and deduplication idempotence in [metadata tests](../card2vcf/tests/contact-metadata.test.mjs). `npm.cmd run test:browser` passed all 4 existing browser tests; `git diff --check` passed. Full integration acceptance remains pending.
- 2026-11-17 planning update: `git diff --check` passed; 84 local documentation links/anchors across the index, both implementation plans and this record resolved successfully. Application tests and deployed-schema checks were not run.
- Original implementation verification is retained in the [historical plan](../card2vcf/PLAN.md#verification-record).
- For commit `207df4f`, the previous session reported 16 unit/integration tests and 4 browser tests passing. Coverage lives in [deduplication tests](../card2vcf/tests/dedup.test.mjs) and [browser tests](../card2vcf/tests/browser/dedup.test.mjs), alongside the existing suites.
- This 2026-11-13 update changes documentation only. Source inspection was used to reconstruct the status above; application tests and live deployment checks were not rerun. Validation: git diff --check passed; local documentation links and anchors were checked successfully.

## Updates

- 2026-11-18: Implemented the Monica [plan](MONICA-PLAN.md) in a pinned source tree, with schema/domain services, import review and existing editor/list extensions. Added reproducible fictional [verification and deployment instructions](MONICA-RUNBOOK.md), production build definition and upgrade/rollback rehearsal. Delivery remains separate from production schema approval and deployment.
- 2026-11-17: Started Monica implementation from pinned v4.1.2 source and upstream tests. Added an isolated fictional Compose project, additive organization migration, initial work/backfill/contact-method services and VCF normalizer/adapters. This work is in progress; schema and feature acceptance are not yet certified. The production compose configuration, credentials and private data remain untouched.
- 2026-11-17: Completed the converter-side [integration plan](../card2vcf/INTEGRATION-PLAN.md), reconciled its checklist with the implemented source, added complete fictional contract/browser coverage and a reproducible PHP parser harness, and provided the [Monica handoff](../card2vcf/INTEGRATION-PLAN.md#verification-and-importer-handoff). Updated index/spec status without claiming importer completion. Parser verification was performed after the already-present exporter changes; no contract incompatibility was found.
- 2026-11-17: Corrected the existing converter implementation against [metadata and reference decisions](../card2vcf/INTEGRATION-PLAN.md#state-and-editing-decisions): detached rows receive independent IDs with remapped phone references; phone deduplication remaps references before social deduplication. Corrected a test that asserted against a replaced row object and added regression coverage. Evidence: [domain implementation](../card2vcf/public/domain.mjs), [metadata tests](../card2vcf/tests/contact-metadata.test.mjs). This verifies these fixes only, not completion of the integration plan.
- 2026-11-17: Reviewed both specs and the converter integration plan; saved the [Monica implementation plan](MONICA-PLAN.md). No blocking specification conflict found; source/schema, parser and end-to-end verification remain explicit implementation gates. Existing uncommitted converter work was left intact and was not certified by this review. Documentation-only change; no application tests or live deployment checks run.
- 2026-11-13: Saved the [card2vcf integration plan](../card2vcf/INTEGRATION-PLAN.md), including its encoding decisions and planning-stage verification. No application implementation performed.
- 2026-11-13: Established this record from existing source and commit history. Updated [Monica requirements](MONICA-SPEC.md), [card2vcf integration requirements](../card2vcf/SPEC.md#planned-integration-with-modified-monica), and documentation links after the specification review. No application implementation was performed in this update.
