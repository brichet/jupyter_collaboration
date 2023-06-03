// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { URLExt } from '@jupyterlab/coreutils';
import { ServerConnection, User } from '@jupyterlab/services';
import { UUID } from '@lumino/coreutils';

import { IRTCConnection } from './tokens';

const WEB_SOCKET_URL = 'api/collaboration/chat';

export class RTCConnection implements IRTCConnection {
  constructor() {
    this._connection = new RTCPeerConnection({
      iceServers: [{ urls: ['stun:stun.1.google.com:19302'] }]
    });

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    this._receivedMessage = (message: string) => {};

    this._connection.onicecandidate = data => {
      if (data.candidate) {
        this._send({
          type: 'candidate',
          candidate: data.candidate,
          name: this._connectedTo
        });
      }
    };
    this._connection.ondatachannel = event => {
      console.log('Data channel is created!');
      const receiveChannel = event.channel;
      receiveChannel.onopen = () => {
        console.log('Data channel is open and ready to be used.');
      };
      receiveChannel.onmessage = event => {
        console.log('MESSAGE RECU', event);
        this._receivedMessage(event.data);
      };
      this._channel = receiveChannel;
    };
    // this._username = '';
    const server = ServerConnection.makeSettings();
    const url = URLExt.join(server.wsUrl, WEB_SOCKET_URL);
    this._websocket = new WebSocket(url);
    this._websocket.onmessage = (message: MessageEvent) => {
      const data = JSON.parse(message.data);
      console.log(data);
      if (data) {
        switch (data.type) {
          case 'offer':
            this.onOffer(data);
            break;
          case 'answer':
            this.onAnswer(data);
            break;
          case 'candidate':
            this.onCandidate(data);
            break;
        }
      }
    };
  }

  get connection(): RTCPeerConnection {
    return this._connection;
  }

  setReceivedMessage(fct: (message: string) => void): void {
    this._receivedMessage = fct;
  }

  sendMessage = (message: string): boolean => {
    try {
      this._channel?.send(message);
      return true;
    } catch (error) {
      console.error('The message has not been sent', error);
      return false;
    }
  };

  login(name: string) {
    this._send({ type: 'login', name: name });
  }

  handleConnection(name: string): void {
    const dataChannel = this._connection.createDataChannel(UUID.uuid4());
    dataChannel.onerror = error => {
      console.error(error);
    };
    dataChannel.onopen = () => {
      console.log('Data channel ready');
      // dataChannel?.send('CONNECTED');
    };
    dataChannel.onmessage = event => {
      console.log('MESSAGE RECU', event);
      this._receivedMessage(event.data);
    };

    this._channel = dataChannel;
    this._connection
      .createOffer()
      .then(offer => this._connection.setLocalDescription(offer))
      .then(() => {
        this._send({
          type: 'offer',
          offer: this._connection.localDescription,
          name: name
        });
      });
  }

  onOffer(data: any) {
    this._connectedTo = data.name;
    this._connection
      .setRemoteDescription(new RTCSessionDescription(data.offer))
      .then(() => this._connection.createAnswer())
      .then(answer => this._connection.setLocalDescription(answer))
      .then(() => {
        this._send({
          type: 'answer',
          answer: this._connection.localDescription,
          name: data.name
        });
      });
  }

  onAnswer(data: any) {
    this._connectedTo = data.name;
    this._connection.setRemoteDescription(
      new RTCSessionDescription(data.answer)
    );
  }

  onCandidate(data: any) {
    this._connection.addIceCandidate(new RTCIceCandidate(data.candidate));
  }

  private _send(data: any): void {
    this._websocket.send(JSON.stringify(data));
  }

  private _connection: RTCPeerConnection;
  private _websocket: WebSocket;
  private _connectedTo = '';
  private _channel: RTCDataChannel | null = null;
  private _receivedMessage: (message: string) => void;
}

namespace RTCConnection {
  export interface IOptions {
    user: User.IManager;
  }
}
