import EventEmitter from 'events';
import { EventMessage, isEventMessage, ResponseMessage } from './messages';
import { TransportConnect } from './transport_connect';
import { TransportSocket } from './transport_socket';
import { createLogger } from '@aztec/barretenberg/debug';

const debug = createLogger('aztec:transport_client');

interface PendingRequest {
  msgId: number;
  resolve(data: any): void;
  reject(error: Error): void;
}

export interface TransportClient<Payload> extends EventEmitter {
  on(name: 'event_msg', handler: (payload: Payload) => void): this;
  emit(name: 'event_msg', payload: Payload): boolean;
}

/**
 * A TransportClient provides a request/response and event api to a corresponding TransportServer.
 * If `broadcast` is called on TransportServer, TransportClients will emit an `event_msg`.
 * The `request` method will block until a response is returned from the TransportServer's dispatch function.
 * Request multiplexing is supported.
 */
export class TransportClient<Payload> extends EventEmitter {
  private msgId = 0;
  private pendingRequests: PendingRequest[] = [];
  private socket?: TransportSocket;

  constructor(private transportConnect: TransportConnect) {
    super();
  }

  async open() {
    this.socket = await this.transportConnect.createSocket();
    this.socket.registerHandler(msg => this.handleSocketMessage(msg));
  }

  close() {
    this.socket?.close();
    this.removeAllListeners();
  }

  async request(payload: Payload) {
    if (!this.socket) {
      throw new Error('Socket not open.');
    }
    const msgId = this.msgId++;
    const msg = { msgId, payload };
    debug(`->`, msg);
    return new Promise<any>((resolve, reject) => {
      this.pendingRequests.push({ resolve, reject, msgId });
      this.socket!.send(msg);
    });
  }

  private async handleSocketMessage(msg: ResponseMessage<Payload> | EventMessage<Payload>) {
    debug(`<-`, msg);
    if (isEventMessage(msg)) {
      this.emit('event_msg', msg.payload);
      return;
    }
    const reqIndex = this.pendingRequests.findIndex(r => r.msgId === msg.msgId);
    if (reqIndex === -1) {
      return;
    }
    const [pending] = this.pendingRequests.splice(reqIndex, 1);
    if (msg.error) {
      pending.reject(new Error(msg.error));
    } else {
      pending.resolve(msg.payload);
    }
  }
}
