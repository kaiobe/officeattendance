#!/bin/sh
# Local dev runner: Node 22 needs the flag that Node 24 has as standard.
cd "$(dirname "$0")" || exit 1
exec node --experimental-sqlite server/index.js
