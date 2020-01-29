#!/bin/bash

if [ "$NODE_ENV" == "production" ]; then
  echo "-----> Building .npmrc and .netrc"

  echo "//repo.churchofjesuschrist.org/artifactory/api/npm/npm-fhd/:_authToken=${NPM_TOKEN}" > .npmrc
  echo "@fs:registry=https://repo.churchofjesuschrist.org/artifactory/api/npm/npm-fhd/" >> .npmrc
  echo -e "machine github.com\n  login $GITHUB_AUTH_TOKEN" > ~/.netrc
fi
