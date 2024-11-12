const tsPlugin = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');
const prettierPlugin = require('eslint-plugin-prettier');
const prettierConfig = require('eslint-config-prettier');

module.exports = [
	{
		files: ['**/*.ts'],
		ignores: [
			'node_modules/**',
			'dist/**',
			'tsup.config.ts',
			'/dist',
			'/.vscode',
			'/.gitignore',
			'/LICENCE',
			'/tsconfig.json',
			'/tsup.config.ts',
			'/README.md',
			'/.prittierrc',
		],

		languageOptions: {
			parser: tsParser,
			parserOptions: {
				project: './tsconfig.json',
			},
			globals: {
				Buffer: 'readonly',
				clearImmediate: 'readonly',
				clearInterval: 'readonly',
				clearTimeout: 'readonly',
				setImmediate: 'readonly',
				setInterval: 'readonly',
				setTimeout: 'readonly',
				console: 'readonly',
				exports: 'readonly',
				global: 'readonly',
				module: 'readonly',
				process: 'readonly',
				require: 'readonly',
				__dirname: 'readonly',
				__filename: 'readonly',
			},
		},
		plugins: {
			'@typescript-eslint': tsPlugin,
			prettier: prettierPlugin,
		},
		rules: {
			...tsPlugin.configs.recommended.rules,
			...tsPlugin.configs['recommended-requiring-type-checking'].rules,
			'prettier/prettier': 'error',
			'no-console': 'off',
			// '@typescript-eslint/no-unsafe-member-access': 'off', // Отключает правило, запрещающее небезопасный доступ к членам объекта.
			// '@typescript-eslint/no-explicit-any': 'off', // Отключает правило, запрещающее использование типа any.
			// '@typescript-eslint/no-unsafe-assignment': 'off', // Отключает правило, запрещающее небезопасное присваивание.
			// '@typescript-eslint/no-unsafe-return': 'off', // Отключает правило, запрещающее небезопасное возвращение значений.
			// '@typescript-eslint/no-unsafe-argument': 'off', // Отключает правило, запрещающее небезопасные аргументы функций.
			// '@typescript-eslint/no-unsafe-call': 'off', // Отключает правило, запрещающее небезопасные вызовы функций.
			// '@typescript-eslint/no-misused-promises': 'off', // Отключает правило, запрещающее некорректное использование промисов.
		},
	},
	prettierConfig,
];
