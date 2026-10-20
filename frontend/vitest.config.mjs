import { defineConfig } from 'vitest/config';

function imageMockPlugin() {
  return {
    name: 'vitest-image-mock',
    transform(code, id) {
      if (/\.(png|jpe?g|gif|webp|svg)$/i.test(id)) {
        return {
          code: 'export default "mock-image.png";',
          map: null,
        };
      }
    },
  };
}

export default defineConfig({
  plugins: [imageMockPlugin()],
  test: {
    environment: 'node',
    server: {
      deps: {
        inline: ['react-native-web', 'react-native-svg'],
      },
    },
  },
  resolve: {
    alias: {
      'react-native': 'react-native-web',
    },
  },
  define: {
    __DEV__: true,
  },
});
