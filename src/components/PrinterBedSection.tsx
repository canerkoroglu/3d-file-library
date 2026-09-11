import { useEffect, useState } from 'react';
import { Ruler } from 'lucide-react';
import { useStore } from '../store/store';

/** The "Printer bed size" block of the settings dialog: the build volume used to flag oversized models. */
export default function PrinterBedSection() {
    const { bedSize, updateBedSize } = useStore();
    const [x, setX] = useState('');
    const [y, setY] = useState('');
    const [z, setZ] = useState('');

    useEffect(() => {
        setX(bedSize ? String(bedSize.x) : '');
        setY(bedSize ? String(bedSize.y) : '');
        setZ(bedSize ? String(bedSize.z) : '');
    }, [bedSize]);

    const save = () => {
        const values = [parseFloat(x), parseFloat(y), parseFloat(z)];
        if (values.every((n) => Number.isFinite(n) && n > 0)) {
            void updateBedSize({ x: values[0], y: values[1], z: values[2] });
        } else {
            void updateBedSize(null);
        }
    };

    const field = (label: string, value: string, set: (v: string) => void) => (
        <label className="flex-1">
            <span className="block text-xs text-text-secondary mb-1">{label}</span>
            <input
                type="number"
                min={0}
                value={value}
                onChange={(e) => set(e.target.value)}
                className="input w-full font-mono text-sm"
                placeholder="—"
            />
        </label>
    );

    return (
        <section className="space-y-4">
            <h3 className="text-sm font-bold text-text-secondary uppercase tracking-wider flex items-center gap-2">
                <Ruler size={14} /> Printer bed size
            </h3>
            <div className="bg-primary-bg rounded-lg border border-accent-gray p-4 space-y-3">
                <p className="text-sm text-text-secondary">
                    Your printer's build volume in millimetres. Models that can't fit are flagged with an "Exceeds bed" badge.
                    Clear the fields to turn the check off. (Only applies to STL, 3MF, OBJ and STEP, which are in mm.)
                </p>
                <div className="flex items-end gap-2">
                    {field('X (width)', x, setX)}
                    {field('Y (depth)', y, setY)}
                    {field('Z (height)', z, setZ)}
                    <button onClick={save} className="btn btn-primary text-sm h-9">Save</button>
                </div>
                {bedSize && (
                    <p className="text-xs text-text-secondary">Current: {bedSize.x} × {bedSize.y} × {bedSize.z} mm</p>
                )}
            </div>
        </section>
    );
}
