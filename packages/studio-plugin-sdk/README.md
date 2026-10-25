# @moteurio/studio-plugin-sdk

Public SDK for **Moteur Studio UI extensions**. Pair with an API host plugin (`@moteurio/plugin-*` + `@moteurio/plugin-sdk`).

The Studio app (`@moteurio/studio`) is private; this package is the stable contract plugin authors target. Hosts **compose** Studio plugins at **build time**. See the [host plugin guide](https://github.com/moteurio/moteur-plugins/blob/main/docs/Plugins.md) for API vs Studio layers and enablement.

## Install

```bash
npm install @moteurio/studio-plugin-sdk
```

Peer dependency: `react` 18+.

## Example

```ts
import { defineStudioPlugin } from '@moteurio/studio-plugin-sdk';
import { QrFieldEditor } from './QrFieldEditor.js';

export default defineStudioPlugin({
    manifest: {
        id: 'qr',
        label: 'QR codes',
        source: 'private',
        scope: 'project',
        categories: ['content'],
        contributes: {
            studioUi: { fieldEditors: ['play/qr'] }
        },
        packageName: '@moteurio/studio-plugin-qr'
    },
    register(ctx) {
        ctx.registerFieldEditor('play/qr', QrFieldEditor);
    }
});
```

`StudioPluginManifest` uses the same catalog axes as an API `PluginManifest` (`id`, `label`, `source`, `scope`, `role`, `categories`, `contributes`, `requires`). Pair by `id`. `applyStudioPlugins` merges declared `contributes.studioUi` with field editors, block previews, and routes registered at runtime.

The private Studio calls `applyStudioPlugins(modules, hostAdapter)` at startup and may pass `fetchProject` / `resolveAssetUrl` on `configureStudioHost` for authenticated previews.

Helpers: `readLocalizedString`, `resolveMediaRef`. Block previews are gated by `project.plugins` when the host maps block types to plugin ids.

Companion UI packages live in **`moteur-plugins-extra`** (`packages/studio-plugin-*`). API-side contracts are documented in the [plugin SDK](../plugin-sdk/README.md).
