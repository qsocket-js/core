import type { IQSocketDebugConfig, IQSocketProtocolConfig } from '@/@types/shared';
import type { TQSocketClientSocket } from '@/@types/transport';
import type { IQSocketProtocolMessage, IQSocketProtocolMessageMetaControl } from '@qsocket/protocol';

import QSocketBase from './QSocketBase';
import QSocketInteraction from '@/core/QSocketInteraction';
import QSocketNamespace from '@/core/QSocketNamespace';
import { EQSocketProtocolContentEncoding, EQSocketProtocolContentType, EQSocketProtocolMessageType } from '@qsocket/protocol';

export default class QSocketClient extends QSocketBase {
	constructor(socket: TQSocketClientSocket, protocolConfig?: IQSocketProtocolConfig, debugConfig?: IQSocketDebugConfig) {
		super('client', protocolConfig, debugConfig);
		this.connectionHandle(socket, this);
	}

	namespaceHandle(namespace: QSocketNamespace) {
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
				.then(() => QSocketInteraction.addNamespace(interaction, namespace))
				.catch(() => this.debuger.error(`Ошибка при подключении к пространству "${namespace.name}"`));
		});
	}
}
