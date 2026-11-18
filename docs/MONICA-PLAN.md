# Monica implementation plan

Status: implemented in source, verified with fictional data and checked against approved live schema metadata; production deployment remains pending. Prepared 2026-11-17; implementation update 2026-11-18. Requirements: [Monica specification](MONICA-SPEC.md). Delivery evidence belongs in the [implementation record](IMPLEMENTATION.md). Reproduction and deployment: [runbook](MONICA-RUNBOOK.md). The [card2vcf wire contract](../card2vcf/INTEGRATION-PLAN.md#wire-contract) is authoritative for exporter/importer encoding.

## Review outcome and boundaries

For defects found in the subsequent implementation review, follow the [repair plan](REPAIR-PLAN.md).

No blocking contradiction was found between the two specifications and the converter integration plan. The contract separates job pairing from language alternatives, preserves explicit phone associations, and retains the compatible export path. Omitting guessed LANGUAGE tags is consistent with the agreed language behavior; ALTID alone can express alternatives ([RFC 6350](https://www.rfc-editor.org/rfc/rfc6350.html#section-5.4)).

The converter and modified importer now pass fictional application integration, including actual browser combined downloads and ZIP entries in both modes; use the [converter handoff](../card2vcf/INTEGRATION-PLAN.md#verification-and-importer-handoff) and [implementation evidence](IMPLEMENTATION.md#verification). Production validation remains separate.

The initial review used public upstream v4.1.2 sources. Implementation subsequently audited the pinned checkout, isolated runtime schema and upstream test tooling. Deployed public-source hashes match that baseline. Following explicit user approval, live version/schema metadata was compared with the fictional environment; results and the non-blocking difference are in the implementation record. No real contact records or card files were inspected. Production migration/service switching remains a later task.

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

The [migration](../monica/database/migrations/2026_11_17_000001_add_contact_organization.php) records the audited additive schema. Both occupation company and title become nullable, with a domain requirement that at least one is present. Existing dates/IDs are retained; primary references are validated against the contact, while category/rating/phone relationships use foreign keys. A missing ORG never creates a fictitious company. Deployed schema differences must be resolved before eventual production migration.

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

- [x] Obtain the pinned source and create the isolated fictional environment described above.
- [x] Audit migrations, casts, work CRUD/API writers, address components, contact-field types, importer policies, list queries, interaction relations and build/test commands. Check deployed source/schema metadata within the [working rules](MONICA-SPEC.md#baseline-and-working-rules) and explicit metadata-only approval, without querying contact contents.
- [x] Record the compatibility/backfill mapping above, including title-only jobs and representative legacy work API writes.
- [x] Run upstream relevant tests and capture field-specific Add/Replace characterization tests, including matching precedence, repeated import, absent fields, retained dates and Notes.
- [x] Run the shared [Sabre probe](../card2vcf/tests/contract/parse.php) with fictional input against the pinned PHP/parser environment. No contract incompatibility was found.

Exit: reproducible source/test environment and a tested migration design. A missing runtime or unverified parser blocks implementation acceptance, not this planning document.

### 2. Add schema and domain services

- [x] Implement additive migrations, account seeding, idempotent legacy backfill, model relations and validation.
- [x] Implement work projection, company matching, variants/link/unlink, primary selection and phone-reference lifecycle services.
- [x] Add fictional legacy-shape/collision/account fixtures, repeated-backfill checks and company/phone deletion coverage; rehearse matching database/storage restoration for migration recovery.
- [x] Test preserving both flat work values and occupations, their employment dates/status, all printed variants and old tag assignments.

Exit: fixtures retain original information after migration and a second run; operations cannot cross account/contact boundaries or undo explicit unlinking.

### 3. Extend importer and existing contact editors

- [x] Implement normalization, preflight review, transactional writes and adapters using the shared contract.
- [x] Add compact work/status/primary and link/unlink controls to existing contact views; show printed variants together. Keep company membership navigation in the existing UI.
- [x] Extend address and contact-method editors through the same domain services; cover phone edit/delete and independent-value conversion.
- [x] Test malformed metadata, partial pairs, exact/ambiguous aliases, same-number associations, two people sharing a company, and legacy imports in both Add and Replace modes.

Exit: fictional cards import with correct relationships; errors do not partially alter a contact; legacy characterization tests still pass.

### 4. Extend organization and interaction views

- [x] Implement category and level management, defaults, ordering, list predicates and batch endpoints/UI.
- [x] Add the derived last-contacted query to existing relevant views and sorts.
- [x] Verify filter algebra, stable pagination/counts, selection scope, atomic batch errors, unrated values, rename/reorder persistence and interaction mutation cases.
- [x] Verify labelled controls, validation messages and desktop/narrow layouts without introducing new dashboards.

Exit: all Monica-only [acceptance checks](MONICA-SPEC.md#acceptance-checks) pass in the fictional environment.

### 5. Verify the actual converter-to-Monica workflow

- [x] Complete the [converter handoff](../card2vcf/INTEGRATION-PLAN.md#7-record-delivery-and-hand-off-to-monica); use and extend its shared fictional fixture module.
- [x] Feed actual browser combined downloads and extracted ZIP entries to the modified application importer in both modes.
- [x] Run the [shared acceptance checks](MONICA-SPEC.md#shared-acceptance-checks), including absent status, partial pairs, all status values, Unicode, two-person unlink isolation, independent/associated equal phone values and repeated Add/Replace.
- [x] Assert ordinary names/nicknames, phones, email, website/First met Notes fallbacks and existing first-PHOTO/avatar behavior. Additional PHOTO values are not certified as attachments.
- [x] Run relevant PHP suites, migration checks and browser flows; record commands/results in the implementation record. New controls use Blade and existing compiled assets.

Exit: actual exporter output passes the complete shared checks in a clean fictional database. Hand-authored VCF or parser-only tests are insufficient.

### 6. Prepare deployment and record delivery

- [x] Build a versioned custom image and prepare the compose override without switching the current deployment; retain loopback binding and existing storage paths.
- [x] Rehearse upgrade, database/storage backup and restoration under the old image on fictional data using the MariaDB 11 image; provide the deployment/recovery runbook.
- [x] Require a completed matching backup before eventual migration and restoration with the prior image for rollback; down-migrations intentionally refuse destructive removal.
- [ ] Leave production real-data processing/import verification to the user under the working rules. Keep deployment pending until that later task; do not inspect backup contents.
- [x] Update the implementation record with spec references/evidence and add source/startup/runbook links to the documentation index, separating implementation from pending production gates.

Exit: implementation delivery is backed by reproducible fictional tests, and deployment has an independently reviewable runbook. Planning completion alone is not implementation or deployment completion.
