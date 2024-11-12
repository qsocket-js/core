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
import { QSocketProtocol, QSocketProtocolDecodeError, QSocketProtocolEncodeError } from '@qsocket/protocol';
//#endregion

//#region Импорт модулей ядра Q-SOCKET
import type QSocketServer from '../interfaces/QSocketServer';
import type QSocketClient from '../interfaces/QSocketClient';
import QSocketNamespace from './QSocketNamespace';

import QSocketUniqueGenerator from './QSocketUniqueGenerator';
import QSocketDebuger from './QSocketDebuger';
import QSocketCompressor from './QSocketCompressor';
import { IQSocketProtocolConfig } from '@/@types/shared';
import { createErrorMessage } from './QSocketHelpers';
//#endregion

export default class QSocketInteraction {
	public readonly uuid: QSocketUniqueGenerator<`${'S' | 'C'}${string}-I${string}-M`>;
	public readonly id: `${'S' | 'C'}${string}-I${string}`;
	server: QSocketServer | QSocketClient;
	socket: TQSocketInteractionInstance;
	acks: Map<string, (ackResult: IQSocketProtocolMessage<IQSocketProtocolMessageMetaAck>[number]['payload'][]) => void> = new Map();
	namespaces: Map<string, QSocketNamespace> = new Map();
	protocol: QSocketProtocol;
	debuger: QSocketDebuger;
	interactions: Map<`${'C' | 'S'}${string}-I${string}`, QSocketInteraction>;
	private middlewares: ((
		message: IQSocketProtocolMessage<IQSocketProtocolMessageMetaData>,
		socket: TQSocketInteractionInstance
	) => IQSocketProtocolMessage<IQSocketProtocolMessageMetaData>)[] = [];

	constructor(
		id: `${'S' | 'C'}${string}-I${string}`,
		socket: TQSocketInteractionInstance,
		server: QSocketServer | QSocketClient,
		interactions: Map<`${'C' | 'S'}${string}-I${string}`, QSocketInteraction>,
		protocolConfig: IQSocketProtocolConfig,
		debuger: QSocketDebuger
	) {
		this.id = id;
		this.uuid = new QSocketUniqueGenerator(`${this.id}-M`);
		this.debuger = debuger;
		this.socket = socket;
		this.server = server;
		this.interactions = interactions;
		this.protocol = this.protocolConfigure(protocolConfig);
		(this.socket as any).on('message', this.onHandle.bind(this));
	}

	static addNamespace(interaction: QSocketInteraction, namespace: QSocketNamespace) {
		interaction.namespaces.set(namespace.name, namespace);
		QSocketNamespace.addClient(namespace, interaction);
	}

	private protocolConfigure(protocolConfig: IQSocketProtocolConfig) {
		if (protocolConfig.compressor?.on) {
			const compressor = protocolConfig.compressor.compressor ?? new QSocketCompressor();
			const compressionFromSize = protocolConfig.compressor.compressionFromSize ?? 100 * 1024;
			return new QSocketProtocol(compressor, compressionFromSize);
		} else {
			return new QSocketProtocol();
		}
	}

	/** Главный обработчик сообщений */
	private async onHandle(data: string | ArrayBuffer) {
		if (!Buffer.isBuffer(data)) {
			this.debuger.error('Общение по протоколу QSocket возможно только в формате буфера');
			return;
		}

		let message = await this.protocol.from(data);
		if (message instanceof QSocketProtocolDecodeError) {
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
				this.sendAck(middlewareResult.map((chunk) => createErrorMessage(chunk, errors)));
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
			const namespaceInstance = this.namespaces.get(chunk.meta.namespace);
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
		message.forEach((chunk) => {
			let result = false;
			const data = chunk.payload.data as IQSocketControlData;

			if (data.command === 'join-namespace') {
				const namespace = this.server.getNamespace(data.namespace);
				if (!namespace) {
					this.debuger.error(`Namespace "${data.namespace}" not found`);
					return;
				}
				if (!this.namespaces.has(namespace.name)) {
					this.namespaces.set(namespace.name, namespace);
				}

				QSocketNamespace.addClient(namespace, this);
				result = true;
			} else if (data.command === 'leave-from-namespace') {
				if (typeof data.namespace === 'string') {
					const namespace = this.namespaces.get(data.namespace);
					if (!namespace) {
						this.debuger.error(`Namespace "${data.namespace}" not found`);
						return;
					}
					this.namespaces.delete(namespace.name);
					QSocketNamespace.deleteClient(namespace, this);
					result = true;
				}
			} else {
				this.debuger.error('Unknown control command');
			}

			this.sendAck([
				{
					meta: {
						type: EQSocketProtocolMessageType.ACK,
						uuid: chunk.meta.uuid,
					},
					payload: {
						data: result,
						'Content-Type': EQSocketProtocolContentType.BOOLEAN,
						'Content-Encoding': EQSocketProtocolContentEncoding.RAW,
					},
				},
			]);
		});
	}

	async sendData<O extends IQSocketProtocolPayload = IQSocketProtocolPayload>(
		message: IQSocketProtocolMessage<IQSocketProtocolMessageMetaData>
	): Promise<O[][] | undefined> {
		const data = await this.protocol.to(message);
		if (data instanceof QSocketProtocolEncodeError) {
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

	async sendAck(message: IQSocketProtocolMessage<IQSocketProtocolMessageMetaAck>) {
		const data = await this.protocol.to(message);
		this.socket.send(data);
	}

	async sendCommand(
		message: IQSocketProtocolMessage<IQSocketProtocolMessageMetaControl>
	): Promise<IQSocketProtocolMessage<IQSocketProtocolMessageMetaAck>[number]['payload'][][] | void> {
		const data = await this.protocol.to(message);

		if (data instanceof QSocketProtocolEncodeError) {
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

	/**
	 * @description Добавляет промежуточный обработчик сообщений
	 * @param handler
	 */
	public use(
		handler: (
			message: IQSocketProtocolMessage<IQSocketProtocolMessageMetaData>,
			socket: TQSocketInteractionInstance
		) => IQSocketProtocolMessage<IQSocketProtocolMessageMetaData>
	): void {
		this.middlewares.push(handler);
	}
}
