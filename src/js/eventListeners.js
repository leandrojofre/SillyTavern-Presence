import { log, onChatChanged, onGenerationAfterCommands, onNewMessage, toggleVisibilityAllMessages } from "../../index.js";
import { event_types, eventSource } from "../../../../../../script.js";

async function messageSent(...args) {
    log("MESSAGE_SENT", args);
    await onNewMessage(...args);
    return;
}

async function generationStopped(...args) {
    log("GENERATION_STOPPED", args);
    await toggleVisibilityAllMessages(true);
    return;
}

async function messageReceived(...args) {
    log("MESSAGE_RECEIVED", args);
    await onNewMessage(...args);
    await toggleVisibilityAllMessages(true);
    return;
};

export function startListeners() {
    eventSource.on(event_types.CHAT_CHANGED, async (...args) => {
        log("CHAT_CHANGED", args);
        onChatChanged();
        return;
    });

    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, async (...args) => {
        log("CHARACTER_MESSAGE_RENDERED", args);
        onChatChanged();
        return;
    });

    eventSource.on(event_types.USER_MESSAGE_RENDERED, async (...args) => {
        log("USER_MESSAGE_RENDERED", args);
        onChatChanged();
        return;
    });

    eventSource.on(event_types.GENERATION_AFTER_COMMANDS, async (...args) => {
        log("GENERATION_AFTER_COMMANDS", args);
        await onGenerationAfterCommands(...args);
        return;
    });

    eventSource.on(event_types.MESSAGE_RECEIVED, messageReceived);
    eventSource.makeFirst(event_types.MESSAGE_RECEIVED, messageReceived);

    eventSource.on(event_types.MESSAGE_SENT, messageSent);
    eventSource.makeLast(event_types.MESSAGE_SENT, messageSent);

    eventSource.on(event_types.GENERATION_STOPPED, generationStopped);
    eventSource.makeFirst(event_types.GENERATION_STOPPED, generationStopped);
}
