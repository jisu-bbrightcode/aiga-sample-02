/** Public surface of the content-catalog feature. */
export * from "./types.js";
export * from "./errors.js";
export * from "./ports.js";
export * from "./state-machine.js";
export * from "./slug.js";
export {
  ContentService,
  CategoryService,
} from "./service.js";
export type {
  ContentActor,
  ContentViewer,
  ContentServiceDeps,
  CategoryServiceDeps,
} from "./service.js";
export {
  DrizzleContentRepository,
  DrizzleCategoryRepository,
} from "./drizzle-repository.js";
export {
  getContentService,
  getCategoryService,
  systemClock,
  uuidGenerator,
} from "./factory.js";
export {
  contentItems,
  contentCategories,
  contentStatus,
} from "./schema.js";
export type { ContentRow, NewContentRow, CategoryRow, NewCategoryRow } from "./schema.js";
export { contentCatalogPaths, contentCatalogComponents } from "./openapi.js";
export * from "./validation.js";
