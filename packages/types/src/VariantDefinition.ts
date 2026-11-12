export type VariantFit = 'cover' | 'contain' | 'fill' | 'inside' | 'outside';

export type VariantDefinition = {
    key: string; // Unique within the project. 'original' is reserved
    label: string;
    width?: number;
    height?: number;
    fit: VariantFit;
    format: 'webp' | 'jpg' | 'png' | 'avif';
    quality?: number; // Image quality from 1 to 100. Defaults to 85
};
