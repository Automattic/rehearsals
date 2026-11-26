#!/bin/sh
# Builds the wordpress.org release into build/rehearsals and build/rehearsals.zip,
# leaving out everything listed in .distignore (tests, dev tooling, screenshots).
set -e
cd "$(dirname "$0")/.."
rm -rf build
mkdir -p build/rehearsals
rsync -a --exclude-from=.distignore ./ build/rehearsals/
(cd build && zip -qr rehearsals.zip rehearsals)
echo "Built build/rehearsals.zip"
