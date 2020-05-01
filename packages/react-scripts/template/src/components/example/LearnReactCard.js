import React from 'react'
import { MenuNewWindow } from '@fs/zion-icon'
import { Button, Card } from '@fs/zion-ui'
import ReactImage from './reactjs.jpg'

const LearnReactCard = () => (
  <Card>
    <Card.Image src={ReactImage} alt="React" height="calc(var(--cell-width, 750px) / 2.5)" />
    <Card.Title>Learn React</Card.Title>
    <Card.Actions>
      <Button Icon={MenuNewWindow} href="https://reactjs.org/docs/getting-started.html">
        React Docs
      </Button>
      <Button
        Icon={MenuNewWindow}
        href="https://github.com/fs-webdev/skill-building-program/tree/master/badges-active/react"
      >
        Earn your Badge
      </Button>
    </Card.Actions>
  </Card>
)

// Use React.memo() to keep our component from re-rendering if the props haven't changed
// https://reactjs.org/docs/react-api.html#reactmemo
// https://egghead.io/lessons/react-prevent-unnecessary-component-rerenders-with-react-memo
export default React.memo(LearnReactCard)
