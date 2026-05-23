import resolve from '@rollup/plugin-node-resolve';

export default {
  input: 'src/room-navbar-card.js',
  output: {
    file: 'room-navbar-card.js',   // root – HACS frontend plugin
    format: 'es',
    sourcemap: false,
  },
  plugins: [resolve()],
};
