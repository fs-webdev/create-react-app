import React from 'react'
import { css } from '@emotion/core'

const styles = css`
  background-color: #282c34;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-size: calc(10px + 2vmin);
`

const HomeHeader = ({ children }) => <header css={styles}>{children}</header>

export default HomeHeader
