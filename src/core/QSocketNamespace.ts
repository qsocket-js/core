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
import { createErrorAckMessage } from './QSocketHelpers';
import { QSocketNamespaceEventEmitter } from './QSocketEventEmetter';
//#endregion

export default class QSocketNamespace extends QSocketNamespaceEventEmitter {
	private readonly _name: string;
	private readonly connections: Map<QSocketInteraction, QSocketConnection> = new Map();
	private readonly debuger: QSocketDebuger;
	private readonly middlewares: ((
		message: IQSocketProtocolChunk<IQSocketProtocolMessageMetaData>
	) => IQSocketProtocolChunk<IQSocketProtocolMessageMetaData>)[] = [];

	public get name(): string {
		return this._name;
	}

	constructor(name: string, debuger: QSocketDebuger) {
		super();
		this._name = name;
		this.debuger = debuger;
	}

	public use(handler: (chunk: IQSocketProtocolChunk<IQSocketProtocolMessageMetaData>) => IQSocketProtocolChunk<IQSocketProtocolMessageMetaData>): void {
		this.middlewares.push(handler);
	}

	public close(): void {
		this.connections.forEach((_, interaction) => {
			this.$__deleteClient(interaction);
		});
	}

	//#region Методы событий

	public async emit<I extends TQSocketProtocolPayloadData, O extends IQSocketProtocolPayload>(
		event: string,
		data?: I,
		contentType?: TQSocketContentType,
		contentEncoding?: TQSocketContentEncoding
	): Promise<O[][]> {
		const promises: Promise<O[]>[] = [];
		this.connections.forEach((connection) => {
			promises.push(connection.emit<I, O>(event, data, contentType, contentEncoding));
		});
		return (await Promise.allSettled(promises)).filter((res) => res.status === 'fulfilled').map(({ value }) => value);
	}
	//#endregion

	//#region Методы управления потоком данных

	public static async pipe(
		interaction: QSocketInteraction,
		namespace: QSocketNamespace,
		message: IQSocketProtocolChunk<IQSocketProtocolMessageMetaData>
	): Promise<IQSocketProtocolMessage<IQSocketProtocolMessageMetaAck>> {
		return await namespace.$__pipe(interaction, message);
	}

	private async $__pipe(
		interaction: QSocketInteraction,
		chunk: IQSocketProtocolChunk<IQSocketProtocolMessageMetaData>
	): Promise<IQSocketProtocolMessage<IQSocketProtocolMessageMetaAck>> {
		const connection = this.connections.get(interaction);
		if (!connection) {
			return [];
		}
		let errors: Error[] = [];
		this.middlewares.forEach((middleware) => {
			try {
				chunk = middleware(chunk);
			} catch (error) {
				if (error instanceof Error) errors.push(error);
				else errors.push(new Error('Unknown error'));
			}
		});
		if (errors.length > 0) return [createErrorAckMessage(chunk, errors)];
		return await QSocketConnection.pipe(connection, chunk);
	}

	//#endregion

	//#region Методы управления клиентами
	public static addClient(namespace: QSocketNamespace, interaction: QSocketInteraction): void {
		namespace.$__addClient(interaction);
	}

	private $__addClient(interaction: QSocketInteraction): void {
		const connection = new QSocketConnection(interaction, this);
		this.connections.set(interaction, connection);
		this.connectionListeners.forEach((listener) => {
			try {
				listener(connection);
			} catch (error) {
				this.debuger.error('Connection event error:', error);
			}
		});
		this.debuger.info(`Interaction "${interaction.id}" join namespace "${this.name}"`);
	}

	public static deleteClient(namespace: QSocketNamespace, interaction: QSocketInteraction): void {
		namespace.$__deleteClient(interaction);
	}

	private $__deleteClient(interaction: QSocketInteraction): void {
		const connection = this.connections.get(interaction);
		this.connections.delete(interaction);
		this.disconnectionListeners.forEach((listener) => {
			try {
				listener();
			} catch {}
		});
		this.debuger.info(`Interaction "${interaction.id}" leave namespace "${this.name}"`);
		if (connection !== undefined) {
			QSocketConnection.close(connection);
		}
	}
	//#endregion
}
