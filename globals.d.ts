declare namespace Presence {
    interface ChatMessageExtended extends ChatMessage {
        present?: string[];
        presence_manually_hidden?: boolean;
    };

    interface ChatMetadataExtended extends ChatMetadata {
        ignore_presence?: string[];
        presence_extension?: ExtensionMetadata;
    };

    interface SillyTavernContext extends ReturnType<typeof SillyTavern.getContext> {
        chat: ChatMessageExtended[];
        chatMetadata: ChatMetadataExtended;
    };

    type PresenceModes = 'present' | 'ignore' | 'on_status_detached'

    type UILocationOption = 'top' | 'bottom';

    type ExtensionSettings = {
        enabled: boolean;
        location: UILocationOption;
        seeLast: boolean;
        includeMuted: boolean;
        disableTransition: boolean;
        minMessageDisplay: number;
        debug: boolean;
    };

    type MessageIdChunk = {
        start?: number;
        end?: number;
    };

    type HTMLTemplateGetOptions = {
        clone?: boolean;
    };

    type GlobalInterfaceExtensions = {
        StatUsMaximus?: ExternalExtension<'StatUsMaximus'>;
    };

    type ExternalExtension<Name extends keyof GlobalInterfaceExtensions = keyof GlobalInterfaceExtensions> = import('./src/classes/ExternalExtension.js').ExternalExtension<Name>;

    type GlobalInterface = {
        extensions: GlobalInterfaceExtensions,
        ext: <K extends keyof GlobalInterfaceExtensions> (key: K) => GlobalInterfaceExtensions[K]
        metadata: <K extends keyof ExtensionMetadata> (key: K, value?: ExtensionMetadata[K]) => ExtensionMetadata[K];
        addPresenceMode: (mode: PresenceModes) => void;
        toggleVisibilityAllMessages: typeof import('./index.js').toggleVisibilityAllMessages;
        hideChatMessageRange: typeof import('./index.js').hideChatMessageRange;
        getMessageIdChunks: typeof import('./index.js').getMessageIdChunks;
        log: (...args: any) => void;
        debug: (...args: any) => void;
        error: (...args: any) => void;
        extensionName: 'Presence';
        presenceModes: Map<PresenceModes, PresenceModes>;
    };

    type ExtensionMetadata = {
        char_mode: Record<string, PresenceModes>;
    };

    type CommonTrackingButtonSetting = {
        title: string;
    };
};