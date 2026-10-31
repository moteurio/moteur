import type { ProjectEmailSettings } from '@moteurio/types/Project.js';
import type { MoteurClient } from '../client.js';

const base = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/email`;

/** A project's own mail to its site's visitors (form confirmations and form emails). */
export type ProjectEmail = {
    /** What the project stored. */
    settings: ProjectEmailSettings;
    /** What the emails use, defaults filled in. */
    effective: {
        senderName: string;
        /** The From header as it goes out: `"Café Olimpico" <mail@server.example>`. */
        from: string;
        fromAddress: string;
        replyTo?: string;
        accent?: string;
        footer?: string;
        siteUrl?: string;
        /** The logo's URL, or the image itself (`data:`). */
        logo?: { src: string; width: number };
    };
    /** Domains the server lets projects send From; empty: only its own address. */
    sendingDomains: string[];
    /** The "Sent with …" line the server adds at the foot, or null. */
    credit: string | null;
    /** Whether the caller may change them (project admins). */
    canEdit: boolean;
};

/** A change: any setting, null (or '') to clear one. */
export type ProjectEmailUpdate = {
    [K in keyof ProjectEmailSettings]?: ProjectEmailSettings[K] | null;
};

export type ProjectEmailPreview = {
    kind: 'form-confirm' | 'form-message';
    locale: 'en' | 'fr';
    subject: string;
    preheader: string;
    html: string;
    text: string;
    from: string;
    replyTo?: string;
};

export function projectEmailApi(client: MoteurClient) {
    return {
        get(projectId: string): Promise<ProjectEmail> {
            return client.get(base(projectId));
        },
        /** Project admins only. */
        update(projectId: string, body: ProjectEmailUpdate): Promise<ProjectEmail> {
            return client.patch(base(projectId), body);
        },
        /** A form email with sample answers; `settings` shows unsaved changes, never keeps them. */
        preview(
            projectId: string,
            body: {
                kind?: 'form-confirm' | 'form-message';
                locale?: 'en' | 'fr';
                settings?: ProjectEmailUpdate;
            } = {}
        ): Promise<ProjectEmailPreview> {
            return client.post(`${base(projectId)}/preview`, body);
        }
    };
}
