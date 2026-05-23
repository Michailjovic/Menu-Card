import resolve from '@rollup/plugin-node-resolve';

export default {
  input: 'src/room-navbar-card.js',
  output: {
    file: 'www/room-navbar-card.js',
    format: 'es',
    sourcemap: false,
  },
  plugins: [resolve()],
};
