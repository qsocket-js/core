import { IQSocketConfigBase, IQSocketLogger } from '@/@types/shared';

export default class QSocketDebuger {
	/** Включен ли режим отладки */
	private readonly enabled: boolean;
	/** Префикс для сообщений логирования */
	private readonly prefix: string;
	/** Логгер, используемый для вывода сообщений */
	private readonly logger: IQSocketLogger = console;

	/**
	 * Конструктор класса QSocketUtils.
	 * @param {IQSocketConfigBase['debug']} [debugConfig] - Конфигурация для режима отладки.
	 */
	constructor(debugConfig?: IQSocketConfigBase['debug']) {
		const { enabled = false, logger = console, prefix = '' } = debugConfig ?? {};
		this.enabled = enabled;
		this.logger = logger;
		this.prefix = prefix;
	}

	/**
	 * Логирует сообщение, если включен режим отладки.
	 * @param {...any[]} message - Сообщение или данные для логирования.
	 */
	public log(...message: any[]): void {
		if (this.enabled) this.logger.log(this.prefix, ...message);
	}

	/**
	 * Логирует сообщение об ошибке, если включен режим отладки.
	 * @param {...any[]} message - Сообщение или данные для логирования ошибок.
	 */
	public error(...message: any[]): void {
		if (this.enabled) this.logger.error(this.prefix, ...message);
	}

	/**
	 * Логирует информационное сообщение, если включен режим отладки.
	 * @param {...any[]} message - Сообщение или данные для информационного логирования.
	 */
	public info(...message: any[]): void {
		if (this.enabled) this.logger.info(this.prefix, ...message);
	}

	/**
	 * Логирует предупреждение, если включен режим отладки.
	 * @param {...any[]} message - Сообщение или данные для логирования предупреждений.
	 */
	public warn(...message: any[]): void {
		if (this.enabled) this.logger.warn(this.prefix, ...message);
	}
	//#endregion
}
