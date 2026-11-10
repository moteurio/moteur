/** The CLI's commands: every API command, plus sign-in, local accounts and setup checks. */
import { API_COMMANDS, Commands } from '@moteurio/commands';
import { doctor, operatorSession, session } from './session.js';

export const commands = new Commands().add([
    ...session,
    ...operatorSession,
    ...API_COMMANDS,
    ...doctor
]);
