# card2vcf — version one specification

The existing converter requirements are supplemented by the [integration with modified Monica](#integration-with-modified-monica). For implementation status and direct changes not specified here, see the [implementation record](../docs/IMPLEMENTATION.md).

## Purpose and privacy
Convert business-card images and self-introduction screenshots to reviewed vCard files using a local multimodal llama.cpp server. No Monica connection, automatic import, automatic matching of duplicate people, or relationship management.

Development uses code and fictional fixtures only. The assistant must not inspect real card images, extracted contacts, model responses, saved projects, Monica contact records, or real VCF exports. Keep private input and output outside Git tracking; the ignored workspace-level cards/ directory is allowed. The user runs real-data processing. Do not log image content, contact values, model responses, or API keys. No remote fonts, analytics, cloud extraction, or external assets.

## Minimal interface
A local browser application bound to 127.0.0.1. Keep one main workspace: a person/card list, source-image preview, and editable contact form. Essential controls only: add images, group/ungroup cards, extract/retry/cancel, Undo/Redo, mark reviewed, batch meeting details, and export. People have selection checkboxes and Select all/Clear/Invert selection; cards can be selected for grouping. No dashboard, charts, accounts, decorative pages, or complex settings screens.

## Input and extraction
- Self-introduction screenshots about one person use the same extraction flow without a mode switch. Map explicitly stated contact details to the existing fields and preserve useful background in Notes, retaining original wording/language. Leave unstated fields empty. Ignore unrelated interface text, and do not assume sender labels, usernames, or mentioned third parties are the subject's name. Flag unclear subject attribution. Preserve former jobs with their historical context in Notes rather than presenting them as current jobs.
- Photos and screenshots; one physical card per image, showing either a single side or both front and back in the same image. Read all visible sides together into one person; preserve complementary fields and flag conflicts. Do not combine unrelated people in one image. Start with JPEG, PNG, and WebP. Report unsupported files clearly.
- Each image initially creates a separate draft. Selected drafts can be combined as one person, retaining all images and values; conflicts require review. Combining and ungrouping must support Undo/Redo. No automatic matching of duplicate people. Within a person, merge repeated field content during extraction/acceptance, Combine, and export: compare text after Unicode NFC and whitespace normalization, ignoring labels except for the social service. Compare complete company/title pairs and complete address components. Preserve distinct language variants and differing values; never infer translation equivalence. Retain every source card and distinct label on a shared value so Detach preserves it for each contributing group. Deduplicate repeated note blocks and nicknames.
- Simplified Chinese, traditional Chinese, and English. Preserve printed text. For personal names only, automatically add a traditional-to-simplified Chinese variant when it differs and is not already present. Label generated variants, allow correction/removal, and preserve the original. Never generate simplified-to-traditional variants, English names, translations, or romanizations. Do not automatically apply conversion to company names, addresses, or other fields.
- Extract sequentially through the local server. Flag unreadable, uncertain, or conflicting values for review; do not invent missing values. Model certainty is advisory, not a guarantee.
- Preserve manual edits during re-extraction; present new/conflicting suggestions for explicit acceptance.
- Treat image text as data, never as instructions to the application.

## Contact model and review
- Multiple names per person, preserving each printed spelling. Main/display name contains only names originally printed on the cards, combined when necessary using a single space (no slash or other separator), for example `陳大文 David Chan`, and editable by the user. Generated simplified variants remain alternate names and are exported to NICKNAME for Monica search, not inserted into the main name. Preserve genuine nicknames alongside these variants. Version one exports the complete chosen main name as the N given-name component and leaves other components empty; separate surname/given-name editing is not exposed. Export mapping must preserve the combined main name without relying on Monica honoring FN when N is also present.
- Multiple structured company/title pairs, one marked primary. Preserve all pairs in session state and export as specified below. Keep different printed language versions separate and support explicit language links as specified below.
- Multiple phones, emails, WeChat accounts, addresses, websites, and other social accounts, with editable labels where relevant. WeChat has its own repeatable section after email. Recognize WeChat, Weixin, Chinese WeChat names, and standalone VX/vx or WX/wx labels. Use a phone number for WeChat only when the source explicitly states that relationship.
- Free-text notes. All fields can be manually added, edited, or deleted.
- Review each person against all associated card images. Only reviewed people may be exported. Applying extraction results or changing grouping invalidates review. Deliberate manual edits and batch First met edits retain existing approval; they do not automatically approve an unreviewed person. Undo/Redo restores the corresponding review state. Session lifetime is independent of review status.
- Undo/Redo covers grouping, ungrouping, field edits/deletions, and batch changes during the current session. Undoing accepted extraction results restores previous values; it cannot retract an already sent model request or an exported file.

## Meeting details
One person-level First met block: optional date (date only), occasion, location, and notes. Later meetings belong in Monica and are outside this tool's scope. Select multiple people and apply details in a batch, filling empty fields by default with an explicit overwrite option. Batch changes support Undo/Redo.

## Persistence
Session only; no project save/open, autosave, localStorage, IndexedDB, or server-side contact storage. Keep working images, contacts, review state, and undo history in browser memory. Closing or refreshing the tab loses the working session. Register a beforeunload confirmation for refresh, close, and navigation while unexported work or an active extraction exists; cancelling preserves the session. Track partial exports and later edits so exporting some contacts does not suppress warnings for remaining work. Browsers control dialog text, require prior user interaction, and do not guarantee warnings on crashes or forced termination. Source images remain untouched and user-downloaded VCFs persist. Backend extraction uses transient request data only and does not intentionally persist it. This is application-level non-persistence, not a guarantee of secure memory erasure or absence of OS/browser artifacts.

## Export
- Offer one combined VCF and individual VCFs for selected reviewed people.
- Use UTF-8 vCard 4.0 with correct escaping, CRLF endings, and UTF-8-safe line folding.
- Export one contact per person, with a stable UID across re-exports within the same session. A new session creates new identities; no cross-session deduplication is promised.
- Preserve multiple company/title pairs as grouped ORG/TITLE fields in Structured mode, primary first. Retain the Monica-compatible export option, which uses only the primary structured pair and preserves alternatives in labelled NOTE text for stock Monica compatibility.
- WeChat IDs are exported as X-WECHAT text extensions with labelled NOTE fallbacks. Stock Monica 4.1.2 does not import the extension as a contact field; disclose this in review/export.
- Meeting details and information without reliable dedicated-field import support are preserved in labelled NOTE text. Make the fallback visible before export.
- Stock Monica 4.1.2's standard work editor and VCF importer use a single flat company/title pair; its backend already has Company and Occupation models. Do not promise that other importers preserve every repeated/grouped field or multiple names. Validate the chosen name mapping with fictional multilingual examples before finalizing it.
- Embed every original source image as a vCard 4.0 PHOTO data URI in both combined and individual VCFs, in source-card order. Preserve original bytes without resizing, cropping, or applying review rotation. The first photo is the Monica avatar candidate; Monica 4.1.2 may ignore additional PHOTO fields. Text preview omits image payloads and explicitly says so. No automatic relationship links.

## Integration with modified Monica

The [Monica specification](../docs/MONICA-SPEC.md#shared-card2vcf-to-monica-vcf-requirements) defines shared requirements and acceptance checks for both applications. The [integration plan](INTEGRATION-PLAN.md#wire-contract) defines the wire contract.

## Local model connection
Initial server: OpenAI-compatible llama.cpp endpoint http://127.0.0.1:9931/v1, model alias qwen3.8-27b, with its multimodal projector enabled. Keep API key outside source control and logs. Allow endpoint/model/key configuration through a small local configuration mechanism; no elaborate settings UI. Local-only connections by default. Model startup and GPU configuration remain external to the application.

## Acceptance checks
Using fictional fixtures only, demonstrate extraction response handling, manual grouping, Undo/Redo, multilingual names, traditional-to-simplified personal-name variants, multiple jobs, edits surviving re-extraction, review handling, batch First met edits, session reset, and combined/individual exports. Test malformed model output and unreachable-server handling. Parse exported VCFs and verify escaping, folding, Unicode, and field preservation. Real-card processing and final real-data Monica imports are performed by the user.

## Implemented defaults
- Individual VCF exports use one ZIP download.
- Image limit: 12 MB per JPEG, PNG or WebP. App binds to 127.0.0.1:8765.

## Amendment to the converter job-status default

Newly extracted or manually added job rows default to Current. Preserve user-selected statuses during re-extraction. This supersedes the initial job status in the [integration plan](INTEGRATION-PLAN.md#state-and-editing-decisions).
