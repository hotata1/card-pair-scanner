/// <reference types="vitest/config" />
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// base './' はリポジトリ名に依存しない相対パス配信(U3-NFR-1)
export default defineConfig({
  base: './',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate', // U3-NFR-4: 自動更新
      devOptions: { enabled: false }, // 開発中はSW無効(HMRと干渉させない)
      workbox: {
        // アプリ本体のみプリキャッシュ。tesseract/** (約10MB) は除外(U3-NFR-3)
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        globIgnores: ['tesseract/**'],
        // Tesseractアセットは初回使用時に CacheFirst でランタイムキャッシュ
        runtimeCaching: [
          {
            urlPattern: /\/tesseract\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tesseract-assets',
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
        // ハーネスも含めてナビゲーションをオフライン対応
        navigateFallback: null,
      },
      manifest: {
        name: 'カードペアスキャナー',
        short_name: 'ペアスキャン',
        description: 'カードの文字と数字のペアを撮影して自動記録(完全オフライン動作)',
        lang: 'ja',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        theme_color: '#101410',
        background_color: '#101410',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        harness: resolve(__dirname, 'harness.html'), // 開発ハーネス(精度検証用)
        display: resolve(__dirname, 'display.html'), // 表示用シミュレータ(実カメラテスト用)
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
