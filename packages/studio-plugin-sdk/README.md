# @moteurio/studio-plugin-sdk

Public SDK for **Moteur Studio UI extensions**. Pair with an API host plugin (`@moteurio/plugin-*` + `@moteurio/plugin-sdk`).

The Studio app (`@moteurio/studio`) is private; this package is the stable contract plugin authors target. Hosts **compose** Studio plugins at **build time** (same idea as `MOTEUR_HOST_PLUGINS` on the API). See [Plugin architecture](../../docs/Plugin%20architecture.md) for API vs Studio layers and enablement.

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
  manifest: { id: 'qr', packageName: '@moteurio/studio-plugin-qr' },
  register(ctx) {
    ctx.registerFieldEditor('play/qr', QrFieldEditor);
  }
});
```

The private Studio calls `applyStudioPlugins(modules, hostAdapter)` at startup and may pass `fetchProject` / `resolveAssetUrl` on `configureStudioHost` for authenticated previews.

Helpers: `readLocalizedString`, `resolveMediaRef`. Block previews are gated by `project.plugins` when the host maps block types to plugin ids.

Companion UI packages live in **`moteur-plugins-extra`** (`packages/studio-plugin-*`). See [Plugins.md](../../docs/Plugins.md).
