// eslint-disable-next-line strict
const getDataLocalizationRouter = require("./getDataLocalizationRouter.js");

const DEFAULT_TARGET = 'https://beta.familysearch.org'

test('does not modify custom target', () => {
  const proxyConfig = {
    route: '/foo',
    options: {
      target: 'https://example.com'
    }
  }
  const fn = getDataLocalizationRouter({ proxyConfig, target: DEFAULT_TARGET })
  const newTarget = fn()
  expect(newTarget).toBeUndefined()
})

test('does not modify target if no auth', () => {
  const proxyConfig = {
    route: '/foo',
  }
  const req = { get: () => undefined }
  const fn = getDataLocalizationRouter({ proxyConfig, target: DEFAULT_TARGET })
  const newTarget = fn(req)
  expect(newTarget).toBeUndefined()
})

test('does not modify target for regular session', () => {
  const proxyConfig = {
    route: '/foo',
  }
  const req = { get: () => 'Bearer b0-87987987' }
  const fn = getDataLocalizationRouter({ proxyConfig, target: DEFAULT_TARGET })
  const newTarget = fn(req)
  expect(newTarget).toBeUndefined()
})

test('does not modify target for session missing rule set', () => {
  const proxyConfig = {
    route: '/foo',
  }
  const req = { get: () => 'Bearer b-87987987' }
  const fn = getDataLocalizationRouter({ proxyConfig, target: DEFAULT_TARGET })
  const newTarget = fn(req)
  expect(newTarget).toBeUndefined()
})

test('rewrites target for Russian session (beta)', () => {
  const proxyConfig = {
    route: '/foo',
  }
  const req = { get: () => 'bearer b1-87987987' }
  const fn = getDataLocalizationRouter({ proxyConfig, target: DEFAULT_TARGET })
  const newTarget = fn(req)
  expect(newTarget).toEqual('https://beta-ru.familysearch.org')
})

test('rewrites target for Russian session (integration)', () => {
  const proxyConfig = {
    route: '/foo',
  }
  const req = { get: () => 'Bearer i1-87987987' }
  const fn = getDataLocalizationRouter({ proxyConfig, target: 'https://integration.familysearch.org' })
  const newTarget = fn(req)
  expect(newTarget).toEqual('https://integration-ru.familysearch.org')
})

test('rewrites target for Russian session (production)', () => {
  const proxyConfig = {
    route: '/foo',
  }
  const req = { get: () => 'Bearer p1-87987987' }
  const fn = getDataLocalizationRouter({ proxyConfig, target: 'https://www.familysearch.org' })
  const newTarget = fn(req)
  expect(newTarget).toEqual('https://www-ru.familysearch.org')
})

