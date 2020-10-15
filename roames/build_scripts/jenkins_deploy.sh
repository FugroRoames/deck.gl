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

# 
for js_file in `ls dist.*.min.js`; do
    echo "$js_file";
    echo "copy to s3"
	aws s3 cp ${js_file} s3://roames-software/software/deckgl/dist.min.js
 	aws s3 cp ${js_file} s3://roames-software/software/deckgl/${js_file}
   
    echo "public read ACL on object"
	aws s3api put-object-acl --bucket roames-software --bucket roames-software --key software/deckgl/dist.min.js --acl public-read
    aws s3api put-object-acl --bucket roames-software --bucket roames-software --key software/deckgl/${js_file} --acl public-read

	echo "debug - read object acl"
	aws s3api get-object-acl --bucket roames-software --key software/deckgl/dist.min.js
    aws s3api get-object-acl --bucket roames-software --key software/deckgl/${js_file}
done

echo "Definitely done"