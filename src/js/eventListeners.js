import { log, onChatChanged, onGenerationAfterCommands, onNewMessage, toggleVisibilityAllMessages } from "../../index.js";
import { event_types, eventSource } from "../../../../../../script.js";

export function startListeners() {
    eventSource.on(event_types.CHAT_CHANGED, async function (...args) {
        log("CHAT_CHANGED", args);
        onChatChanged();
    });

    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, async function (...args) {
        log("CHARACTER_MESSAGE_RENDERED", args);
        onChatChanged();
    });

    eventSource.on(event_types.USER_MESSAGE_RENDERED, async function (...args) {
        log("USER_MESSAGE_RENDERED", args);
        onChatChanged();
    });

    eventSource.on(event_types.GENERATION_AFTER_COMMANDS, async function (...args) {
        log("GENERATION_AFTER_COMMANDS", args);
        await onGenerationAfterCommands(...args);
    });

    eventSource.makeFirst(event_types.MESSAGE_RECEIVED, async function (...args) {
        log("MESSAGE_RECEIVED", args);
        await onNewMessage(...args);
        await toggleVisibilityAllMessages(true);
    });

    eventSource.makeLast(event_types.MESSAGE_SENT, async function (...args) {
        log("MESSAGE_SENT", args);
        await onNewMessage(...args);
    });

    eventSource.makeFirst(event_types.GENERATION_STOPPED, async function (...args) {
        log("GENERATION_STOPPED", args);
        await toggleVisibilityAllMessages(true);
    });
}
