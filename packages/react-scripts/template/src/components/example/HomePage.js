import React, { Suspense } from 'react'
import {
  Cell,
  colors,
  DialogOverlay,
  DialogOverlayContent,
  Grid,
  HeaderBlock,
  LayoutBand,
  Separator,
  Skeleton,
  useAtSize,
  useOverlay,
} from '@fs/zion-ui'

import { css } from '@emotion/core'
import zionDebug from '@fs/zion-debug'
import { NoticeLoading } from '@fs/zion-icon'
import ZionDesignCard from './ZionDesignCard'
import LearnReactCard from './LearnReactCard'
import PurposeStatementGenerator from './PurposeStatementGenerator'
import WagonWheel from './WagonWheel'
import ResponsiveDebug from './ResponsiveDebug'
import RequireSignedInUser from './RequireSignedInUser'

const debug = zionDebug('frontier:cra:example')
const WagonWheelControl = React.lazy(() => import('./WagonWheelControl'))
const ArtifactsViewer = React.lazy(() => import('./ArtifactsViewer'))

// Custom CSS
const gettingStartedCss = css`
  color: ${colors.text.secondary};
  background-color: ${colors.background.secondary};
  padding: 20px 20px 20px 20px;
`

const logInCss = css`
  background-color: ${colors.help.accent2};
  .secondary};
  padding: 20px 20px 20px 20px;
  text-align: center;
`

const wagonButtonCss = css`
  cursor: pointer;
  border: none;
  background-color: transparent;
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  -html-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  overflow: hidden;
  &:focus {
    outline: none;
    background-color: ${colors.background.secondary};
  }
`
const HomePage = () => {
  // Initiate state variables and hooks
  const atSize = useAtSize()
  const overlay = useOverlay({})
  const [wheelColor, setWheelColor] = React.useState(colors.text.primary)
  const [wheelSpeed, setWheelSpeed] = React.useState('0s')

  const handleWheelSpeedChange = React.useCallback(
    (speed) => {
      debug(`changing wheel animation speed: ${speed}`)
      setWheelSpeed(speed)
    },
    [setWheelSpeed]
  )

  const handleWheelColorChange = React.useCallback(
    (color) => {
      debug(`changing wheel color: ${color}`)
      setWheelColor(color)
    },
    [setWheelColor]
  )

  return (
    <LayoutBand>
      <Grid>
        <Cell verticalAlign="middle" columns={atSize({ sm: 8 })}>
          <HeaderBlock
            size={atSize({ default: 'md', lg: 'lg', xl: 'xl' })}
            heading="This is the beginning of something amazing"
            subHeading="Welcome to the start of your new Frontier application."
          />
        </Cell>

        <Cell columns={atSize({ sm: 4 })}>
          <button
            aria-label="Configure wagon wheel"
            css={wagonButtonCss}
            type="button"
            tabIndex={0}
            onClick={overlay.handleClick}
          >
            <WagonWheel
              alt="Wagon Wheel"
              color={wheelColor}
              animationDuration={wheelSpeed}
              handleClick={overlay.handleClick}
            />
          </button>
        </Cell>

        <Cell>
          <div>
            <LayoutBand css={gettingStartedCss}>
              To get started, take a look at the code in <code>src/App.js</code>. Ready to learn more? Check out the
              resources below or visit the <a href="https://beta.familysearch.org/frontier/docs">Frontier Docs</a>.
            </LayoutBand>
          </div>
          <Separator size="xxs" />
        </Cell>

        <Cell columns={atSize({ lg: 6 })}>
          <ZionDesignCard />
        </Cell>

        <Cell columns={atSize({ lg: 6 })}>
          <LearnReactCard />
        </Cell>

        <Cell>
          <Separator />
        </Cell>

        <Cell columns={atSize({ lg: 12 })}>
          <PurposeStatementGenerator />
          <Separator size="xxs" />
        </Cell>

        <Cell>
          <React.Suspense fallback={<Skeleton.Image height={250} />}>
            <RequireSignedInUser
              Component={ArtifactsViewer}
              fallback={
                <LayoutBand css={logInCss}>
                  We really want to show you some pictures of your ancestors but you must sign in first.
                </LayoutBand>
              }
            />
          </React.Suspense>
        </Cell>
      </Grid>

      {/* Overlay */}
      <Suspense fallback={<NoticeLoading />}>
        <DialogOverlay autoWidth headingText="Wagon Wheel Controls" {...overlay}>
          <DialogOverlayContent>
            <WagonWheelControl
              color={wheelColor}
              animationDuration={wheelSpeed}
              handleColorChange={handleWheelColorChange}
              handleAnimationDurationChange={handleWheelSpeedChange}
            />
          </DialogOverlayContent>
        </DialogOverlay>
      </Suspense>

      <ResponsiveDebug />
    </LayoutBand>
  )
}

export default HomePage
