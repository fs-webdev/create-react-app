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
  execSync(`npx nyc report --include 'src/**/*.{js,ts,tsx}' --report-dir coverage --reporter "lcov"`, {stdio: 'inherit'})
}
// dev ran npm test
if(!process.env.CI){
  const args = process.argv.slice(2).join(' ')
  execSync(`react-scripts test ${args}`, { stdio: 'inherit' })
  return
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
  execSync('react-scripts test --coverage', { cwd: process.cwd(), stdio: 'inherit' })
}

// If both types exist, merge coverage reports
if(cypressTestsExist && jestTestsExist){
  mergeReports()
  
  // if only cypress tests exist, move the coverage reports to the coverage directory
} else if(cypressTestsExist){
  renameSync('coverage-cypress', 'coverage');
}
// If only jest tests exist, they're already in the coverage directory
