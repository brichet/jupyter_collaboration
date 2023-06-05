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

  get peers(): Map<string, IPeer> {
    return this._peers;
  }

  setReceivedMessage(fct: (message: string) => void): void {
    this._receivedMessage = fct;
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

  login(name: string) {
    this._send({ type: 'login', name: name });
  }

  handleConnection(name: string): void {
    this._addConnection(name, true);
    console.log('PEERS', this._peers);
  }

  onOffer(data: any) {
    console.log('OFFER', data);
    this._addConnection(data.name);
    const connection = this._peers.get(data.name)?.connection;
    console.log('Connection found', connection);
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
    console.log('ANSWER', data);
    const connection = this._peers.get(data.name)?.connection;
    console.log('Connection found', connection);
    connection?.setRemoteDescription(new RTCSessionDescription(data.answer));
  }

  onCandidate(data: any) {
    console.log('ICE CANDIDATE', data);
    const connection = this._peers.get(data.name)?.connection;
    console.log('Connection found', connection);
    connection?.addIceCandidate(new RTCIceCandidate(data.candidate));
  }

  private _addConnection(name: string, createOffer = false) {
    const connection = new RTCPeerConnection({
      iceServers: [{ urls: ['stun:stun.1.google.com:19302'] }]
    });
    connection.onicecandidate = data => {
      console.log('ICE candidate received', data);
      if (data.candidate) {
        this._send({
          type: 'candidate',
          candidate: data.candidate,
          name: name
        });
      }
    };
    connection.ondatachannel = event => {
      console.log('Data Channel received', this._peers);
      this._addChannel(name, event.channel);
    };
    this._peers.set(name, { ...this._peers.get(name), connection });
    console.log('Peer connection added', name, connection);
    console.log('PEERS', this._peers);
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
      console.log(`Data channel with ${name} ready.`);
    };
    channel.onmessage = event => {
      this._receivedMessage(event.data);
    };
    channel.onclose = event => {
      this._peers.delete(name);
      console.log('CLOSE PEERS', this._peers);
    };
    this._peers.set(name, { ...this._peers.get(name), channel });
    console.log('Peer channel added', name, channel);
    console.log('PEERS', this._peers);
  }

  private _send(data: any): void {
    this._websocket.send(JSON.stringify(data));
  }

  private _peers = new Map<string, IPeer>();
  private _websocket: WebSocket;
  private _receivedMessage: (message: string) => void;
}
