// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { URLExt } from '@jupyterlab/coreutils';
import { ServerConnection } from '@jupyterlab/services';
import { UUID } from '@lumino/coreutils';

import { IPeer, IWebRTCConnections as IWebRTCConnections } from './tokens';

const WEB_SOCKET_URL = 'api/collaboration/chat';

export class WebRTCConnections implements IWebRTCConnections {
  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    this._receivedMessage = (message: string) => {};
    const server = ServerConnection.makeSettings();
    const url = URLExt.join(server.wsUrl, WEB_SOCKET_URL);
    this._websocket = new WebSocket(url);
    this._websocket.onmessage = (message: MessageEvent) => {
      const data = JSON.parse(message.data);
      console.debug('ONMESSAGE', data);
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

  get peers(): Map<string, IPeer> {
    return this._peers;
  }

  setReceivedMessage(fct: (message: string) => void): void {
    this._receivedMessage = fct;
  }

  login(name: string) {
    this._send({ type: 'login', name: name });
  }

  sendMessage = (message: string): boolean[] => {
    const status: boolean[] = [];
    this._peers.forEach(peer => {
      if (peer.channel) {
        try {
          peer.channel.send(message);
          status.push(true);
        } catch (error) {
          console.error('The message has not been sent', error);
          status.push(false);
        }
      } else {
        status.push(false);
      }
    });
    return status;
  };

  handleConnection = (name: string): boolean => {
    this._addConnection(name, true);
    return !!this._peers.get(name);
  };

  onOffer(data: any) {
    console.debug('OFFER', data);
    this._addConnection(data.name);
    const connection = this._peers.get(data.name)?.connection;
    connection
      ?.setRemoteDescription(new RTCSessionDescription(data.offer))
      .then(() => connection.createAnswer())
      .then(answer => connection.setLocalDescription(answer))
      .then(() => {
        this._send({
          type: 'answer',
          answer: connection.localDescription,
          name: data.name
        });
      });
  }

  onAnswer(data: any) {
    console.debug('ANSWER', data);
    const connection = this._peers.get(data.name)?.connection;
    connection?.setRemoteDescription(new RTCSessionDescription(data.answer));
  }

  onCandidate(data: any) {
    console.debug('ICE CANDIDATE', data);
    const connection = this._peers.get(data.name)?.connection;
    connection?.addIceCandidate(new RTCIceCandidate(data.candidate));
  }

  private _addConnection(name: string, createOffer = false) {
    if (this._peers.get(name)?.connection) {
      this._peers.delete(name);
    }

    const connection = new RTCPeerConnection({
      iceServers: [{ urls: ['stun:stun.1.google.com:19302'] }]
    });
    connection.onicecandidate = data => {
      console.debug('ICE candidate received', data);
      if (data.candidate) {
        this._send({
          type: 'candidate',
          candidate: data.candidate,
          name: name
        });
      }
    };
    connection.ondatachannel = event => {
      console.debug('Data Channel received', this._peers);
      this._addChannel(name, event.channel);
    };
    this._peers.set(name, { ...this._peers.get(name), connection });
    if (createOffer) {
      const dataChannel = connection.createDataChannel(UUID.uuid4());
      this._addChannel(name, dataChannel);
      connection
        .createOffer()
        .then(offer => connection.setLocalDescription(offer))
        .then(() => {
          this._send({
            type: 'offer',
            offer: connection.localDescription,
            name: name
          });
        });
    }
  }

  private _addChannel(name: string, channel: RTCDataChannel) {
    channel.onopen = () => {
      console.debug(`Data channel with ${name} ready.`);
    };
    channel.onmessage = event => {
      this._receivedMessage(event.data);
    };
    channel.onclose = event => {
      this._peers.delete(name);
    };
    this._peers.set(name, { ...this._peers.get(name), channel });
  }

  private _send(data: any): void {
    this._websocket.send(JSON.stringify(data));
  }

  private _peers = new Map<string, IPeer>();
  private _websocket: WebSocket;
  private _receivedMessage: (message: string) => void;
}
