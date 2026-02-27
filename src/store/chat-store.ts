import { create } from 'zustand';

import type { ChatMessage } from '../types/chat';

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
    addMessage: (message) =>
      set((state) => ({
        messages: [...state.messages, message],
      })),
    addMessages: (messages) =>
      set((state) => ({
        messages: [...state.messages, ...messages],
      })),
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
