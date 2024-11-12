//#region Импорт общих типов
import type { TQSocketClientSocket, TQSocketInteractionInstance, TQSocketServerSocket } from '@/@types/transport';
import type { IQSocketDebugConfig, IQSocketConfig } from '../@types/shared';
//#endregion

//#region Импорт модулей ядра Q-SOCKET
import QSocketNamespace from '@/core/QSocketNamespace';
import QSocketDebuger from '@/core/QSocketDebuger';
import QSocketInteraction from '@/core/QSocketInteraction';
import QSocketUniqueGenerator from '@/core/QSocketUniqueGenerator';
import { IQSocketProtocolMessage, IQSocketProtocolMessageMetaData, QSocketProtocol } from '@qsocket/protocol';

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
	protected readonly protocol: QSocketProtocol;
	private readonly middlewares: ((
		message: IQSocketProtocolMessage<IQSocketProtocolMessageMetaData>,
		socket: TQSocketInteractionInstance
	) => IQSocketProtocolMessage<IQSocketProtocolMessageMetaData>)[] = [];

	/**
	/**
	 * Конструктор класса QSocketBase.
	 * @param {IQSocketDebugConfig} [debugConfig] - Конфигурация для режима отладки.
	 */
	constructor(type: 'client' | 'server', protocolConfig?: IQSocketConfig, debugConfig?: IQSocketDebugConfig) {
		this.type = type;
		this.debuger = new QSocketDebuger(debugConfig);
		this.protocol = new QSocketProtocol(protocolConfig?.compression?.compressor, protocolConfig?.compression?.compressionFromSize ?? 1024 * 100);
		const prefix: 'S' | 'C' = type === 'server' ? 'S' : 'C';
		const generator = type === 'server' ? serverUUID : clientUUID;
		this.id = `${prefix}${generator.next()}`;
		this.uuid = new QSocketUniqueGenerator(`${this.id}-SM`);
		this.interactionUUID = new QSocketUniqueGenerator(`${this.id}-I`);
	}

	protected connectionHandle(socket: TQSocketServerSocket | TQSocketClientSocket) {
		const interactionId = this.interactionUUID.next();
		const interaction = new QSocketInteraction(interactionId, socket, this.namespaces, this.interactions, this.middlewares, this.protocol, this.debuger);
		this.interactions.set(interactionId, interaction);
		(socket as any).on('close', () => this.closeInteraction(interactionId));
	}

	protected closeInteraction(interactionId: `${'C' | 'S'}${string}-I${string}`) {
		this.interactions.delete(interactionId);
	}

	/**
	 * Создаёт новое пространство имён или возвращает существующее.
	 * @param {string} name - Имя создаваемого пространства имён.
	 * @returns {QSocketNamespace} Пространство имён QSocket.
	 */
	public createNamespace(name: string): QSocketNamespace {
		if (this.namespaces.has(name)) {
			this.debuger.warn(`The namespace "${name}" already exists.`);
			return this.namespaces.get(name)!;
		}
		const namespace = new QSocketNamespace(name, this.debuger);
		this.namespaces.set(name, namespace);
		this.debuger.info(`The namespace "${name}" has been created.`);
		this.joinNamespaceHandle(namespace);
		return namespace;
	}

	/**
	 * Удаляет существующее пространство имён.
	 * @param {string} name - Имя удаляемого пространства имён.
	 * @returns {boolean} Возвращает `true`, если пространство имён было удалено, иначе `false`.
	 */
	public deleteNamespace(name: string): boolean {
		const namespace = this.namespaces.get(name);
		if (namespace === undefined) {
			this.debuger.warn(`The namespace '${name}' does not exist.`);
			return false;
		}
		this.namespaces.delete(name);
		namespace.close();

		this.interactions.forEach((interaction) => QSocketInteraction.leaveNamespace(interaction, namespace));
		this.debuger.info(`The namespace "${name}" has been removed.`);
		return true;
	}

	/**
	 * Абстрактный метод для обработки логики после создания пространства имён.
	 * @param {QSocketNamespace} namespace - Пространство имён, требующее обработки.
	 */
	protected abstract joinNamespaceHandle(namespace: QSocketNamespace): void;

	protected abstract reconnectionHandle(): void;

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
