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
import { EQSocketProtocolMessageType } from '@qsocket/protocol';
import { from, to } from '@qsocket/protocol';
//#endregion

//#region Импорт модулей ядра Q-SOCKET
import QSocketNamespace from './QSocketNamespace';
import QSocketUniqueGenerator from './QSocketUniqueGenerator';
import QSocketDebuger from './QSocketDebuger';
import { base64ToUint8Array, createConfirmAckChunk, createErrorAckChunk, createHandshakeAckChunk, uint8ArrayToBase64 } from './QSocketHelpers';
import { IQSocketConfigBase } from '@/@types/shared';
import { TMakeRequired } from '@/@types/utility';
import { EDataFormat } from '@/@types/enums';
//#endregion

export default class QSocketInteraction {
	public readonly id: `${'S' | 'C'}${string}-I${string}`;
	public readonly uuid: QSocketUniqueGenerator<`${'S' | 'C'}${string}-I${string}-M`>;

	private readonly socket: TQSocketInteractionInstance;
	private readonly acks: Map<string, (ackResult: IQSocketProtocolMessage<IQSocketProtocolMessageMetaAck>[number]['payload'][] | void) => void> = new Map();
	private readonly connectedNamespaces: Map<string, QSocketNamespace> = new Map();
	private readonly allNamespaces: Map<string, QSocketNamespace> = new Map();
	private readonly debuger: QSocketDebuger;
	private readonly interactions: Map<`${'C' | 'S'}${string}-I${string}`, QSocketInteraction>;
	protected readonly timeout: TMakeRequired<TMakeRequired<IQSocketConfigBase>['timeout']>;
	private messageBuffer: IQSocketProtocolMessage[] = [];
	private isProcessing: boolean = false;

	private _dataFormat: EDataFormat;
	set dateFormat(dateFormat: EDataFormat) {
		this._dataFormat = dateFormat;
	}

	constructor(
		id: `${'S' | 'C'}${string}-I${string}`,
		socket: TQSocketInteractionInstance,
		allNamespaces: Map<string, QSocketNamespace> = new Map(),
		interactions: Map<`${'C' | 'S'}${string}-I${string}`, QSocketInteraction>,
		timeout: TMakeRequired<TMakeRequired<IQSocketConfigBase>['timeout']>,
		debuger: QSocketDebuger,
		dateFormat: EDataFormat = EDataFormat.Binary
	) {
		this.id = id;
		this.uuid = new QSocketUniqueGenerator(`${this.id}-M`);
		this.debuger = debuger;
		this.socket = socket;
		this.interactions = interactions;
		this.allNamespaces = allNamespaces;
		this.timeout = timeout;
		this._dataFormat = dateFormat;
		(this.socket as any).on('message', this.onHandle.bind(this));
	}
	public static close(interaction: QSocketInteraction) {
		interaction.socket.close();
		interaction.closeHandle();
	}
	private closeHandle() {
		this.debuger.log('The connection termination process has started.', this.id);
		this.acks.forEach((fn) => fn(void 0));
		this.acks.clear();
		this.socket.close();
		this.connectedNamespaces.forEach((namespace) => QSocketNamespace.deleteClient(namespace, this));
	}

	//#region ПРОСЛУШИВАНИЕ СОБЫТИЙ
	private async onHandle(data: string | ArrayBuffer | Buffer | Uint8Array) {
		if (this._dataFormat === EDataFormat.Binary) {
			if (typeof data === 'string') {
				this.debuger.error('The current QSocket instance is configured to work via binary data. Communication via base64 is not possible!');
				return;
			}
			const type = data && data.constructor ? data.constructor.name : '';
			if (type !== 'Buffer' && type !== 'ArrayBuffer' && type !== 'Uint8Array') {
				this.debuger.error('The current QSocket instance is configured to work via binary data. Communication via base64 is not possible!');
				return;
			}
		} else if (this._dataFormat === EDataFormat.Base64) {
			if (typeof data === 'string') {
				data = base64ToUint8Array(data as string);
			} else {
				this.debuger.error('The current QSocket instance is configured to work via base64 data. Interaction through binary data is not possible!');
				return;
			}
		} else {
			this.debuger.error('The current QSocket instance is not configured correctly. There is no data format for communication!');
			return;
		}

		const buffer: Uint8Array = new Uint8Array(data);

		let message: IQSocketProtocolMessage;
		try {
			message = from(buffer);
		} catch (error) {
			this.debuger.error(error instanceof Error ? error.message : String(error));
			return;
		}

		const ackChunks: IQSocketProtocolMessage<IQSocketProtocolMessageMetaAck> = [];
		const dataChunks: IQSocketProtocolMessage<IQSocketProtocolMessageMetaData> = [];
		const controlChunks: IQSocketProtocolMessage<IQSocketProtocolMessageMetaControl> = [];
		let chunk: IQSocketProtocolChunk;
		// Разбираем сообщение на чанки с данными, ответами и управляющими командами
		for (let i = 0; i < message.length; i++) {
			chunk = message[i];
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
		}

		if (ackChunks.length > 0) this.onAck(ackChunks);
		if (controlChunks.length > 0) await this.onControl(controlChunks);
		if (dataChunks.length > 0) await this.onData(dataChunks);
	}

	private onControl(message: IQSocketProtocolMessage<IQSocketProtocolMessageMetaControl>) {
		let errorInstance: Error;
		let data: IQSocketControlData;
		return Promise.all(
			message.map(async (chunk) => {
				data = chunk.payload.data as IQSocketControlData;
				if (data.command === 'join-namespace') {
					////////////////////////////
					// join-namespace
					////////////////////////////
					const infoMessage = `[namespace: ${data.namespace} | interaction: ${this.id}]`;
					const namespace = this.allNamespaces.get(data.namespace);
					// Проверяем, существует ли такое пространство имён
					if (!namespace) {
						errorInstance = new Error(`An error occurred while executing the command "join-namespace". Namespace not found ${infoMessage}`);
						this.debuger.error(errorInstance.message);
						await this.send([createErrorAckChunk(chunk, errorInstance)]);
						return;
					}
					const handshake = this.uuid.next();
					// Отправляем рукопожатиеи дожидаемся его прихода
					const payload = await this.sendHandshake([createHandshakeAckChunk(chunk, handshake)]);
					const ackHandshake = (payload?.[0]?.[0]?.data as { handshake: string } | undefined)?.handshake;
					if (typeof ackHandshake !== 'string') {
						this.debuger.error(`The last handshake is missing a hash key ${infoMessage}`);
					}
					if (ackHandshake !== handshake) {
						this.debuger.error(`Handshake hash does not match expected (Expected: ${handshake} | Received: ${ackHandshake}) ${infoMessage}`);
						return;
					}
					// Добавляем пространство имён в список активных
					if (!this.connectedNamespaces.has(namespace.name)) this.connectedNamespaces.set(namespace.name, namespace);
					// Добавляем текущего клиента в пространство имён
					await QSocketNamespace.addClient(namespace, this);
				} else if (data.command === 'leave-namespace') {
					////////////////////////////
					// leave-namespace
					////////////////////////////
					const infoMessage = `[namespace: ${data.namespace} | interaction: ${this.id}]`;
					const namespace = this.connectedNamespaces.get(data.namespace);
					// Проверяем, существует ли такое пространство имён
					if (!namespace) {
						errorInstance = new Error(`An error occurred while executing the command "leave-namespace". Namespace not found ${infoMessage}`);
						this.debuger.error(errorInstance.message);
						await this.send([createErrorAckChunk(chunk, errorInstance)]);
						return;
					}
					const handshake = this.uuid.next();
					// Отправляем рукопожатиеи дожидаемся его прихода
					const payload = await this.sendHandshake([createHandshakeAckChunk(chunk, handshake)]);
					const ackHandshake = (payload?.[0]?.[0]?.data as { handshake: string } | undefined)?.handshake;
					if (typeof ackHandshake !== 'string') {
						this.debuger.error(`The last handshake is missing a hash key ${infoMessage}`);
					}
					if (ackHandshake !== handshake) {
						this.debuger.error(`Handshake hash does not match expected (Expected: ${handshake} | Received: ${ackHandshake}) ${infoMessage}`);
						return;
					}
					// Удаляем пространство имён из списка активных
					this.connectedNamespaces.delete(namespace.name);
					// Удаляем текущего клиента из пространства имён
					QSocketNamespace.deleteClient(namespace, this);
				} else if (data.command === 'handshake') {
					////////////////////////////
					// handshake
					////////////////////////////
					const resolver = this.acks.get(chunk.meta.uuid);
					if (resolver !== undefined) {
						resolver([chunk.payload]);
						await this.send([createConfirmAckChunk(chunk, true)]);
					} else {
						this.debuger.error(`There is no resolver on handshake ${data.handshake}`);
						await this.send([createConfirmAckChunk(chunk, false)]);
					}
				} else {
					// Если команда неизвестна
					errorInstance = new Error(`Unknown control command`);
					this.debuger.error(errorInstance.message);
					await this.send([createErrorAckChunk(chunk, errorInstance)]);
				}
			})
		);
	}

	private onData(message: IQSocketProtocolMessage<IQSocketProtocolMessageMetaData>) {
		let errorInstance: Error;
		return Promise.all(
			message.map(async (chunk) => {
				const namespaceInstance = this.connectedNamespaces.get(chunk.meta.namespace);
				if (!namespaceInstance) {
					errorInstance = new Error(`Namespace "${chunk.meta.namespace}" does not exist`);
					this.debuger.error(errorInstance.message);
					await this.send([createErrorAckChunk(chunk, errorInstance)]);
					return;
				}
				try {
					const result = await QSocketNamespace.pipe(this, namespaceInstance, chunk);
					await this.send(result);
				} catch (error) {
					if (error instanceof Error) errorInstance = error;
					else errorInstance = new Error(String(error));
					this.debuger.error(`Ошибка при обработке данных: ${errorInstance.message}`);
					await this.send([createErrorAckChunk(chunk, errorInstance)]);
				}
			})
		);
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

	//#endregion

	//#region ОТПРАВКА ДАННЫХ
	async send(message: IQSocketProtocolMessage) {
		this.messageBuffer.push(message);
		if (!this.isProcessing) {
			this.isProcessing = true;
			setTimeout(() => {
				this.sendCumulative();
				this.isProcessing = false;
			}, 0);
		}
	}

	private sendCumulative() {
		const totalLength = this.messageBuffer.reduce((sum, chunks) => sum + chunks.length, 0);
		const combinedMessages = new Array<IQSocketProtocolChunk>(totalLength);
		let offset = 0;
		const length = this.messageBuffer.length;
		let message: IQSocketProtocolMessage;
		for (let i = 0; i < length; i++) {
			message = this.messageBuffer[i];
			combinedMessages.splice(offset, message.length, ...message);
			offset += message.length;
		}
		this.messageBuffer = [];
		try {
			this.sendBuffer(to(combinedMessages));
		} catch (error) {
			this.debuger.error(`An error occurred while encoding ${combinedMessages.length} messages. I send messages one at a time`);
			for (let i = 0; i < combinedMessages.length; i++) {
				try {
					this.sendBuffer(to([combinedMessages[i]]));
				} catch (error) {
					const problemMeta = combinedMessages[i].meta;
					this.debuger.error(
						`Problem message found.\nInteraction: ${this.id}\nTYPE: ${problemMeta.type}, UUID: ${problemMeta.uuid}${problemMeta.type === EQSocketProtocolMessageType.DATA ? `, NAMESPACE: ${problemMeta.namespace}, EVENT:${problemMeta.event}` : ''}\nERROR: ${error instanceof Error ? error.message : String(error)}`
					);
				}
			}
			return;
		}
	}

	sendBuffer(buffer: Uint8Array) {
		if (this._dataFormat === EDataFormat.Binary) {
			this.socket.send(buffer.buffer);
		} else {
			this.socket.send(uint8ArrayToBase64(buffer));
		}
	}

	async broadcast<O extends IQSocketProtocolPayload = IQSocketProtocolPayload>(
		message: IQSocketProtocolMessage<IQSocketProtocolMessageMetaData>,
		timeout: number = this.timeout.value
	): Promise<O[][][]> {
		let buffer: Uint8Array;
		message.forEach((chunk) => (chunk.meta.uuid = `BROADCAST-FROM-${this.id}-${chunk.meta.uuid}`));
		try {
			buffer = to(message);
		} catch {
			this.debuger.error(`An error occurred while encoding broadcast message.`);
			return [[[]]];
		}

		const promises: Promise<O[][] | undefined>[] = [];
		this.interactions.forEach((interaction) => {
			if (interaction !== this) {
				promises.push(interaction.addAckResolver(message, '', timeout));
				interaction.sendBuffer(buffer);
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
		message: IQSocketProtocolMessage<IQSocketProtocolMessageMetaData>,
		timeout: number = this.timeout.value
	): Promise<O[][] | undefined> {
		this.send(message);
		return await this.addAckResolver<O>(message, '', timeout);
	}

	async sendHandshake(message: IQSocketProtocolMessage<IQSocketProtocolMessageMetaAck>, timeout: number = this.timeout.value) {
		this.send(message);
		return await this.addAckResolver(message, 'HANDSHAKE-', timeout);
	}

	async sendCommand(
		message: IQSocketProtocolMessage<IQSocketProtocolMessageMetaControl>,
		timeout: number = this.timeout.value
	): Promise<IQSocketProtocolMessage<IQSocketProtocolMessageMetaAck>[number]['payload'][][] | void> {
		this.send(message);
		return await this.addAckResolver(message, '', timeout);
	}

	async addAckResolver<O extends IQSocketProtocolPayload = IQSocketProtocolPayload>(
		message: IQSocketProtocolMessage,
		prefix: string,
		timeout: number = this.timeout.value
	): Promise<O[][]> {
		return (
			await Promise.allSettled(
				message.map((chunk) => {
					return new Promise<O[]>((emitResolve, emitReject) => {
						const uuid = prefix + chunk.meta.uuid;
						const ackResolver = (ackResult: O[] | void) => {
							clearTimeout(timer);
							this.acks.delete(uuid);
							if (ackResult === undefined) emitReject();
							else emitResolve(ackResult);
						};
						this.acks.set(uuid, ackResolver as (ackResult: IQSocketProtocolPayload[] | void) => void);
						const timer = setTimeout(() => {
							this.acks.delete(uuid);
							this.debuger.error(`Waiting time expired [${uuid}]`);
							emitReject();
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
		return interaction.joinNamespace(namespace);
	}
	private joinNamespace(namespace: QSocketNamespace) {
		this.connectedNamespaces.set(namespace.name, namespace);
		return QSocketNamespace.addClient(namespace, this);
	}
	public static leaveNamespace(interaction: QSocketInteraction, namespace: QSocketNamespace) {
		return interaction.leaveNamespace(namespace);
	}
	private leaveNamespace(namespace: QSocketNamespace) {
		this.connectedNamespaces.delete(namespace.name);
		return QSocketNamespace.deleteClient(namespace, this);
	}
	//#endregion
}
