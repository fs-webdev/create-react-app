import React from 'react'
import { render } from '@fs/zion-testing-library'
import { Providers } from '@fs/zion-ui'
import HomePage from './HomePage'

jest.mock('@fs/zion-user', () => ({
  useUser: () => ({
    signedIn: false,
    userLoading: true,
  }),
}))

afterEach(() => {
  jest.resetAllMocks()
})

test('renders with Frontier Application on the page', async () => {
  const { getByText } = render(<Providers><HomePage /></Providers>)
  const frontierApplication = getByText(/Welcome to the start of your new Frontier application/i)
  expect(frontierApplication).toBeInTheDocument()
})
