import { log, onChatChanged, onGenerationAfterCommands, onNewMessage, toggleVisibilityAllMessages, isActive } from "../../index.js";
import { event_types, eventSource } from "../../../../../../script.js";

export function startListeners() {
    eventSource.on(event_types.CHAT_CHANGED, async function (...args) {
        log("CHAT_CHANGED", args);

        if (!isActive()) return;

        onChatChanged();
    });

    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, async function (...args) {
        log("CHARACTER_MESSAGE_RENDERED", args);

        if (!isActive()) return;

        onChatChanged();
    });

    eventSource.on(event_types.USER_MESSAGE_RENDERED, async function (...args) {
        log("USER_MESSAGE_RENDERED", args);

        if (!isActive()) return;
       
        onChatChanged();
    });

    eventSource.on(event_types.GENERATION_AFTER_COMMANDS, async function (...args) {
        log("GENERATION_AFTER_COMMANDS", args);

        if (!isActive()) return;
       
        await onGenerationAfterCommands(...args);
    });

    eventSource.makeFirst(event_types.MESSAGE_RECEIVED, async function (...args) {
        log("MESSAGE_RECEIVED", args);

        if (!isActive()) return;
       
        await onNewMessage(...args);
        await toggleVisibilityAllMessages(true);
    });

    eventSource.makeLast(event_types.MESSAGE_SENT, async function (...args) {
        log("MESSAGE_SENT", args);

        if (!isActive()) return;
       
        await onNewMessage(...args);
    });

    eventSource.makeFirst(event_types.GENERATION_STOPPED, async function (...args) {
        log("GENERATION_STOPPED", args);

        if (!isActive()) return;
       
        await toggleVisibilityAllMessages(true);
    });
}
