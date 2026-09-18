export function isAllowedChat(chatId: number | undefined, allowedChatId: number | undefined): boolean {
  if (!allowedChatId) return false;
  return chatId === allowedChatId;
}
