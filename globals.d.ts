declare namespace Presence {
    type UILocationOption = 'top' | 'bottom';

    type ExtensionSettings = {
        enabled: boolean;
        location: UILocationOption;
        seeLast: boolean;
        includeMuted: boolean;
        disableTransition: boolean;
        debug: boolean;
    };

    type ChatMessageExtended = ChatMessage & {
        present?: string[];
        presence_manually_hidden?: boolean;
    };

    type MessageIdChunk = {
        start?: number;
        end?: number;
    };

    type HTMLTemplateGetOptions = {
        clone?: boolean;
    };
};