import { createContext, useContext, type ReactNode } from 'react';
import type { StudioScopeValue } from './types.js';

const StudioScopeContext = createContext<StudioScopeValue>({});

export function StudioScopeProvider({
    value,
    children
}: {
    value: StudioScopeValue;
    children: ReactNode;
}) {
    return <StudioScopeContext.Provider value={value}>{children}</StudioScopeContext.Provider>;
}

export function useStudioScope(): StudioScopeValue {
    return useContext(StudioScopeContext);
}
