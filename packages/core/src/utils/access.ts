import { isInProject } from '@moteurio/types';
import { User } from '@moteurio/types/User.js';
import { ProjectSchema } from '@moteurio/types/Project.js';
import { isSystemActor } from './systemActor.js';
import { workspaceOf } from '../workspaces.js';

/**
 * Refuses someone who is not in the project: neither one of its members (a guest among them) nor
 * a member of its workspace who the workspace gives every project to.
 */
export function assertUserCanAccessProject(user: User, project: ProjectSchema): void {
    // The engine's own work (scheduled publishing, form actions) is not a person's.
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
