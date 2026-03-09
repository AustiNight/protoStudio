import { create } from 'zustand';

import type { ChatMessage, MessageSender } from '../types/chat';
import type { TelemetryMessageRole } from '../types/telemetry';
import { useTelemetryStore } from './telemetry-store';
import { studioLog } from '../utils/studio-logger';

export interface ChatStoreState {
  messages: ChatMessage[];
  addMessage: (message: ChatMessage) => void;
  addMessages: (messages: ChatMessage[]) => void;
  setMessages: (messages: ChatMessage[]) => void;
  clearMessages: () => void;
  resetStore: () => void;
}

const initialState: Pick<ChatStoreState, 'messages'> = {
  messages: [],
};

export const createChatStore = () =>
  create<ChatStoreState>((set) => ({
    ...initialState,
    addMessage: (message) => {
      set((state) => ({
        messages: [...state.messages, message],
      }));
      studioLog({
        level: message.sender === 'system' ? 'warn' : 'info',
        source: `chat.${message.sender}`,
        sessionId: message.sessionId,
        timestamp: message.timestamp,
        message: message.content,
      });
      const role = toTelemetryRole(message.sender);
      if (role) {
        const telemetry = useTelemetryStore.getState();
        void telemetry.recordMessage({
          sessionId: message.sessionId,
          role,
          charCount: message.content.length,
          timestamp: message.timestamp,
        });
      }
    },
    addMessages: (messages) => {
      set((state) => ({
        messages: [...state.messages, ...messages],
      }));
      for (const message of messages) {
        studioLog({
          level: message.sender === 'system' ? 'warn' : 'info',
          source: `chat.${message.sender}`,
          sessionId: message.sessionId,
          timestamp: message.timestamp,
          message: message.content,
        });
      }
      const telemetry = useTelemetryStore.getState();
      for (const message of messages) {
        const role = toTelemetryRole(message.sender);
        if (!role) {
          continue;
        }
        void telemetry.recordMessage({
          sessionId: message.sessionId,
          role,
          charCount: message.content.length,
          timestamp: message.timestamp,
        });
      }
    },
    setMessages: (messages) =>
      set(() => ({
        messages: [...messages],
      })),
    clearMessages: () =>
      set(() => ({
        messages: [],
      })),
    resetStore: () =>
      set(() => ({
        messages: [],
      })),
  }));

export const useChatStore = createChatStore();

export const selectMessages = (state: ChatStoreState) => state.messages;
export const selectMessageCount = (state: ChatStoreState) => state.messages.length;
export const selectLastMessage = (state: ChatStoreState) =>
  state.messages.length > 0 ? state.messages[state.messages.length - 1] : null;

function toTelemetryRole(sender: MessageSender): TelemetryMessageRole | null {
  if (sender === 'user') {
    return 'user';
  }
  if (sender === 'chat_ai') {
    return 'assistant';
  }
  return null;
}
