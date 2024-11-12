import { IQSocketDebugConfig, IQSocketLogger } from '@/@types/general';

export default class QSocketDebuger {
	/** Включен ли режим отладки */
	private debug: boolean;

	/** Префикс для сообщений логирования */
	private prefix: string;

	/** Логгер, используемый для вывода сообщений */
	private logger: IQSocketLogger = console;

	/**
	 * Конструктор класса QSocketUtils.
	 * @param {IQSocketDebugConfig} [debugConfig] - Конфигурация для режима отладки.
	 */
	constructor(debugConfig?: IQSocketDebugConfig) {
		this.debug = debugConfig?.on ?? false;
		this.logger = debugConfig?.logger || console;
		this.prefix = debugConfig?.prefix || '[Q-SOCKET]';
	}

	/**
	 * Логирует сообщение, если включен режим отладки.
	 * @param {...any[]} message - Сообщение или данные для логирования.
	 */
	public log(...message: any[]): void {
		if (this.debug) this.logger.log(this.prefix, ...message);
	}

	/**
	 * Логирует сообщение об ошибке, если включен режим отладки.
	 * @param {...any[]} message - Сообщение или данные для логирования ошибок.
	 */
	public error(...message: any[]): void {
		if (this.debug) this.logger.error(this.prefix, ...message);
	}

	/**
	 * Логирует информационное сообщение, если включен режим отладки.
	 * @param {...any[]} message - Сообщение или данные для информационного логирования.
	 */
	public info(...message: any[]): void {
		if (this.debug) this.logger.info(this.prefix, ...message);
	}

	/**
	 * Логирует предупреждение, если включен режим отладки.
	 * @param {...any[]} message - Сообщение или данные для логирования предупреждений.
	 */
	public warn(...message: any[]): void {
		if (this.debug) this.logger.warn(this.prefix, ...message);
	}
	//#endregion
}
