import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';
const alias = Object.fromEntries(['sim', 'content', 'app', 'view', 'ui'].map(name => [`@${name}`, fileURLToPath(new URL(`./src/${name}`, import.meta.url))]));
export default defineConfig({ base: './', resolve: { alias }, server: { host: true, port: 5187, strictPort: true }, test: { environment: 'node', include: ['tests/**/*.test.ts'] } });
