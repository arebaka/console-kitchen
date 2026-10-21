import yaml from '@modyfi/vite-plugin-yaml';
import dsv from '@rollup/plugin-dsv';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
	base: './',
	plugins: [
		react({
			compiler: true,
		}),
		dsv(),
		yaml(),
	],
	resolve: {
		tsconfigPaths: true,
	},
	build: {
		target: 'esnext',
		sourcemap: true,
		manifest: true,
		minify: 'oxc',
	},
	server: {
		host: '0.0.0.0',
		port: 3000,
		open: true,
		cors: true,
		hmr: true,
	},
	devtools: false,
});
