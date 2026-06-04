/**
 * @nestai/contracts
 *
 * The single source of truth for the NestAI monorepo. Every other package
 * imports its schemas, types, DTOs and provider interfaces from here.
 *
 * Layout:
 *   - enums.ts     : Zod enums + inferred union types + value tuples
 *   - entities.ts  : Zod schemas + inferred types for domain entities
 *   - dto.ts       : request/response DTOs for the API surface
 *   - providers.ts : type-only adapter interfaces (LLM/calendar/email/...)
 *
 * Everything is isomorphic (no Node-only APIs); the only runtime dep is zod.
 */
export * from './enums.js';
export * from './entities.js';
export * from './dto.js';
export * from './providers.js';

/** Semantic version of the contracts package surface. */
export const NESTAI_CONTRACTS_VERSION = '0.0.0';
