import { isInProject } from '@moteurio/types';
import { User } from '@moteurio/types/User.js';
import { ProjectSchema } from '@moteurio/types/Project.js';
import { isSystemActor } from './systemActor.js';
import { workspaceOf } from '../workspaces.js';

/**
 * Throws if the user has no access to the project. A user has access as a project member (guests
 * included) or as a member of the project's workspace when the workspace gives its members access
 * to every project.
 */
export function assertUserCanAccessProject(user: User, project: ProjectSchema): void {
    // Work done by the engine itself, such as scheduled publishing and form actions, is allowed.
    if (isSystemActor(user)) return;
    if (!isInProject(user.id, project, workspaceOf(project))) {
        throw new Error(`User "${user.id}" does not have access to project "${project.id}".`);
    }
}

export function assertUserCanCreateProject(user: User): void {
    if (!user || !user.id || !user.isActive) {
        throw new Error(
            `User "${user?.id || 'unknown'}" does not have permission to create projects.`
        );
    }
}
