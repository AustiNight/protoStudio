import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const projectRoot = fileURLToPath(new URL('./', import.meta.url));

const carouselBuildAssets = [
  {
    source: '.well-known/carousel.json',
    target: '.well-known/carousel.json',
  },
  {
    source: 'preview-carousel.png',
    target: 'preview-carousel.png',
  },
] as const;

function copyCarouselBuildAssets() {
  return {
    name: 'copy-carousel-build-assets',
    apply: 'build',
    async writeBundle() {
      await Promise.all(
        carouselBuildAssets.map(async ({ source, target }) => {
          const sourcePath = resolve(projectRoot, source);
          const targetPath = resolve(projectRoot, 'dist', target);

          await mkdir(dirname(targetPath), { recursive: true });
          await copyFile(sourcePath, targetPath);
        }),
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), copyCarouselBuildAssets()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
