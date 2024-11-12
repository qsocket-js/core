import { defineConfig } from 'tsup';

export default defineConfig({
	format: ['cjs', 'esm'],
	entry: ['./src/index.ts'],
	outDir: 'dist',
	treeshake: true,
	minify: false,
	bundle: true,
	dts: true,
	shims: true,
	skipNodeModulesBundle: false,
	clean: true,
	sourcemap: true,
	platform: 'node',
});
