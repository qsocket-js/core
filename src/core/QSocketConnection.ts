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
import { EQSocketListenerType, TQSocketContentEncoding, TQSocketContentType } from '@/@types/interface';
import { determineContentEncoding, determineContentType, getContentEncodingString, getContentTypeString } from './QSocketHelpers';
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

	//#region Методы управления соединением

	static close(connection: QSocketConnection) {
		connection.close();
	}
	private close() {
		this.disconnectionListeners.forEach((listener) => listener());
		this.listeners.clear();
	}
	//#endregion

	//#region Методы отправки и передачи данных
	/**
	 * @description Отправка данных на связанный клиент
	 */
	public async emit<I extends TQSocketProtocolPayloadData, O extends IQSocketProtocolPayload>(
		event: string,
		data?: I,
		contentType?: TQSocketContentType,
		contentEncoding?: TQSocketContentEncoding
	): Promise<O[]> {
		const message: IQSocketProtocolMessage<IQSocketProtocolMessageMetaData> = [
			{
				payload: {
					data,
					'Content-Type': determineContentType(data, contentType),
					'Content-Encoding': determineContentEncoding(contentEncoding),
				},
				meta: {
					type: EQSocketProtocolMessageType.DATA,
					uuid: this.interaction.uuid.next(),
					namespace: this.namespace.name,
					event,
				},
			},
		];
		console.log('ПОЛЕТЕЛО СООБЩЕНИЦЕ', message);
		const returns = await this.interaction.sendData<O>(message);
		return returns === undefined ? [] : returns[0];
	}

	public async broadcast<I extends TQSocketProtocolPayloadData, O extends IQSocketProtocolPayload>(
		event: string,
		data?: I,
		contentType?: TQSocketContentType,
		contentEncoding?: TQSocketContentEncoding
	): Promise<O[][] | undefined> {
		const message: IQSocketProtocolChunk<IQSocketProtocolMessageMetaData> = {
			payload: {
				data,
				'Content-Type': determineContentType(data, contentType),
				'Content-Encoding': determineContentEncoding(contentEncoding),
			},
			meta: {
				type: EQSocketProtocolMessageType.DATA,
				uuid: this.interaction.uuid.next(),
				namespace: this.namespace.name,
				event,
			},
		};
		const interactionsResults = await this.interaction.broadcast<O>([message]);
		return interactionsResults.map((interactionResult) => interactionResult[0]);
	}

	static async pipe(
		connection: QSocketConnection,
		message: IQSocketProtocolChunk<IQSocketProtocolMessageMetaData>
	): Promise<IQSocketProtocolMessage<IQSocketProtocolMessageMetaAck>> {
		return await connection.$__pipe(message);
	}

	/**
	 * @description Передача сообщения из пространства имён в соединение
	 */
	private async $__pipe(chunk: IQSocketProtocolChunk<IQSocketProtocolMessageMetaData>): Promise<IQSocketProtocolMessage<IQSocketProtocolMessageMetaAck>> {
		const event = chunk.meta.event;
		const payload = chunk.payload;
		const events = this.listeners.get(event);

		if (!events) return [];

		// Очистка одноразовых событий из массива слушателей
		this.listeners.set(
			event,
			events.filter((event) => event.type === EQSocketListenerType.ON)
		);

		// Выполнение всех обработчиков и сбор результата
		const results = await Promise.allSettled(
			events.map(async (eventInstance) => {
				const data = await eventInstance.listener(
					payload.data,
					getContentTypeString(payload['Content-Type']),
					getContentEncodingString(payload['Content-Encoding'])
				);

				return {
					payload: {
						data,
						'Content-Type': determineContentType(data, eventInstance.contentType),
						'Content-Encoding': determineContentEncoding(eventInstance.contentEncoding),
					},
					meta: {
						type: EQSocketProtocolMessageType.ACK,
						uuid: chunk.meta.uuid,
					},
				} as IQSocketProtocolChunk<IQSocketProtocolMessageMetaAck>;
			})
		);

		return results.reduce((acc, cur) => {
			if (cur.status === 'fulfilled' && cur.value) acc.push(cur.value);
			return acc;
		}, [] as IQSocketProtocolMessage<IQSocketProtocolMessageMetaAck>);
	}
	//#endregion
}
