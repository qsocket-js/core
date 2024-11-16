//#region Импорт типов
import type { TQSocketServer, TQSocketServerSocket } from '@/@types/transport';
import type { IQSocketServerConfig } from '@/@types/shared';
//#endregion

//#region Импорт базового класса
import QSocketBase from './QSocketBase';
//#endregion

export default class QSocketServer extends QSocketBase {
	private server: TQSocketServer;

	constructor(transport: TQSocketServer, config: IQSocketServerConfig) {
		super('server', config);
		this.server = transport;
		this.server.on('connection', (socket: any) => this.connectionHandle(socket as unknown as TQSocketServerSocket));
	}
}
