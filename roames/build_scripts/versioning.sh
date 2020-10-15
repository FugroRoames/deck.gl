#!/usr/bin/env bash

set +e
echo "Versioning the build file:"
git tag
git branch
# git version relative to tag, or raw ref as last resort
VERSION=${VERSION:-$(git describe --long --abbrev=10 --match "FRD-*" 2>/dev/null)}
echo "FRD version is ${VERSION}"
VERSION=${VERSION:-$(git describe --long --abbrev=10                 2>/dev/null)}
echo "Lastest tag version is ${VERSION}"
VERSION=${VERSION:-$(git describe --long --abbrev=10 --always)}
echo ${VERSION}
set -e
# bit of debug trail
pwd
ls modules/main

FILEVERSION="dist.${VERSION}.min.js"
echo "Version filename ..."
echo ${FILEVERSION}

mv modules/main/dist.min.js modules/main/${FILEVERSION}


