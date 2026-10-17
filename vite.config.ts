import { defineConfig } from 'vite';
import process from 'node:process';

// Set VITE_BASE_PATH=/your-repository-name/ for a GitHub Pages project site.
export default defineConfig({
  base: process.env.VITE_BASE_PATH || './',
});
