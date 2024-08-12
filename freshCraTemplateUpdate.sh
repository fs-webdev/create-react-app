#! /bin/bash

npm i -g json
cd ${HOME}/tmp/fresh-cra-template
ls -a

# The order of these sed commands is kind of important. The last one of uncommenting all lines needs to occur after
# removing comments explaining in english steps for replacing the binding path
sed -i.bak 's/{{BINDING_PATH}}/fresh-cra-template.frontier/' blueprint.yml
# https://stackoverflow.com/questions/5410757/delete-lines-in-a-text-file-that-contain-a-specific-string
sed -i.bak '/Replace/d' blueprint.yml
sed -i.bak '/See/d' blueprint.yml
sed -i.bak 's/#//' blueprint.yml

# @fs/react-scripts dep version points to the local file (cause of `npx create-react-app file:localReactScriptsPath`),
# so we need to replace that with the actual version
NEW_CRA_VERSION=$(json -f ${TRAVIS_BUILD_DIR}/packages/react-scripts/package.json version)
echo "NEW_CRA_VERSION: $NEW_CRA_VERSION"
json -I -f package.json -e "this.dependencies[\"@fs/react-scripts\"]=\"$NEW_CRA_VERSION\""

rm package-lock.json
rm blueprint.yml.bak
rm .npmrc

# Commit and push to the existing fs-webdev/fresh-cra-template repo on github
git commit -a -m 'editing blueprint.yml, fixing @fs/react-scripts version'
git remote add origin https://github.com/fs-webdev/fresh-cra-template.git

if [ "$1" == next ]; then
  echo Is next branch, pushing to fresh-cra-template next branch
  git push --force origin master:next
else
  git push --force origin master
fi
