import { describeError } from '../../lib/errors';
import type { NotificationsSlice, Slice } from '../types';

let nextToastId = 1;

export const createNotificationsSlice: Slice<NotificationsSlice> = (set, get) => ({
    toasts: [],

    pushToast: (toast) => {
        const id = nextToastId++;
        set((state) => ({ toasts: [...state.toasts.slice(-4), { id, kind: toast.kind, title: toast.title, message: toast.message }] }));
        const timeout = toast.timeout ?? (toast.kind === 'error' || toast.kind === 'warning' ? 9000 : 4500);
        if (timeout > 0) setTimeout(() => get().dismissToast(id), timeout);
        return id;
    },
    dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
    reportError: (title, error) => {
        console.error(title, error);
        get().pushToast({ kind: 'error', title, message: describeError(error) });
    },
});
