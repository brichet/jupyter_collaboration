// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { Token } from '@lumino/coreutils';

export namespace CommandIDs {
  /**
   * Offer a peer to peer connection.
   */
  export const offer = 'chat:offer';
}

export interface IWebRTCConnections {
  handleConnection(name: string): void;
  sendMessage(message: string): boolean[];
  setReceivedMessage(fct: (message: string) => void): void;
  readonly peers: Map<string, IPeer>;
}

export interface IPeer {
  connection?: RTCPeerConnection;
  channel?: RTCDataChannel;
}

export const IWebRTCConnections = new Token<IWebRTCConnections>(
  '@jupyter/collaboration:IRTCConnection'
);
