const extra = new Set<string>();

export function registerOutboundWebhookEvent(event: string): void {
    if (event) extra.add(event);
}

export function listPluginOutboundWebhookEvents(): string[] {
    return [...extra];
}

export function resetOutboundWebhookEvents(): void {
    extra.clear();
}
