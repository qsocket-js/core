//#region Импорт модулей ядра Q-SOCKET
import QSocketBase from './QSocketBase';
import { TQSocketServer, TQSocketServerSocket } from '@/@types/transport';
import { IQSocketDebugConfig } from '@/@types/shared';
import { IQSocketConfig } from '@/@types/shared';
//#endregion

export default class QSocketServer extends QSocketBase {
	private server: TQSocketServer;
	constructor(transport: TQSocketServer, protocolConfig: IQSocketConfig, debugConfig?: IQSocketDebugConfig) {
		super('server', protocolConfig, debugConfig);
		this.server = transport;
		this.server.on('connection', (socket: any) => this.connectionHandle(socket as unknown as TQSocketServerSocket));
	}
	protected override joinNamespaceHandle() {}
}
