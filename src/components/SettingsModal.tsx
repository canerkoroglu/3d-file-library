import { X, Settings as SettingsIcon, Monitor, Github, Info } from 'lucide-react';
import { useStore } from '../store/store';

export default function SettingsModal() {
    const { closeSettings, theme, setTheme } = useStore();

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-primary-card w-full max-w-2xl rounded-xl border border-accent-gray shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                {/* Header */}
                <div className="px-6 py-4 border-b border-accent-gray flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-accent-blue/10 rounded-lg">
                            <SettingsIcon size={20} className="text-accent-blue" />
                        </div>
                        <h2 className="text-xl font-semibold text-text-primary">Settings</h2>
                    </div>
                    <button
                        onClick={closeSettings}
                        className="p-2 hover:bg-primary-hover rounded-lg transition-colors text-text-secondary hover:text-text-primary"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-8">

                    {/* Appearance */}
                    <section className="space-y-4">
                        <h3 className="text-sm font-bold text-text-secondary uppercase tracking-wider flex items-center gap-2">
                            <Monitor size={14} />
                            Appearance
                        </h3>
                        <div className="bg-primary-bg rounded-lg border border-accent-gray p-4 space-y-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="font-medium text-text-primary">Theme</div>
                                    <div className="text-sm text-text-secondary">Choose your preferred theme</div>
                                </div>
                                <div className="flex bg-primary-bg rounded-lg p-1 border border-accent-gray">
                                    <button
                                        onClick={() => setTheme('dark')}
                                        className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${theme === 'dark'
                                            ? 'bg-primary-card shadow-sm text-text-primary'
                                            : 'text-text-secondary hover:text-text-primary'
                                            }`}
                                    >
                                        Dark
                                    </button>
                                    <button
                                        onClick={() => setTheme('light')}
                                        className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${theme === 'light'
                                            ? 'bg-primary-card shadow-sm text-text-primary'
                                            : 'text-text-secondary hover:text-text-primary'
                                            }`}
                                    >
                                        Light
                                    </button>
                                    <button
                                        onClick={() => setTheme('system')}
                                        className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${theme === 'system'
                                            ? 'bg-primary-card shadow-sm text-text-primary'
                                            : 'text-text-secondary hover:text-text-primary'
                                            }`}
                                    >
                                        System
                                    </button>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* About */}
                    <section className="space-y-4">
                        <h3 className="text-sm font-bold text-text-secondary uppercase tracking-wider flex items-center gap-2">
                            <Info size={14} />
                            About
                        </h3>
                        <div className="bg-primary-bg rounded-lg border border-accent-gray p-6 text-center space-y-4">
                            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl flex items-center justify-center mx-auto shadow-lg">
                                <SettingsIcon size={32} className="text-white" />
                            </div>
                            <div>
                                <h4 className="text-lg font-semibold text-text-primary">Modelist</h4>
                                <p className="text-text-secondary text-sm">Version 1.0.0</p>
                                <p className="text-text-secondary text-sm max-w-sm mx-auto pt-2">
                                    A powerful, offline-first 3D model organizer and viewer. Manage your STL, 3MF, and OBJ files with ease using collections, tags, and a high-performance 3D preview.
                                </p>
                            </div>
                            <div className="pt-4 border-t border-accent-gray flex justify-center gap-4">
                                <button
                                    onClick={() => window.open('https://github.com/canerkoroglu/3d-file-library', '_blank')}
                                    className="flex items-center gap-2 px-4 py-2 bg-primary-card hover:bg-primary-hover rounded-lg text-sm text-text-primary transition-colors border border-accent-gray"
                                >
                                    <Github size={16} />
                                    GitHub
                                </button>
                            </div>
                        </div>
                    </section>

                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-accent-gray bg-primary-card flex justify-end gap-3 flex-shrink-0">
                    <button
                        onClick={closeSettings}
                        className="px-4 py-2 bg-primary-hover hover:bg-accent-gray rounded-lg text-sm text-text-primary transition-colors font-medium border border-accent-gray"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
