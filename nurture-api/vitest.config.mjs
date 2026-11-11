export default {
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.mjs'],
    include: ['tests/**/*.test.mjs'],
    // Every test file shares one database, so run them one at a time.
    fileParallelism: false,
  },
};
