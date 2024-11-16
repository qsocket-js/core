//#region Импорт модулей протокола Q-SOCKET
import type {
	IQSocketProtocolChunk,
	IQSocketProtocolMessage,
	IQSocketProtocolMessageMetaAck,
	IQSocketProtocolMessageMetaData,
	IQSocketProtocolPayload,
	TQSocketProtocolPayloadData,
} from '@qsocket/protocol';
import { EQSocketProtocolMessageType } from '@qsocket/protocol';
//#endregion

//#region Импорт модулей ядра Q-SOCKET
import QSocketNamespace from './QSocketNamespace';
import QSocketInteraction from './QSocketInteraction';
import { TQSocketContentEncoding, TQSocketContentType } from '@/@types/interface';
import { createDataChunk, determineContentEncoding, determineContentType } from './QSocketHelpers';
import { QSocketConnectionEventEmitter } from './QSocketEventEmetter';
//#endregion

export default class QSocketConnection extends QSocketConnectionEventEmitter {
	//#region Поля класса
	private interaction: QSocketInteraction;
	private namespace: QSocketNamespace;

	//#endregion

	//#region Конструктор
	constructor(interaction: QSocketInteraction, namespace: QSocketNamespace) {
		super();
		this.interaction = interaction;
		this.namespace = namespace;
	}
	//#endregion

	//#region Методы отправки и передачи данных
	/**
	 * @description Отправка данных на связанный клиент
	 */
	public async emit<I extends TQSocketProtocolPayloadData, O extends IQSocketProtocolPayload>(
		event: string,
		data?: I,
		options?: {
			timeout?: number;
			contentType?: TQSocketContentType;
			contentEncoding?: TQSocketContentEncoding;
		}
	): Promise<O[]> {
		const message: IQSocketProtocolMessage<IQSocketProtocolMessageMetaData> = [
			{
				payload: {
					data,
					'Content-Type': determineContentType(data, options?.contentType),
					'Content-Encoding': determineContentEncoding(options?.contentEncoding),
				},
				meta: {
					type: EQSocketProtocolMessageType.DATA,
					uuid: this.interaction.uuid.next(),
					namespace: this.namespace.name,
					event,
				},
			},
		];
		const returns = await this.interaction.sendData<O>(message, options?.timeout);
		return returns === undefined ? [] : returns[0];
	}

	public async broadcast<I extends TQSocketProtocolPayloadData, O extends IQSocketProtocolPayload>(
		event: string,
		data?: I,
		options?: {
			timeout?: number;
			contentType?: TQSocketContentType;
			contentEncoding?: TQSocketContentEncoding;
		}
	): Promise<O[][] | undefined> {
		const chunk = createDataChunk(this.interaction.uuid.next(), event, this.namespace.name, data, options?.contentType, options?.contentEncoding);
		const interactionsResults = await this.interaction.broadcast<O>([chunk], options?.timeout);
		return interactionsResults.map((interactionResult) => interactionResult[0]);
	}

	static async pipe(
		connection: QSocketConnection,
		chunk: IQSocketProtocolChunk<IQSocketProtocolMessageMetaData>
	): Promise<IQSocketProtocolMessage<IQSocketProtocolMessageMetaAck>> {
		return await connection.executor(chunk);
	}
	//#endregion

	//#region Методы управления соединением

	static close(connection: QSocketConnection) {
		connection.disconnectionListeners.forEach((listener) => listener());
		connection.listeners.clear();
	}

	//#endregion
}
