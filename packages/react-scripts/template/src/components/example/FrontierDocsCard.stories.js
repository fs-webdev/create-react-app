import React from 'react'
import { select, number } from '@storybook/addon-knobs'

import FrontierDocsCard from './FrontierDocsCard'

const colorOptions = { Black: 'black', Red: 'red', Blue: 'blue', Pink: 'pink' }
const animationOptions = {
  range: true,
  min: 0.5,
  max: 20,
  step: 0.5,
}

function log() {
  console.log('You clicked the wheel!')
}

function alerting() {
  /* eslint-disable-next-line no-alert */
  alert('You clicked the wheel!')
}

export default {
  title: 'Frontier Docs Cards',
}

export const defaultWithKnobs = () => (
  <FrontierDocsCard
    logoColor={select('Color', colorOptions, 'black')}
    animationDuration={number('Animation Duration', 10, animationOptions)}
  />
)

defaultWithKnobs.story = {
  name: 'Default (with knobs)',
}

export const redWheel = () => <FrontierDocsCard logoColor="red" />

redWheel.story = {
  name: 'Red Wheel',
}

export const fastSpinningWheel = () => <FrontierDocsCard animationDuration={5} />

fastSpinningWheel.story = {
  name: 'Fast Spinning Wheel',
}

export const fasterSpinningWheel = () => <FrontierDocsCard animationDuration={1} />

fasterSpinningWheel.story = {
  name: 'Faster Spinning Wheel',
}

export const loggingOnClick = () => <FrontierDocsCard handleLogoClick={log} />

loggingOnClick.story = {
  name: 'Logging on Click',
}

export const alertOnClick = () => <FrontierDocsCard handleLogoClick={alerting} />

alertOnClick.story = {
  name: 'Alert on Click',
}
