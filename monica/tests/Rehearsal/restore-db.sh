set -eu
test "$MARIADB_DATABASE" = fictional
exec mariadb --user=fictional --password=fictional-test-only fictional < "$1"
