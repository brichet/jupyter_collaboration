// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { User } from '@jupyterlab/services';
import { ITranslator } from '@jupyterlab/translation';
import { LabIcon, SidePanel, caretRightIcon } from '@jupyterlab/ui-components';
import { Panel, Widget } from '@lumino/widgets';
import { Awareness } from 'y-protocols/awareness';
import { ICollaboratorAwareness } from '@jupyter/collaboration';

import chatSvgstr from '../style/icons/chat.svg';

/**
 * The icon for the chat panel.
 */
export const chatIcon = new LabIcon({
  name: 'collaboration:chat',
  svgstr: chatSvgstr
});

/**
 * The chat panel widget.
 */
export class ChatPanel extends SidePanel {
  /**
   * The constructor of the panel.
   */
  constructor(options: ChatPanel.IOptions) {
    super({ content: new Panel(), translator: options.translator });
    this._user = options.currentUser;
    this._awareness = options.awareness;
    this._send = options.send;
    this.addClass('jp-ChatPanel');

    this._messages.addClass('jp-ChatPanel-messages');
    this.addWidget(this._messages);
    this.addWidget(new Widget({ node: this._prompt }));

    console.log('USER', options.currentUser);
    console.log('awarness', options.awareness);
    this._awareness.on('change', this._onAwarenessChanged);
  }

  /**
   * Add a new message in the list.
   * @param messageContent - Content and metadata of the message.
   */
  onMessageReceived = (messageContent: string): void => {
    const message = JSON.parse(messageContent) as ChatPanel.IMessage;
    message.date = new Date(message.date);

    let index = this._messages.widgets.length;
    for (const msg of this._messages.widgets.slice(1).reverse()) {
      if (message.date > (msg as ChatMessage).date) {
        break;
      }
      index -= 1;
    }

    this._messages.insertWidget(index, new ChatMessage(message, this._user));
  };

  /**
   * Send a new message.
   * @param message - The message content.
   */
  send = (message: ChatPanel.IMessage): void => {
    if (!message) {
      return;
    }
    const msgStr = JSON.stringify(message);
    if (this._send(msgStr)) {
      this.onMessageReceived(msgStr);
    }
  };

  /**
   * Handle collaborator change.
   */
  private _onAwarenessChanged = () => {
    const state = this._awareness.getStates() as any;
    const collaborators: ICollaboratorAwareness[] = [];

    state.forEach((value: ICollaboratorAwareness, key: any) => {
      if (this._user.isReady && value.user.name !== this._user.identity!.name) {
        collaborators.push(value);
      }
    });
  };

  /**
   * Build the prompt div.
   */
  private get _prompt(): HTMLDivElement {
    const div = document.createElement('div');
    div.classList.add('jp-ChatPanel-prompt');

    const input = document.createElement('div');
    input.role = 'textarea';
    input.contentEditable = 'true';
    input.onkeydown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && e.ctrlKey && input.textContent) {
        this.send({
          user: this._user.identity,
          date: new Date(),
          content: input.textContent
        });
        input.textContent = '';
      }
    };

    // input.setAttribute('placeholder', 'Send a message...');
    // input.onclick = () => input.focus();

    const buttonContainer = document.createElement('div');
    buttonContainer.classList.add('jp-ChatPanel-promptButton');
    const button = document.createElement('button');
    const icon = LabIcon.resolveSvg(caretRightIcon);
    if (icon) {
      icon.style.width = '24px';
      button.appendChild(icon);
    } else {
      const span = document.createElement('span');
      span.innerText = 'Send';
      button.appendChild(span);
    }
    button.classList.add('jp-mod-minimal');
    button.classList.add('jp-Button');
    button.onclick = () => {
      if (input.textContent) {
        this.send({
          user: this._user.identity,
          date: new Date(),
          content: input.textContent
        });
        input.textContent = '';
      }
    };
    buttonContainer.append(button);

    div.append(input);
    div.append(buttonContainer);
    return div;
  }

  private _user: User.IManager;
  private _awareness: Awareness;
  private _send: (message: string) => boolean;
  private _messages = new Panel();
}

/**
 * The message widget.
 */
class ChatMessage extends Widget {
  /**
   * The constructor of the message object.
   * @param message - Content and metadata of the message.
   * @param user - The current connected user.
   */
  constructor(message: ChatPanel.IMessage, user: User.IManager) {
    super();
    this._message = message;
    this.addClass('jp-ChatPanel-message');
    this.node.appendChild(this._header(user));
    this.node.appendChild(this._content());
  }

  /**
   * Get the date of the message.
   */
  get date(): Date {
    return this._message.date;
  }

  /**
   * Build the header of the message.
   * @param currentUser - The current connected user.
   * @returns - The div element containing the header.
   */
  private _header(currentUser: User.IManager): HTMLDivElement {
    const header = document.createElement('div');
    const user = document.createElement('div');
    user.innerText =
      currentUser.identity?.username === this._message.user?.username
        ? 'You'
        : this._message.user?.display_name || '???';
    user.style.color = this._message.user?.color || 'inherit';
    header.append(user);

    const date = document.createElement('div');
    date.classList.add('jp-ChatPanel-messageDate');
    console.log(this._message);
    date.innerText = `${this._message.date.toLocaleDateString()} ${this._message.date.toLocaleTimeString()}`;
    header.append(date);
    return header;
  }

  /**
   * Build the content of the message.
   * @returns - The div element containing the message.
   */
  private _content(): HTMLDivElement {
    const message = document.createElement('div');
    message.classList.add('jp-ChatPanel-messageContent');
    message.innerText = this._message.content;
    return message;
  }

  private _message: ChatPanel.IMessage;
}

/**
 * The chat panel namespace.
 */
export namespace ChatPanel {
  /**
   * Options to use when building the chat panel.
   */
  export interface IOptions {
    awareness: Awareness;
    currentUser: User.IManager;
    send: (message: string) => boolean;
    translator?: ITranslator;
  }

  /**
   * The message content.
   */
  export interface IMessage {
    user: User.IIdentity | null;
    date: Date;
    content: string;
  }
}
