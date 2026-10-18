#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
dest="$root/corpus/rustypaste"
if [ -d "$dest/.git" ]; then
  git -C "$dest" fetch --depth 1 origin tag v0.18.0
  git -C "$dest" checkout --detach v0.18.0
else
  mkdir -p "$root/corpus"
  git clone --branch v0.18.0 --depth 1 https://github.com/orhun/rustypaste.git "$dest"
fi
git -C "$dest" describe --tags --exact-match
