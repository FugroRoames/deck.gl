#!/bin/bash
set -e


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
if [ ! -z ${ROAMES_HPC_USER} ]; then
	echo "ROAMES_HPC_USER exists - ${ROAMES_HPC_USER}"
    SOFTWARE_PREFIX="${SOFTWARE_PREFIX}/${ROAMES_HPC_USER}"
fi

echo "${ROAMES_HPC_USER}"
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
    #mapfile="dist.min.js.map"
    echo "Looking for map file"
    if [ -f "dist.min.js.map" ]; then
        echo "The file exists"
        echo "copy to s3"
        aws s3 cp dist.min.js.map s3://roames-software/${SOFTWARE_PREFIX}/dist.min.js.map

        echo "public read ACL on object"
	    aws s3api put-object-acl --bucket roames-software --key ${SOFTWARE_PREFIX}/dist.min.js.map --acl public-read
    fi

done

echo "All done, Definitely"