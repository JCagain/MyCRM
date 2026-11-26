# Implementation record

Updated: 2026-11-26. Maintenance rules: [AGENTS.md](../AGENTS.md).

## Status

Repairs for the seven findings from the 2026-11-18 implementation review are in source. The [repair plan](REPAIR-PLAN.md) links each repair to its requirements and regression checks.

| Scope | State | Evidence |
| --- | --- | --- |
| [Existing card2vcf specification](../card2vcf/SPEC.md), excluding its integration section and explicitly future clauses | Implemented in source | Baseline commit `2a0e200`; subsequent changes in `207df4f`. |
| [First extraction of combined cards](../card2vcf/SPEC.md#first-extraction-of-combined-cards) and [reviewing job and address variants](../card2vcf/SPEC.md#reviewing-job-and-address-variants) | Implemented in source and verified with fictional fixtures on 2026-11-19 | [Implementation plan](../card2vcf/COMBINED-CARD-REVIEW-PLAN.md), [domain regressions](../card2vcf/tests/combined-review.test.mjs), [batch and retry browser tests](../card2vcf/tests/browser/combined-review.test.mjs), [layout and download browser test](../card2vcf/tests/browser/integration.test.mjs). Passed 32 unit tests, 7 Edge browser tests, and the Sabre/vObject 4.5.4 export contract. |
| C2V people sidebar | Matched the [approved stacked demo](../stacked-link-with-demo.html) in the live app | [Workflow test](../card2vcf/tests/browser/workflow.test.mjs) verifies control labels, row placement, and the 16 px selection count. All 7 Edge browser tests passed, including layout checks at 1440, 1100, 800, and 390 px. |
| [card2vcf integration scope](../card2vcf/SPEC.md#integration-with-modified-monica) | Converter implemented; actual downloads verified through the modified importer | [Converter handoff](../card2vcf/INTEGRATION-PLAN.md#verification-and-importer-handoff), [application integration tests](../monica/tests/Feature/OrganizationTest.php), [committed-photo check](../monica/tests/Browser/committed-import.php). Converter baseline committed in `2546ace`. |
| [Monica modification specification](MONICA-SPEC.md) | Implemented and verified | [Plan](MONICA-PLAN.md), [pinned source](../monica/UPSTREAM.md), [reproducible verification](MONICA-RUNBOOK.md). The user approved metadata-only access; no real contact records or card files were inspected. |
| [Local deployment configuration](../compose.yaml) | Verified repair image deployed to the local instance on 2026-11-18 | [Prepared override](../deploy/monica/compose.organization.yaml), [daily startup](MONICA-RUNBOOK.md#start-and-open-monica), [deployment/recovery runbook](MONICA-RUNBOOK.md). [Live deployment verification](#live-deployment) |

## card2vcf Open VCF

Click **Open VCF** in the toolbar and select a UTF-8 vCard 3.0 or 4.0 file. The app opens single-contact and combined VCFs in either interface language. It adds the contacts with new session identities, selects the imported batch and opens the first contact for editing. Review the contacts before exporting. **Undo** removes the batch in one step and **Redo** restores it. A malformed or unsupported file leaves the current session intact.

Import runs in the browser without the extraction model. It reads names, nicknames, jobs, addresses, supported contact methods, notes, and embedded JPEG, PNG and WebP photos. Structured exports restore the primary job, job statuses, linked job and address variants, and WhatsApp phone associations defined in the [wire contract](../card2vcf/INTEGRATION-PLAN.md#wire-contract). Additional jobs in Monica compatible exports stay in Notes. Remote and unsupported photos are skipped and counted in the status message.

The [First met amendment](FIRST-MET-AMENDMENT.md) is implemented in Card2VCF and Monica. The [converter round-trip tests](../card2vcf/tests/open-vcf.test.mjs) and [Monica import tests](../monica/tests/Feature/OrganizationTest.php) cover new and older exports.

Verified on 2026-11-24 with 36 converter unit tests, 10 Edge tests and 125 Monica PHP tests (470 assertions). The committed import and Monica browser checks also passed. The fictional Compose environment now mounts the current Laravel configuration and translations alongside the views to prevent stale image files from affecting verification.

The [import tests](../card2vcf/tests/open-vcf.test.mjs) cover both export formats, a vCard 3.0 fixture, and invalid input. The [Edge test](../card2vcf/tests/browser/open-vcf.test.mjs) covers the file picker, editing, Undo and Redo, language switching, and re-export with the original photo bytes.

## card2vcf source editing and review during extraction

The Names editor places each generated Simplified Chinese name to the right of its Traditional Chinese source. The main name and unpaired names use full rows. The [workflow test](../card2vcf/tests/browser/workflow.test.mjs) verifies the pair at 1440 px and 390 px. All 32 unit tests and 9 Edge browser tests passed on 2026-11-20.

The three workspace panels share a heading color and alignment. The primary job label stays beside its job number at desktop and mobile widths. Attempting review with a blocking suggestion moves focus to its first action. Each person becomes eligible for review once their own queued cards finish.

Each source card has four edge crop controls and a brightness slider with a live preview. Extraction applies these settings and rotation. **Retry edited** processes selected cards whose settings differ from their last successful extraction, or from their original settings before the first success. Downloads embed the original source files.

Verified with 32 unit tests and 9 Edge browser tests. The [source editing test](../card2vcf/tests/browser/combined-review.test.mjs) checks review during a batch and verifies the dimensions and brightness of the uploaded retry image.

## card2vcf primary job and export

Implemented the [primary job and export amendment](../card2vcf/SPEC.md#amendment-to-primary-job-selection-and-export-defaults) in both interface languages. All 32 unit tests and 8 Edge browser tests passed. The [metadata test](../card2vcf/tests/contact-metadata.test.mjs) covers independent job and version order through Undo and Redo. The [Edge integration test](../card2vcf/tests/browser/integration.test.mjs) covers the editor controls, the default format and the exported job data in both formats. The [language test](../card2vcf/tests/browser/ui-language.test.mjs) checks the localized export guidance.

## card2vcf export dialog

Click **?** beside **Format** to compare **Structured vCard (recommended)** and **Monica compatible**. The vCard preview label indicates that photos are omitted from the preview. The [export rules](../card2vcf/SPEC.md#amendment-to-primary-job-selection-and-export-defaults) define the format behavior. The [Edge integration test](../card2vcf/tests/browser/integration.test.mjs) covers the help toggle and both downloads. The [language test](../card2vcf/tests/browser/ui-language.test.mjs) covers the localized help, options and preview label.

## card2vcf interface language

The header's **Language** control switches the interface between English and Simplified Chinese without reloading. English is the default for each new session. Switching preserves the current cards, contact data, and selections. The app displays model-generated warning text as returned by the model.

Verified on 2026-11-19 with 32 unit tests and 8 Edge browser tests. The [language switch test](../card2vcf/tests/browser/ui-language.test.mjs) covers both directions, model status and extraction errors, the batch and export dialogs, and preservation of the export preview at 390 px.

## card2vcf contact editor layout

The right panel uses the Jobs section’s borders, tinted headers, and field spacing for the other contact groups. Repeated entries have dividers, and their Add and Remove controls stay beside the fields they affect. First met uses three columns when space allows and moves Location onto its own row in narrower panels. WhatsApp moves its number-source selector above the value on narrow screens.

Generated names show a small green **Generated simplified** label beside **value**. Printed and manually entered names have no source label. Remove buttons share the Delete text color, and the Remove button is the last action on every job version. The [workflow](../card2vcf/tests/browser/workflow.test.mjs) and [integration](../card2vcf/tests/browser/integration.test.mjs) tests cover these details.

The [Edge workflow test](../card2vcf/tests/browser/workflow.test.mjs) checks the shared framing and control placement at 1440, 1100, 800, and 390 px. The populated editor was also visually reviewed at 1440 and 390 px using fictional data.

## card2vcf toolbar and sidebar layout

The header places Check model and a **?** help button beside the app name. It also displays the model reachability status and language control. The help button opens the PowerShell setup instructions in a dialog. The card toolbar sits below the header. The left-panel action rows and selection count are centered. Select all, Clear, and Invert selection share a light blue background.

**Add cards** and **Open VCF** form the leftmost group, with Add cards first and the divider after Open VCF. The [Edge language test](../card2vcf/tests/browser/ui-language.test.mjs) checks the layout in English and Simplified Chinese at 1440 and 390 px.

## Local demo changes

- The people-list demo displays the primary job in separate Company and Title columns. Search matches either field or the contact name. Verified in Edge at 1440 and 390 px, including a missing job title and a company filter that matches a secondary membership.

- In `people-layout-demo.html`, Filters and Bulk actions start collapsed. The toolbar and table share horizontal padding, and contact rows use smaller avatars and tighter spacing. Verified the initial state, toolbar alignment, filtering and selection in Edge at 1440, 1024, 390 and 320 px.

- The work-focused contact demo shows every saved contact method on its own labeled row and puts tag assignment and removal in the name bar. The people-list demo places independently foldable Filters and Bulk actions below the contact count and search controls. Verified both local demos in Edge at 1440, 390 and 320 px, including tag editing and preservation of filters and selection when folding.

- On 2026-11-26, created the standalone `contact-page-work-demo.html` from the fictional contact snapshot. The demo promotes contact methods, addresses and jobs, places First met directly before Activities, and folds personal details. Amber highlights identify proposed same-company contacts and the cooperation partner relationship type. Verified offline in Edge at 1440, 390 and 320 px, including adding a website, linking contacts and preventing duplicate relationships.

- On 2026-11-19, the local `stacked-same-job-demo.html` moved the selection count directly below the selection controls and placed **Mark reviewed** and **Delete** on one row above **Set first met**. The contact review checkboxes read **Reviewed**, and the job dropdowns read **Status**. Verified in Edge at 1440 px and 390 px viewport widths.

- The local demo’s left panel uses **Link** and **Detach** for the two card actions and displays the selection count at 16 px. Verified the labels, font size, and button alignment in Edge at 1440 px and 390 px viewport widths.

- The local demo centers **Primary job** in the job’s top bar. Verified in Edge at 1440 px, 390 px, and 320 px before linking, after linking, and after unlinking job versions.

- Restored the **Status** dropdown to its original horizontal position in the local demo. **Primary job** stays centered and uses its own line within the top bar when space is tight. Verified in Edge with linked and separate job versions at desktop and mobile widths.

## People page layout and bulk delete

The [People page layout amendment](PEOPLE-PAGE-LAYOUT.md) is implemented in source. Bulk delete shows the selected names for confirmation, checks the full selection against the active account, and reuses the individual contact deletion service. Cancel returns to the same filtered list. Confirm returns to the first page of that list with a deletion count.

The [Edge check](../deploy/monica/browser.mjs) passed at 1440 px and 390 px, including the paired company controls, equal tag dropdown widths, and cancel and confirm with fictional contacts. [PHP tests](../monica/tests/Feature/OrganizationTest.php) verify selection validation and account scope. The live deployment is pending.

## Monica interface language

The [Monica interface language amendment](MONICA-UI-LANGUAGE.md) is implemented in source with [English](../monica/resources/lang/en/organization.php) and [Simplified Chinese](../monica/resources/lang/zh/organization.php) catalogs. Import reports also translate known reasons saved as English text before this change.

The [compatibility suite](../monica/phpunit.organization.xml) verified rendering in both languages, Chinese deletion messages, and old and new import reasons against the fictional database. Deployment to the live container is pending.

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

The repair adds two outcomes to the import workflow. When structured Replace cannot associate imported work with a unique existing employment record, it rejects that card with instructions to reconcile the matching jobs. When a user resolves a company match from an upload, the original report and its counters reflect the result. The report offers review links only while a review is active and belongs to the signed-in user. [Repair plan](REPAIR-PLAN.md) · [Regression tests](../monica/tests/Feature/OrganizationTest.php)

### vCard import filenames and upload size

Settings → Import shows the original filename for new vCard uploads in both the history and the report. The `import:vcard` command records the source basename for the same history. The [additive migration](../monica/database/migrations/2026_11_23_000001_add_original_filename_to_import_jobs.php) leaves the original filename empty for older jobs.

The vCard form and server validation share a 256 MiB limit for files with embedded photos. The Docker image already accepts up to 512 MiB in PHP and 1 GiB in Apache. The [upgrade procedure](MONICA-RUNBOOK.md#later-upgrade-procedure) applies the new migration.

Verified in the fictional deployment on 2026-11-23. The [PHP suite](../monica/phpunit.organization.xml) and [CLI import tests](../monica/tests/Commands/Other/ImportVCardsTest.php) passed 126 tests combined. The [Edge test](../deploy/monica/browser.mjs) uploaded a photo-filled vCard over 10 MiB and confirmed the filename in the history and report. The live deployment is pending.

### Multiple embedded vCard photos

Monica saves distinct, supported embedded images from a vCard in the contact’s Photos after the contact import commits. If the contact has no photo avatar, Monica uses the first usable image. Existing photos stay available when the user switches avatars. On reimport, Monica reuses identical attached images. Invalid images and external links are skipped for photo attachments. The card2vcf export help describes the updated importer in both interface languages.

The [committed import check](../monica/tests/Browser/committed-import.php) passed with fictional vCard 3.0 and 4.0 photos. It checks the stored image, avatar selection, repeated Replace, and rejected-card isolation. All 123 compatibility tests, the [large upload browser check](../deploy/monica/browser.mjs), and the [export language test](../card2vcf/tests/browser/ui-language.test.mjs) passed. The live deployment is pending.

## Direct card2vcf changes beyond the specification

The additions below are implemented in source. The specification remains authoritative for behavior it already describes.

### Review layout and batch actions

The bullets below record the original delivery. The current sidebar labels and layout are linked from [Status](#status).

- Long people lists scroll within the selection panel, with the selection count and batch controls above the scrolling area. Verified that the last of 30 fictional entries can be selected and cleared on desktop and narrow screens.
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

## Live deployment

On 2026-11-24 the local instance restarted with the [First met amendment](FIRST-MET-AMENDMENT.md). The installed importer matched the tested source. The confirmed live reset cleared user content and storage, verified every login email and password hash before committing, and restored default account settings. Post-start checks confirmed empty contact, photo, document and import tables and an HTTP 200 login form.

The local Monica instance at `http://localhost:8080` was upgraded from the stock image using the repaired build from commit `9c70157`. The database and storage backups were restored and upgraded successfully in isolated volumes first. Both organization migrations and the backfill completed on the live database. The running image matched the verified candidate below and the login page returned HTTP 200. Verification used migration metadata and the login endpoint. Real-contact verification remains with the user. The backup location and recovery details are recorded privately.

## Verification

- 2026-11-18 repair verification passed with 122 Monica tests and 398 assertions, 28 converter unit tests, five converter browser tests, and the pinned Sabre/vobject parser. The fictional handoff imported actual combined and ZIP-entry downloads in both modes, verified the committed avatar, and passed the Monica browser flow. The rebuilt candidate `sha256:fc91c5f785b35b6dac852178ef361ae9cc8e4016ff0168458c1f7c9488c57d75` passed the packaged browser check and fictional upgrade/restore rehearsal `monica-rehearsal-20261118104613`, including shared employer membership after two backfill reruns. [Repair plan](REPAIR-PLAN.md)

- Verified packaged image ID: `sha256:84acf0a5499ace1770489d03362ad2acca78f5adffcf600ab3072bbb8c0c370c`, local tag `monica-local:4.1.2-organization-v1`. This is a local build, not a published registry image or deployed production image.
- 2026-11-18 Monica verification: the [focused suite](../monica/phpunit.organization.xml) passed **104 tests, 320 assertions** against PHP 8.2.35 / Sabre 4.5.4 / isolated MariaDB 11. It includes the affected upstream importer, work, occupation, contact-field service/model suites and the new feature checks. Actual converter browser downloads and extracted ZIP entries passed the application importer in both modes, repeated Add/Replace, malformed metadata, company review, partial pairs, status/alias handling, ratings, batch/account isolation, phone lifecycle, interaction derivation and filtered pagination/last-contacted in both HTML and JSON. The [committed import check](../monica/tests/Browser/committed-import.php) separately passed avatar decoding, avatar reuse and rejected-card file isolation.
- 2026-11-18 browser checks: the converter handoff browser test and [Monica browser flow](../deploy/monica/browser.mjs) passed with fictional accounts only; the latter covers work link/unlink, method editing, category/tag creation, batch ratings, mixed filters, selection reset and 1440px/390px layouts. A malformed synthetic PNG in the handoff fixture was replaced with a valid fictional PNG so PHP image decoding is covered. The test helpers now return a failing process status for uncaught errors.
- 2026-11-18 deployment preparation: the [production image](../monica/Dockerfile.organization) built without dev dependencies. [Upgrade/recovery rehearsal](../deploy/monica/rehearsal.ps1) passed from the pinned old image/schema to the custom image, including two backfill reruns, preserved conflicting flat/occupation work, dates and tags, and restoration of the matching pre-upgrade database/storage under the old image. Project `monica-rehearsal-20261118091228` was stopped afterward; its fictional backups/volumes remain outside Git. No production migration or service switch occurred.
- 2026-11-18 baseline check: deployed public importer, Composer lockfile and occupation-migration SHA-256 hashes match upstream `32028ce3ce79cef38df5d27a297e5b20680f0065` after checkout line-ending normalization. Automatic approval review initially blocked live database metadata access. The user subsequently explicitly approved that limited check; its result follows.
- 2026-11-18 approved live schema check: live and fictional databases both report `11.8.9-MariaDB-ubu2404`. Compared column types/nullability/defaults across 15 existing relevant tables and checked for the five new organization tables, plus engines, collations and foreign-key definitions. No unexpected live-only columns or conflicting new table names were found. The fictional schema differs by the expected 40 added columns, the two planned nullable occupation columns, and four added foreign keys on existing tables. One unrelated pre-existing difference is `users.currency_id` defaulting to NULL live versus 2 in the fictional database; this feature does not modify it and it does not block the organization migrations. Shared existing engines/collations/foreign keys match. Queries read only version and `SHOW`/`information_schema` metadata, with no contact rows, card files, exports or backups read and no credential values printed. This check took place before the [live upgrade](#live-deployment).
- 2026-11-18 final verification: `npm.cmd test` passed 26 tests, `npm.cmd run test:browser` passed all 5 browser tests and `npm.cmd run test:contract` passed the extended fixture through Sabre/vobject 4.5.4. The final packaged image also passed [the Monica browser flow without source mounts](../deploy/monica/image-smoke.ps1), then its temporary container stopped and the fictional development app restarted. All 176 checked documentation links/anchors resolved. The staged source/privacy check found no private data, exports, credentials or dependencies; all 40 staged whitespace findings are unchanged upstream lines, with none introduced by the feature changes.
- 2026-11-17 converter completion: `npm.cmd test` passed 26 unit/integration tests; `npm.cmd run test:browser` passed 5 browser tests. New [workflow coverage](../card2vcf/tests/browser/integration.test.mjs) exercises the metadata controls, status conflicts, history, fictional re-extraction, desktop/narrow layouts, reset and both modes in combined/ZIP downloads, with exact per-mode VCF equality and original-photo byte/order checks. `npm.cmd run test:contract` passed actual generated fictional output through Sabre/vobject 4.5.4 in a disposable, offline, read-only Monica 4.1.2 image; [shared semantic expectations](../card2vcf/tests/fixtures/integration-contract.mjs) also passed ical.js 2.2.1. The Docker image is pinned by digest in the [harness](../card2vcf/tests/contract/sabre.mjs). No production containers, private volumes, real model or database were accessed.
- 2026-11-17 association fixes: `npm.cmd test` passed all 25 tests using fictional fixtures, including Detach/edit/Combine, Undo/Redo, structured export references and deduplication idempotence in [metadata tests](../card2vcf/tests/contact-metadata.test.mjs). `npm.cmd run test:browser` passed all 4 existing browser tests; `git diff --check` passed.
- 2026-11-17 planning update: `git diff --check` passed; 84 local documentation links/anchors across the index, both implementation plans and this record resolved successfully. Application tests and deployed-schema checks were not run.
- Original implementation verification is retained in the [historical plan](../card2vcf/PLAN.md#verification-record).
- For commit `207df4f`, the previous session reported 16 unit/integration tests and 4 browser tests passing. Coverage lives in [deduplication tests](../card2vcf/tests/dedup.test.mjs) and [browser tests](../card2vcf/tests/browser/dedup.test.mjs), alongside the existing suites.
- This 2026-11-13 update changes documentation only. Source inspection was used to reconstruct the status above; application tests and live deployment checks were not rerun. Validation: git diff --check passed; local documentation links and anchors were checked successfully.

## Updates

- 2026-11-19: Moved **Add simplified variants** (**添加简体姓名**) beside **Add names** in the Names section. The [Edge workflow test](../card2vcf/tests/browser/workflow.test.mjs) checks the button placement in both languages and confirms that it can restore a removed generated name.
- 2026-11-19: Placed **Accept value** to the left of **Dismiss** in extraction suggestions and used the Delete text color for Dismiss. The [combined review browser test](../card2vcf/tests/browser/combined-review.test.mjs) checks the placement and color on a suggestion with a warning.
- 2026-11-19: Removed numbered **Printed version** labels from linked jobs and addresses. Linked entries remain stacked, and jobs still show **Preferred version** on the selected entry. The [Edge integration test](../card2vcf/tests/browser/integration.test.mjs) checks the labels and linked entries.
- 2026-11-19: Moved Main name (**主姓名**) to the first row of the Names stack. The [workflow test](../card2vcf/tests/browser/workflow.test.mjs) checks its position above the individual name values, and the [language test](../card2vcf/tests/browser/ui-language.test.mjs) checks the Chinese field inside the section.
- 2026-11-19: Moved the session warning to the right of Export in compact brown text on the toolbar. The right-panel review checkboxes now read **Reviewed** (**已核对**), and the Simplified Chinese label for Set first met is **设置初会信息**. The [Edge language test](../card2vcf/tests/browser/ui-language.test.mjs) checks the labels and warning placement.
- 2026-11-19: Updated the [contact editor layout](#card2vcf-contact-editor-layout) so Names and the other repeatable contact fields stack their entries in one box per populated section, with dividers between entries and the heading and Add control above the box. The [Edge workflow test](../card2vcf/tests/browser/workflow.test.mjs) verifies the shared box and entry dividers.
- 2026-11-19: Shortened the session notice to the two sentences about discarding the session and exporting before leaving. Both interface languages display the notice in larger, semibold text on an amber banner. The [Edge language test](../card2vcf/tests/browser/ui-language.test.mjs) checks the text in both languages.
- 2026-11-19: Increased the [toolbar dividers](#card2vcf-toolbar-and-sidebar-layout) to 2 px wide and 26 px tall and darkened their color. The [Edge language test](../card2vcf/tests/browser/ui-language.test.mjs) checks divider size and placement at desktop and mobile widths in both languages.
- 2026-11-19: Corrected the [contact editor layout](#card2vcf-contact-editor-layout) to match the heading hierarchy in Jobs and Addresses. Section titles and Add controls sit above separate boxes for individual entries. First met has one box under its heading. The [Edge workflow test](../card2vcf/tests/browser/workflow.test.mjs) checks the heading hierarchy, per-entry borders, and responsive fields. All 32 unit tests and 8 Edge browser tests passed.
- 2026-11-19: Updated the [toolbar and sidebar layout](#card2vcf-toolbar-and-sidebar-layout). The left panel is titled **List of cards** (**名片列表**) and measures 256 px in multi-column layouts. **Set first met** sits beside **Mark reviewed**, with **Delete** centered on the row below. Vertical dividers follow **Add cards**, **Cancel**, and **Redo** and stay beside their controls when the toolbar wraps. The [workflow test](../card2vcf/tests/browser/workflow.test.mjs) and [language test](../card2vcf/tests/browser/ui-language.test.mjs) cover the layout.
- 2026-11-19: Implemented the [card2vcf job-status default](../card2vcf/SPEC.md#amendment-to-the-converter-job-status-default). Verification covers extracted and manually added jobs, explicit status changes on linked rows, and preservation of status during re-extraction. See [browser coverage](../card2vcf/tests/browser/integration.test.mjs) and [metadata tests](../card2vcf/tests/contact-metadata.test.mjs).
- 2026-11-18: Implemented the Monica [plan](MONICA-PLAN.md) in a pinned source tree, with schema/domain services, import review and existing editor/list extensions. Added reproducible fictional [verification and deployment instructions](MONICA-RUNBOOK.md), production build definition and upgrade/rollback rehearsal.
- 2026-11-17: Started Monica implementation from pinned v4.1.2 source and upstream tests. Added an isolated fictional Compose project, additive organization migration, initial work/backfill/contact-method services and VCF normalizer/adapters. This work is in progress; schema and feature acceptance are not yet certified. The production compose configuration, credentials and private data remain untouched.
- 2026-11-17: Completed the converter-side [integration plan](../card2vcf/INTEGRATION-PLAN.md), reconciled its checklist with the implemented source, added complete fictional contract/browser coverage and a reproducible PHP parser harness, and provided the [Monica handoff](../card2vcf/INTEGRATION-PLAN.md#verification-and-importer-handoff). Updated index/spec status without claiming importer completion. Parser verification was performed after the already-present exporter changes; no contract incompatibility was found.
- 2026-11-17: Corrected the existing converter implementation against [metadata and reference decisions](../card2vcf/INTEGRATION-PLAN.md#state-and-editing-decisions): detached rows receive independent IDs with remapped phone references; phone deduplication remaps references before social deduplication. Corrected a test that asserted against a replaced row object and added regression coverage. Evidence: [domain implementation](../card2vcf/public/domain.mjs), [metadata tests](../card2vcf/tests/contact-metadata.test.mjs). This verifies these fixes only, not completion of the integration plan.
- 2026-11-17: Reviewed both specs and the converter integration plan; saved the [Monica implementation plan](MONICA-PLAN.md). No blocking specification conflict found; source/schema, parser and end-to-end verification remain explicit implementation gates. Existing uncommitted converter work was left intact and was not certified by this review. Documentation-only change; no application tests or live deployment checks run.
- 2026-11-13: Saved the [card2vcf integration plan](../card2vcf/INTEGRATION-PLAN.md), including its encoding decisions and planning-stage verification. No application implementation performed.
- 2026-11-13: Established this record from existing source and commit history. Updated [Monica requirements](MONICA-SPEC.md), [card2vcf integration requirements](../card2vcf/SPEC.md#integration-with-modified-monica), and documentation links after the specification review. No application implementation was performed in this update.
