# Monica and card2vcf repair plan

Source repairs and fictional verification completed on 2026-11-18. The implementation review found seven gaps. Five reproduced with fictional data. The CardDAV logging and import-report findings came from tracing the source and now have regression tests. [Verification results](IMPLEMENTATION.md#verification)

Work through the items below in order. For each item, reproduce the failure against the current implementation, make the smallest change that fixes it, and retain the regression test. Use the [Monica spec](MONICA-SPEC.md), [converter spec](../card2vcf/SPEC.md) and [wire contract](../card2vcf/INTEGRATION-PLAN.md#wire-contract) as the requirements. The choices below describe how to implement the repairs.

### 1. Keep card contents out of CardDAV logs

- [x] Exercise both branches in [UpdateVCard](../monica/app/Jobs/Dav/UpdateVCard.php) with a captured test logger. Cover a pending company review with an incoming ETag, an actual ETag mismatch and an exception whose message contains a fictional marker.
- [x] Give a pending import its own outcome so it does not generate a misleading ETag mismatch. For a mismatch or failure, record the operation and a fixed reason. Remove the card, contact URI, raw exception message and exception object from log arguments. Preserve failure and retry behavior, including checking what the queue error reporter receives.
- **Pass when** the job still signals a real failure, and neither log messages nor context contain the fictional name, URI, card text or photo marker on any tested branch. [Import privacy and review lifecycle](MONICA-PLAN.md#import-pipeline-and-review)

### 2. Reuse the employer during legacy backfill

- [x] In [Backfill](../monica/app/Services/Organization/Backfill.php), keep the decision to create a separate *occupation* for conflicting flat work independent of the decision to create a *company*. Under the existing account lock, use [Work](../monica/app/Services/Organization/Work.php) to reuse a unique exact name or alias and create a company only when there are zero candidates. For multiple candidates, preserve the printed company on the person’s variant and leave the company reference unresolved for explicit selection in the existing work editor. Keep the provenance key so a rerun preserves both unresolved and manually resolved jobs.
- **Pass when** two legacy people with one employer and different titles appear together under one company. Exercise unique alias, genuinely ambiguous name, title-only job and conflicting dated occupation cases. Run backfill twice and compare company, occupation and variant IDs, memberships, primary references and employment dates. Include the shared-employer case in the upgrade rehearsal. [Companies and jobs](MONICA-SPEC.md#companies-and-jobs)

### 3. Keep employment history with the same job on Replace

- [x] Replace the positional assignment in [ImportOrganization::jobs](../monica/app/Services/VCard/ImportOrganization.php) with a one-to-one match computed **before writes**. Match on the contact’s printed company/title pairs, including linked variants, independent of job order and primary representative. Reserve unique exact variant-set matches first, then use an unambiguous shared printed pair for a changed variant set. Status is editable. Card-local group tokens, shared company IDs and array positions cannot establish job identity across imports.
- [x] Reuse a matched occupation ID and its stored employment details. Apply incoming order and primary selection after matching. Create genuinely new jobs without copying dates, salary or description; remove surplus jobs under the existing structured Replace policy. If overlapping or repeated pairs admit multiple assignments, return an actionable per-card result and leave the graph intact. Preserve Add, legacy imports and absent-property behavior. [Replace policy](MONICA-SPEC.md#person-matching-and-vcf-import-behavior)
- **Pass when** importing Alpha (2001) and Beta (2020), then making Beta primary and reimporting, keeps both original IDs and dates while projecting Beta as primary. Also cover changing the representative within a linked job, inserting/removing a job, duplicate pairs with different histories, and repeating the same Replace.

### 4. Preserve case-distinct contact methods

- [x] In [ImportOrganization::fields](../monica/app/Services/VCard/ImportOrganization.php), scope candidates by account, contact, field type and explicit phone reference, then compare the stored and incoming values exactly. Keep this lookup and creation inside the import transaction. A change to the database-wide collation is unnecessary.
- **Pass when** importing LinkedIn values `Abc` and `abc` into the fictional MariaDB stores both original strings, and a second Replace adds neither again. Exercise WeChat and independent versus phone-bound WhatsApp with equal displayed text. [Contact methods](MONICA-SPEC.md#contact-methods)

### 5. Recognize the same extraction after a manual metadata edit

- [x] At [extraction acceptance](../card2vcf/public/domain.mjs), recognize a previously accepted observation by its source card and normalized printed fields before ordinary row deduplication. Use the printed observation for this check even when a bound WhatsApp number now displays an edited phone value. If needed, retain the accepted source identity with session provenance through Undo/Redo, Combine and Detach. A repeat must preserve the user’s status, group, separation and phone choice. Continue offering genuinely new values through the existing suggestion flow.
- [x] Keep distinct deliberately entered rows and the existing metadata compatibility checks for Combine and export. Include a case where independent and bound versions of the same number already exist.
- **Pass when** accepting the same fictional card again after setting a job to Former and binding WhatsApp leaves exactly one job and one bound method. Assert counts, status, phone reference and parsed export after a phone edit and Undo/Redo. Import that export into Monica and verify that the person stays out of the default current-members list. [Extraction and editing decisions](../card2vcf/INTEGRATION-PLAN.md#state-and-editing-decisions)

### 6. Choose the first nonempty job for compatible export

- [x] In the shared [vCard serializer](../card2vcf/public/vcard.mjs), filter job rows using the existing meaningful-content predicate before selecting the compatible-mode primary and generating “Other job” Notes. Preserve the order of the remaining rows, including company-only and title-only jobs.
- **Pass when** a blank first row followed by a real job produces the real ORG/TITLE, a blank trailing row produces no fallback note, and an all-blank job list produces neither. Check the preview, combined download and extracted ZIP entry. Keep Structured output covered by the existing parser tests. [Compatible mode](../card2vcf/INTEGRATION-PLAN.md#compatible-mode)

### 7. Make the import report reflect the outcome of company review

- [x] In [ImportJob](../monica/app/Models/Account/ImportJob.php), attach the review ID to the specific report row as it is created. In [review resolution](../monica/app/Http/Controllers/OrganizationController.php), lock that review and its associated report/job. Commit the import, report outcome and counter changes together. Account for the import worker’s final counter save if resolution overlaps an active import.
- [x] On successful import, mark the row imported, clear its skip reason and review link, and move one from skipped to imported exactly once. Explicit skip or an Add match stays skipped and loses the link. An expired review stays skipped with no active link. A recoverable failure retains a usable review. If revalidation requires a replacement review, point the original report row to the active one. Render the actual state in the [report view](../monica/resources/views/settings/imports/report.blade.php).
- **Pass when** an upload containing one successful card and one ambiguous card initially counts one imported and one skipped. Resolving the latter changes the totals to two and zero, with no stale link. Exercise skip, expiry, failed resolution, repeated submission and resolution while another card is processed. Verify the same report row, unchanged total found and existing account/user ownership throughout. [Import pipeline](MONICA-PLAN.md#import-pipeline-and-review)

### Completion checks

- [x] Run the converter unit, browser and Sabre contract suites, followed by the Monica organization PHPUnit suite against the fictional MariaDB. Run the combined-file and ZIP-entry handoff with output from the repaired converter in both modes. [Converter verification](../card2vcf/INTEGRATION-PLAN.md#verification-and-importer-handoff)
- [x] Rebuild the candidate image and run the packaged browser smoke check and fictional upgrade/restore rehearsal against that image. Record the new image ID and results in the [implementation record](IMPLEMENTATION.md). Deployment is a separate operation under the [runbook](MONICA-RUNBOOK.md).
