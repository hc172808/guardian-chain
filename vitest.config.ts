import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    // Solidity/Hardhat tests run through the contracts package's own scripts.
    // Keep Vitest focused on the root app tests; these suites require Hardhat.
    exclude: [...configDefaults.exclude, 'contracts/test/**', 'contracts/token-test/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
