# Local Monica + card2vcf

This repository versions the local Monica deployment configuration and the card2vcf application. Private data and credentials are deliberately excluded.

- Monica: `monica:4.1.2-apache` with `mariadb:11`, configured in `compose.yaml`, accessible only at http://127.0.0.1:8080.
- card2vcf: local image extraction, contact review and vCard export. See [startup instructions](card2vcf/QUICKSTART.md), [usage](card2vcf/README.md), and [specification](card2vcf/SPEC.md).
- The local vision model is installed and started separately. Model files are not part of this repository.

## Files kept outside Git

`cards/`, `data/`, `backups/`, `.env`, exported contacts, images, dependencies and generated test output are ignored. The existing `.env` supplies the app key and database password; do not commit it. Git is not a database or contact backup.

Monica stores application files in `./data/monica` and database files in `./data/database`. Preserve these directories. Back up the database before schema changes; never reset it or use `migrate:fresh` to prepare a change.

## Development privacy

Develop and test with code and fictional fixtures only. Do not inspect or commit real cards, contacts, model responses, database contents or credential-bearing logs. Synthetic image fixtures used by tests are embedded in test source.
