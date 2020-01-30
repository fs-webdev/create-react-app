import React from 'react'
import { css } from '@emotion/core'
import { colors, HeaderBlock } from '@fs/zion-ui'

const bannerCss = css`
  padding: 25px;
  text-align: center;
  color: ${colors.text.primary};
`
const Banner = ({ message, color }) => (
  <div css={bannerCss} style={{ backgroundColor: color }}>
    <HeaderBlock size="sm" heading={message} />
  </div>
)

export default React.memo(Banner)
