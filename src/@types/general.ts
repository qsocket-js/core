export interface IQSocketLogger {
	log(...message: any[]): void;
	error(...message: any[]): void;
	info(...message: any[]): void;
	debug(...message: any[]): void;
	warn(...message: any[]): void;
}

export interface IQSocketDebugConfig {
	/** Включить отладку */
	on: boolean;
	/** Инстанс логгера */
	logger?: IQSocketLogger;
	/** Префикс перед всеми записями */
	prefix?: string;
}

export type TContentType = 'number' | 'string' | 'JSON' | 'boolean' | 'null';
