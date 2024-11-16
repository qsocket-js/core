//#region Импорты сущностей QSocket
import { TQSocketContentEncoding, TQSocketContentType } from '@/@types/interface';
import QSocketConnection from './QSocketConnection';
import QSocketDebuger from './QSocketDebuger';
import QSocketInteraction from './QSocketInteraction';
import {
	IQSocketProtocolChunk,
	IQSocketProtocolMessage,
	IQSocketProtocolMessageMetaAck,
	IQSocketProtocolMessageMetaData,
	IQSocketProtocolPayload,
	TQSocketProtocolPayloadData,
} from '@qsocket/protocol';

import { QSocketNamespaceEventEmitter } from './QSocketEventEmetter';
import { createDataAckChunk } from './QSocketHelpers';
//#endregion

export default class QSocketNamespace extends QSocketNamespaceEventEmitter {
	private readonly _name: string;
	private readonly connections: Map<QSocketInteraction, QSocketConnection> = new Map();
	private readonly debuger: QSocketDebuger;

	public get name(): string {
		return this._name;
	}

	constructor(name: string, debuger: QSocketDebuger) {
		super();
		this._name = name;
		this.debuger = debuger;
	}

	//#region Методы событий

	public async emit<
		I extends TQSocketProtocolPayloadData,
		O extends TQSocketProtocolPayloadData,
		P extends IQSocketProtocolPayload<O> = IQSocketProtocolPayload<O>,
	>(
		event: string,
		data?: I,
		options?: {
			timeout?: number;
			contentType?: TQSocketContentType;
			contentEncoding?: TQSocketContentEncoding;
		}
	): Promise<P[][]> {
		const promises: Promise<P[]>[] = [];
		this.connections.forEach((connection) => {
			promises.push(connection.emit<I, P>(event, data, options));
		});
		return (await Promise.allSettled(promises)).filter((res) => res.status === 'fulfilled').map(({ value }) => value);
	}
	//#endregion

	//#region Методы управления потоком данных

	public static async pipe(
		interaction: QSocketInteraction,
		namespace: QSocketNamespace,
		chunk: IQSocketProtocolChunk<IQSocketProtocolMessageMetaData>
	): Promise<IQSocketProtocolMessage<IQSocketProtocolMessageMetaAck>> {
		const connection = namespace.connections.get(interaction);
		if (!connection) return [];
		const namespaceResult = await namespace.executor(chunk);
		const connectionResult = await QSocketConnection.pipe(connection, chunk);
		const acks = [...namespaceResult, ...connectionResult];
		if (acks.length > 0) return acks;
		else return [createDataAckChunk(chunk, undefined, 'undefined', 'raw')];
	}

	//#endregion

	//#region Методы управления клиентами
	public static async addClient(namespace: QSocketNamespace, interaction: QSocketInteraction) {
		const connection = new QSocketConnection(interaction, namespace);
		namespace.connections.set(interaction, connection);
		await Promise.allSettled(
			namespace.connectionListeners.map(async (listener) => {
				try {
					return await Promise.resolve(listener(connection));
				} catch (error) {
					return namespace.debuger.error('Connection event error:', error);
				}
			})
		);
		namespace.debuger.info(`Interaction "${interaction.id}" join namespace "${namespace.name}"`);
	}

	public static async deleteClient(namespace: QSocketNamespace, interaction: QSocketInteraction) {
		const connection = namespace.connections.get(interaction);
		namespace.connections.delete(interaction);
		await Promise.allSettled(
			namespace.disconnectionListeners.map(async (listener) => {
				try {
					return await Promise.resolve(listener());
				} catch (error) {
					return namespace.debuger.error('Disconnection event error:', error);
				}
			})
		);
		namespace.debuger.info(`Interaction "${interaction.id}" leave namespace "${namespace.name}"`);
		if (connection !== undefined) QSocketConnection.close(connection);
	}

	public static destroy(namespace: QSocketNamespace) {
		namespace.connections.forEach((_, interaction) => this.deleteClient(namespace, interaction));
	}
	//#endregion

	protected override addConnectionListennerHandle(listenner: (connection: QSocketConnection) => void) {
		this.connections.forEach((connection) => listenner(connection));
	}
}
