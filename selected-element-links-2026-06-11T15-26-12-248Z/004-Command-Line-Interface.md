# Command Line Interface

Source: https://vite.dev/guide/cli
Exported: 2026-06-11T15:25:59.989Z
Language: en-US
Excerpt: Next Generation Frontend Tooling

---

## Dev server [​](https://vite.dev/guide/cli#dev-server)

### `vite` [​](https://vite.dev/guide/cli#vite)

Start Vite dev server in the current directory. `vite dev` and `vite serve` are aliases for `vite`.

#### Usage [​](https://vite.dev/guide/cli#usage)

bash

```
vite [root]
```

#### Options [​](https://vite.dev/guide/cli#options)

| Options |  |
| --- | --- |
| --host [host] | Specify hostname (string) |
| --port <port> | Specify port (number) |
| --open [path] | Open browser on startup (boolean \| string) |
| --cors | Enable CORS (boolean) |
| --strictPort | Exit if specified port is already in use (boolean) |
| --force | Force the optimizer to ignore the cache and re-bundle (boolean) |
| -c, --config <file> | Use specified config file (string) |
| --base <path> | Public base path (default: /) (string) |
| -l, --logLevel <level> | info \| warn \| error \| silent (string) |
| --clearScreen | Allow/disable clear screen when logging (boolean) |
| --configLoader <loader> | Use bundle to bundle the config with Rolldown, or runner (experimental) to process it on the fly, or native (experimental) to load using the native runtime (default: bundle) |
| --profile | Start built-in Node.js inspector (check Performance bottlenecks) |
| -d, --debug [feat] | Show debug logs (string \| boolean) |
| -f, --filter <filter> | Filter debug logs (string) |
| -m, --mode <mode> | Set env mode (string) |
| -h, --help | Display available CLI options |
| -v, --version | Display version number |

## Build [​](https://vite.dev/guide/cli#build)

### `vite build` [​](https://vite.dev/guide/cli#vite-build)

Build for production.

#### Usage [​](https://vite.dev/guide/cli#usage-1)

bash

```
vite build [root]
```

#### Options [​](https://vite.dev/guide/cli#options-1)

| Options |  |
| --- | --- |
| --target <target> | Transpile target (default: "baseline-widely-available") (string) |
| --outDir <dir> | Output directory (default: dist) (string) |
| --assetsDir <dir> | Directory under outDir to place assets in (default: "assets") (string) |
| --assetsInlineLimit <number> | Static asset base64 inline threshold in bytes (default: 4096) (number) |
| --ssr [entry] | Build specified entry for server-side rendering (string) |
| --sourcemap [output] | Output source maps for build (default: false) (boolean \| "inline" \| "hidden") |
| --minify [minifier] | Enable/disable minification, or specify minifier to use (default: "oxc") (boolean \| "oxc" \| "terser" \| "esbuild") |
| --manifest [name] | Emit build manifest json (boolean \| string) |
| --ssrManifest [name] | Emit ssr manifest json (boolean \| string) |
| --emptyOutDir | Force empty outDir when it's outside of root (boolean) |
| -w, --watch | Rebuilds when modules have changed on disk (boolean) |
| -c, --config <file> | Use specified config file (string) |
| --base <path> | Public base path (default: /) (string) |
| -l, --logLevel <level> | Info \| warn \| error \| silent (string) |
| --clearScreen | Allow/disable clear screen when logging (boolean) |
| --configLoader <loader> | Use bundle to bundle the config with Rolldown, or runner (experimental) to process it on the fly, or native (experimental) to load using the native runtime (default: bundle) |
| --profile | Start built-in Node.js inspector (check Performance bottlenecks) |
| -d, --debug [feat] | Show debug logs (string \| boolean) |
| -f, --filter <filter> | Filter debug logs (string) |
| -m, --mode <mode> | Set env mode (string) |
| -h, --help | Display available CLI options |
| --app | Build all environments, same as builder: {} (boolean, experimental) |

## Others [​](https://vite.dev/guide/cli#others)

### `vite optimize` [​](https://vite.dev/guide/cli#vite-optimize)

Pre-bundle dependencies.

**Deprecated**: the pre-bundle process runs automatically and does not need to be called.

#### Usage [​](https://vite.dev/guide/cli#usage-2)

bash

```
vite optimize [root]
```

#### Options [​](https://vite.dev/guide/cli#options-2)

| Options |  |
| --- | --- |
| --force | Force the optimizer to ignore the cache and re-bundle (boolean) |
| -c, --config <file> | Use specified config file (string) |
| --base <path> | Public base path (default: /) (string) |
| -l, --logLevel <level> | Info \| warn \| error \| silent (string) |
| --clearScreen | Allow/disable clear screen when logging (boolean) |
| --configLoader <loader> | Use bundle to bundle the config with Rolldown, or runner (experimental) to process it on the fly, or native (experimental) to load using the native runtime (default: bundle) |
| -d, --debug [feat] | Show debug logs (string \| boolean) |
| -f, --filter <filter> | Filter debug logs (string) |
| -m, --mode <mode> | Set env mode (string) |
| -h, --help | Display available CLI options |

### `vite preview` [​](https://vite.dev/guide/cli#vite-preview)

Locally preview the production build. Do not use this as a production server as it's not designed for it.

This command starts a server in the build directory (by default `dist`). Run `vite build` beforehand to ensure that the build directory is up-to-date. Depending on the project's configured [`appType`](https://vite.dev/config/shared-options#apptype), it makes use of certain middleware.

#### Usage [​](https://vite.dev/guide/cli#usage-3)

bash

```
vite preview [root]
```

#### Options [​](https://vite.dev/guide/cli#options-3)

| Options |  |
| --- | --- |
| --host [host] | Specify hostname (string) |
| --port <port> | Specify port (number) |
| --strictPort | Exit if specified port is already in use (boolean) |
| --open [path] | Open browser on startup (boolean \| string) |
| --outDir <dir> | Output directory (default: dist)(string) |
| -c, --config <file> | Use specified config file (string) |
| --base <path> | Public base path (default: /) (string) |
| -l, --logLevel <level> | Info \| warn \| error \| silent (string) |
| --clearScreen | Allow/disable clear screen when logging (boolean) |
| --configLoader <loader> | Use bundle to bundle the config with Rolldown, or runner (experimental) to process it on the fly, or native (experimental) to load using the native runtime (default: bundle) |
| -d, --debug [feat] | Show debug logs (string \| boolean) |
| -f, --filter <filter> | Filter debug logs (string) |
| -m, --mode <mode> | Set env mode (string) |
| -h, --help | Display available CLI options |
