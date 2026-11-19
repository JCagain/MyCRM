# card2vcf implementation plan

Status: historical implementation plan and verification record. For current requirements, see [SPEC.md](SPEC.md); for subsequent direct changes and current implementation status, see the [implementation record](../docs/IMPLEMENTATION.md). The completed checklist below is historical. The pending work is covered by the [integration implementation plan](INTEGRATION-PLAN.md).

## Scope and boundaries

- One local browser workspace: selectable people, card previews, editable fields, extraction, Undo/Redo, batch First met edits, and export.
- All real contact data is handled by the user. Development and automated tests use fictional fixtures only. Never inspect private images, contact records, model responses, exports, Monica data, or backups.
- No persistence of contact data: no project files, autosave, browser databases, or server-side storage. No dashboard, authentication system, Monica API connection, automatic matching of duplicate people, or relationship editor.
- Only source code, documentation, dependency files, and fictional test fixtures belong in this directory.
- Do not start or inspect the user's existing model server during development. Use a fake local model service for integration tests. An optional real-model test may use an explicitly identified fictional image only.

## Architecture and defaults

Use Node.js for a small local HTTP server and plain HTML/CSS/JavaScript for the UI. Serve static assets from an explicit allowlist and expose one extraction endpoint. Avoid a frontend framework or build pipeline unless a concrete need appears. The browser owns all working contact state and VCF generation; the server only serves application files and forwards transient extraction requests to the local model.

- App: http://127.0.0.1:8765 (separate from Monica on 8080).
- Model endpoint: http://127.0.0.1:9931/v1.
- Model alias: qwen3.8-27b.
- API key: environment variable supplied by the user; never send it to the browser, embed it in source, or print it.
- Endpoint/model may be configured with environment variables. Accept loopback model endpoints only; do not follow redirects to other hosts or use remote assets.
- Initial image formats: JPEG, PNG, WebP. Establish documented per-image/request limits before implementation and expose friendly errors for oversized inputs.
- Use a maintained, offline traditional-to-simplified converter with locally served assets. Verify its conversion mode and license, then pin the dependency. Do not use the model to invent simplified spellings.
- Add only dependencies with a clear purpose, such as offline Chinese conversion and ZIP creation. Lock resolved versions during implementation.
- Interface text: English initially; all contact fields support Unicode.

The original combined-text bilingual default is superseded. See [Contact model and review](SPEC.md#contact-model-and-review) and [integration requirements](SPEC.md#integration-with-modified-monica) for the current requirements.

## 1. Establish the project and test harness

[x] Add package.json, a dependency lockfile when needed, .gitignore, and documented start/test commands.
[x] Separate browser domain logic from DOM rendering so rules can be tested without a browser.
[x] Add fictional multilingual fixtures, including multiple cards for one fictional person and malformed model replies.
[x] Add a fake local model server; ensure test commands cannot accidentally use the configured real model endpoint.
[x] Keep any browser-test screenshots and artifacts limited to fictional data.

Suggested layout:

    server.mjs
    src/model-client.mjs
    src/extraction-schema.mjs
    public/index.html
    public/styles.css
    public/app.mjs
    public/domain.mjs
    public/vcard.mjs
    public/conversion.mjs
    tests/unit/
    tests/integration/
    tests/browser/
    tests/fixtures/
    README.md

Verification: an empty app starts on loopback, loads local assets, and the test harness runs a fictional smoke test.

## 2. Implement the session model and reversible operations

[x] Define card IDs, person IDs, and per-person export UIDs. Retain the same UID for repeat exports within a session.
[x] Each imported image starts as a draft person. Keep image File/Blob objects in a separate in-memory asset registry, referenced by ID; do not duplicate image bytes in undo snapshots.
[x] Define names with origin (printed, manually entered, or generated simplified), source card references, and user-edit status. Define job pairs, contact fields, notes, First met, review state, and pending suggestions.
[x] Preserve which card produced each extracted value. Model flags are hints, not proof of correctness; do not fabricate confidence percentages.
[x] Implement select/clear selection, combine, detach selected cards into a new draft, delete, and field edits. Combining retains conflicting alternatives and all images, and requires review again.
[x] Define detach behavior explicitly: move card-derived values with their source cards; retain manually entered person-level values on the original person unless the user moves them. Use a small confirmation only when ownership is ambiguous. Undo restores the full prior grouping.
[x] Add Undo/Redo for logical user actions, including a batch edit as one action. Coalesce typing into field-edit actions. A fresh action clears redo history.
[x] Keep export-delivery metadata separate from undoable domain state. Determine whether a person's current content differs from its last exported content so undo does not invent or erase a past download.
[x] Applying extraction suggestions or changing grouping invalidates review. Manual and batch edits retain existing approval, never approve an unreviewed draft. Undo/Redo restores associated review status.

Verification: combine/undo/redo loses no values or images; manual edits survive re-extraction; review state and export-dirty state behave correctly after undo, partial export, deletion, and new edits.

## 3. Build the minimal review workspace

[x] A compact toolbar: add images, extract selected, cancel queue, Undo, Redo, batch First met, and export.
[x] People list with checkbox selection distinct from the active person, Select all/Clear selection, and concise draft/review/error status.
[x] Source image preview with card switching and enough zoom/rotation to read a photographed card. Rotation is a session view/extraction transform; never alter original files.
[x] Editable form with repeatable names, jobs, phones, emails, addresses, websites, social accounts, and notes; add/remove rows and choose the primary job.
[x] Combine selected drafts and detach selected source cards without adding a separate management screen.
[x] First met fields and a small batch dialog. Fill only empty fields by default. Overwrite changes only explicitly supplied fields; blank dialog inputs must not erase existing values accidentally.
[x] Mark reviewed control. Block export for selected unreviewed people with a clear count; offer explicit selection of reviewed people rather than silently omitting drafts.
[x] Readable empty, loading, error, and busy states; keyboard labels and focus behavior; no remote fonts or assets.

Verification: browser test imports fictional images, selects and combines drafts, edits repeated fields, applies a reversible batch update, and marks contacts reviewed.

## 4. Connect local extraction safely

[x] Validate request shape, supported image data, maximum sizes, and allowed model endpoint before forwarding anything.
[x] Bind the app to loopback. Check Host/Origin for extraction requests, require an application session token, use a restrictive content security policy, and expose no arbitrary filesystem or proxy routes.
[x] Forward OpenAI-compatible image chat requests using the configured alias and server-side credential. Use local-only assets and disable response caching; do not log bodies, names, credentials, or raw upstream errors.
[x] Use a narrowly defined extraction JSON schema, instructing the model to preserve printed spellings, leave unreadable fields blank, and report uncertainty. Treat card text as untrusted data.
[x] Validate model output independently. Support a bounded JSON/code-fence envelope, reject malformed or wrong-typed data, and render values as text, never HTML.
[x] Queue extraction per selected card, sequentially, so each result retains source provenance. Grouped cards contribute suggestions to the same person.
[x] Cancellation stops new requests and aborts an in-flight request where possible. Discard late results after cancellation, deletion, regrouping, or stale revisions. Do not promise the upstream server immediately stops GPU work.
[x] First extraction populates an untouched draft for review. Re-extraction presents suggestions; explicit acceptance applies changes without overwriting manually edited or deleted values silently.
[x] Retry targets failures only. Keep already completed drafts intact after a timeout, invalid response, or connection failure.

Verification: fake-server integration tests cover image payloads, sequential requests, credentials remaining server-side, timeouts, cancellation races, invalid JSON, hostile text, and privacy-preserving errors. No test reads real model output.

## 5. Implement name handling and export

[x] Combine printed names with a single space: fictional example `陳大文 David Chan`. Never insert a slash, English translation, or romanization.
[x] Generate simplified variants for personal names only, preserving originals. Add a variant only if different and absent; mark its origin and allow edits/removal. Suppress regeneration of a user-deleted variant until explicitly requested.
[x] Keep generated variants out of the main name and include them alongside actual nicknames in NICKNAME for Monica search.
[x] Preserve the chosen combined name through Monica's importer: a nonempty N given-name field takes precedence over FN. Verify a mapping that keeps the combined text intact (default candidate: the complete chosen name as the N given-name component, with remaining components empty). Do not infer surname boundaries. Version one preserves the complete main name in N and FN without separate surname/given-name controls.
[x] Implement UTF-8 vCard 4.0 serialization with CRLF, reserved-character escaping, text-list escaping, and folding at at most 75 octets without splitting a Unicode character. Prevent injected new properties through user-entered newlines.
[x] Default Monica export: primary company/title pair; preserve other jobs, relevant language variants, websites/social fields not reliably imported, and First met details in labelled NOTE text. Avoid duplicate fallback entries.
[x] Optional structured export: preserve grouped ORG/TITLE entries for multiple jobs and relevant language alternatives. Clearly state that other applications may ignore them.
[x] Preserve phone numbers as entered (including leading + and extensions); do not infer countries. Export optional empty fields by omission. Validate required display names without discarding partial data.
[x] Provide an export preview showing names, aliases, primary job, and note fallback. It must not trigger model calls or contact storage.
[x] Combined export: one VCF containing all selected reviewed people. Individual export: one ZIP containing one VCF per person, avoiding multiple browser download prompts. Use safe collision-resistant filenames.
[x] Generate downloads locally; do not upload contacts to the backend for export. Track export content revisions after initiating a download, while documenting that browsers cannot confirm the user kept the file.

Verification: parse generated VCFs with an independent parser in tests. Verify fictional Chinese/English names, NICKNAME, newlines/commas/semicolons/backslashes, multibyte folding, multiple jobs, stable in-session UIDs, ZIP contents, and partial exports. Check Monica mapping against version 4.1.2 source or an isolated fictional fixture test; never test against the user's contacts or database.

## 6. Add refresh/close protection and verify non-persistence

[x] Register beforeunload only while unexported work or extraction exists. Cancelling a normal refresh or close must retain the session. Use the browser's standard dialog.
[x] Keep a short visible explanation that closing or refreshing discards the session. The warning cannot protect against crashes, forced shutdown, or browser suppression.
[x] Refresh must create a genuinely empty session: no restoration from localStorage, IndexedDB, disk, server state, or history caches intentionally used by the app.
[x] Release image object URLs when no active/undo state references them; avoid console logging or hidden caches of contact data. Server requests should release transient buffers after completion/cancellation.
[x] Verify that refreshing after exporting only some people still warns about remaining work, and editing after export re-enables the warning.

Verification: browser tests check leave-dialog dismissal, acceptance, fresh-session state, partial export behavior, and absence of app-managed persistent contact storage. Browser tests must interact with the page first to satisfy beforeunload activation requirements.

## 7. Finish documentation and review

[x] Document Windows setup, the loopback app URL, endpoint/model/key environment variables, and start/stop commands. Do not copy the user's actual API key into documentation.
[x] Provide a fictional walkthrough: add images, combine, extract, review, batch First met, export, import manually into Monica.
[x] Explain session-only operation, Undo/Redo boundaries, native refresh warnings, export modes, multiple-name/job limitations, and stable UIDs only within a session.
[x] Document safe troubleshooting using counts/statuses only. Never ask the user to paste real images, raw extraction responses, VCF files, or contact-bearing logs.
[x] Run unit, fake-model integration, and fictional browser tests. Inspect changes for accidental persistence, data logging, external requests, and unintended changes outside card2vcf.
[x] Update SPEC.md to reflect final resolved behavior and PLAN.md with actual verification outcomes. Separate mocked extraction verification from real model accuracy; do not claim the latter without a fictional real-model test.

Definition of done: the complete fictional workflow passes locally, the application can be started with documented commands, all agreed UI actions work, and real contact data has never been inspected during development. The user's private card extraction and real Monica import are user-run acceptance steps.

## Verification record

- Windows, Node.js 24.18.0. Commands use npm.cmd without changing PowerShell execution policy.
- Seven unit/integration tests passed: conversion, reversible grouping, batch behavior, schema rejection, independent VCF parsing, ZIP roundtrip, fake model requests, timeout and privacy checks.
- Two Edge headless browser tests passed: review/edit/group/Undo/Redo/re-extraction/batch/export and refresh reset; failure-only retry and partial-export warnings. No real cards were opened.
- Dependency audit after updating fflate to 0.8.3 reported zero known vulnerabilities.
- Real model server and Monica were not contacted. Actual OCR accuracy and private import checks remain user-run. The name mapping follows Monica 4.1.2 source behavior.
- Full-image opening provides browser zoom. Rotation leaves original files untouched. Image URLs are released once no current or history state references them.
- Browser close/crash behavior beyond normal Edge beforeunload cannot be guaranteed. Cancellation is implemented using abort signals and ignoring late results; upstream GPU cancellation is outside this application.
