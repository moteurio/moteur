import fieldRegistry from '../../registry/FieldRegistry.js';
import { validateAudioField } from '../../validators/fields/core/validateAudioField.js';

/**
 * A sound file: narration, a podcast clip, an interview. Points at an audio asset (or any URL).
 * The title and transcript are per language.
 */
fieldRegistry.register({
    type: 'core/audio',
    label: 'Audio',
    description: 'A sound file from the media library or a URL, with a title and transcript.',
    validate: validateAudioField,
    fields: {
        assetId: {
            type: 'core/text',
            label: 'Asset',
            description: 'The audio file in the media library.',
            required: false
        },
        src: {
            type: 'core/url',
            label: 'Audio URL',
            description: 'URL to the audio file (mp3, m4a, wav, ogg).',
            required: true
        },
        title: {
            type: 'core/text',
            label: 'Title',
            multilingual: true,
            required: false
        },
        transcript: {
            type: 'core/textarea',
            label: 'Transcript',
            description: 'What is said, for people who can’t listen.',
            multilingual: true,
            required: false
        }
    },
    optionsSchema: {
        ui: {
            type: 'core/text',
            label: 'UI Hint',
            description:
                'Optional hint for Studio input rendering (e.g. "upload", "url"). Does not affect stored data.',
            required: false
        }
    }
});
