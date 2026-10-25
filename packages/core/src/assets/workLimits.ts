import sharp, { type Sharp, type SharpOptions } from 'sharp';
import { WorkBudget, boundedSetting } from '../utils/workBudget.js';
let budget: WorkBudget | undefined;
export function imagePixelLimit(): number {
    return boundedSetting('MOTEUR_IMAGE_MAX_PIXELS', 16_000_000, 100_000_000);
}
export function openImage(input: Buffer, options: SharpOptions = {}): Sharp {
    return sharp(input, { ...options, limitInputPixels: imagePixelLimit() });
}
export function imageWork<T>(work: () => Promise<T>): Promise<T> {
    budget ??= new WorkBudget(boundedSetting('MOTEUR_IMAGE_CONCURRENCY', 2, 8), 8);
    return budget.run(work);
}
