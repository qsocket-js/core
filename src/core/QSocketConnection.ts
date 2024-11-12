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
import { EQSocketListenerType, IQSocketListener, TQSocketContentEncoding, TQSocketContentType, TQSocketListenerCallback } from '@/@types/interface';
import { determineContentEncoding, determineContentType, getContentEncodingString, getContentTypeString } from './QSocketHelpers';
//#endregion

export default class QSocketConnection {
	//#region Поля класса
	private interaction: QSocketInteraction;
	private namespace: QSocketNamespace;

	private events: Map<string, IQSocketListener<any, any>[]> = new Map();
	private closeListeners: (() => void)[] = [];
	//#endregion

	//#region Конструктор
	constructor(interaction: QSocketInteraction, namespace: QSocketNamespace) {
		this.interaction = interaction;
		this.namespace = namespace;
	}
	//#endregion

	//#region Методы управления соединением
	/**
	 * @description Подписка на событие завершения соединения с клиентом
	 */
	onClose(listener: () => void) {
		this.closeListeners.push(listener);
	}

	/**
	 * @description Закрытие соединения
	 */
	private $__close() {
		this.closeListeners.forEach((listener) => listener());
	}

	static close(connection: QSocketConnection) {
		connection.$__close();
	}
	//#endregion

	//#region Методы подписки на события
	/**
	 * @description Подписка на событие с поддержкой нескольких слушателей
	 */
	public on<I extends TQSocketProtocolPayloadData, O extends TQSocketProtocolPayloadData>(
		event: string,
		listener: TQSocketListenerCallback<I, O>,
		contentType?: TQSocketContentType,
		contentEncoding?: TQSocketContentEncoding
	) {
		this.addEventListener(event, listener, EQSocketListenerType.ON, contentType, contentEncoding);
	}

	/**
	 * @description Подписка на одноразовое событие
	 */
	public once<I extends TQSocketProtocolPayloadData, O extends TQSocketProtocolPayloadData>(
		event: string,
		listener: TQSocketListenerCallback<I, O>,
		contentType?: TQSocketContentType,
		contentEncoding?: TQSocketContentEncoding
	) {
		this.addEventListener(event, listener, EQSocketListenerType.ONCE, contentType, contentEncoding);
	}

	/**
	 * @description Производит отписку от события
	 */
	public off<I extends TQSocketProtocolPayloadData, O extends TQSocketProtocolPayloadData>(event: string, listener: TQSocketListenerCallback<I, O>) {
		const events = this.events.get(event);
		if (events === undefined) return false;
		let spliceIndex = -1;
		for (let i = events.length - 1; i >= 0; i--) {
			if (events[i].listener === listener) {
				spliceIndex = i;
				break;
			}
		}
		events.splice(spliceIndex, 1);
	}
	//#endregion

	//#region Методы отправки и передачи данных
	/**
	 * @description Отправка данных на связанный клиент
	 */
	public async emit<I extends TQSocketProtocolPayloadData, O extends IQSocketProtocolPayload>(
		event: string,
		data: I,
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
		const returns = await this.interaction.sendData<O>(message);
		if (returns === undefined) {
			// Если произошла ошибка - возвращаем пустой массив
			return [];
		} else {
			// Если всё корректно - возвращаем первый чанк ответов (он всегда один)
			return returns[0];
		}
	}

	public async broadcast<I extends TQSocketProtocolPayloadData, O extends IQSocketProtocolPayload>(
		event: string,
		data: I,
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
				broadcast: true,
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
		const events = this.events.get(event);

		if (!events) return [];

		// Очистка одноразовых событий из массива слушателей
		this.events.set(
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

				return this.createAck(chunk.meta.uuid, data, eventInstance.contentType, eventInstance.contentEncoding);
			})
		);

		return results.reduce((acc, cur) => {
			if (cur.status === 'fulfilled' && cur.value) acc.push(cur.value);
			return acc;
		}, [] as IQSocketProtocolMessage<IQSocketProtocolMessageMetaAck>);
	}
	//#endregion

	//#region Вспомогательные методы
	/**
	 * @description Добавление слушателя события в карту событий
	 */
	private addEventListener<I extends TQSocketProtocolPayloadData, O extends TQSocketProtocolPayloadData>(
		event: string,
		listener: TQSocketListenerCallback<I, O>,
		type: EQSocketListenerType,
		contentType?: TQSocketContentType,
		contentEncoding?: TQSocketContentEncoding
	) {
		if (!this.events.has(event)) {
			this.events.set(event, []);
		}

		this.events.get(event)!.push({
			type,
			listener,
			contentType,
			contentEncoding,
		});
	}

	/**
	 * @description Создание нового сообщения в формате IQSocketProtocolChunk
	 */
	private createAck(
		uuid: string,
		data: any,
		contentType?: TQSocketContentType,
		contentEncoding?: TQSocketContentEncoding
	): IQSocketProtocolChunk<IQSocketProtocolMessageMetaAck> {
		return {
			payload: {
				data,
				'Content-Type': determineContentType(data, contentType),
				'Content-Encoding': determineContentEncoding(contentEncoding),
			},
			meta: {
				type: EQSocketProtocolMessageType.ACK,
				uuid: uuid,
			},
		};
	}
	//#endregion
}
