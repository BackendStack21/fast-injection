# Scripts

Utility scripts for the fast-di project.

## Memory Leak Check

The `memory-leak-check.ts` script validates that the dependency injection container properly cleans up resources and doesn't have memory leaks.

### Usage

```bash
# Run with npm script (recommended - includes --expose-gc flag)
bun run memory-check

# Or run directly
bun --expose-gc run scripts/memory-leak-check.ts
```

### What It Tests

The script runs 10 comprehensive tests:

1. **Container disposal cleanup** - Verifies containers release resources on disposal
2. **Decorator metadata cleanup** - Checks decorator metadata is properly cleaned
3. **Failed async token cleanup** - Validates failed async resolutions don't leak
4. **Scoped container cleanup** - Tests scoped container disposal
5. **Global container reset** - Verifies global container cleanup
6. **Transient instances** - Checks transient instances are garbage collected
7. **Factory registrations** - Tests factory cleanup
8. **Async factory registrations** - Validates async factory cleanup
9. **Multiple registrations** - Tests multi-registration cleanup
10. **Lifecycle hooks** - Verifies lifecycle hooks don't cause leaks

### Memory Thresholds

Each test creates many instances (5,000-10,000) and then performs cleanup. The script considers a test passing if memory increase is less than 5MB after garbage collection, which indicates proper cleanup.

### Output

The script provides:

- Memory usage before and after each test
- Memory increase calculations
- Pass/fail status for each test
- Summary with percentage of tests passed

### CI/CD Integration

You can add this to your CI pipeline:

```yaml
- name: Check for memory leaks
  run: bun run memory-check
```

The script exits with code 0 if all tests pass, or 1 if any test fails.
