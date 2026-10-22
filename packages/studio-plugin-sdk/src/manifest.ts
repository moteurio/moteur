/** Studio-side plugin manifest (pairs with an API host plugin by id). */
export type StudioPluginManifest = {
    /** Must match the API plugin id (`qr`, `poll`, `billing`, …). */
    id: string;
    label?: string;
    /** npm name of this package (documentation / tooling). */
    packageName?: string;
};

export type StudioPluginModule = {
    manifest: StudioPluginManifest;
    register: (ctx: import('./context.js').StudioPluginContext) => void;
};
