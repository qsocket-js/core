//#region Импорт модулей протокола Q-SOCKET
import type { IQSocketControlData, TQSocketInteractionInstance } from '@/@types/transport';
import type {
	IQSocketProtocolChunk,
	IQSocketProtocolMessage,
	IQSocketProtocolMessageMetaAck,
	IQSocketProtocolMessageMetaControl,
	IQSocketProtocolMessageMetaData,
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

		const message = await this.protocol.from(data);
		if (message instanceof QSocketProtocolDecodeError) {
			this.debuger.error(message);
			return;
		}

		const ackChunks: IQSocketProtocolMessage<IQSocketProtocolMessageMetaAck> = [];
		message.forEach((chunk) => {
			switch (chunk.meta.type) {
				case EQSocketProtocolMessageType.DATA:
					this.onData(chunk as IQSocketProtocolChunk<IQSocketProtocolMessageMetaData>);
					break;
				case EQSocketProtocolMessageType.ACK:
					ackChunks.push(chunk as IQSocketProtocolChunk<IQSocketProtocolMessageMetaAck>);
					break;
				case EQSocketProtocolMessageType.CONTROL:
					this.onControl(chunk as IQSocketProtocolChunk<IQSocketProtocolMessageMetaControl>);
					break;
			}
		});
		if (ackChunks.length > 0) {
			this.onAck(ackChunks);
		}
	}

	private onData(message: IQSocketProtocolChunk<IQSocketProtocolMessageMetaData>) {
		const namespaceInstance = this.namespaces.get(message.meta.namespace);
		if (!namespaceInstance) {
			this.debuger.error(`Namespace "${message.meta.namespace}" does not exist`);
			return;
		}

		QSocketNamespace.pipe(this, namespaceInstance, message)
			.then((results) => {
				this.sendAck(results);
			})
			.catch((error) => {
				this.debuger.error(`Ошибка при обработке данных: ${error.message}`);
				this.sendAck([
					{
						meta: {
							type: EQSocketProtocolMessageType.ACK,
							uuid: message.meta.uuid,
						},
						payload: {
							data: `Error: ${error.message}`,
							'Content-Type': EQSocketProtocolContentType.STRING,
							'Content-Encoding': EQSocketProtocolContentEncoding.RAW,
						},
					},
				]);
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

	private onControl(message: IQSocketProtocolChunk<IQSocketProtocolMessageMetaControl>) {
		let result = false;
		const data = message.payload.data as IQSocketControlData;

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
					uuid: message.meta.uuid,
				},
				payload: {
					data: result,
					'Content-Type': EQSocketProtocolContentType.BOOLEAN,
					'Content-Encoding': EQSocketProtocolContentEncoding.RAW,
				},
			},
		]);
	}

	async sendData(message: IQSocketProtocolMessage<IQSocketProtocolMessageMetaData>) {
		const data = await this.protocol.to(message);
		if (data instanceof QSocketProtocolEncodeError) {
			this.debuger.error(data);
			return;
		}
		return await this.sendSourceData(message, data);
	}

	async broadcast(message: IQSocketProtocolMessage<IQSocketProtocolMessageMetaData>) {
		const promises: Promise<unknown[] | undefined>[] = [];
		this.interactions.forEach((interaction) => {
			if (interaction !== this) {
				promises.push(interaction.sendData(message));
			}
		});
		return await Promise.allSettled(promises).then((result) => result.filter((item) => item.status === 'fulfilled').map(({ value }) => value));
	}

	async sendSourceData(message: IQSocketProtocolMessage<IQSocketProtocolMessageMetaData>, data: Buffer | Uint8Array | QSocketProtocolEncodeError) {
		this.socket.send(data);
		return (
			await Promise.allSettled(
				message.map((chunk) => {
					return new Promise((emitResolve, emitReject) => {
						const timeout = 10000;
						const ackResolver = (ackResult: unknown) => {
							clearTimeout(timer);
							this.acks.delete(chunk.meta.uuid);
							emitResolve(ackResult);
						};
						this.acks.set(chunk.meta.uuid, ackResolver);
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
}
