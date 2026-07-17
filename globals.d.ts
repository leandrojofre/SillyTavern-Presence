declare namespace Presence {
    interface ChatMessageExtended extends ChatMessage {
        present?: string[];
        presence_manually_hidden?: boolean;
    };

    interface SillyTavernContext extends ReturnType<typeof SillyTavern.getContext> {
        chat: ChatMessageExtended[];
    };

    type UILocationOption = 'top' | 'bottom';

    type ExtensionSettings = {
        enabled: boolean;
        location: UILocationOption;
        seeLast: boolean;
        includeMuted: boolean;
        disableTransition: boolean;
        debug: boolean;
    };

    type MessageIdChunk = {
        start?: number;
        end?: number;
    };

    type HTMLTemplateGetOptions = {
        clone?: boolean;
    };
};