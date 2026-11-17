# Monica implementation plan

Status: planned, not implemented. Prepared 2026-11-17. Requirements: [Monica specification](MONICA-SPEC.md). Delivery evidence belongs in the [implementation record](IMPLEMENTATION.md). The [card2vcf wire contract](../card2vcf/INTEGRATION-PLAN.md#wire-contract) is authoritative for exporter/importer encoding; this plan does not introduce a second format.

## Review outcome and boundaries

No blocking contradiction was found between the two specifications and the converter integration plan. The contract separates job pairing from language alternatives, preserves explicit phone associations, and retains the compatible export path. Omitting guessed LANGUAGE tags is consistent with the agreed language behavior; ALTID alone can express alternatives ([RFC 6350](https://www.rfc-editor.org/rfc/rfc6350.html#section-5.4)).

The initial planning review did not certify the converter changes. Converter implementation has since passed its own fictional tests and both parser checks; use the [converter handoff](../card2vcf/INTEGRATION-PLAN.md#verification-and-importer-handoff) and [implementation evidence](IMPLEMENTATION.md#verification). Modified-Monica importer and shared end-to-end acceptance remain pending.

The review rechecked the versioned compose configuration and upstream v4.1.2 [import service](https://github.com/monicahq/monica/blob/v4.1.2/app/Services/VCard/ImportVCard.php), [Occupation](https://github.com/monicahq/monica/blob/v4.1.2/app/Models/Contact/Occupation.php) and [Company](https://github.com/monicahq/monica/blob/v4.1.2/app/Models/Account/Company.php) sources. No running schema or private data was inspected. The first implementation gate must confirm the actual source, migrations, parser and supported tooling. No application implementation or deployment is authorized by completing this document.

## Implementation decisions

### Source and test environment

Use a pinned v4.1.2 source checkout under `monica/`, with a reproducible custom image built from that checkout. Record its upstream commit and base-image digest when obtained. Add narrowly scoped source/build allowlist entries to Git only when introducing these files; retain all private-data exclusions. Do not edit a running container as the source of truth.

Create a separate development compose project with its own fictional database and storage, no production bind mounts, and loopback-only ports distinct from the current deployment. Tests must never load the workspace's production credentials. Use upstream lockfiles and test tooling first; settle exact commands after inspecting that checkout. Do not upgrade Monica or MariaDB as part of these feature changes.

### Jobs, variants and compatibility

Implement [companies/jobs](MONICA-SPEC.md#companies-and-jobs) and [multilingual entries](MONICA-SPEC.md#multilingual-entries) through existing occupations plus additive storage:

| Storage | Implementation decision |
| --- | --- |
| Occupation | One logical job, with canonical three-state status and ordered person-owned variant rows. Preserve existing dates and identifiers. |
| Job variant | Store the printed company/title pair together, its order and optional supplied language metadata; do not reconstruct printed text from shared aliases. |
| Company alias | Account-scoped name belonging to an existing company. Keep original spelling and a separate exact-match key. |
| Contact primary job | Nullable occupation reference and representative variant, validated against that contact. |
| Address | Retain existing address records; add contact-owned alternative-group/order metadata and fields needed to preserve all ADR components. |

Final table/column names and foreign keys depend on gate 1's schema audit. A company-only or title-only job must remain representable; do not create a fictitious company for a missing ORG. If the existing occupation schema requires a company, make its relationship nullable and adapt affected services/serializers with regression coverage before importing partial pairs.

Use a single work service for UI, API and importer writes. Keep existing flat work fields as the primary representative projection after migration. Audit every writer before enabling that projection so an old endpoint cannot silently overwrite secondary jobs. The three-state status is canonical; maintain `currently_works_here` as a compatibility projection according to the spec's membership rule. Preserve existing true/false values as Current/Former during migration; do not turn existing explicit status into Unspecified. Legacy API writes without the new status must retain their established boolean meaning.

Backfill occupations from existing flat work data without dropping either representation. A unique identical company/title occupation can supply the primary mapping; otherwise retain the flat pair as a separate legacy-derived job, initially Unspecified, without overwriting occupations or dates. Retain an internal migration provenance key so rerunning the backfill cannot create duplicates. When only occupations exist, use a deterministic order for the initial representative without inventing employment facts. Test empty, conflicting, partial and already-migrated records.

For new company matching, compare Unicode NFC text exactly, preserving case, punctuation and internal spacing; do not rely on a case/accent-insensitive database collation. The lookup key must not force uniqueness across companies because historical ambiguities must remain representable. Restrict every lookup to the account. For an explicitly linked job, evaluate all supplied company names together: one unique company candidate allows reuse and adding missing aliases; no candidate allows creation; multiple candidates or any ambiguous alias require review. Do not automatically merge shared companies. Serialize competing match/create operations within the account to avoid concurrent duplicate creation.

Manual linking of jobs that already point at different company records requires explicit selection of the intended company for that person's job; do not merge or delete shared records. Preserve dates/status or require reconciliation when they conflict. Unlink creates independent person-owned jobs from the variants while retaining company references, dates and status; retain the primary representative. Company lookup must never recreate the person's removed grouping. Address link/unlink similarly changes only contact-owned grouping metadata.

### Contact methods

Use the existing contact-field storage and type lookup for [contact methods](MONICA-SPEC.md#contact-methods). Provision a missing WeChat type idempotently for existing and newly created accounts; reuse customized matching types instead of duplicating them. Keep LinkedIn and WhatsApp repeatable.

Add a nullable WhatsApp-to-phone contact-field reference, constrained in services to a phone of the same account and contact. Resolve its displayed value from the referenced phone. Converting to independent entry or deleting/changing the referenced phone's type must preserve the last resolved value before clearing the link. Apply this through ordinary edits, imports and contact deletion services. Equal text is not sufficient to collapse independent and associated rows. Preserve supplied text for the new structured mapping; do not run it through legacy URL-stripping behavior.

### Import pipeline and review

Extend `ImportVCard` through a parser/normalizer and focused mapping services. Read the [wire contract](../card2vcf/INTEGRATION-PLAN.md#wire-contract) directly when implementing its property names, ordering and legacy fallback. Do not infer pairings by zipping independent ORG and TITLE lists or infer language groups from matching company IDs.

1. Keep existing person matching and the Add skip decision ahead of new mutations, as required by [import behavior](MONICA-SPEC.md#person-matching-and-vcf-import-behavior).
2. Normalize the complete card into ordered jobs/variants, addresses and contact methods. Resolve card-local identifiers only within this card; never treat them as database keys.
3. Validate pairing, status, alternative groups and phone references, and resolve company candidates before changing any existing contact.
4. Write the affected contact graph transactionally, with phone rows available before WhatsApp bindings. Coordinate photo/file side effects with transaction failure so retries do not leave broken references or orphaned new files.
5. Return the existing import result format with an actionable review/error result where new metadata cannot be resolved safely.

Missing status uses the spec default. Unknown/conflicting explicit statuses, duplicate pair tokens, conflicting alternative groups, multiple ambiguous TEL targets or dangling explicit phone references must produce a per-card validation result instead of silently losing information. Legacy cards without the extensions continue through the established mapping; simple legacy grouped jobs follow the wire contract. Unsupported ambiguous repeated legacy pairs require review rather than guessed associations. Preserve optional supplied LANGUAGE metadata without inferring it.

For company ambiguity, add a compact resolution step to the existing import flow showing the affected job and candidate companies. Keep the normalized pending card within the existing authorized import lifecycle, with account/user ownership and expiry; do not add contact values to logs. The user can select the intended company, explicitly create a separate company, or skip the card. Resume with the chosen resolution and revalidate it; no partial contact or company changes precede resolution. One rejected card must not invalidate successfully imported independent cards.

Before extending Replace, write characterization tests for each existing collection's behavior, including absent properties. Jobs must synchronize the imported structured collection and primary projection consistently, while unrelated contacts/shared companies are untouched. Extend address replacement to its grouping metadata and contact-method handling to association identity. Preserve existing field-specific policies instead of imposing a blanket delete-and-recreate strategy: legacy social handling uses `firstOrCreate`, whereas phone replacement removes surplus rows ([import source](https://github.com/monicahq/monica/blob/v4.1.2/app/Services/VCard/ImportVCard.php)). Document the exact extension behavior in tests before coding it. Notes fallbacks remain Notes; never parse them back into duplicate jobs or methods. Ratings, category definitions and interaction records are not import payloads.

### Categories, ratings and the people list

Implement the linked requirements for [tags](MONICA-SPEC.md#tag-categories-and-filters), [ratings](MONICA-SPEC.md#closeness-and-importance) and [batch editing](MONICA-SPEC.md#batch-editing-and-interface):

- Add account-owned tag categories and a nullable category reference on existing tags. Keep old IDs and pivots; uncategorized tags remain usable as one filter group. Renaming or assigning a category changes metadata, not contact assignments.
- Add account-owned level definitions with dimension (`closeness` or `importance`) and position; store nullable level references on contacts. Seed the spec's defaults once per account, including new accounts. Validate dimension and account at every write. Use stable level IDs so reordering never changes ratings; sort by position with a deterministic tie-breaker and Unrated last.
- Centralize people-list predicates in one query service, using grouped `EXISTS` clauses to prevent duplicated people/counts. Reuse it for filtered counts and pagination. Company membership uses the canonical job status and distinct contact IDs; provide a former-members option in the existing company/list view.
- Add selection checkboxes and compact batch controls to the existing list. Initially select explicit visible-row IDs; do not silently interpret a page selection as every filtered contact. Clear selection when filters change. Validate the whole batch and authorization before an atomic write; adding tags uses non-destructive attachment, removing tags detaches only the requested IDs, and setting/clearing ratings is explicit.
- Preserve filter values through pagination and sorting; cover mixed company/category/rating filters and empty results. Add indexes from actual query plans on fictional data, without creating a second search subsystem.

### Last contacted

For [past interactions](MONICA-SPEC.md#past-interactions-and-last-contacted), compute the greatest non-null event date from per-contact aggregates over calls, conversations and activity participation. Prefer a derived query/accessor rather than a new cache requiring invalidation. Reuse it on profiles and any existing list display/sort that represents last contacted. Audit existing similarly named fields before substituting it; do not repurpose reminder scheduling state.

Honor existing date/time-zone conventions and account scopes. Test that backdating, editing, deleting the newest event and adding/removing shared-activity participants all change the derived result correctly. No interactions returns null. Profile views/edits must not change it. Reuse existing interaction forms; this work does not create a new scheduling workflow.

## Execution sequence and exit checks

### 1. Establish the source and compatibility baseline

- [ ] Obtain the pinned source and create the isolated fictional environment described above.
- [ ] Audit migrations, casts, work CRUD/API writers, address components, contact-field types, importer policies, list queries, interaction relations and build/test commands. Inspect deployed source/schema metadata only within the [working rules](MONICA-SPEC.md#baseline-and-working-rules); never query contact contents.
- [ ] Record the exact compatibility/backfill mapping in this plan after the audit, including constraints needed for title-only jobs and the legacy work API.
- [ ] Run upstream relevant tests and capture field-specific Add/Replace characterization tests, including matching precedence, repeated import, absent fields, retained dates and Notes.
- [ ] Run the shared [Sabre probe](../card2vcf/tests/contract/parse.php) with fictional input against the pinned PHP/parser environment. Resolve any incompatibility in the single wire contract before importer changes.

Exit: reproducible source/test environment and a tested migration design. A missing runtime or unverified parser blocks implementation acceptance, not this planning document.

### 2. Add schema and domain services

- [ ] Implement additive migrations, account seeding, idempotent legacy backfill, model relations and validation.
- [ ] Implement work projection, company matching, variants/link/unlink, primary selection and phone-reference lifecycle services.
- [ ] Add fictional migration fixtures for each legacy shape, collisions and two accounts. Exercise interrupted/repeated backfill and foreign-key/deletion paths.
- [ ] Test preserving both flat work values and occupations, their employment dates/status, all printed variants and old tag assignments.

Exit: fixtures retain original information after migration and a second run; operations cannot cross account/contact boundaries or undo explicit unlinking.

### 3. Extend importer and existing contact editors

- [ ] Implement normalization, preflight review, transactional writes and adapters using the shared contract.
- [ ] Add compact work/status/primary and link/unlink controls to existing contact views; show printed variants together. Keep company membership navigation in the existing UI.
- [ ] Extend address and contact-method editors through the same domain services; cover phone edit/delete and independent-value conversion.
- [ ] Test malformed metadata, partial pairs, exact/ambiguous aliases, same-number associations, two people sharing a company, and legacy imports in both Add and Replace modes.

Exit: fictional cards import with correct relationships; errors do not partially alter a contact; legacy characterization tests still pass.

### 4. Extend organization and interaction views

- [ ] Implement category and level management, defaults, ordering, list predicates and batch endpoints/UI.
- [ ] Add the derived last-contacted query to existing relevant views and sorts.
- [ ] Verify filter algebra, stable pagination/counts, selection scope, atomic batch errors, unrated values, rename/reorder persistence and interaction mutation cases.
- [ ] Verify keyboard labels, validation messages and desktop/narrow layouts without introducing new dashboards.

Exit: all Monica-only [acceptance checks](MONICA-SPEC.md#acceptance-checks) pass in the fictional environment.

### 5. Verify the actual converter-to-Monica workflow

- [ ] Complete the [converter handoff](../card2vcf/INTEGRATION-PLAN.md#7-record-delivery-and-hand-off-to-monica); use its fictional fixture module and agreed expected semantics, extending coverage there when necessary.
- [ ] Generate actual combined and individual downloads with the exporter/browser harness. Feed combined cards and extracted ZIP entries to the same modified importer used by the application.
- [ ] Run every [shared acceptance check](MONICA-SPEC.md#shared-acceptance-checks), including absent status, partial pairs, all status values, Unicode, two-person unlink isolation, independent/associated equal phone values and repeated Add/Replace.
- [ ] Assert ordinary names/nicknames, phones, email, websites, Notes/First met and existing photo/avatar behavior remain intact. Do not claim that additional source images become Monica attachments merely because VCF contains them.
- [ ] Run relevant PHP unit/feature suites, migration checks, frontend checks and browser flows, then the converter suites. Record exact commands, versions and results; distinguish parser success from application integration success.

Exit: actual exporter output passes the complete shared checks in a clean fictional database. Hand-authored VCF or parser-only tests are insufficient.

### 6. Prepare deployment and record delivery

- [ ] Build a versioned custom image and prepare the compose change without switching the current deployment. Explain any changed configuration and its effect; retain loopback binding and existing storage paths.
- [ ] Rehearse upgrade, backup/restore and rollback on fictional data using the existing engine version. Provide a runbook covering stopped writers/queues, pre-migration database and storage backup, migration/backfill, image switch and health checks.
- [ ] For eventual deployment, require a completed backup before migration. Rollback restores a matching database/storage backup and prior image; do not assume an old image can safely use migrated data or use destructive down-migrations as the recovery plan.
- [ ] Leave production real-data processing/import verification to the user under the working rules. Keep deployment pending until that later task; do not inspect backup contents.
- [ ] Update the implementation record with spec references and evidence, and add source/startup/runbook links to the documentation index. Record converter, importer, Monica-only features and deployment status separately.

Exit: implementation delivery is backed by reproducible fictional tests, and deployment has an independently reviewable runbook. Planning completion alone is not implementation or deployment completion.
