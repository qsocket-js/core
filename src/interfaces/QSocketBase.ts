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
	EQSocketProtocolContentEncoding,
	EQSocketProtocolContentType,
	EQSocketProtocolMessageType,
	IQSocketProtocolMessage,
	IQSocketProtocolMessageMetaControl,
	IQSocketProtocolMessageMetaData,
	QSocketProtocol,
} from '@qsocket/protocol';
import { TMakeRequired } from '@/@types/utility';

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
		this.protocol = new QSocketProtocol(config?.compression?.compressor, config?.compression?.compressionFromSize ?? 1024 * 100);
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
		const interaction = new QSocketInteraction(interactionId, socket, this.namespaces, this.interactions, this.protocol, this.timeout, this.debuger);
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
			this.debuger.warn(`The namespace "${name}" already exists.`);
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
	public deleteNamespace(name: string): void {
		const namespace = this.namespaces.get(name);
		if (namespace === undefined) {
			this.debuger.warn(`The namespace '${name}' does not exist.`);
			return;
		}
		this.namespaces.delete(name);
		QSocketNamespace.destroy(namespace);
		this.namespaceControl(namespace, 'leave-namespace');
		return;
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
	protected async namespaceControl(namespace: QSocketNamespace, command: 'join-namespace' | 'leave-namespace'): Promise<boolean> {
		if (this.type !== 'client') return true;

		const message: IQSocketProtocolMessage<IQSocketProtocolMessageMetaControl> = [
			{
				meta: {
					type: EQSocketProtocolMessageType.CONTROL,
					uuid: this.uuid.next(),
				},
				payload: {
					data: {
						command,
						namespace: namespace.name,
					},
					'Content-Type': EQSocketProtocolContentType.JSON,
					'Content-Encoding': EQSocketProtocolContentEncoding.RAW,
				},
			},
		];

		const promises: Promise<boolean>[] = [];
		this.interactions.forEach((interaction) => {
			promises.push(
				interaction
					.sendCommand(message)
					.then(() => {
						if (command === 'join-namespace') {
							return QSocketInteraction.joinNamespace(interaction, namespace);
						} else if (command === 'leave-namespace') {
							return QSocketInteraction.leaveNamespace(interaction, namespace);
						}
						return;
					})
					.then(() => {
						if (command === 'join-namespace') {
							this.debuger.info(`The namespace "${namespace.name}" has been created.`);
							QSocketNamespace.activate(namespace);
						} else if (command === 'leave-namespace') {
							this.debuger.info(`The namespace "${namespace.name}" has been removed.`);
							QSocketNamespace.diactivate(namespace);
						}
						return true;
					})
					.catch(() => {
						this.debuger.error(`Error while ${command === 'join-namespace' ? 'connecting to' : 'disconnecting from'} the namespace "${namespace.name}".`);
						return false;
					})
			);
		});

		return (await Promise.allSettled(promises)).every((item) => item.status === 'fulfilled');
	}
	//#endregion
}
