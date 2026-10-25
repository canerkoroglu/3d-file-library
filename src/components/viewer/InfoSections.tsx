/** Read-mostly facts about a model: file (with rename), geometry, slicer project and source. */
import { useState } from 'react';
import { AlertTriangle, Pencil } from 'lucide-react';
import { useStore } from '../../store/store';
import { exceedsBed, formatDimensions, formatFileSize, formatVolume, httpUrl } from '../../lib/format';
import type { ModelWithTags } from '../../types';
import { Field } from './Field';

export function FileSection({ model, missing }: { model: ModelWithTags; missing: boolean }) {
    const reportError = useStore((s) => s.reportError);
    const [isRenaming, setIsRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState('');

    const handleRename = async () => {
        if (!renameValue.trim() || renameValue === model.filename) {
            setIsRenaming(false);
            return;
        }
        try {
            await window.electronAPI.renameModelFile(model.id, renameValue);
            setIsRenaming(false);
        } catch (error) {
            reportError('Could not rename the file', error);
        }
    };

    return (
        <section>
            <h3 className="text-sm font-semibold mb-3 text-text-primary">File</h3>
            <div className="space-y-3">
                <div>
                    <div className="text-text-secondary text-xs mb-1">Filename</div>
                    <input
                        className="w-full bg-primary-bg text-text-primary px-3 py-2 rounded-lg border border-transparent focus:border-blue-500 focus:outline-hidden transition-colors text-sm"
                        value={isRenaming ? renameValue : model.filename}
                        onChange={(e) => {
                            setIsRenaming(true);
                            setRenameValue(e.target.value);
                        }}
                        onBlur={() => isRenaming && handleRename()}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur();
                            if (e.key === 'Escape') {
                                e.stopPropagation();
                                setIsRenaming(false);
                                setRenameValue('');
                            }
                        }}
                        title={missing ? 'Cannot rename a missing file' : 'Click to rename'}
                        readOnly={missing}
                    />
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <Field label="Size">{formatFileSize(model.fileSize)}</Field>
                    <Field label="Type"><span className="uppercase">{model.fileType}</span></Field>
                </div>
                <Field label="Location"><span className="text-xs font-mono break-all">{model.filepath}</span></Field>
            </div>
        </section>
    );
}

export function GeometrySection({ model }: { model: ModelWithTags }) {
    const bedSize = useStore((s) => s.bedSize);
    if (!model.bbox && model.triangleCount === undefined) return null;
    return (
        <section>
            <h3 className="text-sm font-semibold mb-3 text-text-primary">Geometry</h3>
            <div className="grid grid-cols-2 gap-3">
                {model.bbox && <Field label="Dimensions">{formatDimensions(model.bbox)}</Field>}
                {model.triangleCount !== undefined && <Field label="Triangles">{model.triangleCount.toLocaleString()}</Field>}
                {model.volumeMm3 !== undefined && <Field label="Volume">{formatVolume(model.volumeMm3)}</Field>}
            </div>
            {exceedsBed(model, bedSize) && (
                <p className="mt-3 flex items-center gap-1.5 text-xs text-amber-400">
                    <AlertTriangle size={14} /> Larger than your printer bed ({bedSize!.x} × {bedSize!.y} × {bedSize!.z} mm)
                </p>
            )}
        </section>
    );
}

/** Print settings read from a slicer project (3MF). */
export function ProjectSection({ model }: { model: ModelWithTags }) {
    const print = model.printMeta;
    if (!print || !(print.slicer || print.printerModel || print.filamentTypes?.length || print.layerHeight || print.title || print.designer)) return null;
    return (
        <section>
            <h3 className="text-sm font-semibold mb-3 text-text-primary">Project</h3>
            <div className="space-y-3">
                {print.title && <Field label="Title">{print.title}</Field>}
                {print.designer && <Field label="Designer">{print.designer}</Field>}
                {print.description && <Field label="Description"><span className="text-xs whitespace-pre-wrap">{print.description}</span></Field>}
                <div className="grid grid-cols-2 gap-3">
                    {print.slicer && <Field label="Slicer">{print.slicer}</Field>}
                    {print.printerModel && <Field label="Printer">{print.printerModel}</Field>}
                    {print.filamentTypes && print.filamentTypes.length > 0 && <Field label="Filament">{print.filamentTypes.join(', ')}</Field>}
                    {print.layerHeight !== undefined && !Number.isNaN(print.layerHeight) && <Field label="Layer height">{print.layerHeight} mm</Field>}
                </div>
            </div>
        </section>
    );
}

export function SourceSection({ model, onEdit }: { model: ModelWithTags; onEdit: () => void }) {
    const meta = model.sourceMetadata;
    return (
        <section>
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-text-primary">Source</h3>
                <button onClick={onEdit} className="text-xs text-accent-blue hover:underline flex items-center gap-1">
                    <Pencil size={12} /> Edit
                </button>
            </div>
            {meta && (meta.source || meta.author || meta.license || meta.url || meta.notes) ? (
                <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        {meta.source && <Field label="Site">{meta.source}</Field>}
                        {meta.author && <Field label="Author">{meta.author}</Field>}
                        {meta.license && <Field label="License">{meta.license}</Field>}
                    </div>
                    {meta.url && (
                        <Field label="URL">
                            {httpUrl(meta.url)
                                ? <a href={meta.url} target="_blank" rel="noreferrer" className="text-accent-blue hover:underline text-xs break-all">{meta.url}</a>
                                : <span className="text-xs break-all">{meta.url}</span>}
                        </Field>
                    )}
                    {meta.notes && <Field label="Notes"><span className="text-xs whitespace-pre-wrap">{meta.notes}</span></Field>}
                </div>
            ) : (
                <div className="text-text-secondary text-xs italic">No source information yet.</div>
            )}
        </section>
    );
}
