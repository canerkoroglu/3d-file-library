import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
    isDestructive?: boolean;
}

export function ConfirmDialog({
    isOpen,
    title,
    message,
    confirmLabel = 'Delete',
    cancelLabel = 'Cancel',
    onConfirm,
    onCancel,
    isDestructive = true
}: ConfirmDialogProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
                onClick={onCancel}
            />

            {/* Modal */}
            <div className="relative z-10 w-full max-w-md bg-[#1e1e1e] border border-[#404040] rounded-xl shadow-2xl transform transition-all scale-100 opacity-100">
                <div className="p-6">
                    <div className="flex items-start gap-4">
                        <div className={`p-3 rounded-full ${isDestructive ? 'bg-red-500/10 text-red-500' : 'bg-blue-500/10 text-blue-500'}`}>
                            <AlertTriangle size={24} />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-lg font-semibold text-white mb-2">
                                {title}
                            </h3>
                            <p className="text-[#a0a0a0] text-sm leading-relaxed">
                                {message}
                            </p>
                        </div>
                        <button
                            onClick={onCancel}
                            className="text-[#606060] hover:text-white transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    <div className="flex justify-end gap-3 mt-8">
                        <button
                            onClick={onCancel}
                            className="px-4 py-2 text-sm font-medium text-white bg-[#2d2d2d] hover:bg-[#353535] rounded-lg transition-colors"
                        >
                            {cancelLabel}
                        </button>
                        <button
                            onClick={onConfirm}
                            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors ${isDestructive
                                    ? 'bg-red-600 hover:bg-red-700'
                                    : 'bg-blue-600 hover:bg-blue-700'
                                }`}
                        >
                            {confirmLabel}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
