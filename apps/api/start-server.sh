#!/bin/sh
set -eu
# Run after the persistent disk is mounted. Existing admin passwords are retained.
node dist/bootstrap.js
exec node dist/index.js
