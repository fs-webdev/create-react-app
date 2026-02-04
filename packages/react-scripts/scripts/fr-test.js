'use strict'
const {renameSync, existsSync, rmSync, mkdirSync, copyFileSync} = require('fs');
const { execSync } = require('child_process')
const glob = require('fast-glob')
const { join } = require('path')

const mergeReports = ()=>{
  // move coverage directory to coverage-jest
  renameSync('coverage', 'coverage-jest');
    
  // make dirs
  !existsSync('.nyc_output') && mkdirSync('.nyc_output');
  !existsSync('coverage') && mkdirSync('coverage');
  !existsSync('reports') && mkdirSync('reports');

  // combine jest and cypress coverage
  copyFileSync('coverage-cypress/coverage-final.json', 'reports/from-cypress.json');
  copyFileSync('coverage-jest/coverage-final.json', 'reports/from-jest.json');

  // merge reports
  execSync('npx nyc merge reports .nyc_output/out.json', {stdio: 'inherit'})
  // report the coverage
  execSync("npx nyc report --include 'src/**/*.{js,ts,tsx}' --report-dir coverage --reporter lcov --reporter text --reporter text-summary --check-coverage --colors", {stdio: 'inherit'})
}
// dev ran npm test
if(!process.env.CI){
  const args = process.argv.slice(2).join(' ')
  execSync(`react-scripts test ${args}`, { stdio: 'inherit' })
  return
}

// CI mode - check if acceptance:pr script exists
try {
  const packageJson = require(join(process.cwd(), 'package.json'));
  const scripts = packageJson.scripts || {};

  if (scripts['acceptance:pr']) {
    console.log('Found acceptance:pr script, running conditional test...\n');
    try {
      execSync('npm run acceptance:pr', { cwd: process.cwd(), stdio: 'inherit' });
      // Script ran successfully, exit
      process.exit(0);
    } catch (error) {
      // Script failed, exit with error
      process.exit(error.status || 1);
    }
  }
} catch (error) {
  // No package.json or error reading it, continue with normal tests
}

// reset
existsSync('.nyc_output') && rmSync('.nyc_output', { recursive: true });
existsSync('coverage') && rmSync('coverage', { recursive: true });
existsSync('coverage-jest') && rmSync('coverage-jest', { recursive: true });
existsSync('coverage-cypress') && rmSync('coverage-cypress', { recursive: true });
existsSync('reports') && rmSync('reports', { recursive: true });

const jestTestsExist = glob.sync(join(process.cwd(),'src/**/*.test.*')).length //filesWithExtensionExist('.test.')
const cypressTestsExist = glob.sync(join(process.cwd(),'src/**/*.cy.*')).length


if(cypressTestsExist){
  console.log('RUNNING CYPRESS TESTS')
  execSync('npx cypress run --component', { cwd: process.cwd(), stdio: 'inherit' })
}

if(jestTestsExist){
  console.log('RUNNING JEST TESTS')
  execSync('react-scripts test --coverage --colors', { cwd: process.cwd(), stdio: 'inherit' })
}

// If both types exist, merge coverage reports
if(cypressTestsExist && jestTestsExist){
  mergeReports()
  
  // if only cypress tests exist, move the coverage reports to the coverage directory
} else if(cypressTestsExist){
  renameSync('coverage-cypress', 'coverage');
}
// If only jest tests exist, they're already in the coverage directory
