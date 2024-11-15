import { TQSocketContentEncoding, TQSocketContentType } from '@/@types/interface';
import {
	EQSocketProtocolContentEncoding,
	EQSocketProtocolContentType,
	EQSocketProtocolMessageType,
	IQSocketProtocolChunk,
	IQSocketProtocolMessage,
	IQSocketProtocolMessageMetaAck,
	IQSocketProtocolMessageMetaControl,
	IQSocketProtocolMessageMetaData,
	TQSocketProtocolPayloadData,
} from '@qsocket/protocol';

/** Маппинг типов контента */
export const contentTypeMap = new Map<EQSocketProtocolContentType, TQSocketContentType>([
	[EQSocketProtocolContentType.UNDEFINED, 'undefined'],
	[EQSocketProtocolContentType.NULL, 'null'],
	[EQSocketProtocolContentType.BOOLEAN, 'boolean'],
	[EQSocketProtocolContentType.NUMBER, 'number'],
	[EQSocketProtocolContentType.STRING, 'string'],
	[EQSocketProtocolContentType.JSON, 'json'],
	[EQSocketProtocolContentType.BUFFER, 'buffer'],
]);

/** Обратный маппинг типов контента */
export const reverseContentTypeMap = new Map<TQSocketContentType, EQSocketProtocolContentType>([
	['undefined', EQSocketProtocolContentType.UNDEFINED],
	['null', EQSocketProtocolContentType.NULL],
	['boolean', EQSocketProtocolContentType.BOOLEAN],
	['number', EQSocketProtocolContentType.NUMBER],
	['string', EQSocketProtocolContentType.STRING],
	['json', EQSocketProtocolContentType.JSON],
	['buffer', EQSocketProtocolContentType.BUFFER],
]);

/** Маппинг типов кодировок контента */
export const contentEncodingMap = new Map<EQSocketProtocolContentEncoding, TQSocketContentEncoding>([
	[EQSocketProtocolContentEncoding.RAW, 'raw'],
	[EQSocketProtocolContentEncoding.GZIP, 'gzip'],
	[EQSocketProtocolContentEncoding.DEFLATE, 'deflate'],
]);

/** Обратный маппинг типов кодировок контента */
export const reverseContentEncodingMap = new Map<TQSocketContentEncoding, EQSocketProtocolContentEncoding>([
	['raw', EQSocketProtocolContentEncoding.RAW],
	['gzip', EQSocketProtocolContentEncoding.GZIP],
	['deflate', EQSocketProtocolContentEncoding.DEFLATE],
]);

//#region Логирование

/**
 * Определяет тип контента на основе переданного значения.
 * @param {TQSocketProtocolPayloadData} data - Данные для проверки.
 * @param {TQSocketContentType} [contentType] - Явно указанный тип контента.
 * @returns {EQSocketProtocolContentType} Соответствующий тип контента.
 */
export function determineContentType(data: TQSocketProtocolPayloadData, contentType?: TQSocketContentType): EQSocketProtocolContentType {
	if (contentType) {
		const type = reverseContentTypeMap.get(contentType);
		if (type !== undefined) return type;
	}

	switch (typeof data) {
		case 'undefined':
			return EQSocketProtocolContentType.UNDEFINED;
		case 'boolean':
			return EQSocketProtocolContentType.BOOLEAN;
		case 'number':
			return EQSocketProtocolContentType.NUMBER;
		case 'string':
			return EQSocketProtocolContentType.STRING;
		case 'symbol':
			return EQSocketProtocolContentType.UNDEFINED;
		case 'object':
			if (data === null) return EQSocketProtocolContentType.NULL;
			if (Buffer.isBuffer(data)) return EQSocketProtocolContentType.BUFFER;
			return EQSocketProtocolContentType.JSON;
		default:
			return EQSocketProtocolContentType.UNDEFINED;
	}
}

/**
 * Определяет тип кодировки контента на основе переданного значения.
 * @param {TQSocketContentEncoding} [contentEncoding] - Явно указанный тип кодировки.
 * @returns {EQSocketProtocolContentEncoding} Соответствующий тип кодировки.
 */
export function determineContentEncoding(contentEncoding?: TQSocketContentEncoding): EQSocketProtocolContentEncoding {
	if (contentEncoding) {
		const encoding = reverseContentEncodingMap.get(contentEncoding);
		if (encoding !== undefined) return encoding;
	}

	return EQSocketProtocolContentEncoding.RAW;
}

/**
 * Возвращает строковое представление типа контента.
 * @param {EQSocketProtocolContentType} contentType - Тип контента.
 * @returns {TQSocketContentType} Строковое представление типа контента.
 */
export function getContentTypeString(contentType?: EQSocketProtocolContentType): TQSocketContentType {
	if (contentType === undefined) return 'undefined';
	return contentTypeMap.get(contentType) ?? 'undefined';
}

/**
 * Возвращает строковое представление типа кодировки.
 * @param {EQSocketProtocolContentEncoding} contentEncoding - Тип кодировки контента.
 * @returns {TQSocketContentEncoding} Строковое представление типа кодировки контента.
 */
export function getContentEncodingString(contentEncoding?: EQSocketProtocolContentEncoding): TQSocketContentEncoding {
	if (contentEncoding === undefined) return 'raw';
	return contentEncodingMap.get(contentEncoding) ?? 'raw';
}

export function createErrorAckMessage(
	sourceChunk: IQSocketProtocolChunk<IQSocketProtocolMessageMetaData>,
	errors: Error[]
): IQSocketProtocolChunk<IQSocketProtocolMessageMetaAck> {
	return {
		meta: {
			type: EQSocketProtocolMessageType.ACK,
			uuid: sourceChunk.meta.uuid,
		},
		payload: {
			data: errors.map((error) => error.message),
			'Content-Type': EQSocketProtocolContentType.JSON,
			'Content-Encoding': EQSocketProtocolContentEncoding.RAW,
		},
	};
}

export function createConfirmAckMessage(
	chunk: IQSocketProtocolChunk,
	result: TQSocketProtocolPayloadData
): IQSocketProtocolMessage<IQSocketProtocolMessageMetaAck> {
	return [
		{
			meta: {
				type: EQSocketProtocolMessageType.ACK,
				uuid: chunk.meta.uuid,
			},
			payload: {
				data: result,
				'Content-Type': EQSocketProtocolContentType.BOOLEAN,
				'Content-Encoding': EQSocketProtocolContentEncoding.RAW,
			},
		},
	];
}

export function createPingMessage(uuid: string): IQSocketProtocolMessage<IQSocketProtocolMessageMetaControl> {
	return [
		{
			meta: {
				type: EQSocketProtocolMessageType.CONTROL,
				uuid: uuid,
			},
			payload: {
				data: {
					command: 'ping',
				},
				'Content-Type': EQSocketProtocolContentType.STRING,
				'Content-Encoding': EQSocketProtocolContentEncoding.RAW,
			},
		},
	];
}

export function createPongMessage(uuid: string): IQSocketProtocolMessage<IQSocketProtocolMessageMetaAck> {
	return [
		{
			meta: {
				type: EQSocketProtocolMessageType.ACK,
				uuid: uuid,
			},
			payload: {
				data: 'pong',
				'Content-Type': EQSocketProtocolContentType.STRING,
				'Content-Encoding': EQSocketProtocolContentEncoding.RAW,
			},
		},
	];
}
