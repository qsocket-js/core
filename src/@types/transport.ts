import type {
	IQSocketTransportEIOLatestSocket,
	IQSocketTransportEIOV3Socket,
	IQSocketTransportEIOClientLatestSocket,
	IQSocketTransportEIOClientV3Socket,
	IQSocketTransportEIOV3Server,
	IQSocketTransportEIOLatestServer,
} from '@qsocket/transport';

export type TQSocketServer = IQSocketTransportEIOLatestServer | IQSocketTransportEIOV3Server;
export type TQSocketClientSocket = IQSocketTransportEIOClientLatestSocket | IQSocketTransportEIOClientV3Socket;
export type TQSocketServerSocket = IQSocketTransportEIOLatestSocket | IQSocketTransportEIOV3Socket;
export type TQSocketInteractionInstance = TQSocketClientSocket | TQSocketServerSocket;

export type IQSocketControlData =
	| {
			command: 'join-namespace';
			namespace: string;
	  }
	| {
			command: 'leave-from-namespace';
			namespace: string;
	  }
	| {
			command: 'ping';
	  };
