//#region Импорт модулей ядра Q-SOCKET
import QSocketBase from './QSocketBase';
import { TQSocketServer, TQSocketServerSocket } from '@/@types/transport';
import { IQSocketDebugConfig } from '@/@types/general';
//#endregion

export default class QSocketServer extends QSocketBase {
	private server: TQSocketServer;
	constructor(transport: TQSocketServer, debugConfig?: IQSocketDebugConfig) {
		super('server', debugConfig);
		this.server = transport;
		this.server.on('connection', (socket: any) => this.connectionHandle(socket as unknown as TQSocketServerSocket, this));
	}

	protected override namespaceHandle() {
		// Ничего не делает, так как на стороне сервера не требуется действий после инициализации пространства имён
	}
}
