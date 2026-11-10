import type { ProjectEmailSettings } from '@moteurio/types/Project.js';
import type { MoteurClient } from '../client.js';

const base = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/email`;

/** The email settings of a project, which govern the emails it sends to its site's visitors (form confirmations and form notifications). */
export type ProjectEmail = {
    /** The settings stored on the project. */
    settings: ProjectEmailSettings;
    /** The settings emails actually use, with defaults filled in. */
    effective: {
        senderName: string;
        /** The From header as sent, for example `"Café Olimpico" <mail@server.example>`. */
        from: string;
        fromAddress: string;
        replyTo?: string;
        accent?: string;
        footer?: string;
        siteUrl?: string;
        /** The logo's URL, or the image itself as a `data:` URI. */
        logo?: { src: string; width: number };
    };
    /** Domains that projects may use in the From address. When empty, only the server's own address is allowed. */
    sendingDomains: string[];
    /** The "Sent with …" line that the server adds to the footer, or null when there is none. */
    credit: string | null;
    /** True when the caller can change the settings (project admins). */
    canEdit: boolean;
};

/** A settings change. Any setting can be included, and null (or an empty string) clears it. */
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
        /** Updates the settings. Requires a project admin. */
        update(projectId: string, body: ProjectEmailUpdate): Promise<ProjectEmail> {
            return client.patch(base(projectId), body);
        },
        /** Renders a form email with sample answers. `settings` previews unsaved changes without saving them. */
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
