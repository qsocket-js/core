import { EQSocketListenerType, IQSocketListener, TQSocketContentEncoding, TQSocketContentType, TQSocketListenerCallback } from '@/@types/interface';
import QSocketConnection from './QSocketConnection';
import {
	IQSocketProtocolChunk,
	IQSocketProtocolMessage,
	IQSocketProtocolMessageMetaAck,
	IQSocketProtocolMessageMetaData,
	TQSocketProtocolPayloadData,
} from '@qsocket/protocol';
import { createDataAckChunk, getContentEncodingString, getContentTypeString } from './QSocketHelpers';

class QSocketEventEmetterBase {
	/**
	 * Map of all event listeners, supporting multiple listeners for each event type.
	 * @private
	 * @type {Map<string, IQSocketListener<any, any>[]>}
	 */
	protected readonly listeners: Map<string, IQSocketListener<any, any>[]> = new Map();

	/**
	 * Listeners for the "connection" event, triggered upon establishing a new connection.
	 * @private
	 * @type {((connection: QSocketConnection) => void)[]}
	 */
	protected readonly connectionListeners: ((connection: QSocketConnection) => void)[] = [];

	/**
	 * Listeners for the "disconnection" event, triggered when a connection is terminated.
	 * @private
	 * @type {(() => void)[]}
	 */
	protected readonly disconnectionListeners: (() => void)[] = [];

	protected addEventListener<I extends TQSocketProtocolPayloadData, O extends TQSocketProtocolPayloadData>(
		event: string,
		listener: TQSocketListenerCallback<I, O>,
		type: EQSocketListenerType,
		contentType?: TQSocketContentType,
		contentEncoding?: TQSocketContentEncoding
	) {
		let listeners = this.listeners.get(event);
		if (!listeners) {
			listeners = [];
			this.listeners.set(event, listeners);
		}

		listeners.push({
			type,
			listener,
			contentType,
			contentEncoding,
		});
	}

	protected removeEventListener<I extends TQSocketProtocolPayloadData, O extends TQSocketProtocolPayloadData>(
		event: string,
		listener: TQSocketListenerCallback<I, O> | ((connection: QSocketConnection) => void)
	) {
		const listeners = this.listeners.get(event);
		if (!listeners) return;

		const index = listeners.findIndex((item) => item.listener === listener);
		if (index !== -1) listeners.splice(index, 1);
	}

	protected async executor(chunk: IQSocketProtocolChunk<IQSocketProtocolMessageMetaData>): Promise<IQSocketProtocolMessage<IQSocketProtocolMessageMetaAck>> {
		const event = chunk.meta.event;
		const listeners = this.listeners.get(event);
		if (!listeners) return [];
		const payload = chunk.payload;

		// Очистка одноразовых событий из массива слушателей
		this.listeners.set(
			event,
			listeners.filter(({ type }) => type === EQSocketListenerType.ON)
		);

		// Выполнение всех обработчиков и сбор результата
		const results = await Promise.allSettled(
			listeners.map(async (eventInstance) => {
				const data = await Promise.resolve(
					eventInstance.listener(payload.data, getContentTypeString(payload['Content-Type']), getContentEncodingString(payload['Content-Encoding']))
				);
				return createDataAckChunk(chunk, data, eventInstance.contentType, eventInstance.contentEncoding);
			})
		);

		return results.reduce<IQSocketProtocolMessage<IQSocketProtocolMessageMetaAck>>((acc, cur) => {
			if (cur.status === 'fulfilled' && cur.value) acc.push(cur.value);
			return acc;
		}, []);
	}
}

export class QSocketConnectionEventEmitter extends QSocketEventEmetterBase {
	/**
	 * Registers a persistent listener for the disconnection event.
	 * @example
	 * ```typescript
	 * emitter.on('disconnection', () => { console.log('Disconnected'); });
	 * ```
	 * @param {string} event - Event name: 'disconnection'
	 * @param {() => void} listener - Callback function executed on disconnection.
	 */
	public on(event: 'disconnection', listener: () => void): void;

	/**
	 * Registers a persistent listener for a custom event.
	 * @example
	 * ```typescript
	 * emitter.on('customEvent', (data) => { console.log('Received data:', data); }, 'application/json', 'utf-8');
	 * ```
	 * @param {string} event - Custom event name.
	 * @param {TQSocketListenerCallback<I, O>} listener - Callback function for the custom event.
	 * @param {TQSocketContentType} [contentType] - Optional content type (e.g., 'application/json').
	 * @param {TQSocketContentEncoding} [contentEncoding] - Optional encoding (e.g., 'utf-8').
	 */
	public on<I extends TQSocketProtocolPayloadData, O extends TQSocketProtocolPayloadData>(
		event: string,
		listener: TQSocketListenerCallback<I, O>,
		contentType?: TQSocketContentType,
		contentEncoding?: TQSocketContentEncoding
	): void;

	/**
	 * Main implementation of the `on` method, determining which handler to add.
	 * @param {string} event - Event name.
	 * @param {Function} listener - Callback function for the event.
	 * @param {TQSocketContentType} [contentType] - Optional content type.
	 * @param {TQSocketContentEncoding} [contentEncoding] - Optional encoding: 'raw' | 'gzip' | 'deflate'.
	 */
	public on<I extends TQSocketProtocolPayloadData, O extends TQSocketProtocolPayloadData>(
		event: string,
		listener: TQSocketListenerCallback<I, O> | ((connection: QSocketConnection) => void) | (() => void),
		contentType?: TQSocketContentType,
		contentEncoding?: TQSocketContentEncoding
	) {
		if (event === 'disconnection') {
			this.disconnectionListeners.push(listener as () => void);
		} else {
			this.addEventListener(event, listener as TQSocketListenerCallback<I, O>, EQSocketListenerType.ON, contentType, contentEncoding);
		}
	}

	/**
	 * Registers a one-time listener for the disconnection event.
	 * @example
	 * ```typescript
	 * emitter.once('disconnection', () => { console.log('One-time disconnection'); });
	 * ```
	 * @param {string} event - Event name: 'disconnection'
	 * @param {() => void} listener - Callback function executed on disconnection.
	 */
	public once(event: 'disconnection', listener: () => void): void;

	/**
	 * Registers a one-time listener for a custom event.
	 * @example
	 * ```typescript
	 * emitter.once('customEvent', (data) => { console.log('One-time event data:', data); }, 'application/json', 'utf-8');
	 * ```
	 * @param {string} event - Custom event name.
	 * @param {TQSocketListenerCallback<I, O>} listener - Callback function for the custom event.
	 * @param {TQSocketContentType} [contentType] - Optional content type.
	 * @param {TQSocketContentEncoding} [contentEncoding] - Optional encoding: 'raw' | 'gzip' | 'deflate'.
	 */
	public once<I extends TQSocketProtocolPayloadData, O extends TQSocketProtocolPayloadData>(
		event: string,
		listener: TQSocketListenerCallback<I, O>,
		contentType?: TQSocketContentType,
		contentEncoding?: TQSocketContentEncoding
	): void;

	/**
	 * Main implementation of the `once` method, determining the addition of a one-time handler.
	 * @param {string} event - Event name.
	 * @param {Function} listener - Callback function for the event.
	 * @param {TQSocketContentType} [contentType] - Optional content type.
	 * @param {TQSocketContentEncoding} [contentEncoding] - Optional encoding: 'raw' | 'gzip' | 'deflate'.
	 */
	public once<I extends TQSocketProtocolPayloadData, O extends TQSocketProtocolPayloadData>(
		event: string,
		listener: TQSocketListenerCallback<I, O> | ((connection: QSocketConnection) => void) | (() => void),
		contentType?: TQSocketContentType,
		contentEncoding?: TQSocketContentEncoding
	) {
		if (event === 'disconnection') {
			this.disconnectionListeners.push(listener as () => void);
		} else {
			this.addEventListener(event, listener as TQSocketListenerCallback<I, O>, EQSocketListenerType.ON, contentType, contentEncoding);
		}
	}

	/**
	 * Removes a listener for the disconnection event.
	 * @example
	 * ```typescript
	 * emitter.off('disconnection', disconnectionHandler);
	 * ```
	 * @param {string} event - Event name: 'disconnection'
	 * @param {() => void} listener - Callback function previously registered for disconnection.
	 */
	public off(event: 'disconnection', listener: () => void): void;

	/**
	 * Removes a listener for a custom event.
	 * @example
	 * ```typescript
	 * emitter.off('customEvent', customEventHandler);
	 * ```
	 * @param {string} event - Custom event name.
	 * @param {Function} listener - Callback function registered for the event.
	 */
	public off<I extends TQSocketProtocolPayloadData, O extends TQSocketProtocolPayloadData>(
		event: string,
		listener: TQSocketListenerCallback<I, O> | ((connection: QSocketConnection) => void)
	) {
		if (event === 'disconnection') {
			const index = this.disconnectionListeners.lastIndexOf(listener as () => void);
			if (index !== -1) this.disconnectionListeners.splice(index, 1);
		} else {
			this.removeEventListener(event, listener);
		}
	}
}

export abstract class QSocketNamespaceEventEmitter extends QSocketEventEmetterBase {
	/**
	 * Registers a persistent listener for the connection event.
	 * @example
	 * ```typescript
	 * emitter.on('connection', (connection: QSocketConnection) => { console.log('Connected:', connection); });
	 * ```
	 * @param {string} event - Event name: 'connection'
	 * @param {(connection: QSocketConnection) => void} listener - Callback function executed on connection.
	 */
	public on(event: 'connection', listener: (connection: QSocketConnection) => void): void;

	/**
	 * Registers a persistent listener for the disconnection event.
	 * @example
	 * ```typescript
	 * emitter.on('disconnection', () => { console.log('Disconnected'); });
	 * ```
	 * @param {string} event - Event name: 'disconnection'
	 * @param {() => void} listener - Callback function executed on disconnection.
	 */
	public on(event: 'disconnection', listener: () => void): void;

	/**
	 * Registers a persistent listener for a custom event.
	 * @example
	 * ```typescript
	 * emitter.on('customEvent', (data) => { console.log('Received data:', data); }, 'application/json', 'utf-8');
	 * ```
	 * @param {string} event - Custom event name.
	 * @param {TQSocketListenerCallback<I, O>} listener - Callback function for the custom event.
	 * @param {TQSocketContentType} [contentType] - Optional content type (e.g., 'application/json').
	 * @param {TQSocketContentEncoding} [contentEncoding] - Optional encoding (e.g., 'utf-8').
	 */
	public on<I extends TQSocketProtocolPayloadData, O extends TQSocketProtocolPayloadData>(
		event: string,
		listener: TQSocketListenerCallback<I, O>,
		contentType?: TQSocketContentType,
		contentEncoding?: TQSocketContentEncoding
	): void;

	/**
	 * Main implementation of the `on` method, determining which handler to add.
	 * @param {string} event - Event name.
	 * @param {Function} listener - Callback function for the event.
	 * @param {TQSocketContentType} [contentType] - Optional content type.
	 * @param {TQSocketContentEncoding} [contentEncoding] - Optional encoding: 'raw' | 'gzip' | 'deflate'.
	 */
	public on<I extends TQSocketProtocolPayloadData, O extends TQSocketProtocolPayloadData>(
		event: string,
		listener: TQSocketListenerCallback<I, O> | ((connection: QSocketConnection) => void) | (() => void),
		contentType?: TQSocketContentType,
		contentEncoding?: TQSocketContentEncoding
	) {
		if (event === 'connection') {
			this.connectionListeners.push(listener as (connection: QSocketConnection) => void);
			this.addConnectionListennerHandle(listener as (connection: QSocketConnection) => void);
		} else if (event === 'disconnection') {
			this.disconnectionListeners.push(listener as () => void);
		} else {
			this.addEventListener(event, listener as TQSocketListenerCallback<I, O>, EQSocketListenerType.ON, contentType, contentEncoding);
		}
	}

	/**
	 * Registers a one-time listener for the connection event.
	 * @example
	 * ```typescript
	 * emitter.once('connection', (connection: QSocketConnection) => { console.log('One-time connection:', connection); });
	 * ```
	 * @param {string} event - Event name: 'connection'
	 * @param {(connection: QSocketConnection) => void} listener - Callback function executed on connection.
	 */
	public once(event: 'connection', listener: (connection: QSocketConnection) => void): void;

	/**
	 * Registers a one-time listener for the disconnection event.
	 * @example
	 * ```typescript
	 * emitter.once('disconnection', () => { console.log('One-time disconnection'); });
	 * ```
	 * @param {string} event - Event name: 'disconnection'
	 * @param {() => void} listener - Callback function executed on disconnection.
	 */
	public once(event: 'disconnection', listener: () => void): void;

	/**
	 * Registers a one-time listener for a custom event.
	 * @example
	 * ```typescript
	 * emitter.once('customEvent', (data) => { console.log('One-time event data:', data); }, 'application/json', 'utf-8');
	 * ```
	 * @param {string} event - Custom event name.
	 * @param {TQSocketListenerCallback<I, O>} listener - Callback function for the custom event.
	 * @param {TQSocketContentType} [contentType] - Optional content type.
	 * @param {TQSocketContentEncoding} [contentEncoding] - Optional encoding: 'raw' | 'gzip' | 'deflate'.
	 */
	public once<I extends TQSocketProtocolPayloadData, O extends TQSocketProtocolPayloadData>(
		event: string,
		listener: TQSocketListenerCallback<I, O>,
		contentType?: TQSocketContentType,
		contentEncoding?: TQSocketContentEncoding
	): void;

	/**
	 * Main implementation of the `once` method, determining the addition of a one-time handler.
	 * @param {string} event - Event name.
	 * @param {Function} listener - Callback function for the event.
	 * @param {TQSocketContentType} [contentType] - Optional content type.
	 * @param {TQSocketContentEncoding} [contentEncoding] - Optional encoding: 'raw' | 'gzip' | 'deflate'.
	 */
	public once<I extends TQSocketProtocolPayloadData, O extends TQSocketProtocolPayloadData>(
		event: string,
		listener: TQSocketListenerCallback<I, O> | ((connection: QSocketConnection) => void) | (() => void),
		contentType?: TQSocketContentType,
		contentEncoding?: TQSocketContentEncoding
	) {
		if (event === 'connection') {
			this.connectionListeners.push(listener as (connection: QSocketConnection) => void);
			this.addConnectionListennerHandle(listener as (connection: QSocketConnection) => void);
		} else if (event === 'disconnection') {
			this.disconnectionListeners.push(listener as () => void);
		} else {
			this.addEventListener(event, listener as TQSocketListenerCallback<I, O>, EQSocketListenerType.ON, contentType, contentEncoding);
		}
	}

	/**
	 * Removes a listener for the connection event.
	 * @example
	 * ```typescript
	 * emitter.off('connection', connectionHandler);
	 * ```
	 * @param {string} event - Event name: 'connection'
	 * @param {(connection: QSocketConnection) => void} listener - Callback function previously registered for connection.
	 */
	public off(event: 'connection', listener: (connection: QSocketConnection) => void): void;

	/**
	 * Removes a listener for the disconnection event.
	 * @example
	 * ```typescript
	 * emitter.off('disconnection', disconnectionHandler);
	 * ```
	 * @param {string} event - Event name: 'disconnection'
	 * @param {() => void} listener - Callback function previously registered for disconnection.
	 */
	public off(event: 'disconnection', listener: () => void): void;

	/**
	 * Removes a persistent listener for a custom event.
	 * @example
	 * ```typescript
	 * emitter.off('customEvent', (data) => { console.log('Received data:', data); });
	 * ```
	 * @param {string} event - Custom event name.
	 * @param {TQSocketListenerCallback<I, O>} listener - Callback function for the custom event.
	 * @param {TQSocketContentType} [contentType] - Optional content type (e.g., 'application/json').
	 * @param {TQSocketContentEncoding} [contentEncoding] - Optional encoding 'raw' | 'gzip' | 'deflate'.
	 */
	public off<I extends TQSocketProtocolPayloadData, O extends TQSocketProtocolPayloadData>(
		event: string,
		listener: TQSocketListenerCallback<I, O>,
		contentType?: TQSocketContentType,
		contentEncoding?: TQSocketContentEncoding
	): void;
	/**
	 * Removes a listener for a custom event.
	 * @example
	 * ```typescript
	 * emitter.off('customEvent', customEventHandler);
	 * ```
	 * @param {string} event - Custom event name.
	 * @param {Function} listener - Callback function registered for the event.
	 */
	public off<I extends TQSocketProtocolPayloadData, O extends TQSocketProtocolPayloadData>(
		event: string,
		listener: TQSocketListenerCallback<I, O> | ((connection: QSocketConnection) => void)
	) {
		if (event === 'connection') {
			const index = this.connectionListeners.lastIndexOf(listener as (connection: QSocketConnection) => void);
			if (index !== -1) this.connectionListeners.splice(index, 1);
		} else if (event === 'disconnection') {
			const index = this.disconnectionListeners.lastIndexOf(listener as () => void);
			if (index !== -1) this.disconnectionListeners.splice(index, 1);
		} else {
			this.removeEventListener(event, listener);
		}
	}

	protected abstract addConnectionListennerHandle(listenner: (connection: QSocketConnection) => void): void;
}
