import { X, Settings as SettingsIcon, Monitor, Github, Info } from 'lucide-react';
import { useStore } from '../store/store';

export default function SettingsModal() {
    const { closeSettings } = useStore();

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#2d2d2d] w-full max-w-2xl rounded-xl border border-[#404040] shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                {/* Header */}
                <div className="px-6 py-4 border-b border-[#404040] flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-[#3b82f6]/10 rounded-lg">
                            <SettingsIcon size={20} className="text-[#3b82f6]" />
                        </div>
                        <h2 className="text-xl font-semibold">Settings</h2>
                    </div>
                    <button
                        onClick={closeSettings}
                        className="p-2 hover:bg-[#353535] rounded-lg transition-colors text-[#808080] hover:text-white"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-8">

                    {/* Appearance */}
                    <section className="space-y-4">
                        <h3 className="text-sm font-bold text-[#808080] uppercase tracking-wider flex items-center gap-2">
                            <Monitor size={14} />
                            Appearance
                        </h3>
                        <div className="bg-[#353535] rounded-lg border border-[#404040] p-4 space-y-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="font-medium">Theme</div>
                                    <div className="text-sm text-[#808080]">Choose your preferred theme</div>
                                </div>
                                <div className="flex bg-[#2d2d2d] rounded-lg p-1 border border-[#404040]">
                                    <button className="px-3 py-1.5 bg-[#404040] rounded text-xs font-medium shadow-sm transition-all text-white">Dark</button>
                                    <button className="px-3 py-1.5 text-[#808080] hover:text-white rounded text-xs font-medium transition-all">Light</button>
                                    <button className="px-3 py-1.5 text-[#808080] hover:text-white rounded text-xs font-medium transition-all">System</button>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* About */}
                    <section className="space-y-4">
                        <h3 className="text-sm font-bold text-[#808080] uppercase tracking-wider flex items-center gap-2">
                            <Info size={14} />
                            About
                        </h3>
                        <div className="bg-[#353535] rounded-lg border border-[#404040] p-6 text-center space-y-4">
                            <div className="w-16 h-16 bg-gradient-to-br from-[#3b82f6] to-[#2563eb] rounded-2xl flex items-center justify-center mx-auto shadow-lg">
                                <SettingsIcon size={32} className="text-white" />
                            </div>
                            <div>
                                <h4 className="text-lg font-semibold">Modelist</h4>
                                <p className="text-[#808080] text-sm">Version 1.0.0</p>
                            </div>
                            <div className="pt-4 border-t border-[#404040] flex justify-center gap-4">
                                <button className="flex items-center gap-2 px-4 py-2 bg-[#2d2d2d] hover:bg-[#404040] rounded-lg text-sm transition-colors border border-[#404040]">
                                    <Github size={16} />
                                    GitHub
                                </button>
                                <button className="flex items-center gap-2 px-4 py-2 bg-[#2d2d2d] hover:bg-[#404040] rounded-lg text-sm transition-colors border border-[#404040]">
                                    Website
                                </button>
                            </div>
                        </div>
                    </section>

                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-[#404040] bg-[#2d2d2d] flex justify-end gap-3 flex-shrink-0">
                    <button
                        onClick={closeSettings}
                        className="px-4 py-2 bg-[#353535] hover:bg-[#404040] rounded-lg text-sm transition-colors font-medium border border-[#404040]"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
