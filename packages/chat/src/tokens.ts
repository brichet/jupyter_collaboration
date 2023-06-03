// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { Token } from '@lumino/coreutils';

export namespace CommandIDs {
  /**
   * Offer a peer to peer connection.
   */
  export const offer = 'chat:offer';
}

export interface IRTCConnection {
  handleConnection(name: string): void;
  sendMessage(message: string): void;
  setReceivedMessage(fct: (message: string) => void): void;
  readonly connection: RTCPeerConnection;
}

export const IRTCConnection = new Token<IRTCConnection>(
  '@jupyter/collaboration:IRTCConnection'
);
