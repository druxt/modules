// The outside world, behind one seam.
//
// Every network read the sync makes goes through a source object, so the tests
// can hand it recorded answers instead of reaching the network. Nothing else in
// the sync knows that GitHub, npm or drupal.org exist.

/** drupal.org asks for one request a second, and means it. */
export const DRUPAL_ORG_INTERVAL_MS = 1000

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function json(url, headers = {}) {
  const response = await fetch(url, {
    headers: { 'user-agent': 'druxt-module-registry', ...headers },
  })
  if (response.status === 404) return undefined
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} for ${url}`)
  }
  return response.json()
}

/**
 * The live sources.
 *
 * A GitHub token is optional for reading public repositories but raises the
 * rate limit from 60 an hour to 5000, which 15 entries times three reads will
 * otherwise exhaust on a busy afternoon.
 */
export function liveSources({ githubToken = process.env.GITHUB_TOKEN } = {}) {
  const gh = githubToken ? { authorization: `Bearer ${githubToken}` } : {}
  let drupalOrgNext = 0

  return {
    async repo(fullName) {
      const d = await json(`https://api.github.com/repos/${fullName}`, gh)
      if (!d) return undefined
      return {
        private: d.private,
        archived: d.archived,
        description: d.description || '',
        defaultBranch: d.default_branch,
        url: d.html_url,
        stars: d.stargazers_count,
      }
    },

    async packageJson(fullName, ref, path) {
      const file = [path, 'package.json'].filter(Boolean).join('/')
      const url = `https://api.github.com/repos/${fullName}/contents/${encodeURI(file)}?ref=${encodeURIComponent(ref)}`
      const d = await json(url, gh)
      if (!d || !d.content) return undefined
      try {
        return JSON.parse(Buffer.from(d.content, 'base64').toString('utf8'))
      } catch {
        return undefined
      }
    },

    async npmPackage(name) {
      const d = await json(
        `https://registry.npmjs.org/${name.split('/').map(encodeURIComponent).join('/')}`
      )
      if (!d) return undefined
      return { name: d.name, latest: d['dist-tags']?.latest }
    },

    // Serialised rather than throttled per call: the sync resolves these in a
    // loop, and a shared next-allowed time is the only thing that holds across
    // iterations without threading a clock through every caller.
    async drupalProject(machineName) {
      const wait = drupalOrgNext - Date.now()
      if (wait > 0) await sleep(wait)
      drupalOrgNext = Date.now() + DRUPAL_ORG_INTERVAL_MS

      const url =
        'https://www.drupal.org/api-d7/node.json' +
        `?type=project_module&field_project_machine_name=${encodeURIComponent(machineName)}`
      const d = await json(url)
      const node = d?.list?.[0]
      if (!node) return undefined
      return { url: node.url, title: node.title }
    },
  }
}
