// three's examples/jsm loaders we use that don't ship their own type declarations.
declare module 'three/examples/jsm/loaders/USDZLoader.js' {
    import { Loader, Group, LoadingManager } from 'three';
    export class USDZLoader extends Loader {
        constructor(manager?: LoadingManager);
        parse(buffer: ArrayBuffer | Uint8Array): Group;
    }
}
