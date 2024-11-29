//#region Импорт общих типов
import type { TQSocketClientSocket, TQSocketInteractionInstance, TQSocketServerSocket } from '@/@types/transport';
import type { IQSocketConfigBase } from '../@types/shared';
//#endregion

//#region Импорт модулей ядра Q-SOCKET
import QSocketNamespace from '@/core/QSocketNamespace';
import QSocketDebuger from '@/core/QSocketDebuger';
import QSocketInteraction from '@/core/QSocketInteraction';
import QSocketUniqueGenerator from '@/core/QSocketUniqueGenerator';
import {
	EQSocketProtocolContentType,
	EQSocketProtocolMessageType,
	IQSocketProtocolMessage,
	IQSocketProtocolMessageMetaControl,
	IQSocketProtocolMessageMetaData,
	IQSocketProtocolPayload,
	TQSocketProtocolPayloadData,
} from '@qsocket/protocol';
import { TMakeRequired } from '@/@types/utility';
import { EDataFormat } from '@/@types/enums';

//#endregion

const clientUUID = new QSocketUniqueGenerator();
const serverUUID = new QSocketUniqueGenerator();

/**
 * Абстрактный базовый класс для работы с QSocket.
 * Предоставляет методы для управления пространствами имён.
 */
export default abstract class QSocketBase {
	public readonly type: 'client' | 'server';
	public readonly id: `${'C' | 'S'}${string}`;
	protected readonly uuid: QSocketUniqueGenerator<`${'C' | 'S'}${string}-SM`>;
	protected readonly interactionUUID: QSocketUniqueGenerator<`${'C' | 'S'}${string}-I${string}`>;
	protected readonly namespaces: Map<string, QSocketNamespace> = new Map();
	protected readonly debuger: QSocketDebuger;
	protected readonly interactions: Map<`${'C' | 'S'}${string}-I${string}`, QSocketInteraction> = new Map();
	private dateFormat: EDataFormat = EDataFormat.Binary;
	protected readonly timeout: TMakeRequired<TMakeRequired<IQSocketConfigBase>['timeout']> = {
		value: 60000,
		actionAfrer: 'none',
	};
	private readonly middlewares: ((
		message: IQSocketProtocolMessage<IQSocketProtocolMessageMetaData>,
		socket: TQSocketInteractionInstance
	) => IQSocketProtocolMessage<IQSocketProtocolMessageMetaData>)[] = [];

	constructor(type: 'client' | 'server', config?: IQSocketConfigBase) {
		this.type = type;
		this.debuger = new QSocketDebuger(config?.debug);
		if (config?.timeout?.value !== undefined) this.timeout.value = config.timeout.value;
		if (config?.timeout?.actionAfrer !== undefined) this.timeout.actionAfrer = config.timeout.actionAfrer;
		const prefix: 'S' | 'C' = type === 'server' ? 'S' : 'C';
		const generator = type === 'server' ? serverUUID : clientUUID;
		this.id = `${prefix}${generator.next()}`;
		this.uuid = new QSocketUniqueGenerator(`${this.id}-SM`);
		this.interactionUUID = new QSocketUniqueGenerator(`${this.id}-I`);
	}

	protected connectionHandle(socket: TQSocketServerSocket | TQSocketClientSocket) {
		const interactionId = this.interactionUUID.next();
		const interaction = new QSocketInteraction(interactionId, socket, this.namespaces, this.interactions, this.timeout, this.debuger, this.dateFormat);
		this.interactions.set(interactionId, interaction);
		(socket as any).on('close', () => this.closeInteraction(interactionId, interaction));
	}

	protected closeInteraction(interactionId: `${'C' | 'S'}${string}-I${string}`, interaction: QSocketInteraction) {
		QSocketInteraction.close(interaction);
		this.interactions.delete(interactionId);
	}

	/**
	 * Создаёт новое пространство имён или возвращает существующее.
	 * @param {string} name - Имя создаваемого пространства имён.
	 * @returns {QSocketNamespace} Пространство имён QSocket.
	 */
	public createNamespace(name: string): QSocketNamespace {
		if (this.namespaces.has(name)) {
			this.debuger.warn(`[QSOCKET] The namespace "${name}" already exists.`);
			return this.namespaces.get(name)!;
		}
		const namespace = new QSocketNamespace(name, this.type === 'server', this.debuger);
		this.namespaces.set(name, namespace);

		this.namespaceControl(namespace, 'join-namespace');
		return namespace;
	}

	/**
	 * Удаляет существующее пространство имён.
	 * @param {string} name - Имя удаляемого пространства имён.
	 * @returns {boolean} Возвращает `true`, если пространство имён было удалено, иначе `false`.
	 */
	public async deleteNamespace(name: string): Promise<boolean> {
		const namespace = this.namespaces.get(name);
		if (namespace === undefined) {
			this.debuger.warn(`[QSOCKET] The namespace '${name}' does not exist.`);
			return false;
		}
		this.namespaces.delete(name);
		QSocketNamespace.destroy(namespace);
		return await this.namespaceControl(namespace, 'leave-namespace');
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

	//#region Методы, работающие ТОЛЬКО НА КЛИЕНТЕ
	protected async namespaceControl(namespace: QSocketNamespace, cmd: 'join-namespace' | 'leave-namespace'): Promise<boolean> {
		if (this.type !== 'client') return true;

		const handshakeUUID = this.uuid.next();
		const message: IQSocketProtocolMessage<IQSocketProtocolMessageMetaControl> = [
			{
				meta: { type: EQSocketProtocolMessageType.CONTROL, uuid: handshakeUUID },
				payload: {
					data: { command: cmd, namespace: namespace.name },
					'Content-Type': EQSocketProtocolContentType.JSON,
				},
			},
		];

		const interactions = Array.from(this.interactions, ([_, interaction]) => interaction);
		const promises: Promise<void>[] = interactions.map(async (interaction) => {
			// Начинаем процесс тройного рукопожатия для подключения к пространству имён
			let sendingResult: void | IQSocketProtocolPayload<TQSocketProtocolPayloadData>[][];
			try {
				sendingResult = await interaction.sendCommand(message);
			} catch {
				throw new Error(`An error occurred while sending the command "${cmd}" (${namespace.name}) to server "${interaction.id}"`);
			}

			if (sendingResult === undefined) {
				throw new Error(`Failed to send command "${cmd}" (${namespace.name}) to server "${interaction.id}"`);
			}

			// Вытаскиваем хэндшейк и проверяем его на корректность
			const handshake = sendingResult[0][0].data as unknown;

			if (typeof handshake !== 'string') throw new Error(`The handshake is damaged.`);

			// На этом этапе клиент точно понимает, что сервер готов подключить его к пространству имён
			if (cmd === 'join-namespace') {
				await QSocketInteraction.joinNamespace(interaction, namespace).then(() => handshake);
			} else {
				await QSocketInteraction.leaveNamespace(interaction, namespace).then(() => handshake);
			}
			// На этом этапе клиент уже может принимать сообщения от сервера
			try {
				sendingResult = await interaction.sendCommand([
					{
						meta: { type: EQSocketProtocolMessageType.CONTROL, uuid: `HANDSHAKE-${handshakeUUID}` },
						payload: {
							data: { command: 'handshake', handshake: handshake },
							'Content-Type': EQSocketProtocolContentType.JSON,
						},
					},
				]);
			} catch {
				throw new Error(`Failed to send handshake confirmation for "${cmd}" (${namespace.name}) to server "${interaction.id}" [handshake: ${handshake}].`);
			}

			const canBeActivated = sendingResult?.[0]?.[0]?.data;
			if (canBeActivated === undefined) {
				throw new Error(`Failed to send handshake confirmation for "${cmd}" (${namespace.name}) to server "${interaction.id}" [handshake: ${handshake}].`);
			}
			// На этом этапе клиент уже может отправлять сообщения на сервер
			if (canBeActivated) {
				if (cmd === 'join-namespace') {
					QSocketNamespace.activate(namespace);
				} else if (cmd === 'leave-namespace') {
					QSocketNamespace.diactivate(namespace);
				}
			} else {
				if (cmd === 'join-namespace') {
					QSocketInteraction.leaveNamespace(interaction, namespace);
				} else if (cmd === 'leave-namespace') {
					QSocketInteraction.joinNamespace(interaction, namespace);
				}
				throw new Error(`Failed to establish connection to namespace "${namespace.name}"`);
			}
		});
		return (await Promise.allSettled(promises)).every((item) => item.status === 'fulfilled');
	}
	//#endregion

	/**
	 * Изменяет формат передачи данных для всех соединений
	 * По умолчанию "binary"
	 */
	public setDateFormat(dataFormat: 'base64' | 'binary') {
		switch (dataFormat) {
			case 'base64':
				this.interactions.forEach((interaction) => (interaction.dateFormat = EDataFormat.Base64));
				break;
			case 'binary':
				this.interactions.forEach((interaction) => (interaction.dateFormat = EDataFormat.Binary));
				break;
			default:
				this.debuger.error('[QSOCKET] Incorrect data format');
		}
	}
}
