/** The command line's commands: every API command, plus signing in, local accounts, and checks. */
import { API_COMMANDS, Commands } from '@moteurio/commands';
import { doctor, operatorSession, session } from './session.js';

export const commands = new Commands().add([
    ...session,
    ...operatorSession,
    ...API_COMMANDS,
    ...doctor
]);
