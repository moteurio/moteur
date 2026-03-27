import { registerAdapter } from './adapterRegistry.js';
import { LocalAdapter } from './adapters/LocalAdapter.js';

registerAdapter(new LocalAdapter());

export * from './assetService.js';
export * from './adapterRegistry.js';
export * from './providerRegistry.js';
export * from './StorageAdapter.js';
export * from './VideoProvider.js';
export * from './defaultVariants.js';
export * from './allowedTypes.js';
