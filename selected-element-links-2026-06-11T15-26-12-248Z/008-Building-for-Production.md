# Building for Production

Source: https://vite.dev/guide/build
Exported: 2026-06-11T15:26:02.578Z
Language: en-US
Excerpt: Next Generation Frontend Tooling

---

When it is time to deploy your app for production, simply run the `vite build` command. By default, it uses `<root>/index.html` as the build entry point, and produces an application bundle that is suitable to be served over a static hosting service. Check out the [Deploying a Static Site](https://vite.dev/guide/static-deploy) for guides about popular services.

## Browser Compatibility [​](https://vite.dev/guide/build#browser-compatibility)

By default, the production bundle assumes a modern browser that is included in the [Baseline](https://web-platform-dx.github.io/web-features/) Widely Available targets. The default browser support range is:

-   Chrome >=111
-   Edge >=111
-   Firefox >=114
-   Safari >=16.4

You can specify custom targets via the [`build.target` config option](https://vite.dev/config/build-options#build-target), where the lowest target is `es2015`. If a lower target is set, Vite will still require these minimum browser support ranges as it relies on [native ESM dynamic import](https://caniuse.com/es6-module-dynamic-import), and [`import.meta`](https://caniuse.com/mdn-javascript_operators_import_meta):

-   Chrome >=64
-   Firefox >=67
-   Safari >=11.1
-   Edge >=79

Note that by default, Vite only handles syntax transforms and **does not cover polyfills**. You can check out [https://cdnjs.cloudflare.com/polyfill/](https://cdnjs.cloudflare.com/polyfill/) which automatically generates polyfill bundles based on the user's browser UserAgent string.

Legacy browsers can be supported via [@vitejs/plugin-legacy](https://github.com/vitejs/vite/tree/main/packages/plugin-legacy), which will automatically generate legacy chunks and corresponding ES language feature polyfills. The legacy chunks are conditionally loaded only in browsers that do not have native ESM support.

## Public Base Path [​](https://vite.dev/guide/build#public-base-path)

-   Related: [Asset Handling](https://vite.dev/guide/assets)

If you are deploying your project under a nested public path, simply specify the [`base` config option](https://vite.dev/config/shared-options#base) and all asset paths will be rewritten accordingly. This option can also be specified as a command line flag, e.g. `vite build --base=/my/public/path/`.

JS-imported asset URLs, CSS `url()` references, and asset references in your `.html` files are all automatically adjusted to respect this option during build.

The exception is when you need to dynamically concatenate URLs on the fly. In this case, you can use the globally injected `import.meta.env.BASE_URL` variable which will be the public base path. Note this variable is statically replaced during build so it must appear exactly as-is (i.e. `import.meta.env['BASE_URL']` won't work).

For advanced base path control, check out [Advanced Base Options](https://vite.dev/guide/build#advanced-base-options).

### Relative base [​](https://vite.dev/guide/build#relative-base)

If you don't know the base path in advance, you may set a relative base path with `"base": "./"` or `"base": ""`. This will make all generated URLs to be relative to each file.

## Customizing the Build [​](https://vite.dev/guide/build#customizing-the-build)

The build can be customized via various [build config options](https://vite.dev/config/build-options). Specifically, you can directly adjust the underlying [Rolldown options](https://rolldown.rs/reference/) via `build.rolldownOptions`:

vite.config.js

js

```
export default defineConfig({
  build: {
    rolldownOptions: {
      // https://rolldown.rs/reference/
    },
  },
})
```

For example, you can specify multiple Rolldown outputs with plugins that are only applied during build.

## Chunking Strategy [​](https://vite.dev/guide/build#chunking-strategy)

You can configure how chunks are split using [`build.rolldownOptions.output.codeSplitting`](https://rolldown.rs/reference/OutputOptions.codeSplitting) (see [Rolldown docs](https://rolldown.rs/in-depth/manual-code-splitting)). If you use a framework, refer to their documentation for configuring how chunks are split.

## Load Error Handling [​](https://vite.dev/guide/build#load-error-handling)

Vite emits `vite:preloadError` event when it fails to load dynamic imports. `event.payload` contains the original import error. If you call `event.preventDefault()`, the error will not be thrown.

js

```
window.addEventListener('vite:preloadError', (event) => {
  window.location.reload() // for example, refresh the page
})
```

When a new deployment occurs, the hosting service may delete the assets from previous deployments. As a result, a user who visited your site before the new deployment might encounter an import error. This error happens because the assets running on that user's device are outdated and it tries to import the corresponding old chunk, which is deleted. This event is useful for addressing this situation. In this case, make sure to set `Cache-Control: no-cache` on the HTML file, otherwise the old assets will be still referenced.

## Rebuild on Files Changes [​](https://vite.dev/guide/build#rebuild-on-files-changes)

You can enable rollup watcher with `vite build --watch`. Or, you can directly adjust the underlying [`WatcherOptions`](https://rolldown.rs/reference/InputOptions.watch) via `build.watch`:

vite.config.js

js

```
export default defineConfig({
  build: {
    watch: {
      // https://rolldown.rs/reference/InputOptions.watch
    },
  },
})
```

With the `--watch` flag enabled, changes to files to be bundled will trigger a rebuild. Note that changes to the config and its dependencies require restarting the build command.

## Multi-Page App [​](https://vite.dev/guide/build#multi-page-app)

Suppose you have the following source code structure:

```
├── package.json
├── vite.config.js
├── index.html
├── main.js
└── nested
    ├── index.html
    └── nested.js
```

During dev, simply navigate or link to `/nested/` - it works as expected, just like for a normal static file server.

During build, all you need to do is to specify multiple `.html` files as entry points:

vite.config.js

js

```
import { dirname, resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rolldownOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        nested: resolve(import.meta.dirname, 'nested/index.html'),
      },
    },
  },
})
```

If you specify a different root, remember that `import.meta.dirname` will still be the folder of your `vite.config.js` file when resolving the input paths. Therefore, you will need to add your `root` entry to the arguments for `resolve`.

Note that for HTML files, Vite ignores the name given to the entry in the `rolldownOptions.input` object and instead respects the resolved id of the file when generating the HTML asset in the dist folder. This ensures a consistent structure with the way the dev server works.

## Library Mode [​](https://vite.dev/guide/build#library-mode)

When you are developing a browser-oriented library, you are likely spending most of the time on a test/demo page that imports your actual library. With Vite, you can use your `index.html` for that purpose to get the smooth development experience.

When it is time to bundle your library for distribution, use the [`build.lib` config option](https://vite.dev/config/build-options#build-lib). Make sure to also externalize any dependencies that you do not want to bundle into your library, e.g. `vue` or `react`:

vite.config.js (single entry)vite.config.js (multiple entries)

js

```
import { dirname, resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'lib/main.js'),
      name: 'MyLib',
      // the proper extensions will be added
      fileName: 'my-lib',
    },
    rolldownOptions: {
      // make sure to externalize deps that shouldn't be bundled
      // into your library
      external: ['vue'],
      output: {
        // Provide global variables to use in the UMD build
        // for externalized deps
        globals: {
          vue: 'Vue',
        },
      },
    },
  },
})
```

js

```
import { dirname, resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    lib: {
      entry: {
        'my-lib': resolve(import.meta.dirname, 'lib/main.js'),
        secondary: resolve(import.meta.dirname, 'lib/secondary.js'),
      },
      name: 'MyLib',
    },
    rolldownOptions: {
      // make sure to externalize deps that shouldn't be bundled
      // into your library
      external: ['vue'],
      output: {
        // Provide global variables to use in the UMD build
        // for externalized deps
        globals: {
          vue: 'Vue',
        },
      },
    },
  },
})
```

The entry file would contain exports that can be imported by users of your package:

lib/main.js

js

```
import Foo from './Foo.vue'
import Bar from './Bar.vue'
export { Foo, Bar }
```

Running `vite build` with this config uses a Rollup preset that is oriented towards shipping libraries and produces two bundle formats:

-   `es` and `umd` (for single entry)
-   `es` and `cjs` (for multiple entries)

The formats can be configured with the [`build.lib.formats`](https://vite.dev/config/build-options#build-lib) option.

```
$ vite build
building for production...
dist/my-lib.js      0.08 kB / gzip: 0.07 kB
dist/my-lib.umd.cjs 0.30 kB / gzip: 0.16 kB
```

Recommended `package.json` for your lib:

package.json (single entry)package.json (multiple entries)

json

```
{
  "name": "my-lib",
  "type": "module",
  "files": ["dist"],
  "main": "./dist/my-lib.umd.cjs",
  "module": "./dist/my-lib.js",
  "exports": {
    ".": {
      "import": "./dist/my-lib.js",
      "require": "./dist/my-lib.umd.cjs"
    }
  }
}
```

json

```
{
  "name": "my-lib",
  "type": "module",
  "files": ["dist"],
  "main": "./dist/my-lib.cjs",
  "module": "./dist/my-lib.js",
  "exports": {
    ".": {
      "import": "./dist/my-lib.js",
      "require": "./dist/my-lib.cjs"
    },
    "./secondary": {
      "import": "./dist/secondary.js",
      "require": "./dist/secondary.cjs"
    }
  }
}
```

### CSS support [​](https://vite.dev/guide/build#css-support)

If your library imports any CSS, it will be bundled as a single CSS file besides the built JS files, e.g. `dist/my-lib.css`. The name defaults to `build.lib.fileName`, but can also be changed with [`build.lib.cssFileName`](https://vite.dev/config/build-options#build-lib).

You can export the CSS file in your `package.json` to be imported by users:

json

```
{
  "name": "my-lib",
  "type": "module",
  "files": ["dist"],
  "main": "./dist/my-lib.umd.cjs",
  "module": "./dist/my-lib.js",
  "exports": {
    ".": {
      "import": "./dist/my-lib.js",
      "require": "./dist/my-lib.umd.cjs"
    },
    "./style.css": "./dist/my-lib.css"
  }
}
```

File Extensions

If the `package.json` does not contain `"type": "module"`, Vite will generate different file extensions for Node.js compatibility. `.js` will become `.mjs` and `.cjs` will become `.js`.

Environment Variables

In library mode, all [`import.meta.env.*`](https://vite.dev/guide/env-and-mode) usage are statically replaced when building for production. However, `process.env.*` usage are not, so that consumers of your library can dynamically change it. If this is undesirable, you can use `define: { 'process.env.NODE_ENV': '"production"' }` for example to statically replace them, or use [`esm-env`](https://github.com/benmccann/esm-env) for better compatibility with bundlers and runtimes.

Advanced Usage

Library mode includes a simple and opinionated configuration for browser-oriented and JS framework libraries. If you are building non-browser libraries, or require advanced build flows, you can use [tsdown](https://tsdown.dev/) or [Rolldown](https://rolldown.rs/) directly.

## Advanced Base Options [​](https://vite.dev/guide/build#advanced-base-options)

For advanced use cases, the deployed assets and public files may be in different paths, for example to use different cache strategies. A user may choose to deploy in three different paths:

-   The generated entry HTML files (which may be processed during SSR)
-   The generated hashed assets (JS, CSS, and other file types like images)
-   The copied [public files](https://vite.dev/guide/assets#the-public-directory)

A single static [base](https://vite.dev/guide/build#public-base-path) isn't enough in these scenarios. Vite provides experimental support for advanced base options during build, using `experimental.renderBuiltUrl`.

ts

```
experimental: {
  renderBuiltUrl(filename, { hostType }) {
    if (hostType === 'js') {
      return { runtime: `window.__toCdnUrl(${JSON.stringify(filename)})` }
    } else {
      return { relative: true }
    }
  },
},
```

If the hashed assets and public files aren't deployed together, options for each group can be defined independently using asset `type` included in the second `context` param given to the function.

ts

```
experimental: {
  renderBuiltUrl(filename, { hostId, hostType, type }) {
    if (type === 'public') {
      return 'https://www.domain.com/' + filename
    } else if (path.extname(hostId) === '.js') {
      return {
        runtime: `window.__assetsPath(${JSON.stringify(filename)})`
      }
    } else {
      return 'https://cdn.domain.com/assets/' + filename
    }
  },
},
```

Note that the `filename` passed is a decoded URL, and if the function returns a URL string, it should also be decoded. Vite will handle the encoding automatically when rendering the URLs. If an object with `runtime` is returned, encoding should be handled yourself where needed as the runtime code will be rendered as is.
