//#region Импорт общих типов
import type { TQSocketClientSocket, TQSocketServerSocket } from '@/@types/transport';
import type { IQSocketDebugConfig, IQSocketProtocolConfig } from '../@types/shared';
import type QSocketServer from './QSocketServer';
import type QSocketClient from './QSocketClient';
//#endregion

//#region Импорт модулей ядра Q-SOCKET
import QSocketNamespace from '@/core/QSocketNamespace';
import QSocketDebuger from '@/core/QSocketDebuger';
import QSocketInteraction from '@/core/QSocketInteraction';
import QSocketUniqueGenerator from '@/core/QSocketUniqueGenerator';

import { getDefaultProtocolConfig } from '@/core/QSocketHelpers';
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
	protected readonly protocolConfig: IQSocketProtocolConfig = getDefaultProtocolConfig();

	/**
	 * Конструктор класса QSocketBase.
	 * @param {IQSocketDebugConfig} [debugConfig] - Конфигурация для режима отладки.
	 */
	constructor(type: 'client' | 'server', protocolConfig?: IQSocketProtocolConfig, debugConfig?: IQSocketDebugConfig) {
		this.type = type;
		this.debuger = new QSocketDebuger(debugConfig);
		if (protocolConfig !== undefined && protocolConfig.compressor !== undefined) {
			this.protocolConfig.compressor!.on = protocolConfig.compressor.on ?? this.protocolConfig.compressor!.on;
			this.protocolConfig.compressor!.compressor = protocolConfig.compressor.compressor ?? this.protocolConfig.compressor!.compressor;
			this.protocolConfig.compressor!.compressionFromSize =
				protocolConfig.compressor.compressionFromSize ?? this.protocolConfig.compressor!.compressionFromSize;
		}
		const prefix: 'S' | 'C' = type === 'server' ? 'S' : 'C';
		const generator = type === 'server' ? serverUUID : clientUUID;
		this.id = `${prefix}${generator.next()}`;
		this.uuid = new QSocketUniqueGenerator(`${this.id}-SM`);
		this.interactionUUID = new QSocketUniqueGenerator(`${this.id}-I`);
	}

	protected connectionHandle(socket: TQSocketServerSocket | TQSocketClientSocket, server: QSocketServer | QSocketClient) {
		const interactionId = this.interactionUUID.next();
		const interaction = new QSocketInteraction(interactionId, socket, server, this.interactions, this.protocolConfig, this.debuger);
		this.interactions.set(interactionId, interaction);

		(socket as any).on('close', () => {
			this.interactions.delete(interactionId);
		});
	}

	/**
	 * Создаёт новое пространство имён или возвращает существующее.
	 * @param {string} name - Имя создаваемого пространства имён.
	 * @returns {QSocketNamespace} Пространство имён QSocket.
	 */
	public createNamespace(name: string): QSocketNamespace {
		if (this.namespaces.has(name)) {
			this.debuger.warn(`Пространство имён '${name}' уже существует`);
			return this.namespaces.get(name)!;
		}
		const namespace = new QSocketNamespace(name, this.debuger);
		this.namespaces.set(name, namespace);
		this.debuger.info(`Пространство имён "${name}" создано!`);
		this.namespaceHandle(namespace);
		return namespace;
	}

	/**
	 * Удаляет существующее пространство имён.
	 * @param {string} name - Имя удаляемого пространства имён.
	 * @returns {boolean} Возвращает `true`, если пространство имён было удалено, иначе `false`.
	 */
	public removeNamespace(name: string): boolean {
		if (!this.namespaces.has(name)) {
			this.debuger.warn(`Пространство имён '${name}' не существует`);
			return false;
		}
		this.namespaces.get(name)!.destroy();
		this.namespaces.delete(name);
		this.debuger.info(`Пространство имён "${name}" уничтожено!`);
		return true;
	}

	/**
	 * Получает пространство имён по его имени.
	 * @param {string} name - Имя запрашиваемого пространства имён.
	 * @returns {QSocketNamespace | undefined} Пространство имён или `undefined`, если оно не найдено.
	 */
	public getNamespace(name: string): QSocketNamespace | undefined {
		return this.namespaces.get(name);
	}

	/**
	 * Абстрактный метод для обработки логики после создания пространства имён.
	 * @param {QSocketNamespace} namespace - Пространство имён, требующее обработки.
	 */
	protected abstract namespaceHandle(namespace: QSocketNamespace): void;
}
