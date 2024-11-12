/** Максимально допустимое значение для UUID индекса */
const MAX_VALUE = Number.MAX_SAFE_INTEGER;

/**
 * Класс для генерации уникальных идентификаторов (UUID), с возможностью добавления префикса.
 */
export default class QSocketUniqueGenerator<T extends string = ''> {
	/**
	 * Текущий индекс для генерации UUID.
	 * @private
	 */
	private uuidIndex: number = 0;

	private prefix: T;

	constructor(prefix: T = '' as T) {
		this.prefix = prefix;
	}

	/**
	 * Метод для генерации следующего уникального идентификатора.
	 */
	public next(): `${T}${string}` {
		if (++this.uuidIndex > MAX_VALUE) this.uuidIndex = 0;
		return `${this.prefix}${this.uuidIndex.toString(16)}`;
	}
}
