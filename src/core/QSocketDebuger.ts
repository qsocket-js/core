import { IQSocketConfigBase, IQSocketLogger } from '@/@types/shared';

const colors: { [key: string]: string } = {
	log: '\x1b[32m', // Зеленый
	error: '\x1b[31m', // Красный
	warn: '\x1b[33m', // Желтый
	info: '\x1b[34m', // Синий
};
const reset = '\x1b[0m'; // Сброс цвета

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
	 * Получает цветной префикс в зависимости от типа сообщения.
	 * @param {string} type - Тип сообщения (log, error, info, warn).
	 * @returns {string} - Цветной префикс.
	 */
	private getColoredPrefix(type: string): string {
		return `${colors[type] ?? colors.log}${this.prefix}${reset}`;
	}

	/**
	 * Логирует сообщение, если включен режим отладки.
	 * @param {...any[]} message - Сообщение или данные для логирования.
	 */
	public log(...message: any[]): void {
		if (this.enabled) this.logger.log(this.getColoredPrefix('log'), ...message);
	}

	/**
	 * Логирует сообщение об ошибке, если включен режим отладки.
	 * @param {...any[]} message - Сообщение или данные для логирования ошибок.
	 */
	public error(...message: any[]): void {
		if (this.enabled) this.logger.error(this.getColoredPrefix('error'), ...message);
	}

	/**
	 * Логирует информационное сообщение, если включен режим отладки.
	 * @param {...any[]} message - Сообщение или данные для информационного логирования.
	 */
	public info(...message: any[]): void {
		if (this.enabled) this.logger.info(this.getColoredPrefix('info'), ...message);
	}

	/**
	 * Логирует предупреждение, если включен режим отладки.
	 * @param {...any[]} message - Сообщение или данные для логирования предупреждений.
	 */
	public warn(...message: any[]): void {
		if (this.enabled) this.logger.warn(this.getColoredPrefix('warn'), ...message);
	}
}
