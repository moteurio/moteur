import sharp, { type Sharp, type SharpOptions } from 'sharp';
import { WorkBudget, boundedSetting } from '../utils/workBudget.js';
// libvips' cache keeps recent operations and the pictures they read (whole originals): it helps
// a program that repeats them. Moteur stores every copy it makes and never makes it twice, so the
// cache would only hold memory.
sharp.cache(false);

let budget: WorkBudget | undefined;
export function imagePixelLimit(): number {
    return boundedSetting('MOTEUR_IMAGE_MAX_PIXELS', 16_000_000, 100_000_000);
}
export function openImage(input: Buffer, options: SharpOptions = {}): Sharp {
    return sharp(input, { ...options, limitInputPixels: imagePixelLimit() });
}
export function imageWork<T>(work: () => Promise<T>, maxQueued?: number): Promise<T> {
    budget ??= new WorkBudget(boundedSetting('MOTEUR_IMAGE_CONCURRENCY', 2, 8), 8);
    return budget.run(work, maxQueued);
}
