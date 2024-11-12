import { TQSocketProtocolPayloadData } from '@qsocket/protocol';

export enum EQSocketListenerType {
	ON,
	ONCE,
}

export type TQSocketContentType = 'undefined' | 'null' | 'boolean' | 'number' | 'string' | 'json' | 'buffer';
export type TQSocketContentEncoding = 'raw' | 'gzip' | 'deflate';

export type TListennerReturn<T extends TQSocketProtocolPayloadData> = Promise<T> | T;

export type TQSocketListenerCallback<I extends TQSocketProtocolPayloadData, O extends TQSocketProtocolPayloadData> = (
	payload: I,
	contentType?: TQSocketContentType,
	contentEncoding?: TQSocketContentEncoding
) => TListennerReturn<O>;

export interface IQSocketListener<I extends TQSocketProtocolPayloadData, O extends TQSocketProtocolPayloadData> {
	/** Тип слушателя (ON/ONCE) */
	type: EQSocketListenerType;
	/** Слушатель */
	listener: TQSocketListenerCallback<I, O>;
	/** Тип контента по умолчанию */
	contentType?: TQSocketContentType;
	/** Алгоритм сжатия, который будет использован для сжатия пакета */
	contentEncoding?: TQSocketContentEncoding;
}
