export type VariantFit = 'cover' | 'contain' | 'fill' | 'inside' | 'outside';

export type VariantDefinition = {
    key: string; // unique within project; 'original' is reserved
    label: string;
    width?: number;
    height?: number;
    fit: VariantFit;
    format: 'webp' | 'jpg' | 'png' | 'avif';
    quality?: number; // 1–100, default 85
};
