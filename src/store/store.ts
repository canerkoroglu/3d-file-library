/**
 * The renderer's application state, composed from slices (see ./slices). Components use
 * `useStore` exactly as before; each slice owns one area of state and its actions.
 */
import { create } from 'zustand';
import type { AppState } from './types';
import { createNotificationsSlice } from './slices/notifications';
import { applyThemeToDom, createUiSlice } from './slices/ui';
import { createLibrarySlice } from './slices/library';
import { createDuplicatesSlice } from './slices/duplicates';
import { createSelectionSlice } from './slices/selection';
import { createAssistantSlice } from './slices/assistant';
import { createSlicersSlice } from './slices/slicers';

export type { Toast, ToastKind } from './types';

export const useStore = create<AppState>()((...a) => ({
    ...createNotificationsSlice(...a),
    ...createUiSlice(...a),
    ...createLibrarySlice(...a),
    ...createDuplicatesSlice(...a),
    ...createSelectionSlice(...a),
    ...createAssistantSlice(...a),
    ...createSlicersSlice(...a),
}));

applyThemeToDom(useStore.getState().theme);
