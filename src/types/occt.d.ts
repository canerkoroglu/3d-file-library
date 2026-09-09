// Type surface for occt-import-js (OpenCASCADE compiled to WASM); the package ships no types.
declare module 'occt-import-js' {
    export interface OcctMesh {
        name?: string;
        color?: [number, number, number];
        attributes: { position: { array: number[] }; normal?: { array: number[] } };
        index?: { array: number[] };
    }
    export interface OcctResult {
        success: boolean;
        meshes: OcctMesh[];
    }
    export interface OcctModule {
        ReadStepFile(content: Uint8Array, params: unknown): OcctResult;
    }
    export interface OcctFactoryOptions {
        locateFile?: (path: string, scriptDirectory: string) => string;
        /** Pre-fetched WASM bytes, so the module does not fetch them itself (needed under file://). */
        wasmBinary?: ArrayBuffer;
    }
    const factory: (options?: OcctFactoryOptions) => Promise<OcctModule>;
    export default factory;
}

// The WASM binary imported as a bundled asset URL (Vite ?url).
declare module '*occt-import-js.wasm?url' {
    const url: string;
    export default url;
}
