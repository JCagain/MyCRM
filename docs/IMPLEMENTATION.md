# Implementation record

Updated: 2026-11-17. Maintenance rules: [AGENTS.md](../AGENTS.md).

## Status

| Scope | State | Evidence |
| --- | --- | --- |
| [Existing card2vcf specification](../card2vcf/SPEC.md), excluding its planned-integration section and explicitly future clauses | Implemented in source | Baseline commit `2a0e200`; subsequent changes in `207df4f`. |
| [card2vcf integration scope](../card2vcf/SPEC.md#planned-integration-with-modified-monica) | Converter implemented and verified; importer/shared acceptance pending | [Completed converter plan and handoff](../card2vcf/INTEGRATION-PLAN.md#verification-and-importer-handoff), [metadata helpers](../card2vcf/public/contact-metadata.mjs), [domain](../card2vcf/public/domain.mjs), [UI](../card2vcf/public/app.mjs), [exporter](../card2vcf/public/vcard.mjs). Working-tree delivery; no new commit created. |
| [Monica modification specification](MONICA-SPEC.md) | Planned; not implemented | [Implementation plan and review boundaries](MONICA-PLAN.md), [source audit and deployment limitations](MONICA-SPEC.md#baseline-and-working-rules). |
| [Local deployment configuration](../compose.yaml) | Versioned; runtime not rechecked during this update | Commit `2a0e200`. |

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

- 2026-11-17 converter completion: `npm.cmd test` passed 26 unit/integration tests; `npm.cmd run test:browser` passed 5 browser tests. New [workflow coverage](../card2vcf/tests/browser/integration.test.mjs) exercises the metadata controls, status conflicts, history, fictional re-extraction, desktop/narrow layouts, reset and both modes in combined/ZIP downloads, with exact per-mode VCF equality and original-photo byte/order checks. `npm.cmd run test:contract` passed actual generated fictional output through Sabre/vobject 4.5.4 in a disposable, offline, read-only Monica 4.1.2 image; [shared semantic expectations](../card2vcf/tests/fixtures/integration-contract.mjs) also passed ical.js 2.2.1. The Docker image is pinned by digest in the [harness](../card2vcf/tests/contract/sabre.mjs). No production containers, private volumes, real model or database were accessed. Modified importer/shared acceptance remains pending.
- 2026-11-17 association fixes: `npm.cmd test` passed all 25 tests using fictional fixtures, including Detach/edit/Combine, Undo/Redo, structured export references and deduplication idempotence in [metadata tests](../card2vcf/tests/contact-metadata.test.mjs). `npm.cmd run test:browser` passed all 4 existing browser tests; `git diff --check` passed. Full integration acceptance remains pending.
- 2026-11-17 planning update: `git diff --check` passed; 84 local documentation links/anchors across the index, both implementation plans and this record resolved successfully. Application tests and deployed-schema checks were not run.
- Original implementation verification is retained in the [historical plan](../card2vcf/PLAN.md#verification-record).
- For commit `207df4f`, the previous session reported 16 unit/integration tests and 4 browser tests passing. Coverage lives in [deduplication tests](../card2vcf/tests/dedup.test.mjs) and [browser tests](../card2vcf/tests/browser/dedup.test.mjs), alongside the existing suites.
- This 2026-11-13 update changes documentation only. Source inspection was used to reconstruct the status above; application tests and live deployment checks were not rerun. Validation: git diff --check passed; local documentation links and anchors were checked successfully.

## Updates

- 2026-11-17: Completed the converter-side [integration plan](../card2vcf/INTEGRATION-PLAN.md), reconciled its checklist with the implemented source, added complete fictional contract/browser coverage and a reproducible PHP parser harness, and provided the [Monica handoff](../card2vcf/INTEGRATION-PLAN.md#verification-and-importer-handoff). Updated index/spec status without claiming importer completion. Parser verification was performed after the already-present exporter changes; no contract incompatibility was found.
- 2026-11-17: Corrected the existing converter implementation against [metadata and reference decisions](../card2vcf/INTEGRATION-PLAN.md#state-and-editing-decisions): detached rows receive independent IDs with remapped phone references; phone deduplication remaps references before social deduplication. Corrected a test that asserted against a replaced row object and added regression coverage. Evidence: [domain implementation](../card2vcf/public/domain.mjs), [metadata tests](../card2vcf/tests/contact-metadata.test.mjs). This verifies these fixes only, not completion of the integration plan.
- 2026-11-17: Reviewed both specs and the converter integration plan; saved the [Monica implementation plan](MONICA-PLAN.md). No blocking specification conflict found; source/schema, parser and end-to-end verification remain explicit implementation gates. Existing uncommitted converter work was left intact and was not certified by this review. Documentation-only change; no application tests or live deployment checks run.
- 2026-11-13: Saved the [card2vcf integration plan](../card2vcf/INTEGRATION-PLAN.md), including its encoding decisions and planning-stage verification. No application implementation performed.
- 2026-11-13: Established this record from existing source and commit history. Updated [Monica requirements](MONICA-SPEC.md), [card2vcf integration requirements](../card2vcf/SPEC.md#planned-integration-with-modified-monica), and documentation links after the specification review. No application implementation was performed in this update.
