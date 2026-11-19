# Monica modification specification

This document records the agreed requirements. For implementation and deployment status, see the [implementation record](IMPLEMENTATION.md).

## Baseline and working rules

The local compose.yaml was rechecked on 2026-11-12: monica:4.1.2-apache and mariadb:11, with Monica bound to 127.0.0.1:8080. The findings below come from the original audit of the official v4.1.2 source, when Docker Desktop's Linux engine was unavailable. Subsequent deployed public-source and user-approved schema-metadata verification is recorded in the [implementation record](IMPLEMENTATION.md#verification).

Inspect the existing implementation before proposing an addition. Reuse features that already satisfy the requirement. Keep the interface simple and limit changes to the agreed scope. Explain configurable values and their effects before changing them.

Development uses application code and fictional fixtures only. Never inspect real cards, contacts, exports, model responses or database contents. Keep cards/, data/, backups/, exports and credentials outside Git. Preserve existing data; back up the database before any eventual migration. Do not reset the database or use migrate:fresh.

## Existing features checked

| Area | Existing v4.1.2 implementation | Consequence for this work |
| --- | --- | --- |
| Companies and jobs | Company and Occupation models and CRUD API endpoints exist. Occupations already link a person to a company and store title, currently_works_here, start date and end date. | Reuse these records. |
| Standard work editor | The web form edits the contact's single company and job text fields; it has no current/former status selector. | Integrate multiple occupations, primary selection and company grouping into the existing interface. |
| Tags | Tags belong to contacts through a many-to-many relation; the tag model has no category relation. | Add one-level categories while preserving existing tags. |
| People list | The existing list has tag filters and sorting. | Extend the current list with the agreed filters, selection and batch actions. |
| Past interactions | Calls have called_at; conversations and activities have happened_at. Activities can include multiple people. | Reuse the existing recording features and their event dates. |
| VCF import | The importer has Add and Replace modes. The upload form selects Add by default. LinkedIn and WhatsApp socialProfile mappings exist; WeChat, LANGUAGE and ALTID handling do not. | Extend field mapping for agreed contact methods and multilingual records while retaining existing person matching and Add/Replace behavior. |

Source references:

- [Company model](https://github.com/monicahq/monica/blob/v4.1.2/app/Models/Account/Company.php), [Occupation model](https://github.com/monicahq/monica/blob/v4.1.2/app/Models/Contact/Occupation.php), [API routes](https://github.com/monicahq/monica/blob/v4.1.2/routes/api.php).
- [Work editor](https://github.com/monicahq/monica/blob/v4.1.2/resources/views/people/work/edit.blade.php), [people list](https://github.com/monicahq/monica/blob/v4.1.2/resources/views/people/index.blade.php), [Tag model](https://github.com/monicahq/monica/blob/v4.1.2/app/Models/Contact/Tag.php).
- [Call](https://github.com/monicahq/monica/blob/v4.1.2/app/Models/Contact/Call.php), [Conversation](https://github.com/monicahq/monica/blob/v4.1.2/app/Models/Contact/Conversation.php), [Activity](https://github.com/monicahq/monica/blob/v4.1.2/app/Models/Account/Activity.php).
- [Import service](https://github.com/monicahq/monica/blob/v4.1.2/app/Services/VCard/ImportVCard.php), [upload form](https://github.com/monicahq/monica/blob/v4.1.2/resources/views/settings/imports/upload.blade.php).

## Agreed changes

### Companies and jobs

- A person can have multiple company/title pairs, with one primary job.
- Preserve former jobs and existing employment dates/status.
- Job status is editable in both Monica and card2vcf: Current, Former or Unspecified. Store Unspecified distinctly, but treat it as current for company membership and filtering; only Former is excluded from the default current-members view. An absent imported status becomes Unspecified.
- Group people by company. Show current members by default; former memberships remain accessible.
- A company's linked printed language variants are names of the same company record. Person-level language grouping follows the [multilingual rules](#multilingual-entries).
- During import, a unique exact match against any stored company name or language alias reuses that company. Ambiguous matches require review. Do not guess that differently worded names or translations are equivalent.
- Preserve information in both the existing flat company/job fields and occupation records when integrating the agreed behavior. The compatibility mapping requires checking the deployed schema before implementation.

### Tag categories and filters

- One level of categories, such as Area containing Finance, Healthcare and Governance.
- A person can have multiple tags within a category.
- Allow creating and renaming categories and tags.
- Within a category, selected tags use OR. Across categories and other selected filters, conditions use AND.
- Example: Finance OR Healthcare, AND company ABC, AND High importance.
- Preserve existing tags and assignments. Categorizing an old tag must not discard its contacts.

### Closeness and importance

- Two independent optional named levels: Closeness and Importance (priority).
- Initial closeness labels: Acquaintance, Familiar, Close.
- Initial importance labels: Low, Medium, High.
- Both support Unrated, distinct from the lowest level.
- Allow adding, renaming and reordering levels. Level order defines sorting.
- Ratings are entered by the user. Interaction dates do not automatically change them.

### Contact methods

- WeChat and LinkedIn are repeatable contact methods with their own editable fields.
- Reuse Monica's existing configurable contact-field mechanism and existing LinkedIn/WhatsApp support where suitable.
- WhatsApp can reuse a selected phone number or store a different number. The user explicitly chooses the association; do not assume every phone number supports WhatsApp.
- Extend both card2vcf export and Monica import so these methods arrive in contact fields, following the [shared VCF requirements](#shared-card2vcf-to-monica-vcf-requirements).
- Preserve card2vcf's dedicated WeChat field and recognition of WeChat, Weixin, Chinese WeChat names, VX/vx and WX/wx labels.

### Multilingual entries

- Store printed Chinese/English versions of company names, job titles and addresses separately, linked as versions of one logical item.
- Show all stored language versions together by default.
- Preserve every printed version. Do not generate translations or equate translated-looking text automatically.
- Keep genuinely different jobs and addresses separate from language alternatives of one job/address.
- Respect explicit language-alternative links supplied by a VCF.
- If the VCF does not explicitly link entries as language alternatives, keep them separate until the user manually links them. Provide manual linking/unlinking controls in both card2vcf and Monica.
- Unlinking affects only that person's language-alternative grouping. It must not remove shared company names/aliases, split the shared company record or change another person's entries or memberships. Company-name matching must not automatically undo that person's explicit unlink.
- Company-name matching follows the separate exact-match rule above; it does not infer a new translation relationship.
- Preserve the established personal-name policy: combine printed names in the main name using a single space, without a slash. Generated traditional-to-simplified personal-name variants remain alternate names exported through NICKNAME, alongside genuine nicknames. Do not generate reverse conversions or English translations.

### Past interactions and last contacted

- Record interactions that have already happened, using existing activities, calls and conversations.
- Last contacted is the latest event date across the person's recorded calls, conversations and shared activities: called_at for calls, happened_at for conversations and activities.
- Recording a past interaction automatically updates last contacted according to that event date.
- Editing or viewing a contact profile does not count as contacting the person.
- Keep the established division: card2vcf records First met information; later interactions are recorded in Monica.
- Reminders, next-follow-up dates, follow-up frequency, scheduled contact plans and notifications are outside this modification scope. Existing Monica reminder features and data are not being removed.

### Batch editing and interface

- Keep the current people-list layout.
- Allow selecting multiple people to add/remove tags and set closeness or importance.
- Adding tags preserves existing assignments. Replacing or clearing a value must be explicit.

## Shared card2vcf-to-Monica VCF requirements

This section defines shared requirements for the converter and Monica importer. The [wire contract](../card2vcf/INTEGRATION-PLAN.md#wire-contract) defines the encoding.

Use the existing Structured export as the path for the agreed structured fields into modified Monica. Retain the existing Monica-compatible export and its default selection for stock Monica compatibility: it emits one primary company/title pair and preserves other jobs in Notes. Combined and individual VCF downloads must use the same field mapping.

| Information | card2vcf export responsibility | Modified Monica import responsibility |
| --- | --- | --- |
| Names | Retain the existing printed main-name mapping through N/FN and generated simplified aliases through NICKNAME. | Preserve the established main name and nickname behavior. |
| Companies and jobs | Reuse the existing grouped ORG/TITLE export for every job, primary first. Preserve company/title pairing and the per-job status defined in [Companies and jobs](#companies-and-jobs). | Import every structured pair into the existing company/occupation model, retain the primary selection, and apply the agreed company-name matching and status rules. |
| WeChat | Retain repeatable X-WECHAT values and the existing labelled Notes fallback. | Import X-WECHAT values into WeChat contact fields. |
| LinkedIn and WhatsApp | Export the explicitly supplied service and value as structured contact properties. Notes alone do not meet this requirement. Preserve an explicit WhatsApp/phone association where supplied; never infer one just because numbers match. | Import the properties into the corresponding contact fields, reusing existing social-profile handling where suitable. Support the agreed explicit WhatsApp phone association. |
| Company names, job titles and addresses in multiple languages | Preserve separate printed versions and explicitly supplied language-alternative links. Keep distinct jobs/addresses and unlinked variants separate. | Respect explicit links, show linked variants together, and allow manual linking/unlinking. Unlinked entries remain separate until linked by the user, subject to the agreed company-name matching rule. |

Keep the existing handling of phones, emails, websites, Notes, First met information and original PHOTO data. This integration does not add a live Monica connection or automatic import to card2vcf. First met remains in the existing export mapping; later interaction recording and last-contact calculation belong to Monica. Company groups, tag categories, ratings and batch tag/rating edits remain Monica features.

### Shared acceptance checks

Use fictional fixtures to follow an actual card2vcf export through the modified Monica importer, rather than testing only independently constructed import files:

- A person with multiple jobs retains every company/title pair, the primary choice and each job's status; absent status follows [Companies and jobs](#companies-and-jobs).
- WeChat, LinkedIn and WhatsApp arrive in their contact fields; an explicitly supplied WhatsApp phone association survives.
- Linked company/title/address language variants retain their printed text and links. Distinct jobs/addresses and unlinked variants stay separate; manual link/unlink behavior works as specified. Use two fictional people sharing a company to verify that unlinking for one leaves the other and the shared company unchanged.
- Printed names, generated simplified aliases and the existing ordinary contact fields remain intact.
- Combined and individual exports preserve the same agreed information.
- Monica-compatible export retains its existing primary-job/Notes fallback behavior; it is not the format used to demonstrate complete structured multi-job import.
- The extended mappings retain the agreed person matching and Add/Replace behavior.

## Person matching and VCF import behavior

The existing person-matching strategy and Add/Replace behavior are sufficient and will be retained.

For ordinary VCF imports, the current service tries UID, then email, then first/middle/last name matching. It takes a first match rather than enforcing uniqueness. Add is the default and skips matched contacts. Replace can overwrite imported collections and remove surplus rows; Notes are appended. This is not a fill-empty-only merge. See the linked import service for field-specific behavior.

The agreed company-name matching and new field/language mappings do not authorize changes to person matching or replacement policy.

## Acceptance checks

Use fictional fixtures only to verify the agreed behavior:

- Multiple company/title pairs, primary selection, retained former jobs, and company groups showing current members by default.
- Company reuse through a unique exact name/alias match, with ambiguous matches requiring review.
- One-level tag categories, multiple tags within a category, OR within categories and AND across selected filter groups.
- Independent named closeness/importance levels, Unrated, and user-controlled label ordering.
- Batch tag changes and rating changes within the existing people-list layout, preserving existing tags when adding.
- WeChat, LinkedIn and WhatsApp field import from actual card2vcf exports, including explicit phone association for WhatsApp; verify the shared acceptance checks above.
- Separate language variants displayed together when linked; explicit VCF links preserved; unlinked entries kept separate until manually linked; unlinking available.
- Preservation of the established printed-name and generated simplified-name behavior.
- Last contacted determined by the latest recorded call, conversation or shared-activity event date.
- Existing person matching and Add/Replace behavior retained alongside the added field mappings.

Recheck the deployed source/schema before implementation, within the privacy restrictions above. Preserve existing data and take a database backup before deployment changes.
