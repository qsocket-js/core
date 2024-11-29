export type TQSocketServer = any;
export type TQSocketClientSocket = any;
export type TQSocketServerSocket = any;
export type TQSocketInteractionInstance = any;

export type IQSocketControlData =
	| {
			command: 'join-namespace';
			namespace: string;
	  }
	| {
			command: 'leave-namespace';
			namespace: string;
	  }
	| {
			command: 'handshake';
			handshake: string;
	  }
	| {
			command: 'ping';
	  };
