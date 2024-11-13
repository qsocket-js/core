import type { IQSocketClientConfig } from '@/@types/shared';
import type { TQSocketClientSocket } from '@/@types/transport';
import type { IQSocketProtocolMessage, IQSocketProtocolMessageMetaControl } from '@qsocket/protocol';

import QSocketBase from './QSocketBase';
import QSocketInteraction from '@/core/QSocketInteraction';
import QSocketNamespace from '@/core/QSocketNamespace';
import { EQSocketProtocolContentEncoding, EQSocketProtocolContentType, EQSocketProtocolMessageType } from '@qsocket/protocol';
import { createPingMessage } from '@/core/QSocketHelpers';

export default class QSocketClient extends QSocketBase {
	private isConnected = false;
	private isIntentionalDisconnect = false;
	private transportBuilder: () => TQSocketClientSocket;
	private reconnectionAttempts = 0;
	private reconnectionConfig: IQSocketClientConfig['reconnection'];

	constructor(socketBuilder: () => TQSocketClientSocket, config?: IQSocketClientConfig) {
		super('client', config);
		this.reconnectionConfig = config?.reconnection;
		this.transportBuilder = socketBuilder;
	}

	connect() {
		if (this.isConnected) this.disconnect();
		this.isIntentionalDisconnect = false;
		const transport = this.transportBuilder();
		transport.on('close', () => {
			this.isConnected = false;
			if (!this.isIntentionalDisconnect) this.startReconnection();
		});
		this.connectionHandle(transport);
		this.isConnected = true;
		this.namespaces.forEach(this.afterCreatingNamespace.bind(this));
		return this;
	}

	disconnect() {
		this.isIntentionalDisconnect = true;
		this.interactions.forEach(QSocketInteraction.close);
		this.isConnected = false;
	}

	reconnect() {
		this.disconnect();
		this.connect();
	}

	//#region Абстрактные методы
	protected override afterCreatingNamespace(namespace: QSocketNamespace) {
		const message: IQSocketProtocolMessage<IQSocketProtocolMessageMetaControl> = [
			{
				meta: {
					type: EQSocketProtocolMessageType.CONTROL,
					uuid: this.uuid.next(),
				},
				payload: {
					data: {
						command: 'join-namespace',
						namespace: namespace.name,
					},
					'Content-Type': EQSocketProtocolContentType.JSON,
					'Content-Encoding': EQSocketProtocolContentEncoding.RAW,
				},
			},
		];
		this.interactions.forEach((interaction) => {
			interaction
				.sendCommand(message)
				.then(() => QSocketInteraction.joinNamespace(interaction, namespace))
				.catch(() => this.debuger.error(`Ошибка при подключении к пространству "${namespace.name}"`));
		});
	}
	//#endregion

	//#region
	private startReconnection() {
		const { enabled, maxAttempts = 5, delay = 1000 } = this.reconnectionConfig || {};

		if (!enabled) return;

		const attemptReconnection = () => {
			if (this.reconnectionAttempts >= maxAttempts) {
				this.debuger.error('Exceeded maximum reconnection attempts');
				return;
			}

			this.reconnectionAttempts++;
			this.connect();

			// Проверка состояния подключения после попытки соединения
			const checkConnection = () => {
				if (this.isConnected) {
					this.sendPingMessage()
						.then(() => {
							this.debuger.info('Reconnection successful');
							this.reconnectionAttempts = 0;
						})
						.catch(() => {
							this.scheduleNextReconnection();
						});
				} else {
					// Планируем следующую попытку, если соединение не установлено
					this.scheduleNextReconnection();
				}
			};

			// Задержка перед проверкой состояния подключения
			setTimeout(checkConnection, delay);
		};

		attemptReconnection();
	}

	// Метод для планирования следующей попытки переподключения
	private scheduleNextReconnection() {
		const { delay = 1000, exponentialBackoff = false } = this.reconnectionConfig || {};
		const nextDelay = exponentialBackoff ? delay * 2 ** this.reconnectionAttempts : delay;
		setTimeout(() => this.startReconnection(), nextDelay);
	}

	// Метод для отправки "ping" сообщения для проверки состояния подключения
	private async sendPingMessage(): Promise<void> {
		const pingPromises = Array.from(this.interactions.values()).map((interaction) => interaction.sendCommand(createPingMessage(this.uuid.next())));

		try {
			await Promise.all(pingPromises);
			return await Promise.resolve();
		} catch {
			return await Promise.reject();
		}
	}
	//#endregion
}
