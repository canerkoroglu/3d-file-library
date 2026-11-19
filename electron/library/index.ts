/**
 * The library: models, tags, collections and the search index stored in SQLite.
 * Split by concern; this file re-exports the public API.
 */
export { SUPPORTED_EXTENSIONS, THUMBNAIL_STRENGTH, fileTypeOf, libraryEvents, notifyModelsUpdated, notifyUser } from './core';
export { buildModelsQuery, getModel, getModelReadme, getModels, getModelsPage } from './query';
export type { ModelsQuery } from './query';
export { rebuildSearchIndex, refreshSearchIndex } from './searchIndex';
export { deleteModel, forgetMissingModels, getLibraryStats, importModel, markFolderModelsMissing, markModelAvailable, markModelMissing, markModelMissingByPath, removeModelByPath, removeModelsOfWatchedFolder } from './records';
export type { ImportOutcome } from './records';
export { applyAnalysis, discardAnalysisThumbnail, renameModelFile, setThumbnail, thumbnailStrengthOf, updateSourceMetadata } from './updates';
export { applySuggestedTags, getEnrichmentSource, listAiCategories, listTagNames, setAiMetadata } from './ai';
export type { EnrichmentSource } from './ai';
export { findDuplicates, findSimilar, getEmbeddingStats, getModelsNeedingEmbedding, setEmbedding } from './similarity';
