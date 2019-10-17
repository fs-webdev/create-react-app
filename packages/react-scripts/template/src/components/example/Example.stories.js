import React from 'react'

import ExamplePageComponent from './ExamplePage'
import LearnReactCardComponent from './LearnReactCard'
import ZionCardComponent from './ZionCard'
import NotSignedInCardComponent from './NotSignedInCard'
import SignedInCardReadme from './SignedInCard.md'

export default {
  title: 'ExamplePage',
}

export const ExamplePage = () => <ExamplePageComponent />

export const LearnReactCard = () => <LearnReactCardComponent />

export const SignedInCard = () => null

SignedInCard.story = {
  name: 'Signed In Card',
  parameters: {
    readme: {
      content: SignedInCardReadme,
    },
  },
}

export const NotSignedInCard = () => <NotSignedInCardComponent user={{}} />

export const ZionCard = () => <ZionCardComponent />
