# card2vcf

Local business-card and self-introduction screenshot review and vCard export. No cloud services or Monica connection. All working contacts/images live in browser memory; closing or refreshing the tab discards the session.

For complete startup commands for both PowerShell windows, see [QUICKSTART.md](QUICKSTART.md). The current llama command uses the settings confirmed working on this PC: `--parallel 1 --cache-ram 0 --batch-size 512 --ubatch-size 128`. These limit concurrent work, disable the extra RAM prompt cache, and use smaller processing chunks to reduce peak working memory, potentially at some cost to speed. Model weights and active context buffers stay loaded between cards. Applying these llama flags requires only restarting llama; keep card2vcf and its browser tab open.

## Run on Windows

Install Node.js 22 or newer. Start llama using the quickstart above, then run the app in a separate PowerShell window. No API key is required by default:

    cd D:\Dev\monica\card2vcf
    npm.cmd ci --ignore-scripts
    npm.cmd start

Open http://127.0.0.1:8765 in Edge or Chrome. Stop the app with Ctrl+C. The browser is not opened automatically.

The model server must already be running with image support. Defaults:

| Variable | Default | Effect |
| --- | --- | --- |
| CARD2VCF_PORT | 8765 | App port, loopback only |
| CARD2VCF_ENDPOINT | http://127.0.0.1:9931/v1 | Local OpenAI-compatible image endpoint |
| CARD2VCF_MODEL | qwen3.8-27b | Model alias sent with requests |
| CARD2VCF_API_KEY | empty | Optional bearer credential, server-side only |
| CARD2VCF_TIMEOUT_SECONDS | 300 | Maximum extraction wait, 1–300 seconds; Cancel remains available |

Use `--host 127.0.0.1` for the llama.cpp server to limit it to this PC. Configure its model, multimodal projector, GPU, and context independently. No credentials belong in source files. Maximum image size is 12 MB; JPEG, PNG and WebP are accepted. Images are sent at their original resolution unless rotated. Large photos may be slow or exceed the model's context; resize them yourself if needed.

## Workflow

1. Add card images or self-introduction screenshots. A card image can show one side or both the front and back, side by side or stacked; extraction reads all visible sides into one contact. A self-introduction screenshot uses the same fields, with useful stated background preserved in Notes in the original language. No mode switch or cropping is needed. Keep each image focused on one person. Sender labels and other people mentioned in a chat are not automatically used as names; missing details remain empty. Each image creates a selected draft. Select all/Clear controls checkboxes; clicking a name opens that draft.
2. Select drafts belonging to one person and Combine. Their images and conflicting values are retained. Undo/Redo can reverse this. On the open person, tick some (but not all) source-card checkboxes and use Detach cards beside Combine to split them; source-derived values move with cards, while manually entered person-level details stay on the original person.
3. Extract selected. Requests run sequentially. Cancel stops the queue and ignores late replies; the model may continue computing briefly. Failed drafts are labelled; Retry failed processes only failures in the selection.
4. Review against each source image. Open full image for browser zoom; Rotate changes the image sent on extraction but leaves the source file untouched. All fields are editable. For bilingual companies/titles, enter both versions in the same field separated by spaces. Additional jobs remain separate; Make primary chooses the one Monica will use.
5. Original names form the main name with spaces, e.g. `陳大文 David Chan`. Generated simplified variants (`陈大文`) remain nicknames. Conversion is local and editable; it applies to personal names only. Removing a generated variant suppresses its automatic re-addition; Add simplified variants explicitly regenerates them.
6. Re-extraction offers additional suggestions. Accepting adds nonidentical values for manual review, preserving edited values; dismiss unwanted suggestions. Warnings must be reviewed/dismissed. This does not automatically resolve conflicting card information.
7. Select people and use First met in the selection toolbar to batch-fill date, occasion, location and notes. Blank inputs leave values alone. Overwrite is explicit. Later meetings belong in Monica.
8. Mark each person reviewed using the checkbox at the top or bottom of Contact review. No edits are required if the fields are correct. To approve a batch you have checked, select their people-list checkboxes and click Mark selected reviewed. Everyone selected must have a name and no unresolved extraction suggestions; otherwise nobody is marked. New extraction results/group changes require review again. Manual edits retain existing approval. Export requires every selected person to be reviewed and suggestions resolved.
9. Open Export, choose a download filename (default: contacts), then download a combined VCF or ZIP of individual VCFs. The .vcf or .zip extension is added automatically; files inside a ZIP keep their individual contact names. Check your downloads before leaving. Import the VCF into Monica yourself.

Delete person is available at both ends of Contact review. Delete selected removes only people checked in the list, after confirming the count. Batch review and batch deletion each undo or redo as one operation. Deletion affects this browser session only, leaving source image files untouched.

## Export behavior

- UTF-8 vCard 4.0. Main name uses the complete chosen name as the given-name component of N as well as FN, preventing Monica's importer from splitting bilingual names. This deliberately prioritizes preserving the combined name over surname/given-name sorting; automatic surname splitting is not provided.
- Nicknames contain generated simplified names plus your manually entered nicknames. Monica 4.1.2 searches its nickname field.
- Monica format is the default: one primary company/title; other jobs, First met, websites and socials are preserved in labelled notes. Website URL properties are also exported.
- Structured format groups multiple jobs as ORG/TITLE pairs. Receiving apps may ignore extra properties; Monica still has one company/title pair.
- Stable UID within the current session. Re-adding cards in a new session creates new UIDs. This tool does not detect duplicates.
- Each contact has a filename containing a UID; individual contacts are delivered in one ZIP. Browser download preferences control existing-file naming/overwrite prompts.
- Both combined and individual VCF exports embed every associated original image as a vCard 4.0 PHOTO data URI, in source-card order. Original JPEG/PNG/WebP bytes are preserved: no resizing, cropping, or review rotation is applied to export. Files become larger (base64 adds roughly one third, plus line folding), and large batches need more memory. The text preview omits image payloads for readability; the actual downloads include them.
- Monica 4.1.2 imports the first embedded photo as the avatar, unless a photo avatar is already set. Additional photos are preserved in the downloaded VCF but may be ignored by Monica and other importers. This is not a multi-image attachment import, nor a guarantee Monica retains byte-identical original files. Keep the VCF/originals if you need the full image archive.

## Session and privacy

No project save, autosave, localStorage, IndexedDB, contact database, image cache, cloud extraction, analytics or remote UI assets. Source files remain untouched. The backend forwards transient image requests without logging request/response content. The model server's own logging is controlled separately by you.

Refresh/close/navigation prompts appear when there is unexported content or active extraction, after interacting with the page. Cancel preserves the session. Exporting some people does not clear the warning for others; editing exported content re-enables it. Browsers control the message and cannot guarantee warnings for crashes or forced termination. A requested download is treated as exported, since browsers cannot tell us whether you kept the file.

Undo history and images remain in memory until the session ends. Large batches consume memory. No secure erasure of OS/browser memory artifacts is promised. Work in manageable batches and export regularly.

Keep real cards outside the repository. Development, screenshots and tests must use fictional fixtures only. Do not send real cards, extracted JSON, VCFs or contact-bearing logs to a coding assistant.

## Tests

    npm.cmd test
    npm.cmd run test:browser

Browser tests use installed Microsoft Edge in headless mode, a fake local model, and synthetic one-pixel PNG fixtures. They never connect to your configured model endpoint or Monica. The tests verify application behavior; they do not measure OCR accuracy. There has been no real-model accuracy test.

Chinese conversion uses opencc-js (MIT); ZIP output uses fflate (MIT). Test tooling uses Playwright (Apache-2.0) and ical.js (MPL-2.0). See installed package licenses. Runtime assets are served locally; dependency installation requires network access.

If extraction times out, the card preview keeps a readable failure reason. The default wait is five minutes per card; this is separate from the fast model connectivity check. No model response text is included in diagnostic messages.
