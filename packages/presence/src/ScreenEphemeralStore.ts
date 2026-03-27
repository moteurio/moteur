/**
 * Per-screen ephemeral state (not persisted). Last-write-wins per key using server receive time.
 */
export interface ScreenEphemeralCell {
    value: string;
    updatedAt: number;
    userId: string;
}

interface ScreenBuckets {
    fields: Map<string, ScreenEphemeralCell>;
    ui: Map<string, ScreenEphemeralCell>;
}

export class ScreenEphemeralStore {
    private screens = new Map<string, ScreenBuckets>();

    private bucket(screenId: string): ScreenBuckets {
        let b = this.screens.get(screenId);
        if (!b) {
            b = { fields: new Map(), ui: new Map() };
            this.screens.set(screenId, b);
        }
        return b;
    }

    /**
     * Apply patch with LWW. Returns merged keys that were updated (for broadcast).
     */
    applyPatch(
        screenId: string,
        userId: string,
        now: number,
        fields?: Record<string, string>,
        ui?: Record<string, string>
    ): { fields: Record<string, string>; ui: Record<string, string> } {
        const outFields: Record<string, string> = {};
        const outUi: Record<string, string> = {};
        const b = this.bucket(screenId);

        const applyMap = (
            map: Map<string, ScreenEphemeralCell>,
            incoming: Record<string, string> | undefined,
            out: Record<string, string>
        ) => {
            if (!incoming) return;
            for (const [key, value] of Object.entries(incoming)) {
                const prev = map.get(key);
                if (!prev || now >= prev.updatedAt) {
                    map.set(key, { value, updatedAt: now, userId });
                    out[key] = value;
                }
            }
        };

        applyMap(b.fields, fields, outFields);
        applyMap(b.ui, ui, outUi);
        return { fields: outFields, ui: outUi };
    }

    getField(screenId: string, fieldPath: string): string | undefined {
        return this.screens.get(screenId)?.fields.get(fieldPath)?.value;
    }

    getFieldsRecord(screenId: string): Record<string, string> {
        const b = this.screens.get(screenId);
        if (!b) return {};
        return Object.fromEntries(Array.from(b.fields.entries()).map(([k, c]) => [k, c.value]));
    }

    getUiRecord(screenId: string): Record<string, string> {
        const b = this.screens.get(screenId);
        if (!b) return {};
        return Object.fromEntries(Array.from(b.ui.entries()).map(([k, c]) => [k, c.value]));
    }

    clearField(screenId: string, fieldPath: string): void {
        this.screens.get(screenId)?.fields.delete(fieldPath);
    }

    clearScreen(screenId: string): void {
        this.screens.delete(screenId);
    }
}

export const screenEphemeralStore = new ScreenEphemeralStore();
