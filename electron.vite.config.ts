import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@main': resolve('src/main'),
        '@shared': resolve('src/shared'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
      },
    },
  },
  renderer: {
    root: 'src/renderer',
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared'),
        // 폰트 파일(.ttf/.woff2) 참조용 alias. renderer root 밖(app/resources) 에 위치.
        '@fonts': resolve('resources/font'),
      },
    },
    // renderer root(src/renderer) 외부 resources/ 를 Vite dev server 가 읽도록 허용.
    server: {
      fs: {
        allow: [resolve('.'), resolve('resources'), resolve('src')],
      },
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: resolve('src/renderer/index.html'),
      },
    },
  },
});
