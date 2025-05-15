## How to use on a new app

The plan is to incorporate this fork of create-react-app and how to use it within the frontier-cli.  
That being said, if you want to use our fork "manually", then here is how you do it.

1. Make sure you are authenticated with Artifactory

   See https://beta.familysearch.org/frontier/docs/getting-started/setup#setting-up-artifactory

2. Run the following command

   `npx create-react-app --use-npm --template @fs/cra-template --scripts-version @fs/react-scripts ${your-app-name}`

## How to test your local copy of react-scripts

If you have cloned this repo and made changes locally and want to test them before committing and publishing here is how.

1. Clone this repo and make any changes needed in `./packages/react-scripts/`
2. In the `react-scripts` directory run `npm install`.
3. Change directories to where you want a brand new app to be created in (don't run step 4 in an existing repo)
4. Run the following command  
   `npx create-react-app --use-npm --template @fs/cra-template --scripts-version file:${relativePathToYourClonedCreateReactAppRepo}/packages/react-scripts ${your-app-name} `


## Development and Cutting a Release

- All development will be done from the frontierMaster branch
  - Branch off of frontierMaster for any feature/bug fixes
  - PRs will be made into the frontierMaster branch

## Merging Upstream changes from Facebook

When we are ready to pull in changes from Facebook, here are the steps

1. Make a PR from facebook's master (main) into our fork's master. This url SHOULD be what you want... please verify before blindly doing anything
   - https://github.com/fs-webdev/create-react-app/compare/master...facebook:main
   - DO NOT SQUASH THE COMMITS when merging the PR. We need to be able to checkout a specific commit later in our steps
2. Locally, check out the master branch and do a `git pull`
3. Find facebook's latest release https://github.com/facebook/create-react-app/releases
4. Find the commit hash corresponding to the release that you want incorporated into our fork.
5. Checkout our develop branch
6. Run `git merge ${HASH_OF_RELEASE_YOU_WANT}`
7. Fix any merge conflicts
8. Bump the 'upstreamVersion' in packages/react-scripts/package.json to match the release of facebook's react-scripts that you merged to
9. Cut a release (follow steps up above)
