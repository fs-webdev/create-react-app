import { i18n } from '@fs/zion-locale'
import { authHeaderInterceptor } from '@fs/zion-axios'
import { useAxios } from 'use-axios-client'

export default function useZionAxios(url) {
  let config = {
    headers: {
      common: {},
    },
    url,
  }
  config.headers['Accept-Language'] = i18n.language
  // We're using the authHeaderInterceptor from zion-axios to set up the config correctly:
  config = authHeaderInterceptor(config)
  return useAxios({ ...config })
}
