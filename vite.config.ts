import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 渲染进程构建配置。dev 时由 vite 起本地服务（http://localhost:5173），
// 主进程通过 ELECTRON_RENDERER_URL 加载该地址；生产构建输出到 dist/renderer。
export default defineConfig({
  root: 'src/renderer',
  plugins: [react()],
  base: './',
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
