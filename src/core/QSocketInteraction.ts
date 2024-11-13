//#region Импорт модулей протокола Q-SOCKET
import type { IQSocketControlData, TQSocketInteractionInstance } from '@/@types/transport';
import type {
	IQSocketProtocolChunk,
	IQSocketProtocolMessage,
	IQSocketProtocolMessageMetaAck,
	IQSocketProtocolMessageMetaControl,
	IQSocketProtocolMessageMetaData,
	IQSocketProtocolPayload,
} from '@qsocket/protocol';
import { EQSocketProtocolContentType, EQSocketProtocolContentEncoding, EQSocketProtocolMessageType } from '@qsocket/protocol';
import { QSocketProtocol } from '@qsocket/protocol';
//#endregion

//#region Импорт модулей ядра Q-SOCKET
import QSocketNamespace from './QSocketNamespace';
import QSocketUniqueGenerator from './QSocketUniqueGenerator';
import QSocketDebuger from './QSocketDebuger';
import { createConfirmAckMessage, createErrorAckMessage, createPongMessage } from './QSocketHelpers';
//#endregion

export default class QSocketInteraction {
	public readonly id: `${'S' | 'C'}${string}-I${string}`;
	public readonly uuid: QSocketUniqueGenerator<`${'S' | 'C'}${string}-I${string}-M`>;

	private readonly socket: TQSocketInteractionInstance;
	private readonly acks: Map<string, (ackResult: IQSocketProtocolMessage<IQSocketProtocolMessageMetaAck>[number]['payload'][]) => void> = new Map();
	private readonly connectedNamespaces: Map<string, QSocketNamespace> = new Map();
	private readonly allNamespaces: Map<string, QSocketNamespace> = new Map();
	private readonly protocol: QSocketProtocol;
	private readonly debuger: QSocketDebuger;
	private readonly interactions: Map<`${'C' | 'S'}${string}-I${string}`, QSocketInteraction>;
	private readonly middlewares: ((
		message: IQSocketProtocolMessage<IQSocketProtocolMessageMetaData>,
		socket: TQSocketInteractionInstance
	) => IQSocketProtocolMessage<IQSocketProtocolMessageMetaData>)[] = [];

	constructor(
		id: `${'S' | 'C'}${string}-I${string}`,
		socket: TQSocketInteractionInstance,
		allNamespaces: Map<string, QSocketNamespace> = new Map(),
		interactions: Map<`${'C' | 'S'}${string}-I${string}`, QSocketInteraction>,
		middlewares: ((
			message: IQSocketProtocolMessage<IQSocketProtocolMessageMetaData>,
			socket: TQSocketInteractionInstance
		) => IQSocketProtocolMessage<IQSocketProtocolMessageMetaData>)[] = [],
		protocol: QSocketProtocol,
		debuger: QSocketDebuger
	) {
		this.id = id;
		this.uuid = new QSocketUniqueGenerator(`${this.id}-M`);
		this.debuger = debuger;
		this.socket = socket;
		this.interactions = interactions;
		this.allNamespaces = allNamespaces;
		this.middlewares = middlewares;
		this.protocol = protocol;
		(this.socket as any).on('message', this.onHandle.bind(this));
	}
	public static close(interaction: QSocketInteraction) {
		interaction.socket.close();
		interaction.closeHandle();
	}
	private closeHandle() {
		this.debuger.log('Запущен процесс уничтожения соединения', this.id);
		this.acks.clear();
		this.socket.close();
		this.connectedNamespaces.forEach((namespace) => QSocketNamespace.deleteClient(namespace, this));
	}

	//#region ПРОСЛУШИВАНИЕ СОБЫТИЙ
	private async onHandle(data: string | ArrayBuffer | Buffer | Uint8Array) {
		if (typeof data === 'string') {
			this.debuger.error('Общение по протоколу QSocket возможно только в формате буфера');
			return;
		}
		const buffer: Uint8Array = new Uint8Array(data);

		let message = await this.protocol.from(buffer);
		if (message instanceof Error) {
			this.debuger.error(message);
			return;
		}

		const ackChunks: IQSocketProtocolMessage<IQSocketProtocolMessageMetaAck> = [];
		const dataChunks: IQSocketProtocolMessage<IQSocketProtocolMessageMetaData> = [];
		const controlChunks: IQSocketProtocolMessage<IQSocketProtocolMessageMetaControl> = [];
		message.forEach((chunk) => {
			switch (chunk.meta.type) {
				case EQSocketProtocolMessageType.DATA:
					dataChunks.push(chunk as IQSocketProtocolChunk<IQSocketProtocolMessageMetaData>);
					break;
				case EQSocketProtocolMessageType.ACK:
					ackChunks.push(chunk as IQSocketProtocolChunk<IQSocketProtocolMessageMetaAck>);
					break;
				case EQSocketProtocolMessageType.CONTROL:
					controlChunks.push(chunk as IQSocketProtocolChunk<IQSocketProtocolMessageMetaControl>);
					break;
			}
		});

		if (dataChunks.length > 0) {
			const errors: Error[] = [];
			let middlewareResult = dataChunks;
			this.middlewares.forEach((middleware) => {
				middlewareResult = middleware(middlewareResult, this.socket);
				if (middlewareResult instanceof Error) {
					errors.push(middlewareResult);
					return;
				}
			});
			if (errors.length > 0) {
				this.sendAck(middlewareResult.map((chunk) => createErrorAckMessage(chunk, errors)));
			} else this.onData(middlewareResult);
		}
		if (ackChunks.length > 0) {
			this.onAck(ackChunks);
		}
		if (controlChunks.length > 0) {
			this.onControl(controlChunks);
		}
	}

	private onData(message: IQSocketProtocolMessage<IQSocketProtocolMessageMetaData>) {
		message.forEach((chunk) => {
			const namespaceInstance = this.connectedNamespaces.get(chunk.meta.namespace);
			if (!namespaceInstance) {
				this.debuger.error(`Namespace "${chunk.meta.namespace}" does not exist`);
				return;
			}

			QSocketNamespace.pipe(this, namespaceInstance, chunk)
				.then((results) => {
					this.sendAck(results);
				})
				.catch((error) => {
					this.debuger.error(`Ошибка при обработке данных: ${error.message}`);
					this.sendAck([
						{
							meta: {
								type: EQSocketProtocolMessageType.ACK,
								uuid: chunk.meta.uuid,
							},
							payload: {
								data: `Error: ${error.message}`,
								'Content-Type': EQSocketProtocolContentType.STRING,
								'Content-Encoding': EQSocketProtocolContentEncoding.RAW,
							},
						},
					]);
				});
		});
	}

	private onAck(message: IQSocketProtocolMessage<IQSocketProtocolMessageMetaAck>) {
		const ackMap = new Map<string, IQSocketProtocolChunk<IQSocketProtocolMessageMetaAck>[]>();
		message.forEach((chunk) => {
			let ack = ackMap.get(chunk.meta.uuid) || [];
			ack.push(chunk);
			ackMap.set(chunk.meta.uuid, ack);
		});
		ackMap.forEach((value, uuid) => {
			const resolve = this.acks.get(uuid);
			if (!resolve) {
				this.debuger.error(`Return message UUID not found [id: ${this.id}, uuid: ${uuid}]`);
				return;
			}
			resolve(value.map((item) => item.payload));
			this.acks.delete(uuid);
		});
	}

	private onControl(message: IQSocketProtocolMessage<IQSocketProtocolMessageMetaControl>) {
		message.forEach(async (chunk) => {
			const data = chunk.payload.data as IQSocketControlData;
			if (data.command === 'ping') {
				await this.sendAck(createPongMessage(chunk.meta.uuid));
			} else if (data.command === 'join-namespace') {
				const namespace = this.allNamespaces.get(data.namespace);
				if (!namespace) {
					this.debuger.error(`Namespace "${data.namespace}" not found`);
					return;
				}
				await this.sendAck(createConfirmAckMessage(chunk, true));
				if (!this.connectedNamespaces.has(namespace.name)) {
					this.connectedNamespaces.set(namespace.name, namespace);
				}
				QSocketNamespace.addClient(namespace, this);
			} else if (data.command === 'leave-from-namespace') {
				if (typeof data.namespace === 'string') {
					const namespace = this.connectedNamespaces.get(data.namespace);
					if (!namespace) {
						this.debuger.error(`Namespace "${data.namespace}" not found`);
						return;
					}

					await this.sendAck(createConfirmAckMessage(chunk, true));
					this.connectedNamespaces.delete(namespace.name);
					QSocketNamespace.deleteClient(namespace, this);
				}
			} else {
				this.debuger.error('Unknown control command');
			}
		});
	}
	//#endregion

	//#region ОТПРАВКА ДАННЫХ
	async broadcast<O extends IQSocketProtocolPayload = IQSocketProtocolPayload>(
		message: IQSocketProtocolMessage<IQSocketProtocolMessageMetaData>
	): Promise<O[][][]> {
		const promises: Promise<O[][] | undefined>[] = [];
		this.interactions.forEach((interaction) => {
			if (interaction !== this) {
				promises.push(interaction.sendData<O>(message));
			}
		});
		const interactionsResults = await Promise.allSettled(promises).then((result) =>
			result
				.filter((item) => item.status === 'fulfilled')
				.map(({ value }) => value)
				.filter((value) => value !== undefined)
		);
		return interactionsResults;
	}

	async sendData<O extends IQSocketProtocolPayload = IQSocketProtocolPayload>(
		message: IQSocketProtocolMessage<IQSocketProtocolMessageMetaData>
	): Promise<O[][] | undefined> {
		const data = await this.protocol.to(message);
		if (data instanceof Error) {
			this.debuger.error(data);
			return;
		}
		this.socket.send(data);
		const result = (
			await Promise.allSettled(
				message.map((chunk) => {
					return new Promise<O[]>((emitResolve, emitReject) => {
						const timeout = 10000;
						const ackResolver = (ackResult: O[]) => {
							clearTimeout(timer);
							this.acks.delete(chunk.meta.uuid);
							emitResolve(ackResult);
						};
						this.acks.set(chunk.meta.uuid, ackResolver as (ackResult: IQSocketProtocolPayload[]) => void);
						const timer = setTimeout(() => {
							this.acks.delete(chunk.meta.uuid);
							this.debuger.error(`Время ожидания истекло [event: ${chunk.meta.event}, uuid: ${chunk.meta.uuid}]`);
							emitReject(new Error('Timeout'));
						}, timeout);
					});
				})
			)
		)
			.filter((res) => res.status === 'fulfilled')
			.map(({ value }) => value);
		return result;
	}

	async sendAck(message: IQSocketProtocolMessage<IQSocketProtocolMessageMetaAck>) {
		const data = await this.protocol.to(message);
		this.socket.send(data);
	}

	async sendCommand(
		message: IQSocketProtocolMessage<IQSocketProtocolMessageMetaControl>
	): Promise<IQSocketProtocolMessage<IQSocketProtocolMessageMetaAck>[number]['payload'][][] | void> {
		const data = await this.protocol.to(message);

		if (data instanceof Error) {
			this.debuger.error(data);
			return;
		}
		this.socket.send(data);
		return (
			await Promise.allSettled<IQSocketProtocolMessage<IQSocketProtocolMessageMetaAck>[number]['payload'][]>(
				message.map((chunk) => {
					return new Promise<IQSocketProtocolMessage<IQSocketProtocolMessageMetaAck>[number]['payload'][]>((emitResolve, emitReject) => {
						const timeout = 10000;
						const ackResolver = (ackResult: IQSocketProtocolMessage<IQSocketProtocolMessageMetaAck>[number]['payload'][]) => {
							clearTimeout(timer);
							emitResolve(ackResult);
							this.acks.delete(chunk.meta.uuid);
						};
						this.acks.set(chunk.meta.uuid, ackResolver);
						const timer = setTimeout(() => {
							this.debuger.error(`Время ожидания истекло [command, uuid: ${chunk.meta.uuid}]`);
							emitReject(new Error('Timeout'));
							this.acks.delete(chunk.meta.uuid);
						}, timeout);
					});
				})
			)
		)
			.filter((res) => res.status === 'fulfilled')
			.map(({ value }) => value);
	}
	//#endregion

	//#region NAMESPACES
	public static joinNamespace(interaction: QSocketInteraction, namespace: QSocketNamespace) {
		interaction.joinNamespace(namespace);
	}
	private joinNamespace(namespace: QSocketNamespace) {
		this.connectedNamespaces.set(namespace.name, namespace);
		QSocketNamespace.addClient(namespace, this);
	}
	public static leaveNamespace(interaction: QSocketInteraction, namespace: QSocketNamespace) {
		interaction.leaveNamespace(namespace);
	}
	private leaveNamespace(namespace: QSocketNamespace) {
		this.connectedNamespaces.delete(namespace.name);
		QSocketNamespace.deleteClient(namespace, this);
	}
	//#endregion
}
