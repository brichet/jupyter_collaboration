// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.
/**
 * @packageDocumentation
 * @module chat-extension
 */

import {
  ILayoutRestorer,
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { DOMUtils } from '@jupyterlab/apputils';
import { ITranslator, nullTranslator } from '@jupyterlab/translation';

import {
  CommandIDs,
  chatIcon,
  ChatPanel,
  IWebRTCConnections,
  WebRTCConnections
} from '@jupyter/chat';
import { IGlobalAwareness } from '@jupyter/collaboration';
import { Awareness } from 'y-protocols/awareness';

/**
 * The webRTC provider.
 */
export const webRTCConnection: JupyterFrontEndPlugin<IWebRTCConnections> = {
  id: '@jupyter/collaboration-extension:rtcProvider',
  description: 'The webRTC connection',
  autoStart: true,
  provides: IWebRTCConnections,
  activate: (app: JupyterFrontEnd): IWebRTCConnections => {
    const { user } = app.serviceManager;
    const connection = new WebRTCConnections();

    Promise.all([app.restored, user.ready]).then(() => {
      connection.login(user.identity!.username);
    });
    return connection;
  }
};

/**
 * The default collaborative chat panel.
 */
export const chat: JupyterFrontEndPlugin<void> = {
  id: '@jupyter/collaboration-extension:chat',
  description: 'The default chat panel',
  requires: [IGlobalAwareness, IWebRTCConnections],
  optional: [ITranslator, ILayoutRestorer],
  autoStart: true,
  activate: (
    app: JupyterFrontEnd,
    awareness: Awareness,
    webRTCConnection: IWebRTCConnections,
    translator: ITranslator,
    restorer: ILayoutRestorer
  ): void => {
    const { user } = app.serviceManager;
    const trans = (translator ?? nullTranslator).load('jupyter_collaboration');

    const panel = new ChatPanel({
      translator,
      currentUser: user,
      awareness: awareness,
      send: webRTCConnection.sendMessage
    });

    webRTCConnection.setReceivedMessage(panel.onMessageReceived);
    panel.id = DOMUtils.createDomID();
    panel.title.caption = trans.__('Collaboration');
    panel.title.icon = chatIcon;
    app.shell.add(panel, 'right', { rank: 300 });

    restorer.add(panel, 'chat-panel');
  }
};

/**
 * The chat commands.
 */
export const chatCommands: JupyterFrontEndPlugin<void> = {
  id: '@jupyter/collaboration-extension:chat-commands',
  description: 'The default chat commands',
  requires: [IWebRTCConnections],
  optional: [ITranslator],
  autoStart: true,
  activate: (
    app: JupyterFrontEnd,
    webRTCConnection: IWebRTCConnections,
    translator: ITranslator
  ) => {
    const { commands } = app;
    const trans = (translator ?? nullTranslator).load('jupyter_collaboration');

    commands.addCommand(CommandIDs.offer, {
      label: trans.__('Offer chat communication'),
      execute: async args => {
        const user = (args?.user as string) || undefined;
        if (user) {
          webRTCConnection.handleConnection(user);
        }
      }
    });
  }
};
