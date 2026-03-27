import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

let ffprobeWarned = false;

/**
 * Detect video duration via ffprobe. Returns null if ffprobe is missing or on error.
 * Logs a one-time warning when ffprobe is not found.
 */
export async function detectVideoDuration(buffer: Buffer): Promise<number | null> {
    let tmpPath: string | null = null;
    try {
        const tmpDir = os.tmpdir();
        tmpPath = path.join(
            tmpDir,
            `moteur-video-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`
        );
        fs.writeFileSync(tmpPath, buffer);

        const result = await new Promise<{ stdout: string; code: number | null }>(resolve => {
            const proc = spawn(
                'ffprobe',
                ['-v', 'quiet', '-print_format', 'json', '-show_format', tmpPath!],
                { stdio: ['ignore', 'pipe', 'pipe'] }
            );

            let stdout = '';
            proc.stdout?.on('data', (chunk: Buffer) => {
                stdout += chunk.toString();
            });
            proc.on('close', code => resolve({ stdout, code }));
            proc.on('error', (err: NodeJS.ErrnoException) => {
                if (err?.code === 'ENOENT' && !ffprobeWarned) {
                    ffprobeWarned = true;
                    console.warn(
                        '[moteur] ffprobe not found — video duration will not be detected. Install ffmpeg to enable.'
                    );
                }
                resolve({ stdout: '', code: 1 });
            });
        });

        if (result.code !== 0) return null;
        const data = JSON.parse(result.stdout) as { format?: { duration?: string } };
        const durationStr = data?.format?.duration;
        if (durationStr == null) return null;
        const duration = parseFloat(durationStr);
        return Number.isFinite(duration) ? duration : null;
    } catch {
        return null;
    } finally {
        if (tmpPath) {
            try {
                fs.unlinkSync(tmpPath);
            } catch {
                // ignore cleanup errors
            }
        }
    }
}
