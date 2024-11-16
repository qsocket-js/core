import { TQSocketProtocolCompressor } from '@qsocket/protocol';

export interface IQSocketLogger {
	log(...message: any[]): void;
	error(...message: any[]): void;
	info(...message: any[]): void;
	debug(...message: any[]): void;
	warn(...message: any[]): void;
}

export interface IQSocketConfigBase {
	/**  */
	timeout?: {
		value?: number;
		actionAfrer?: 'none' | 'resend';
	};
	/** Конфигурация компрессии */
	compression?: {
		compressor?: TQSocketProtocolCompressor;
		compressionFromSize?: number;
	};
	debug: {
		/** Включить отладку */
		enabled: boolean;
		/** Инстанс логгера */
		logger?: IQSocketLogger;
		/** Префикс перед всеми записями */
		prefix?: string;
	};
}

export interface IQSocketClientConfig extends IQSocketConfigBase {
	/** Конфигурация переподключения */
	reconnection?: {
		enabled: boolean; // Включение/отключение автоматического переподключения
		maxAttempts?: number; // Максимальное количество попыток переподключения
		delay?: number; // Задержка между попытками переподключения в миллисекундах
		exponentialBackoff?: boolean; // Если true, задержка будет увеличиваться экспоненциально
	};
}

export interface IQSocketServerConfig extends IQSocketConfigBase {}
