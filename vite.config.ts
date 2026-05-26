import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'


function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

export default defineConfig({
  plugins: [
    figmaAssetResolver(),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],

  build: {
    rollupOptions: {
      output: {
        // PERFORMANCE: separa libs pesadas em chunks proprios pra que o
        // bundle inicial nao traga TUDO. Cada chunk so eh baixado quando
        // realmente usado (PainelControle puxa charts, HlsVideo puxa
        // hls, etc — via React.lazy + tree-shaking de import dinamico).
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('recharts') || id.includes('d3-')) return 'vendor-charts';
            if (id.includes('hls.js')) return 'vendor-video';
            if (id.includes('@supabase/')) return 'vendor-supabase';
            if (id.includes('@radix-ui/')) return 'vendor-radix';
            if (id.includes('react-dom') || id.includes('scheduler')) return 'vendor-react';
            if (id.includes('lucide-react')) return 'vendor-icons';
            // AR/filtros — chunks separados, carregam SO quando o user
            // abre a camera AR (lazy import). Sem isso o bundle inicial
            // ganhava 2-3MB gzip.
            if (id.includes('@mediapipe/')) return 'vendor-mediapipe';
            if (id.includes('three') && !id.includes('@react-three/')) return 'vendor-three';
            if (id.includes('@react-three/')) return 'vendor-three';
          }
        },
      },
    },
    // Aumenta o warning de chunk size — sabemos que vendor-react eh
    // legitimamente ~150KB. Sem isso, build alerta toda vez.
    chunkSizeWarningLimit: 800,
  },
})
