#!/usr/bin/env bash

set +e
echo "here we go"
# git version relative to tag, or raw ref as last resort
VERSION=${VERSION:-$(git describe --long --abbrev=10 --match "HPC-*" 2>/dev/null)}
VERSION=${VERSION:-$(git describe --long --abbrev=10                 2>/dev/null)}
VERSION=${VERSION:-$(git describe --long --abbrev=10 --always)}
echo ${VERSION}
set -e

pwd

# reference from repo home dir
ls modules/main

FILEVERSION="dist.${VERSION}.min.js"

echo ${FILEVERSION}

mv modules/main/dist.min.js modules/main/${FILEVERSION}


