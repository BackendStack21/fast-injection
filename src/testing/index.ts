import { Container } from "../core/container.js";
import type { IContainer } from "../types/index.js";

/**
 * Create an isolated test container for unit testing with mocked dependencies.
 *
 * Creates a fresh container instance with no parent and no pre-registered services.
 * This ensures complete isolation between tests and allows you to register only
 * the services and mocks needed for each specific test case.
 *
 * @returns A new, empty container for testing
 *
 * @example
 * ```typescript
 * describe('UserService', () => {
 *   let container: IContainer;
 *   let mockDatabase: Database;
 *
 *   beforeEach(() => {
 *     container = createTestContainer();
 *     mockDatabase = createMock<Database>({
 *       users: {
 *         findById: jest.fn().mockResolvedValue({ id: '1', name: 'John' })
 *       }
 *     });
 *     container.registerValue('database', mockDatabase);
 *     container.register(UserService);
 *   });
 *
 *   it('should fetch user by id', async () => {
 *     const service = container.resolve(UserService);
 *     const user = await service.getUser('1');
 *     expect(user.name).toBe('John');
 *   });
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Testing with multiple mocks
 * it('should log errors', async () => {
 *   const container = createTestContainer();
 *   const mockLogger = createMock<Logger>({
 *     error: jest.fn()
 *   });
 *   const mockDb = createMock<Database>({
 *     users: {
 *       findById: jest.fn().mockRejectedValue(new Error('Not found'))
 *     }
 *   });
 *
 *   container.registerValue('logger', mockLogger);
 *   container.registerValue('database', mockDb);
 *   container.register(UserService);
 *
 *   const service = container.resolve(UserService);
 *   await expect(service.getUser('999')).rejects.toThrow();
 *   expect(mockLogger.error).toHaveBeenCalled();
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Testing scoped services
 * it('should isolate request context', () => {
 *   const container = createTestContainer();
 *   container.register(RequestContext, { lifetime: Lifetime.Scoped });
 *
 *   const scope1 = container.createScope();
 *   scope1.registerValue('requestId', 'req-1');
 *   const ctx1 = scope1.resolve(RequestContext);
 *
 *   const scope2 = container.createScope();
 *   scope2.registerValue('requestId', 'req-2');
 *   const ctx2 = scope2.resolve(RequestContext);
 *
 *   expect(ctx1).not.toBe(ctx2);
 * });
 * ```
 */
export function createTestContainer(): IContainer {
  return new Container();
}

/**
 * Create a partial mock implementation of an interface or class for testing.
 *
 * This utility function provides a type-safe way to create test doubles by accepting
 * a partial implementation and casting it to the full type. Commonly used with testing
 * frameworks like Jest, Vitest, or Sinon to create mocked dependencies.
 *
 * @template T - The type to mock
 * @param implementation - Partial implementation with only the methods/properties needed for the test
 * @returns The partial implementation cast to the full type T
 *
 * @example
 * ```typescript
 * // Mock a database interface
 * interface Database {
 *   connect(): Promise<void>;
 *   disconnect(): Promise<void>;
 *   query(sql: string): Promise<any[]>;
 * }
 *
 * const mockDb = createMock<Database>({
 *   query: jest.fn().mockResolvedValue([{ id: 1, name: 'Test' }])
 * });
 *
 * container.registerValue('database', mockDb);
 * ```
 *
 * @example
 * ```typescript
 * // Mock with spy functions
 * interface Logger {
 *   debug(msg: string): void;
 *   info(msg: string): void;
 *   error(msg: string): void;
 * }
 *
 * const mockLogger = createMock<Logger>({
 *   info: jest.fn(),
 *   error: jest.fn()
 * });
 *
 * container.registerValue('logger', mockLogger);
 * const service = container.resolve(UserService);
 * service.doSomething();
 *
 * expect(mockLogger.info).toHaveBeenCalledWith('Operation completed');
 * ```
 *
 * @example
 * ```typescript
 * // Mock with computed properties
 * interface Config {
 *   apiUrl: string;
 *   timeout: number;
 *   retries: number;
 * }
 *
 * const mockConfig = createMock<Config>({
 *   apiUrl: 'http://test.example.com',
 *   timeout: 1000
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Combining with class instances
 * class UserRepository {
 *   async findById(id: string): Promise<User> { throw new Error('Not implemented'); }
 *   async save(user: User): Promise<void> { throw new Error('Not implemented'); }
 * }
 *
 * const mockRepo = createMock<UserRepository>({
 *   findById: async (id: string) => ({ id, name: 'Mock User', email: 'test@example.com' }),
 *   save: jest.fn()
 * });
 *
 * container.registerValue(UserRepository, mockRepo);
 * ```
 */
export function createMock<T>(implementation: Partial<T>): T {
  return implementation as T;
}
