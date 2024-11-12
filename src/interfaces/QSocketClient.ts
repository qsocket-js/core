import type { IQSocketDebugConfig, IQSocketConfig } from '@/@types/shared';
import type { TQSocketClientSocket } from '@/@types/transport';
import type { IQSocketProtocolMessage, IQSocketProtocolMessageMetaControl } from '@qsocket/protocol';

import QSocketBase from './QSocketBase';
import QSocketInteraction from '@/core/QSocketInteraction';
import QSocketNamespace from '@/core/QSocketNamespace';
import { EQSocketProtocolContentEncoding, EQSocketProtocolContentType, EQSocketProtocolMessageType } from '@qsocket/protocol';

export default class QSocketClient extends QSocketBase {
	private isConnected = false;
	private transportBuilder: () => TQSocketClientSocket;
	constructor(socketBuilder: () => TQSocketClientSocket, protocolConfig?: IQSocketConfig, debugConfig?: IQSocketDebugConfig) {
		super('client', protocolConfig, debugConfig);
		this.transportBuilder = socketBuilder;
	}

	connect() {
		if (this.isConnected) this.disconnect();
		this.connectionHandle(this.transportBuilder());
		this.isConnected = true;
		this.namespaces.forEach((namespace) => {
			this.joinNamespaceHandle(namespace);
		});
		return this;
	}

	disconnect() {
		this.interactions.forEach(QSocketInteraction.close);
		this.isConnected = false;
		console.log('САЙЗ', this.interactions.size);
	}

	reconnect() {
		this.disconnect();
		this.connect();
	}

	joinNamespaceHandle(namespace: QSocketNamespace) {
		const message: IQSocketProtocolMessage<IQSocketProtocolMessageMetaControl> = [
			{
				meta: {
					type: EQSocketProtocolMessageType.CONTROL,
					uuid: this.uuid.next(),
					namespace: namespace.name,
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
}
