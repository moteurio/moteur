import type { PlanLimitKind, PluginContributions } from '@moteurio/types/Plugin.js';

/**
 * Records what a plugin actually registers during `init()`. Snapshot is merged
 * with `manifest.contributes` after init.
 */
export class ContributionCollector {
    private blocks: string[] = [];
    private structures: string[] = [];
    private blueprints: string[] = [];
    private fields: string[] = [];
    private storage: string[] = [];
    private video: string[] = [];
    private activeProvider?: string;
    private events: string[] = [];
    private plan: NonNullable<PluginContributions['planLimits']> = {};
    private mutatesCredits = false;
    private onlinePresence = false;
    private cli: string[] = [];
    private mcp: string[] = [];
    private mediaVariants: string[] = [];
    private mediaTransforms: string[] = [];
    private mediaGenerators: string[] = [];
    private models: string[] = [];
    private gitProviders: string[] = [];
    private gitCommitHooks = false;
    private outboundEvents: string[] = [];
    private forms: Record<'actions' | 'fields' | 'screens' | 'holds', string[]> = {
        actions: [],
        fields: [],
        screens: [],
        holds: []
    };

    addBlock(type: string): void {
        if (type) this.blocks.push(type);
    }

    addStructure(type: string): void {
        if (type) this.structures.push(type);
    }

    addBlueprint(id: string): void {
        if (id) this.blueprints.push(id);
    }

    addField(type: string): void {
        if (type) this.fields.push(type);
    }

    addStorageAdapter(id: string): void {
        if (id) this.storage.push(id);
    }

    addVideoProvider(id: string): void {
        if (id) this.video.push(id);
    }

    setActiveVideoProvider(id: string | undefined): void {
        if (id) this.activeProvider = id;
    }

    addEvent(name: string): void {
        if (name) this.events.push(name);
    }

    setPlanLimit(
        key: Exclude<keyof NonNullable<PluginContributions['planLimits']>, 'counts'>
    ): void {
        this.plan[key] = true;
    }

    addCountKinds(kinds?: PlanLimitKind[]): void {
        this.plan.counts = [...(this.plan.counts ?? []), ...(kinds ?? [])];
    }

    markCreditsMutated(): void {
        this.mutatesCredits = true;
    }

    markOnlinePresence(): void {
        this.onlinePresence = true;
    }

    addCommand(cli?: string, mcp?: string): void {
        if (cli) this.cli.push(cli);
        if (mcp) this.mcp.push(mcp);
    }

    addMediaVariant(id: string): void {
        if (id) this.mediaVariants.push(id);
    }

    addMediaTransform(id: string): void {
        if (id) this.mediaTransforms.push(id);
    }

    addMediaGenerator(id: string): void {
        if (id) this.mediaGenerators.push(id);
    }

    addModel(id: string): void {
        if (id) this.models.push(id);
    }

    addGitProvider(id: string): void {
        if (id) this.gitProviders.push(id);
    }

    markGitCommitHook(): void {
        this.gitCommitHooks = true;
    }

    addOutboundWebhookEvent(event: string): void {
        if (event) this.outboundEvents.push(event);
    }

    addFormExtension(kind: 'actions' | 'fields' | 'screens' | 'holds', id: string): void {
        if (id) this.forms[kind].push(id);
    }

    snapshot(): PluginContributions {
        const out: PluginContributions = {};
        if (
            this.blocks.length ||
            this.structures.length ||
            this.blueprints.length ||
            this.fields.length ||
            this.models.length
        ) {
            out.schemas = {
                ...(this.blocks.length ? { blocks: [...this.blocks] } : {}),
                ...(this.structures.length ? { structures: [...this.structures] } : {}),
                ...(this.blueprints.length ? { blueprints: [...this.blueprints] } : {}),
                ...(this.fields.length ? { fields: [...this.fields] } : {}),
                ...(this.models.length ? { models: [...this.models] } : {})
            };
        }
        if (this.storage.length || this.video.length) {
            out.adapters = {
                ...(this.storage.length ? { storage: [...this.storage] } : {}),
                ...(this.video.length ? { video: [...this.video] } : {})
            };
        }
        if (this.activeProvider) out.video = { activeProvider: this.activeProvider };
        if (this.events.length) out.events = { subscribes: [...this.events] };
        if (Object.keys(this.plan).length) out.planLimits = { ...this.plan };
        if (this.mutatesCredits) out.metering = { mutatesCredits: true };
        if (this.onlinePresence) out.platform = { onlinePresence: true };
        if (this.cli.length || this.mcp.length) {
            out.commands = {
                ...(this.cli.length ? { cli: [...this.cli] } : {}),
                ...(this.mcp.length ? { mcp: [...this.mcp] } : {})
            };
        }
        if (this.mcp.length) out.mcp = { tools: [...this.mcp] };
        if (
            this.mediaVariants.length ||
            this.mediaTransforms.length ||
            this.mediaGenerators.length
        ) {
            out.media = {
                ...(this.mediaVariants.length ? { variants: [...this.mediaVariants] } : {}),
                ...(this.mediaTransforms.length ? { transforms: [...this.mediaTransforms] } : {}),
                ...(this.mediaGenerators.length ? { generators: [...this.mediaGenerators] } : {})
            };
        }
        if (this.gitCommitHooks || this.gitProviders.length) {
            out.git = {
                ...(this.gitCommitHooks ? { commitHooks: true } : {}),
                ...(this.gitProviders.length ? { providers: [...this.gitProviders] } : {})
            };
        }
        const forms = Object.fromEntries(
            Object.entries(this.forms)
                .filter(([, ids]) => ids.length)
                .map(([kind, ids]) => [kind, [...ids]])
        );
        if (Object.keys(forms).length) out.forms = forms;
        if (this.outboundEvents.length) {
            out.webhooks = { outboundEvents: [...this.outboundEvents] };
        }
        return out;
    }
}
