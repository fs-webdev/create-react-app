/**
 * Gets a router function for http-proxy-middleware that
 * checks the session in the auth header and modifies the target
 * based on the session ruleSet for data localization cases
 * (e.g. Russia: https://beta.familysearch.org -> https://beta-ru.familysearch.org).
 */

module.exports = ({ proxyConfig, target }) =>
  function changeTargetBasedOnSessionRuleSet(req) {
    // only return a target string from this function if the target needs changing
    // otherwise the middleware logs an unnecessary "[HPM] Router new target:"
    if (proxyConfig.options?.target) {
      // Do not interfere with custom target
      return
    }
    // Check session and change target based on ruleSet for data localization cases (e.g. Russia)
    // WARNING: Do not directly parse the session in your app.
    // We have to do it here for localhost development
    // since the Lambda@Edge function will enforce a redirect which will end up dropping the auth header.
    const auth = req.get('Authorization')
    if (!auth) {
      return
    }
    // https://fhconfluence.churchofjesuschrist.org/display/Product/Session+ID+Format
    // example header value: "Bearer p0-Adeq12~_tmc.Qed~3_4ZuIY"
    const ruleSet = /bearer\s+\w{1}(?<ruleSet>\d+)/i.exec(auth)?.groups?.ruleSet
    let subdomainSuffix
    if (ruleSet === '1') {
      // Russian data localization
      subdomainSuffix = '-ru'
      console.log('Rewriting target for Russian data localization')
    }
    return subdomainSuffix && target.replace('.familysearch.org', `${subdomainSuffix}.familysearch.org`)
  };
