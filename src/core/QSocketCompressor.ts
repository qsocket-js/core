import { TQSocketProtocolCompressor } from '@qsocket/protocol';
import zlib from 'zlib';

export default class QSocketCompressor implements TQSocketProtocolCompressor {
	/**
	 * Compresses data using the GZIP algorithm.
	 * @param data Data to be compressed.
	 * @returns A promise that resolves to the compressed data.
	 */
	async toGzip(data: Buffer | Uint8Array): Promise<Buffer | Uint8Array> {
		return new Promise((resolve, reject) => {
			zlib.gzip(data, (error, result) => {
				if (error) {
					reject(new Error(`GZIP compression failed: ${error.message}`));
				} else {
					resolve(result);
				}
			});
		});
	}

	/**
	 * Decompresses data that was compressed with the GZIP algorithm.
	 * @param data Compressed data.
	 * @returns A promise that resolves to the decompressed data.
	 */
	async fromGzip(data: Buffer | Uint8Array): Promise<Buffer | Uint8Array> {
		return new Promise((resolve, reject) => {
			zlib.gunzip(data, (error, result) => {
				if (error) {
					reject(new Error(`GZIP decompression failed: ${error.message}`));
				} else {
					resolve(result);
				}
			});
		});
	}

	/**
	 * Compresses data using the DEFLATE algorithm.
	 * @param data Data to be compressed.
	 * @returns A promise that resolves to the compressed data.
	 */
	async toDeflate(data: Buffer | Uint8Array): Promise<Buffer | Uint8Array> {
		return new Promise((resolve, reject) => {
			zlib.deflate(data, (error, result) => {
				if (error) {
					reject(new Error(`DEFLATE compression failed: ${error.message}`));
				} else {
					resolve(result);
				}
			});
		});
	}

	/**
	 * Decompresses data that was compressed with the DEFLATE algorithm.
	 * @param data Compressed data.
	 * @returns A promise that resolves to the decompressed data.
	 */
	async fromDeflate(data: Buffer | Uint8Array): Promise<Buffer | Uint8Array> {
		return new Promise((resolve, reject) => {
			zlib.inflate(data, (error, result) => {
				if (error) {
					reject(new Error(`DEFLATE decompression failed: ${error.message}`));
				} else {
					resolve(result);
				}
			});
		});
	}
}
