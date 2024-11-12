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
import { createErrorMessage } from './QSocketHelpers';
//#endregion

/**
 * Класс `QSocketNamespace` представляет пространство имён для управления подключениями и событиями клиентов.
 */
export default class QSocketNamespace {
	//#region Поля экземпляра

	/**
	 * @private
	 * @readonly
	 * @type {string}
	 * @description Уникальное название пространства имён.
	 */
	private readonly _name: string;

	/**
	 * @private
	 * @type {((connection: QSocketConnection) => void)[]}
	 * @description Список слушателей для событий подключения клиента к пространству имён.
	 */
	private connectionListeners: ((connection: QSocketConnection) => void)[] = [];

	/**
	 * @private
	 * @type {Map<QSocketInteraction, QSocketConnection>}
	 * @description Карта активных соединений, связывающая клиентов с их подключениями.
	 */
	private connections: Map<QSocketInteraction, QSocketConnection> = new Map();
	//#endregion

	//#region Свойства

	/**
	 * @public
	 * @type {string}
	 * @description Возвращает название пространства имён.
	 */
	public get name(): string {
		return this._name;
	}

	private debuger: QSocketDebuger;

	private middlewares: ((message: IQSocketProtocolChunk<IQSocketProtocolMessageMetaData>) => IQSocketProtocolChunk<IQSocketProtocolMessageMetaData>)[] = [];
	//#endregion

	//#region Конструктор

	/**
	 * @constructor
	 * @param {string} name - Название нового пространства имён.
	 * @throws {Error} Если пространство имён с таким именем уже существует.
	 * @description Создаёт новое пространство имён и добавляет его имя в список уникальных.
	 */
	constructor(name: string, debuger: QSocketDebuger) {
		this._name = name;
		this.debuger = debuger;
	}

	//#endregion

	//#region Методы событий

	/**
	 * @public
	 * @param {'connection'} event - Событие, которое требуется отслеживать. В данный момент поддерживается только 'connection'.
	 * @param {(connection: QSocketConnection) => void} listener - Слушатель, который будет вызван при наступлении события.
	 * @throws {Error} Если событие не поддерживается.
	 * @description Добавляет слушателя на событие подключения нового клиента к пространству имён.
	 */
	public on(event: 'connection', listener: (connection: QSocketConnection) => void): void {
		switch (event) {
			case 'connection':
				this.connectionListeners.push(listener);
				break;
			default:
				throw new Error(`Неизвестное событие: ${event}`);
		}
	}

	//#endregion

	//#region Методы управления потоком данных
	/**
	 * @public
	 * @static
	 * @param {QSocketNamespace} namespace - Экземпляр пространства имён, из которого будет удалён клиент.
	 * @param {IQSocketProtocolChunk<IQSocketProtocolMessageMetaData>} message - Сообщение по протоколу Q-SOCKET-DATA.
	 * @description Организует поток данных от клиента к активным соединениям передаваемого пространства имён.
	 */
	public static async pipe(
		interaction: QSocketInteraction,
		namespace: QSocketNamespace,
		message: IQSocketProtocolChunk<IQSocketProtocolMessageMetaData>
	): Promise<IQSocketProtocolMessage<IQSocketProtocolMessageMetaAck>> {
		return await namespace.$__pipe(interaction, message);
	}

	/**
	 * @private
	 * @param {IQSocketProtocolChunk<IQSocketProtocolMessageMetaData>} message - Сообщение по протоколу Q-SOCKET-DATA.
	 * @description Организует поток данных от клиента к активным соединениям текущего пространства имён.
	 */
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
		if (errors.length > 0) return [createErrorMessage(chunk, errors)];
		return await QSocketConnection.pipe(connection, chunk);
	}

	//#endregion

	//#region Методы управления клиентами

	/**
	 * @public
	 * @static
	 * @param {QSocketNamespace} namespace - Экземпляр пространства имён, к которому добавляется клиент.
	 * @param {QSocketInteraction} interaction - Экземпляр клиента, который будет добавлен.
	 * @description Добавляет клиента к указанному пространству имён, вызывая метод экземпляра для подключения.
	 */
	public static addClient(namespace: QSocketNamespace, interaction: QSocketInteraction): void {
		namespace.$__addClient(interaction);
	}

	/**
	 * @private
	 * @param {QSocketInteraction} interaction - Экземпляр клиента для добавления.
	 * @description Создаёт соединение для клиента, добавляет его в карту подключений и вызывает всех слушателей события "connection".
	 */
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
	}

	/**
	 * @public
	 * @static
	 * @param {QSocketNamespace} namespace - Экземпляр пространства имён, из которого будет удалён клиент.
	 * @param {QSocketInteraction} interaction - Экземпляр клиента, который будет удалён.
	 * @description Удаляет клиента из указанного пространства имён, вызывая метод экземпляра для отключения.
	 */
	public static deleteClient(namespace: QSocketNamespace, interaction: QSocketInteraction): void {
		namespace.$__deleteClient(interaction);
	}
	/**
	 * @private
	 * @param {QSocketInteraction} interaction - Экземпляр клиента для удаления.
	 * @description Удаляет соединение клиента из карты подключений и закрывает его.
	 */
	private $__deleteClient(interaction: QSocketInteraction): void {
		const connection = this.connections.get(interaction);
		this.connections.delete(interaction);
		if (connection !== undefined) {
			QSocketConnection.close(connection);
		}
	}

	//#endregion

	/**
	 * @public
	 * @description Уничтожает текущее пространство имён: удаляет все активные соединения клиентов и очищает его из списка уникальных имён.
	 */
	public destroy(): void {
		this.connections.forEach((_, interaction) => {
			this.$__deleteClient(interaction);
		});
	}

	public async emit<I extends TQSocketProtocolPayloadData, O extends IQSocketProtocolPayload>(
		event: string,
		data: I,
		contentType?: TQSocketContentType,
		contentEncoding?: TQSocketContentEncoding
	): Promise<O[][]> {
		const promises: Promise<O[]>[] = [];
		this.connections.forEach((connection) => {
			promises.push(connection.emit<I, O>(event, data, contentType, contentEncoding));
		});
		return (await Promise.allSettled(promises)).filter((res) => res.status === 'fulfilled').map(({ value }) => value);
	}

	/**
	 * @description Добавляет промежуточный обработчик чанков сообщения
	 * @param handler
	 */
	public use(handler: (chunk: IQSocketProtocolChunk<IQSocketProtocolMessageMetaData>) => IQSocketProtocolChunk<IQSocketProtocolMessageMetaData>): void {
		this.middlewares.push(handler);
	}
}
