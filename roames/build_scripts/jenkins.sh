# debug - get versions of relavent applications
which node
node --version
npm --version 
cat /etc/system-release
cat /etc/issue
git --version

# install yarn if not found
./roames/build_scripts/install_yarn.sh

ls -a
ls .yarn/bin
echo "got installed yarn version"
.yarn/bin/yarn --version

echo "add yarn to PATH"
export PATH=$PATH:.yarn/bin

echo "debugging"
pwd
ls

echo "Running yarn install"
yarn install

echo "Building DeckGL..."
yarn run build

echo "Version the built asset"
./roames/build_scripts/versioning.sh


echo "That will do me ...."