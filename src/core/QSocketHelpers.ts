import { TQSocketContentType } from '@/@types/interface';
import {
	EQSocketProtocolContentType,
	EQSocketProtocolMessageType,
	IQSocketProtocolChunk,
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
 * Возвращает строковое представление типа контента.
 * @param {EQSocketProtocolContentType} contentType - Тип контента.
 * @returns {TQSocketContentType} Строковое представление типа контента.
 */
export function getContentTypeString(contentType?: EQSocketProtocolContentType): TQSocketContentType {
	if (contentType === undefined) return 'undefined';
	return contentTypeMap.get(contentType) ?? 'undefined';
}

export function createConfirmAckChunk(
	chunk: IQSocketProtocolChunk,
	result: TQSocketProtocolPayloadData
): IQSocketProtocolChunk<IQSocketProtocolMessageMetaAck> {
	return {
		meta: {
			type: EQSocketProtocolMessageType.ACK,
			uuid: chunk.meta.uuid,
		},
		payload: {
			data: result,
			'Content-Type': EQSocketProtocolContentType.BOOLEAN,
		},
	};
}

export function createHandshakeAckChunk(
	chunk: IQSocketProtocolChunk,
	result: TQSocketProtocolPayloadData
): IQSocketProtocolChunk<IQSocketProtocolMessageMetaAck> {
	return {
		meta: {
			type: EQSocketProtocolMessageType.ACK,
			uuid: chunk.meta.uuid,
		},
		payload: {
			data: result,
			'Content-Type': EQSocketProtocolContentType.STRING,
		},
	};
}

export function createErrorAckChunk(
	sourceChunk: IQSocketProtocolChunk<IQSocketProtocolMessageMetaData> | IQSocketProtocolChunk<IQSocketProtocolMessageMetaControl>,
	error: Error
): IQSocketProtocolChunk<IQSocketProtocolMessageMetaAck> {
	return {
		meta: {
			type: EQSocketProtocolMessageType.ACK,
			uuid: sourceChunk.meta.uuid,
		},
		payload: {
			data: {
				type: 'error',
				value: error.message,
			},
			'Content-Type': EQSocketProtocolContentType.STRING,
		},
	};
}

export function createDataAckChunk(
	chunk: IQSocketProtocolChunk,
	data: TQSocketProtocolPayloadData,
	contentType?: TQSocketContentType
): IQSocketProtocolChunk<IQSocketProtocolMessageMetaAck> {
	return {
		meta: {
			type: EQSocketProtocolMessageType.ACK,
			uuid: chunk.meta.uuid,
		},
		payload: {
			data: data,
			'Content-Type': determineContentType(data, contentType),
		},
	};
}

export function createDataChunk(
	uuid: string,
	event: string,
	namespace: string,
	data: TQSocketProtocolPayloadData,
	contentType?: TQSocketContentType
): IQSocketProtocolChunk<IQSocketProtocolMessageMetaData> {
	return {
		meta: {
			type: EQSocketProtocolMessageType.DATA,
			uuid: uuid,
			event: event,
			namespace: namespace,
		},
		payload: {
			data: data,
			'Content-Type': determineContentType(data, contentType),
		},
	};
}

//#region Преобразователи данных
export function uint8ArrayToBase64(uint8Array: Uint8Array) {
	if (typeof window === 'undefined') {
		// Node.js
		return Buffer.from(uint8Array).toString('base64');
	} else {
		// Браузер
		let binaryString = '';
		for (let i = 0; i < uint8Array.length; i++) {
			binaryString += String.fromCharCode(uint8Array[i]);
		}
		return btoa(binaryString);
	}
}

export function base64ToUint8Array(base64String: string) {
	if (typeof window === 'undefined') {
		// Node.js
		const buffer = Buffer.from(base64String, 'base64');
		return new Uint8Array(buffer);
	} else {
		// Браузер
		const binaryString = atob(base64String);
		const len = binaryString.length;
		const uint8Array = new Uint8Array(len);
		for (let i = 0; i < len; i++) {
			uint8Array[i] = binaryString.charCodeAt(i);
		}
		return uint8Array;
	}
}
//#endregion
