import { User } from '@moteurio/types/User.js';
import { ProjectSchema } from '@moteurio/types/Project.js';

export function assertUserCanAccessProject(user: User, project: ProjectSchema): void {
    if (!project.users || project.users.length === 0) {
        throw new Error(`Project "${project.id}" has no specific users defined.`);
    }
    if (!project.users.includes(user.id)) {
        throw new Error(`User "${user.id}" does not have access to project "${project.id}".`);
    }
}

export function assertUserCanCreateProject(user: User): void {
    if (!user || !user.id || !user.isActive) {
        throw new Error(
            `User "${user?.id || 'unknown'}" does not have permission to create projects.`
        );
    }
    // @todo: limit the number of projects per user?
}
