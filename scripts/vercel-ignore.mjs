#!/usr/bin/env node
/**
 * Vercel "Ignored Build Step" for every app in this monorepo.
 *
 * Each app's vercel.json runs it from the app's root directory:
 *   "ignoreCommand": "node ../../scripts/vercel-ignore.mjs"
 * Vercel's contract: exit 0 skips the build, exit 1 builds. Any error builds.
 *
 * It replaces `npx turbo-ignore <app>`, which downloaded turbo on every
 * deploy and could only say "a dependency package changed". This decides from
 * the changed files instead:
 *
 * 1. Which files count. The app's own directory, every workspace package it
 *    depends on (dependencies / devDependencies / peerDependencies with a
 *    `workspace:` range, transitively), the directories its CSS pulls in with
 *    Tailwind `@source`, and the root files every build reads (lockfile,
 *    root package.json, turbo.json, …). Docs and tests inside those don't
 *    count: README/CLAUDE/AGENTS/CHANGELOG .md, anything under docs/, and
 *    *.test.* / *.spec.* / __tests__/.
 *
 * 2. Changed since when. Since this branch's last deploy
 *    (VERCEL_GIT_PREVIOUS_SHA). On a preview it also has to be part of the
 *    PR's own diff (merge-base with main → HEAD), so merging main into a
 *    branch doesn't rebuild every app for changes main already deployed. A
 *    branch's first deploy uses the PR diff alone. If neither can be worked
 *    out (shallow clone, fetch refused) it builds.
 *
 * 3. Preview opt-in for low-traffic apps. The apps in PREVIEW_ON_OWN_CHANGES
 *    build previews only when their own directory changed. A change that
 *    only reaches them through a shared package waits for production, where
 *    they always build. Put `[preview:<app>]` (e.g. `[preview:travel]`) or
 *    `[preview:all]` in the commit message to force one.
 *
 * Try it locally from an app directory:
 *   VERCEL_ENV=preview VERCEL_GIT_PREVIOUS_SHA=<sha> node ../../scripts/vercel-ignore.mjs
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'

/** Apps whose previews build only when their own directory changed. */
const PREVIEW_ON_OWN_CHANGES = new Set(['@travel/web', '@umami/web', '@kidzovo/web', '@vizf1/web'])

/** Root files every build reads. */
const GLOBAL_FILES = new Set([
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'turbo.json',
  '.npmrc',
  '.nvmrc',
  '.node-version',
])

const DEFAULT_BRANCH = 'main'

const SKIP = 0
const BUILD = 1

function log(msg) {
  console.log(`[vercel-ignore] ${msg}`)
}

function git(args, opts = {}) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], ...opts }).trim()
}

function tryGit(args) {
  try {
    return git(args)
  } catch {
    return null
  }
}

function hasCommit(sha) {
  return tryGit(['cat-file', '-e', `${sha}^{commit}`]) !== null
}

/** Make sure a commit is in the (usually shallow) clone. */
function ensureCommit(sha) {
  if (!sha) return false
  if (hasCommit(sha)) return true
  tryGit(['fetch', '--no-tags', '--quiet', '--depth=1', 'origin', sha])
  return hasCommit(sha)
}

function changedFiles(from, to) {
  const out = git(['diff', '--name-only', '--no-renames', from, to])
  return out ? out.split('\n') : []
}

/** Merge-base of HEAD with the default branch, fetching history if needed. */
function prBase() {
  const branch = process.env.VERCEL_GIT_COMMIT_REF
  const mainRef = `refs/remotes/origin/${DEFAULT_BRANCH}`
  const head = git(['rev-parse', 'HEAD'])
  for (const depth of [50, 250]) {
    const refspecs = [`+refs/heads/${DEFAULT_BRANCH}:${mainRef}`]
    if (branch && branch !== DEFAULT_BRANCH) refspecs.push(`+refs/heads/${branch}:refs/remotes/origin/${branch}`)
    tryGit(['fetch', '--no-tags', '--quiet', `--depth=${depth}`, 'origin', ...refspecs])
    if (!tryGit(['rev-parse', '--verify', '--quiet', mainRef])) return null
    const base = tryGit(['merge-base', mainRef, head])
    if (base) return base
  }
  return null
}

/** name → repo-relative dir for every workspace package. */
function workspacePackages(root) {
  const yaml = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8')
  const globs = [...yaml.matchAll(/^\s*-\s*['"]?([^'"\s#]+)['"]?/gm)].map((m) => m[1])
  const dirs = []
  for (const glob of globs) {
    if (glob.endsWith('/*')) {
      const parent = join(root, glob.slice(0, -2))
      if (!existsSync(parent)) continue
      for (const entry of readdirSync(parent)) dirs.push(join(parent, entry))
    } else {
      dirs.push(join(root, glob))
    }
  }
  const byName = new Map()
  for (const dir of dirs) {
    const pkgPath = join(dir, 'package.json')
    if (!existsSync(pkgPath)) continue
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
    if (pkg.name) byName.set(pkg.name, { dir: toPosix(relative(root, dir)), pkg })
  }
  return byName
}

function workspaceDeps(pkg) {
  const deps = { ...pkg.peerDependencies, ...pkg.devDependencies, ...pkg.dependencies }
  return Object.entries(deps)
    .filter(([, range]) => typeof range === 'string' && range.startsWith('workspace:'))
    .map(([name]) => name)
}

/** The app's package dir plus every workspace package it reaches. */
function dependencyDirs(appName, packages) {
  const seen = new Set([appName])
  const queue = [appName]
  while (queue.length) {
    const entry = packages.get(queue.shift())
    if (!entry) continue
    for (const dep of workspaceDeps(entry.pkg)) {
      if (!seen.has(dep) && packages.has(dep)) {
        seen.add(dep)
        queue.push(dep)
      }
    }
  }
  return [...seen].map((name) => packages.get(name)?.dir).filter(Boolean)
}

/** Directories named by Tailwind `@source` in the app's CSS. */
function tailwindSourceDirs(root, appDir) {
  const dirs = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue
      const p = join(dir, entry)
      if (statSync(p).isDirectory()) walk(p)
      else if (entry.endsWith('.css')) {
        for (const m of readFileSync(p, 'utf8').matchAll(/@source\s+(?:not\s+)?["']([^"']+)["']/g)) {
          if (/^\s*@source\s+not\b/.test(m[0])) continue
          const staticPart = m[1].split(/[*{[]/)[0]
          dirs.push(toPosix(relative(root, resolve(dirname(p), staticPart))))
        }
      }
    }
  }
  walk(join(root, appDir))
  return dirs.filter((d) => d && !d.startsWith('..'))
}

function toPosix(p) {
  return p.split(sep).join('/')
}

function isDocOrTest(file) {
  const base = file.split('/').pop()
  return (
    /^(README|CLAUDE|AGENTS|CHANGELOG)\.md$/i.test(base) ||
    /(^|\/)docs\//.test(file) ||
    /(^|\/)__tests__\//.test(file) ||
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(base)
  )
}

function under(file, dir) {
  return dir === '' || file === dir || file.startsWith(dir.endsWith('/') ? dir : `${dir}/`)
}

function main() {
  const root = git(['rev-parse', '--show-toplevel'])
  const cwd = process.cwd()
  const appPkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'))
  const appName = appPkg.name
  const appDir = toPosix(relative(root, cwd))
  const shortName = appDir.replace(/^apps\//, '').replace(/\/web$/, '')
  const env = process.env.VERCEL_ENV ?? 'unknown'
  const message = process.env.VERCEL_GIT_COMMIT_MESSAGE ?? ''
  log(`${appName} (${appDir}), ${env} deploy of ${process.env.VERCEL_GIT_COMMIT_REF ?? 'HEAD'}`)

  const packages = workspacePackages(root)
  const watched = [...new Set([...dependencyDirs(appName, packages), ...tailwindSourceDirs(root, appDir)])]
  const relevant = (file) => (GLOBAL_FILES.has(file) || watched.some((d) => under(file, d))) && !isDocOrTest(file)

  // What changed since the last deploy of this branch.
  const prev = process.env.VERCEL_GIT_PREVIOUS_SHA
  let changed = null
  if (ensureCommit(prev)) {
    changed = changedFiles(prev, 'HEAD')
    log(`${changed.length} file(s) changed since the last deploy (${prev.slice(0, 8)})`)
  } else {
    log(prev ? `last deploy ${prev.slice(0, 8)} is not reachable` : 'no previous deploy on this branch')
  }

  // On previews, only what this PR itself changes counts.
  if (env === 'preview') {
    const base = prBase()
    if (base) {
      const prFiles = new Set(changedFiles(base, 'HEAD'))
      log(`${prFiles.size} file(s) in the PR diff against ${DEFAULT_BRANCH} (${base.slice(0, 8)})`)
      changed = changed ? changed.filter((f) => prFiles.has(f)) : [...prFiles]
    } else {
      log(`could not find the merge-base with ${DEFAULT_BRANCH}`)
    }
  }

  if (!changed) {
    log('nothing to compare against → build')
    return BUILD
  }

  const hits = changed.filter(relevant)
  if (hits.length === 0) {
    log('no change reaches this app → skip')
    return SKIP
  }
  log(`${hits.length} relevant change(s), e.g. ${hits.slice(0, 5).join(', ')}`)

  if (env === 'preview' && PREVIEW_ON_OWN_CHANGES.has(appName)) {
    const forced = new RegExp(`\\[preview:(all|${shortName.replace(/[/.]/g, '\\$&')})\\]`, 'i').test(message)
    const own = hits.some((f) => under(f, appDir))
    if (!own && !forced) {
      log(`only shared code changed; ${appName} previews build on their own changes (or [preview:${shortName}]) → skip`)
      return SKIP
    }
  }

  log('→ build')
  return BUILD
}

let code = BUILD
try {
  code = main()
} catch (err) {
  log(`error, building to be safe: ${err?.message ?? err}`)
}
process.exit(code)
