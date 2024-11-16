export type TMakeRequired<T> = {
	[K in keyof T]-?: T[K];
};
