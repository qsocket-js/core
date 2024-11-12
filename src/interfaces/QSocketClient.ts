import type { IQSocketDebugConfig } from '../@types/general';
import type { TQSocketClientSocket } from '@/@types/transport';
import type { IQSocketProtocolChunk, IQSocketProtocolMessageMetaControl } from '@qsocket/protocol';

import QSocketBase from './QSocketBase';
import QSocketInteraction from '../core/QSocketInteraction';
import QSocketNamespace from '../core/QSocketNamespace';

import { EQSocketProtocolContentEncoding, EQSocketProtocolContentType, EQSocketProtocolMessageType } from '@qsocket/protocol';

export default class QSocketClient extends QSocketBase {
	constructor(socket: TQSocketClientSocket, debugConfig?: IQSocketDebugConfig) {
		super('client', debugConfig);
		this.connectionHandle(socket, this);
	}

	namespaceHandle(namespace: QSocketNamespace) {
		const chunk: IQSocketProtocolChunk<IQSocketProtocolMessageMetaControl> = {
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
		};

		this.interactions.forEach((interaction) => {
			interaction
				.sendCommand([chunk])
				.then(() => {
					QSocketInteraction.addNamespace(interaction, namespace);
				})
				.catch(() => this.debuger.error(`Ошибка при подключении к пространству "${namespace.name}"`));
		});
	}
}
