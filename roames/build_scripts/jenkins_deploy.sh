#!/bin/bash
set -e

#
# This is script that is used in Jenkins to copy the artifacts from a DeckGL build into the public S3 folder
#

# lets just see what artifacts were actually copied
ls

# get all of the local dist.<version>.min.js files ...
file_count=`ls dist.*.js | wc -l`
echo "found ${file_count} js bundles"

if [ "$file_count" -ne "1" ]; then
    echo "Ambiguous number of javascript mimimified bundles"
    exit 1 # terminate and indicate error
fi

# Custom or Prod deploy
SOFTWARE_PREFIX="software/deckgl"
if [ -z ${ROAMES_HPC_USER} ]; then
    SOFTWARE_PREFIX="${SOFTWARE_PREFIX}${ROAMES_HPC_USER}"
fi
echo "Deploying to ${SOFTWARE_PREFIX}"

# 
for js_file in `ls dist.*.min.js`; do
    echo "$js_file";
    echo "copy to s3"
	aws s3 cp ${js_file} s3://roames-software/${SOFTWARE_PREFIX}/dist.min.js
 	aws s3 cp ${js_file} s3://roames-software/${SOFTWARE_PREFIX}/${js_file}
   
    echo "public read ACL on object"
	aws s3api put-object-acl --bucket roames-software --key ${SOFTWARE_PREFIX}/dist.min.js --acl public-read
    aws s3api put-object-acl --bucket roames-software --key ${SOFTWARE_PREFIX}/${js_file} --acl public-read

	echo "debug - read object acl"
	aws s3api get-object-acl --bucket roames-software --key ${SOFTWARE_PREFIX}/dist.min.js
    aws s3api get-object-acl --bucket roames-software --key ${SOFTWARE_PREFIX}/${js_file}

    # look for source maps - no version, just the dist.min.js.map as this is what is referenced in the source map link in bundle
    mapfile="${js_file}.map"
    echo "Looking for map file ${mapfile}"
    if [ -f "dist.min.js.map" ]; then
        echo "The file exists"
        echo "copy to s3"
        aws s3 cp ${mapfile} s3://roames-software/${SOFTWARE_PREFIX}/dist.min.js.map

        echo "public read ACL on object"
	    aws s3api put-object-acl --bucket roames-software --key ${SOFTWARE_PREFIX}/dist.min.js.map --acl public-read
    fi

done

echo "Definitely done"