import React from 'react'
import { MenuNewWindow } from '@fs/zion-icon'
import { Button, Card } from '@fs/zion-ui'
import ZionImage from './zion.jpg'

const ZionDesignCard = () => {
  return (
    <Card>
      <Card.Image height="calc(var(--cell-width, 750px) / 2.5)" src={ZionImage} alt="Zion National Park" />
      <Card.Title>Zion Design System</Card.Title>
      <Card.Actions>
        <Button Icon={MenuNewWindow} keyline="left" href="https://beta.familysearch.org/frontier/zion">
          Zion Docs + Components
        </Button>
        <Button Icon={MenuNewWindow} href="https://github.com/fs-webdev/zion">
          Github
        </Button>
      </Card.Actions>
    </Card>
  )
}

// Use React.memo() to keep our component from re-rendering if the props havent changed
// https://reactjs.org/docs/react-api.html#reactmemo
// https://egghead.io/lessons/react-prevent-unnecessary-component-rerenders-with-react-memo
export default React.memo(ZionDesignCard)
