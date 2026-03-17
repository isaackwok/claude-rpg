import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src')
    }
  },
  test: {
    globals: false,
    environment: 'node',
    exclude: ['tests/e2e/**', 'node_modules/**']
  }
})
