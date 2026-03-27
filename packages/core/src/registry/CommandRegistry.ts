export interface Subcommand {
    name: string;
    description?: string;
    action: (opts: Record<string, any>) => Promise<any> | void;
}

export class CommandRegistry {
    private registry: Record<string, Record<string, Subcommand>> = {};
    private defaults: Record<string, Subcommand> = {};

    register(command: string, sub: Subcommand) {
        this.registry[command] ??= {};
        if (sub.name === '' || sub.name === '_') {
            // register default action
            this.defaults[command] = { ...sub, name: '' };
        } else {
            if (this.registry[command][sub.name]) {
                throw new Error(`Subcommand '${command} ${sub.name}' already registered`);
            }
            this.registry[command][sub.name] = sub;
        }
    }

    has(command: string, sub?: string) {
        if (!sub) {
            return command in this.registry || command in this.defaults;
        }
        return !!this.registry[command]?.[sub];
    }

    get(command: string, sub?: string): Subcommand {
        if (sub && this.registry[command]?.[sub]) {
            return this.registry[command][sub];
        }
        const def = this.defaults[command];
        if (def) {
            return def;
        }
        throw new Error(
            sub
                ? `Subcommand '${command} ${sub}' not found`
                : `No default action for command '${command}'`
        );
    }

    listCommands(): string[] {
        // include commands even if only default registered
        return Array.from(new Set([...Object.keys(this.registry), ...Object.keys(this.defaults)]));
    }

    listSubcommands(command: string): Subcommand[] {
        return Object.values(this.registry[command] || {});
    }
}

export const cliRegistry = new CommandRegistry();
