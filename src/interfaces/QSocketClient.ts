import type { IQSocketClientConfig } from '@/@types/shared';
import type { TQSocketClientSocket } from '@/@types/transport';

import QSocketBase from './QSocketBase';

export default class QSocketClient extends QSocketBase {
	private isConnected = false;
	private transportBuilder: () => TQSocketClientSocket;
	private reconnectionAttempts = 0;
	private reconnecting = false;
	private reconnectionConfig: IQSocketClientConfig['reconnection'];

	constructor(socketBuilder: () => TQSocketClientSocket, config?: IQSocketClientConfig) {
		super('client', config);
		this.reconnectionConfig = config?.reconnection;
		this.transportBuilder = socketBuilder;
	}

	async connect() {
		if (this.isConnected) return;

		let isTimeout = false;
		let timeout: number | undefined;

		try {
			const transport = await Promise.race([
				new Promise<TQSocketClientSocket>((resolve) => {
					const transport: any = this.transportBuilder();
					const handleOpen = () => {
						if (isTimeout) {
							transport.close();
							transport.off('open', handleOpen);
							return;
						}
						if (timeout !== undefined) {
							clearTimeout(timeout);
						}
						transport.off('open', handleOpen);
						resolve(transport);
					};
					transport.on('open', handleOpen);
				}),
				new Promise<never>((_, reject) => {
					timeout = window.setTimeout(() => {
						isTimeout = true;
						reject(new Error('Connection timed out'));
					}, 10000);
				}),
			]);

			this.isConnected = true;
			this.reconnectionAttempts = 0; // Сбрасываем количество попыток при успешном подключении
			this.connectionHandle(transport);
			this.namespaces.forEach((namespace) => this.namespaceControl(namespace, 'join-namespace'));
			transport.on('close', () => {
				this.isConnected = false;
				this.attemptReconnect(); // Инициируем переподключение при закрытии соединения
			});
		} catch (error) {
			this.debuger.error('Connection failed:', error);
			this.isConnected = false;
			this.attemptReconnect(); // Инициируем переподключение при ошибке
		} finally {
			if (timeout !== undefined) {
				clearTimeout(timeout);
			}
		}
	}

	/**
	 * Метод для переподключения с учетом конфигурации.
	 */
	private async attemptReconnect() {
		// Проверяем, включено ли переподключение в конфигурации и не идет ли уже попытка переподключения
		if (!this.reconnectionConfig?.enabled || this.reconnecting) return;

		this.reconnecting = true;
		this.debuger.log(`Connection restoration process started.`);
		while (
			this.reconnectionConfig.enabled &&
			(this.reconnectionConfig.maxAttempts === undefined || this.reconnectionAttempts < this.reconnectionConfig.maxAttempts)
		) {
			this.reconnectionAttempts++;
			const delay = this.calculateDelay();
			await new Promise((resolve) => setTimeout(resolve, delay));
			this.debuger.log(`Attempting to reconnect... (attempt ${this.reconnectionAttempts})`);

			try {
				await this.connect(); // Пытаемся переподключиться
				if (this.isConnected) {
					this.debuger.log('Reconnected successfully.');
					break; // Выходим из цикла при успешном подключении
				}
			} catch (error) {
				this.debuger.error('Reconnection attempt failed:', error);
			}
		}

		this.reconnecting = false; // Сбрасываем флаг после завершения попыток переподключения
	}

	/**
	 * Вычисляет задержку для следующей попытки переподключения.
	 * @returns {number} Задержка в миллисекундах
	 */
	private calculateDelay(): number {
		const baseDelay = this.reconnectionConfig?.delay ?? 1000; // Значение по умолчанию — 1 секунда
		const maxDelay = 60000; // Максимальная задержка — 60 секунд

		if (this.reconnectionConfig?.exponentialBackoff) {
			// Логарифмическое увеличение задержки
			const delay = baseDelay * Math.log1p(this.reconnectionAttempts); // log1p(x) = ln(1 + x)
			return Math.min(delay, maxDelay); // Ограничиваем максимальное значение
		}

		return baseDelay; // Если exponentialBackoff отключён, возвращаем базовую задержку
	}

	//#endregion
}
