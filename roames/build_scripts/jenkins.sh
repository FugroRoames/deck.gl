# debug - get versions of relavent applications
which node
node --version
npm --version 
cat /etc/system-release
cat /etc/issue
git --version

./roames/build_scripts/install_yarn.sh

ls -a
echo "got installed yarn version"
ls .yarn/bin

.yarn/bin/yarn --version

echo "add yarn to PATH"

export PATH=$PATH:.yarn/bin

echo "debugging"
pwd
ls

yarn install

echo "now yarn build baby"
yarn run build

ls modules/main/*


./roames/build_scripts/versioning.sh


echo "That will do me ...."