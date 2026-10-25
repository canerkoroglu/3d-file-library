export function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <div className="text-text-secondary text-xs mb-1">{label}</div>
            <div className="text-text-primary bg-primary-bg px-3 py-2 rounded-lg text-sm wrap-break-word">{children}</div>
        </div>
    );
}
