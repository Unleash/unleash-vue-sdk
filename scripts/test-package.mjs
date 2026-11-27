import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const temporary = await mkdtemp(join(tmpdir(), 'vue-sdk-package-'))
const installedVersion = async name =>
  JSON.parse(
    await readFile(join(root, 'node_modules', name, 'package.json'), 'utf8')
  ).version
const run = (args, cwd, env = process.env) =>
  execFileSync('pnpm', args, {
    cwd,
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  })

try {
  const pack = JSON.parse(
    execFileSync(
      'pnpm',
      [
        'pack',
        '--json',
        '--skip-manifest-obfuscation',
        '--pack-destination',
        temporary
      ],
      { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' }
    )
  )
  assert(
    pack.files.every(
      ({ path }) =>
        !/\.(test|spec)\./.test(path) &&
        !path.startsWith('tests/') &&
        !path.startsWith('scripts/')
    ),
    'Test files must not be published'
  )
  const tools = ['@vitejs/plugin-vue', 'typescript', 'vite', 'vue-tsc']
  const devDependencies = Object.fromEntries(
    await Promise.all(
      tools.map(async name => [name, await installedVersion(name)])
    )
  )
  const versions = new Set([
    manifest.peerDependencies.vue.replace(/^\^/, ''),
    await installedVersion('vue')
  ])

  for (const vue of versions) {
    console.log(`Checking packed SDK with Vue ${vue}`)
    const consumer = join(temporary, vue)
    await cp(join(root, 'tests/package'), consumer, { recursive: true })
    await cp(
      join(root, 'pnpm-workspace.yaml'),
      join(consumer, 'pnpm-workspace.yaml')
    )
    await cp(join(root, 'pnpm-lock.yaml'), join(consumer, 'pnpm-lock.yaml'))
    await writeFile(
      join(consumer, 'package.json'),
      JSON.stringify({
        name: 'vue-sdk-consumer',
        private: true,
        type: 'module',
        packageManager: manifest.packageManager,
        dependencies: {
          [manifest.name]: `file:${pack.filename}`,
          vue
        },
        devDependencies,
        scripts: {
          check: 'vue-tsc --noEmit',
          build: 'vite build',
          ssr: 'node ssr.mjs'
        }
      })
    )
    run(['install', '--lockfile-only'], consumer)
    run(['install', '--frozen-lockfile'], consumer)
    for (const script of ['check', 'build', 'ssr']) {
      run(['run', script], consumer, {
        ...process.env,
        EXPECTED_CLIENT_VERSION: await installedVersion('unleash-proxy-client')
      })
    }
  }
} finally {
  await rm(temporary, { recursive: true, force: true })
}
