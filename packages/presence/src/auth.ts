import { verifyJWT } from '@moteurio/core/auth.js';
import { getUserById } from '@moteurio/core/users.js';

export function registerAuthMiddleware(io: import('socket.io').Server) {
    io.use((socket, next) => {
        try {
            const token =
                socket.handshake.auth?.token ||
                socket.handshake.query?.token ||
                socket.handshake.headers['authorization']?.toString().replace(/^Bearer\s+/, '');

            if (!token) {
                return next(new Error('Unauthorized: Missing token'));
            }

            const decoded = verifyJWT(token); // throws if invalid

            const userId = (decoded.id ?? decoded.sub) as string | undefined;
            // Optional: validate expected shape (prefer `id`; fall back to JWT `sub`)
            if (!decoded || !userId || !decoded.email) {
                return next(new Error('Unauthorized: Invalid token payload'));
            }

            const dbUser = getUserById(userId);
            const tokenName = typeof decoded.name === 'string' ? decoded.name : undefined;
            const tokenAvatar =
                typeof decoded.avatarUrl === 'string' ? decoded.avatarUrl : undefined;

            socket.data.user = {
                userId,
                name: (dbUser?.name ?? dbUser?.email ?? tokenName ?? decoded.email) as string,
                avatarUrl: dbUser?.avatar ?? tokenAvatar,
                roles: decoded.roles || [],
                projects: decoded.projects || []
            };

            next();
        } catch (_err) {
            return next(new Error('Unauthorized: Invalid or expired token'));
        }
    });
}
