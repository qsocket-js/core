/**
 * @description Ошибки
 */
export default class QSocketError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'QSocketError';
	}
}
