# card2vcf integration implementation plan

Status: converter implementation and verification completed 2026-11-17; modified-Monica fictional integration completed 2026-11-18. Prepared 2026-11-13. Requirements: [card2vcf integration scope](SPEC.md#planned-integration-with-modified-monica) and its linked Monica sections. Current delivery/deployment status and evidence belong in the [implementation record](../docs/IMPLEMENTATION.md). The [original plan](PLAN.md) remains historical.

This plan specifies implementation decisions and execution order; the linked specs remain the authority for product behavior. Its [wire contract](#wire-contract) is the single reference for the new exporter/importer encoding. The [Monica implementation plan](../docs/MONICA-PLAN.md) references it rather than duplicating it.

## Source findings that affect the implementation

| Existing code | Consequence |
| --- | --- |
| [fields.mjs](public/fields.mjs) supplies editable columns, extraction validation and exact-value identity. | Keep internal IDs, status and associations separate from generic text columns; metadata must not make an empty row count as contact content. |
| [domain.mjs](public/domain.mjs) merges equal rows, retains source-card provenance, splits them on Detach and snapshots state for history. | New references must survive merge/split operations. Text deduplication alone cannot decide whether metadata may be merged. |
| [app.mjs](public/app.mjs) renders generic rows, stores the primary job first and tracks export changes through domain signatures. | Add small specialized renderers and domain operations; include new metadata in signatures without changing the overall workspace. |
| [schema.mjs](src/schema.mjs) accepts the existing extraction shape; [the prompt](src/extraction-prompt.mjs) retains former-job context in Notes. | Keep that extraction policy. Missing application metadata receives defaults locally; the model does not assign user-controlled links. |
| [vcard.mjs](public/vcard.mjs) deduplicates a clone before serialization; combined and ZIP downloads already call it. | Use one mapping for preview and both downloads. Export-time deduplication must obey the same metadata rules as editing. |
| [server.mjs](server.mjs) has an explicit static-file allowlist. | Register any new browser modules there; no new data endpoint is needed. |

## State and editing decisions

Use the existing flat arrays and source provenance. Add focused helpers in a new `public/contact-metadata.mjs`, consumed by the domain, UI and exporter.

- Give jobs, addresses, phones and social rows stable session-local `id` values. Create them when rows enter state, not during rendering or export. Preserve IDs in history snapshots; remap references when a merge replaces a row.
- Job rows gain `status`, initially `unspecified`, plus a nullable `alternativeGroupId`. Addresses gain the same grouping field. Status values and their meaning come from [the job-status rules](../docs/MONICA-SPEC.md#companies-and-jobs).
- A linked job group contains complete company/title rows. Every row retains its own text, source cards and ID; one group's rows have the same status. Changing its status updates all variants in one history action.
- Link selected rows only within the active person's jobs or addresses. If selected jobs have different statuses, leave them unchanged and ask the user to align the existing status selectors before linking. Linking never resolves conflicting statuses silently.
- Store an explicit separation marker when unlinking. Deduplication can consolidate repeated ungrouped extraction values or duplicates within a group, but cannot bridge distinct explicit groups or undo an explicit unlink. Equal job text with different statuses remains separate. Do not let matching one shared value transitively merge two language groups.
- Keep linked job variants contiguous in the array. The first job row remains the primary representative used by the existing compatible exporter. Making a variant primary moves its group first and puts that variant first within it. Linking preserves the existing primary representative when included; unlinking leaves that representative primary.
- Keep LinkedIn/WhatsApp rows in `socials`, using the existing service-name normalizer. Render dedicated repeatable sections for these services and leave other services in the generic social section. Retain the existing extraction JSON shape and service-label handling.
- A WhatsApp row gains nullable `phoneId`. The UI offers an independent number or an explicit selection from this person's phone rows. A linked row reads its current number from that phone; editing the phone updates the displayed/exported number. Switching to independent copies the current number before clearing the reference.
- Before deleting a referenced phone, preserve the resolved WhatsApp number and clear its association in the same history action. When Detach separates the two rows, use that same conversion on the side without the phone. If both move or are copied together, remap the reference within the resulting person.
- Deduplicating phone rows must remap all references to the retained row. Social rows with conflicting explicit associations must not collapse merely because their displayed numbers match.
- Detach partitions language groups by the surviving rows, gives the new person's groups independent IDs, and leaves singleton variants unlinked. Preserve explicit separation markers. Apply existing source/manual ownership rules; no references may point across people.
- Keep the existing review policy: language linking/unlinking is a grouping change; status and contact-method edits are ordinary manual edits. All new operations use existing history, revisions and export-change tracking.

The extractor continues to produce unlinked rows, with jobs initialized to Unspecified. Historical-job context remains governed by [Input and extraction](SPEC.md#input-and-extraction); this work does not promote that Notes content into jobs or add employment-date inputs.

## Wire contract

This section defines the implemented Structured-mode extension. Identifiers below are generated ASCII tokens local to one vCard; they are not Monica database IDs or cross-session matching keys. Emit them deterministically from the ordered state.

### Jobs and language alternatives

- Use one property group `job1`, `job2`, etc. per logical job, with the primary group first. An unlinked row is its own logical job. Preserve row order within each group.
- Use `X-C2V-PAIR=v1`, `v2`, etc. on ORG and TITLE to identify their original company/title row inside that group. Omit an empty ORG or TITLE rather than inventing text; retain its pair token on the property that is present.
- For explicitly linked variants, emit `ALTID=job1-org` on that group's ORG properties and `ALTID=job1-title` on its TITLE properties. Unlinked rows have no ALTID. Distinct jobs never share these ALTID tokens.
- Emit one grouped `X-C2V-JOB-STATUS;VALUE=text` property with the stored lowercase status for each nonempty job group. Missing status when consuming older exports follows the linked spec rule.
- Use repeated ADR properties with a shared `ALTID=address1`, etc. only for explicitly linked address rows. Ordinary repeated addresses have no ALTID.
- Do not infer language tags from scripts, labels or the act of linking. LANGUAGE is optional; this phase omits it because the current state has no verified language-tag metadata. ALTID expresses the explicit alternative relationship without requiring language guessing or a new language-setting UI.

Illustrative property fragment only; the normal serializer supplies the vCard envelope and unchanged fields:

```text
job1.ORG;ALTID=job1-org;X-C2V-PAIR=v1:示例公司
job1.TITLE;ALTID=job1-title;X-C2V-PAIR=v1:顾问
job1.ORG;ALTID=job1-org;X-C2V-PAIR=v2:Example Company
job1.TITLE;ALTID=job1-title;X-C2V-PAIR=v2:Advisor
job1.X-C2V-JOB-STATUS;VALUE=text:unspecified
job2.ORG;X-C2V-PAIR=v1:Another Example Company
job2.TITLE;X-C2V-PAIR=v1:Researcher
job2.X-C2V-JOB-STATUS;VALUE=text:former
ADR;ALTID=address1:;;示例路1号;示例市;;;
ADR;ALTID=address1:;;1 Example Road;Example City;;;
```

For the future importer, the group identifies the logical job, X-C2V-PAIR preserves company/title pairing, and ALTID explicitly links representations of the same property. Retain separate person-level variant rows rather than reconstructing them from company aliases. This also handles company-only/title-only rows and shared text in otherwise different pairs.

The first job group and its first pair carry the primary choice; no second primary flag is introduced. Legacy grouped ORG/TITLE exports without the new metadata remain unlinked single-pair jobs. This contract does not change person matching or Add/Replace.

### Contact methods and phone references

- Keep WeChat's existing mapping by reference to [Export](SPEC.md#export).
- Emit repeatable `X-SOCIALPROFILE;VALUE=text;TYPE=linkedin` and `X-SOCIALPROFILE;VALUE=text;TYPE=whatsapp`. Preserve the entered value, whether a handle, URL or formatted number; do not manufacture a profile URL or reformat phone numbers.
- Give exported TEL properties groups `phone1`, `phone2`, etc. An explicitly associated WhatsApp property receives `X-C2V-PHONE=phone1` and the current resolved phone value. An independent WhatsApp number omits that parameter even if equal to a TEL value.
- Keep the existing social Notes fallback. The structured property, not the fallback text, is authoritative for importing these methods.
- The modified Monica importer must recognize X-SOCIALPROFILE alongside its existing legacy SOCIALPROFILE handling, reuse its contact-field type lookup, and resolve phone references after reading this card's TEL properties. A small mapping adapter is required; stock import support is not assumed.

Example:

```text
phone1.TEL;VALUE=text:+1 202 555 0100
X-SOCIALPROFILE;VALUE=text;TYPE=linkedin:fictional-profile
X-SOCIALPROFILE;VALUE=text;TYPE=whatsapp;X-C2V-PHONE=phone1:+1 202 555 0100
X-SOCIALPROFILE;VALUE=text;TYPE=whatsapp:+1 202 555 0199
```

Custom property/parameter names above define this application's contract; they are not claims of standard Monica or universal vCard support. Keep user text in escaped property values, never interpolate it into group or parameter names.

### Compatible mode

Retain the existing mapping and default selected mode described in [Export](SPEC.md#export). Language/status metadata and phone associations are encoded only in Structured mode. Resolve a linked WhatsApp value before producing its existing Notes fallback. Keep every non-primary printed job row in the compatible fallback, including linked variants. Show a short mode-specific limitation beside the existing preview so the new metadata is not presented as supported by stock Monica.

### Evidence and verification boundary

[RFC 6350](https://www.rfc-editor.org/rfc/rfc6350.html#section-5.4) makes ALTID a same-property alternative marker; it does not pair ORG with TITLE. Its [group syntax](https://www.rfc-editor.org/rfc/rfc6350.html#section-3.3) permits grouping related fields, while this contract supplies the application-specific pairing rule.

Monica v4.1.2's [import service](https://github.com/monicahq/monica/blob/v4.1.2/app/Services/VCard/ImportVCard.php) reads flat work information and legacy SOCIALPROFILE values. Its [lockfile](https://github.com/monicahq/monica/blob/v4.1.2/composer.lock) pins sabre/vobject 4.5.4. That parser's [Document](https://github.com/sabre-io/vobject/blob/4.5.4/lib/Document.php) and [Property](https://github.com/sabre-io/vobject/blob/4.5.4/lib/Property.php) expose groups, parameters and explicit text values.

During planning, an in-memory fictional fragment passed parsing with ical.js 2.2.1. Delivery verification subsequently passed actual exporter output through both ical.js and Monica 4.1.2's Sabre/vobject 4.5.4, using the same semantic expectations. The exporter changes were already present before the PHP gate was executed; no incompatibility was found. Modified application-import evidence is recorded in the [implementation record](../docs/IMPLEMENTATION.md#verification).

## Implementation sequence

### 1. Establish fictional contract fixtures

- [x] Create `tests/fixtures/integration-contract.mjs` with fictional person inputs and expected semantic results. Generate VCF text through the actual exporter in tests; do not add broad exceptions to Git's private-export exclusions.
- [x] Include paired language variants, partial pairs, unrelated jobs, all status values, linked/unlinked addresses, independent and associated WhatsApp entries, LinkedIn and existing ordinary fields.
- [x] Add `tests/vcard-contract.test.mjs` using the installed independent parser, with assertions defined by the wire contract rather than copied serializer output.
- [x] Add a minimal, data-free Sabre parser probe in `tests/contract/parse.php`. Run it against the pinned parser in an isolated PHP environment with fictional input only; no production database, private volumes or actual model endpoint. Read parsed groups, parameters, values and structured components. If the deployed parser is later found to differ, repeat this probe against that version before integration.
- [x] Resolve any parser incompatibility in this contract and its fixtures before proceeding to the exporter. Do not substitute a JavaScript-only result for PHP evidence.

Before the exporter is updated, use a minimal literal fragment for the parser probes; the new exporter assertions may initially fail. Step 6 reruns the probes on actual exporter output.

Exit check: both parser APIs can represent the proposed syntax, and the expected fixture semantics are written down once for the exporter tests and later importer handoff.

### 2. Extend domain metadata and reversible operations

- [x] Implement the state decisions above in `public/contact-metadata.mjs`, `public/domain.mjs` and `public/fields.mjs`. Keep text-field definitions distinct from metadata validation.
- [x] Route row creation, primary selection, deletion, status updates, link/unlink and phone association through domain helpers. Register the new module in the server allowlist.
- [x] Update deduplication to return retained-ID mappings where needed. Apply reference remapping in Combine, Detach, extraction acceptance and export normalization.
- [x] Initialize absent metadata on existing-shaped inputs. Preserve source/manual provenance, suppressed names and pending suggestions. Metadata-only empty rows must neither export nor interfere with untouched-draft detection.
- [x] Add domain coverage in `tests/contact-metadata.test.mjs`; extend the existing dedup suite where its behavior intersects the new metadata.

Exit check: history restores exact grouping/status/reference state; conflicting metadata is not silently lost; Detach and Combine leave no dangling or cross-person references; export normalization is idempotent and does not mutate the reviewed person.

### 3. Connect extraction to the extended state

- [x] Keep the JSON shape in `src/schema.mjs` and `src/extraction-prompt.mjs` backward-compatible. Explicitly request separate printed company/title/address variants without invented language links; do not automatically split existing manually entered text.
- [x] Normalize recognized LinkedIn/WhatsApp labels with the existing service helper. The application supplies row IDs and default metadata; model-supplied internal IDs, group references or phone bindings are not trusted or adopted.
- [x] On accepting re-extraction, deduplicate compatible content without overwriting edited status, chosen associations or explicit link/unlink boundaries.
- [x] Extend fake-model tests for old-shaped results, separate bilingual rows, unknown services, hostile extra metadata and preservation of manual edits.

Exit check: existing extraction fixtures still work; new rows appear in the appropriate editable sections; all new relationships originate from explicit user actions.

### 4. Add the minimal editing controls

- [x] In `public/app.mjs`, render synchronized status selectors on linked job rows and compact selection/link/unlink controls beside job/address rows. Display linked rows together without merging their text inputs.
- [x] Let a printed variant become the primary representative of its logical job. Show incompatible-status validation in the existing status area instead of a new workflow screen. These row-level controls are the delivered refinement of the originally proposed single group-level controls.
- [x] Render repeated LinkedIn and WhatsApp fields alongside the existing contact methods. WhatsApp's number source selector lists this person's phones plus independent entry; keep other socials editable.
- [x] Make remove/edit actions use the domain helpers; retain existing keyboard labels and review controls. Update only the necessary grid rules in `public/styles.css`.
- [x] Use existing history actions for these controls and keep row selection distinct from person/card selection.

Exit check: new controls can be used without extra navigation; manual field edits, grouping review transitions, Undo/Redo and export-dirty warnings match the referenced policies.

### 5. Implement the export contract

- [x] Update `public/vcard.mjs` to normalize a clone, enumerate logical jobs and phone IDs, and serialize the contract above.
- [x] Preserve partial pairs and repeated equal component text when it belongs to different pairs. Export metadata only for nonempty rows; never infer links from matching text.
- [x] Reuse the serializer for text preview, combined VCF and individual ZIP entries. Adjust only the existing mode help in `public/index.html` / `public/app.mjs`.
- [x] Expand independent parsing assertions for Unicode, escaping, line folding, status, explicit versus absent links, and equal-number WhatsApp entries with different association choices.
- [x] Retain existing tests for the established export behavior; add paired download assertions so new fields cannot differ between combined and ZIP paths.

Exit check: parsed exports match the fictional semantic fixtures, the default mode stays unchanged, and serialization leaves state/history untouched.

### 6. Verify the complete converter workflow

- [x] Add `tests/browser/integration.test.mjs` using a fresh browser context, fake model and fictional image buffers, following the current browser-test harness.
- [x] Cover extraction, Combine, selecting/linking variants, status conflict handling, changing primary, phone association/edit/delete, unlinking, Detach and Undo/Redo.
- [x] Cover re-extraction after manual changes, approval state, partial export, edited-after-export warnings and refresh reset.
- [x] Parse actual browser downloads for both modes and both download forms; compare agreed semantics and retain original-photo byte/order checks.
- [x] Check the existing tested desktop and narrow viewport sizes for usable controls and horizontal overflow.
- [x] Run `npm.cmd test`, then `npm.cmd run test:browser`, and the Sabre probe using freshly generated fictional exporter output. Follow the repository's Node setup if the session PATH needs repair.

Exit check: the complete converter test suite passes with isolated fixtures and no dependency on the user's live services. Record commands/results, including any unresolved test limitation, in the implementation record.

### 7. Record delivery and hand off to Monica

- [x] Update [the implementation record](../docs/IMPLEMENTATION.md) with links to the implemented spec scope, this plan, commit evidence and verification results. Describe only implemented behavior that has no other authoritative description; do not paste this checklist or the specs.
- [x] Link the spec to the implementation record for current converter/importer/deployment status. Maintain README/AGENTS links as needed; startup instructions change only with the actual startup process.
- [x] Hand the fictional fixture module, actual exporter-generated VCFs, parser probe and this wire-contract link to the later Monica implementation. Keep generated contact exports outside tracked files unless a narrowly scoped fictional fixture exception is justified.
- [x] Keep [shared acceptance](../docs/MONICA-SPEC.md#shared-acceptance-checks) distinct from converter/parser success. The modified importer has since run actual exports in an isolated fictional database; evidence, including two-person unlink isolation and import matching, is in the implementation record.

The converter can be recorded as implemented after its own checks pass. Full Monica compatibility can be recorded only after the linked shared acceptance checks pass; planning or parser-only verification is not that evidence.

## Verification and importer handoff

Run from `card2vcf/`, using the repository's Windows Node setup:

```powershell
npm.cmd test
npm.cmd run test:browser
npm.cmd run test:contract
```

The contract command requires Docker and uses the digest-pinned Monica 4.1.2 image in [the harness](tests/contract/sabre.mjs). Docker may download that public image on first use. The parser process has networking disabled, a read-only filesystem, no capabilities, no database and no mounted volumes. An empty temporary Docker configuration prevents loading the user's Docker credentials. It reads generated fictional VCF over stdin and asserts the installed parser version and shared semantics. JavaScript-only tests do not replace this command.

The handoff consists of the [fixture and shared semantic assertions](tests/fixtures/integration-contract.mjs), [exporter tests](tests/vcard-contract.test.mjs), [PHP probe](tests/contract/parse.php), [browser download checks](tests/browser/integration.test.mjs) and [wire contract](#wire-contract). Generate fresh fictional VCF on stdout with `node tests/contract/generate.mjs structured` or `node tests/contract/generate.mjs monica`; the importer tests should consume these actual exporter results. Generated exports are not tracked. Combined and individual browser downloads are compared exactly within each mode, including original image bytes and order.

The [Monica plan](../docs/MONICA-PLAN.md) owns importer implementation and isolated-database acceptance; its current results are in the implementation record. No production import, real-model accuracy test, production-schema check or private data processing was performed for this converter delivery.
