# Source provenance

Monica v4.1.2, commit `32028ce3ce79cef38df5d27a297e5b20680f0065`, from https://github.com/monicahq/monica.
Application source was obtained from that commit's archive. The upstream tests,
phpunit.xml, .gitignore and .gitattributes were copied from a checkout of the same commit
because release archives exclude tests. Local modifications are recorded in
[the implementation record](../docs/IMPLEMENTATION.md); requirements and execution
decisions remain in [the Monica plan](../docs/MONICA-PLAN.md).

Build/start/verification instructions: [runbook](../docs/MONICA-RUNBOOK.md).
The pinned base image supplies the unchanged compiled frontend and binary assets;
private-data/binary exclusions remain in force for the source checkout. New controls
are rendered by Blade and use those existing assets.
