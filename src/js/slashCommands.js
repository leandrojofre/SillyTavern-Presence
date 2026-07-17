import {
    log,
    debug,
    warn,
    addPresenceTrackerToMessages,
    getCurrentParticipants,
    context,
    isActive,
    saveChatDebounced,
    t,
} from "../../index.js";

import { commonEnumProviders } from "../../../../../slash-commands/SlashCommandCommonEnumsProvider.js";
import { stringToRange } from "../../../../../utils.js";

/** @typedef {Presence.ChatMessageExtended} ChatMessageExtended */

// * MARK:Methods

function sanitizeCharID(str) {
    return str.replace(/(\.[\w\d]+)$/i, '');
}

/**
 * @param {string} search
 * @param {object} [options]
 * @param {boolean} [options.allowAvatar]
 * @param {boolean} [options.preferMembers]
 * @return {Character}
 */
function findCharacter(search, {allowAvatar = true} = {}) {
    const {characters, groupId, groups} = context();
    const group = groupId ? groups.find(g => g.id === groupId) : null;
    const members = group ? characters.filter(c => group.members.includes(c.avatar)) : [];
    let character;

    search = String(search).trim();

    if (allowAvatar) character = members.find(m => m.avatar === search);
    if (allowAvatar && !character) character = characters.find(c => c.avatar === search);

    if (!character) character = members.find(m => m.name === search);
    if (!character) character = characters.find(c => c.name === search);

    return character;
}

async function commandForget(namedArgs, message_id) {
    if (!isActive()) return;

    const {chat} = context();
    const {name: charName} = namedArgs;
    const messages_number = String(message_id).trim().includes("-") ? stringToRange(message_id, 0, chat.length - 1) : Number(message_id);

    log(`/presenceForgetAll name="${charName}" ${message_id}`);

    if (charName.length == 0) return;
    if (messages_number == null) return toastr.error(`ID range provided for /presenceForget is invalid`, Presence.extensionName);

    const char = findCharacter(charName)?.avatar;

    if (!char) return toastr.error(`Character name provided for /presenceForget doesn't exist within the character list`, Presence.extensionName);

    /** @type {ChatMessageExtended[]} */
    const chat_messages = chat;

    if (typeof messages_number === "number") {
        if (isNaN(messages_number))
            return toastr.error(`Message ID provided for /presenceForget is not a number`, Presence.extensionName);
        if (chat_messages[messages_number] === undefined)
            return toastr.error(`Message ID provided for /presenceForget doesn't exist within the chat`, Presence.extensionName);

        if (!chat_messages[messages_number].present)
            chat_messages[messages_number].present = [];

        chat_messages[messages_number].present = chat_messages[messages_number].present.filter((group_member) => group_member != char);

        log(`Removed message with id=${messages_number} from the memory of ${charName}`);
        saveChatDebounced();
        await addPresenceTrackerToMessages(true);
        return;
    }

    for (let mes_id = messages_number.start; mes_id <= messages_number.end; mes_id++) {
        debug(mes_id);
        if (!chat_messages[mes_id].present) chat_messages[mes_id].present = [];
        chat_messages[mes_id].present = chat_messages[mes_id].present.filter((group_member) => group_member != char);
    }

    log(`Removed all messages in the range=${messages_number.start}-${messages_number.end} from the memory of ${charName}`);

    saveChatDebounced();
    await addPresenceTrackerToMessages(true);
};

async function commandForgetAll(namedArgs, charName) {
    if (!isActive()) return;
    if (charName.length == 0) return;

    const {chat} = context();
    const char = findCharacter(charName)?.avatar;

    if (!char) return toastr.error(`Character name provided for /presenceForget doesn't exist within the character list`, Presence.extensionName);

    /** @type {ChatMessageExtended[]} */
    const chat_messages = chat;
    const charMessages = chat_messages.map((m, i) => ({ id: i, present: m.present ?? [] })).filter((m) => m.present.includes(char));

    for (const charMes of charMessages) {
        debug(charMes);
        chat_messages[charMes.id].present = charMes.present.filter((m) => m != char);
    }

    log("Wiped the memory of", charName);

    saveChatDebounced();
    await addPresenceTrackerToMessages(true);
};

async function commandRemember(namedArgs, message_id) {
    if (!isActive()) return;

    const {chat} = context();
    const {name: charName} = namedArgs;
    const messageRange = stringToRange(message_id, 0, chat.length - 1);

    log(`/presenceForgetAll name="${charName}" ${message_id}`);

    if (charName.length == 0) return;
    if (messageRange == null) return toastr.error(`ID range provided for /presenceRemember is invalid`, Presence.extensionName);

    const char = findCharacter(charName)?.avatar;

    if (!char) return toastr.error(`Character name provided for /presenceRemember doesn't exist within the character list`, Presence.extensionName);

    if (messageRange.start === messageRange.end) {
        const messageId = messageRange.start;

        if (isNaN(messageId))
            return toastr.error(`Message ID provided for /presenceRemember is not a number`, Presence.extensionName);
        if (chat[messageId] === undefined)
            return toastr.error(`Message ID provided for /presenceRemember doesn't exist within the chat`, Presence.extensionName);

        if (!chat[messageId].present)
            chat[messageId].present = [];

        chat[messageId].present.push(char);

        log(`Added message with ID=${messageId} to the memory of ${charName}`);
        saveChatDebounced();
        await addPresenceTrackerToMessages(true);
        return;
    }

    for (let messageId = messageRange.start; messageId <= messageRange.end; messageId++) {
        if (!chat[messageId].present)
            chat[messageId].present = [];

        chat[messageId].present.push(char);
    }

    log(`Added all messages in the range=${messageRange.start}-${messageRange.end} to the memory of ${charName}`);

    saveChatDebounced();
    await addPresenceTrackerToMessages(true);
};

async function commandRememberAll(namedArgs, charName) {
    if (!isActive()) return;
    if (charName.length == 0) return;

    const {chat} = context();
    const char = findCharacter(charName)?.avatar;

    if (!char) return toastr.error(`Character name provided for /presenceRemember doesn't exist within the character list`, Presence.extensionName);

    /** @type {ChatMessageExtended[]} */
    const chat_messages = chat;
    const charMessages = chat_messages.map((m, i) => ({ id: i, present: m.present ?? [] })).filter((m) => !m.present.includes(char));

    for (const charMes of charMessages) {
        debug(charMes);

        if (!chat_messages[charMes.id].present) chat_messages[charMes.id].present = [];

        chat_messages[charMes.id].present.push(char);
    }

    log(`Added all messages to the memory of ${charName}`);

    saveChatDebounced();
    await addPresenceTrackerToMessages(true);
};

async function commandReplace({ name = '', replace = '', forget = true, forceName = false } = {}, message_id) {
    if (!isActive()) return;

    const {chat} = context();
    const characterName = String(name).trim();
    const replaceName = String(replace).trim();
    const doForget = String(forget).trim().toLowerCase() === 'true';
    const messages_number = String(message_id).trim().includes('-') ? stringToRange(message_id, 0, chat.length - 1) : Number(message_id);

    if (!characterName.length || !replaceName.length) return toastr.warning(t`Character name or replacer are not valid`, Presence.extensionName);

    const character = forceName ? characterName : findCharacter(characterName)?.avatar;
    const replacer = findCharacter(replaceName)?.avatar;

    if (!character || !replacer) {
        toastr.error(`Character or replacer not found - check the console for more details`, Presence.extensionName);
        return warn(`Character or replacer not found - name=${character} replace=${replacer}`);
    }

    log(`/presenceReplace name="${character}" replace="${replacer}"`, {name, replace, message_id});

    /** @type {ChatMessageExtended[]} */
    const chat_messages = chat;
    let messages_to_process = [];

    const matchCharacter = function(character, match, equal = true) {
        if (!equal) return forceName ? sanitizeCharID(match) !== sanitizeCharID(character) : match !== character;
        return forceName ? sanitizeCharID(match) === sanitizeCharID(character) : match === character;
    }

    if (typeof messages_number === 'number' && message_id !== ''  && !isNaN(messages_number)) {
        const mess = chat_messages[messages_number];

        if (!mess.present) mess.present = [];

        const isPresent = mess.present.some((ch_name) => matchCharacter(character, ch_name));
        const isReplacerPresent = mess.present.some((ch_name) => ch_name === replacer);

        if (isPresent && !isReplacerPresent) mess.present.push(replacer);
        if (isPresent && doForget) mess.present = mess.present.filter((ch_name) => matchCharacter(character, ch_name, false));

        log(`Moved messages from ${characterName} to ${replaceName} (forget=${doForget})`);

        saveChatDebounced();
        await addPresenceTrackerToMessages(true);

        return;
    }

    if (typeof messages_number === 'object' && messages_number !== null)
        messages_to_process = chat_messages.slice(messages_number.start, messages_number.end + 1);

    if (messages_to_process.length < 1)
        messages_to_process = chat_messages;

    for (const mess of messages_to_process) {
        if (!mess.present) mess.present = [];

        const isPresent = mess.present.some((ch_name) => matchCharacter(character, ch_name));
        const isReplacerPresent = mess.present.some((ch_name) => ch_name === replacer);

        if (isPresent && !isReplacerPresent) mess.present.push(replacer);
        if (isPresent && doForget) mess.present = mess.present.filter((ch_name) => matchCharacter(character, ch_name, false));
    }

    log(`Moved messages from ${characterName} to ${replaceName} (forget=${doForget})`, {messages_to_process});

    saveChatDebounced();
    await addPresenceTrackerToMessages(true);
};

async function commandCopy({ source_index = '', target_index = '' } = {}) {
    if (!isActive()) return;

    const sourceIndex = Number(source_index.trim());
    const targetIndex = Number(target_index.trim());

    if (isNaN(sourceIndex)) return toastr.warning(t`source_index is not valid`, Presence.extensionName);
    if (isNaN(targetIndex)) return toastr.warning(t`target_index is not valid`, Presence.extensionName);
    if (sourceIndex === targetIndex) return;

    const {chat} = context();

    /** @type {ChatMessageExtended} */
    const sourceMess = chat[sourceIndex];

    /** @type {ChatMessageExtended} */
    const targetMess = chat[targetIndex];

    if (!chat[sourceIndex]) return toastr.warning(t`Source mess=#${sourceIndex} was not found`, Presence.extensionName);
    if (!chat[targetIndex]) return toastr.warning(t`Target mess=#${targetIndex} was not found`, Presence.extensionName);

    targetMess.present = [...new Set([
        ...targetMess.present ?? [],
        ...sourceMess.present ?? []
    ])];

    log(`/presenceCopy source_index="${sourceIndex}" target_index="${targetIndex}"`, {source_index: source_index, target_index: target_index});
    log(`Copied the tracker from mess=#${sourceIndex} into mess=#${targetIndex}`);

    saveChatDebounced();
    await addPresenceTrackerToMessages(true);
};

async function commandLockHiddenMessages({ name = '', unlock = false } = {}, message_id = '') {
    if (!isActive()) return;

    const {chat} = context();
    const messageID = String(message_id).trim();
    const characterName = String(name).trim();
    const doLock = String(unlock).trim().toLowerCase() !== 'true';
    const messagesNumber = messageID.includes('-') ? stringToRange(messageID, 0, chat.length - 1) : Number(messageID);

    /** @type {ChatMessageExtended[]} */
    const chat_messages = chat;
    let messages_to_process = [];

    if (typeof messagesNumber === 'number' && !isNaN(messagesNumber)) {
        const mess = chat_messages[messagesNumber];

        if (characterName !== '' && mess.name !== characterName) return;
        if (!mess.is_system) return;

        mess.presence_manually_hidden = doLock;
        saveChatDebounced();

        return;
    }

    if (typeof messagesNumber === 'object' && messagesNumber !== null)
        messages_to_process = chat_messages.slice(messagesNumber.start, messagesNumber.end + 1);

    if (messages_to_process.length === 0)
        messages_to_process = chat_messages;

    for (const mess of messages_to_process) {
        if (characterName !== '' && mess.name !== characterName) continue;
        if (!mess.is_system) continue;

        mess.presence_manually_hidden = doLock;
    }

    saveChatDebounced();
};

async function commandForceAllPresent(namedArgs, message_id) {
    if (!isActive()) return;

    const {chat} = context();

    /** @type {ChatMessageExtended[]} */
    const chat_messages = chat;
    const members = getCurrentParticipants().members;

    if (message_id === undefined || message_id === '') {
        for(const message of chat_messages) message.present = members;

        saveChatDebounced();
        await addPresenceTrackerToMessages(true);
        return;
    }

    const messages_number = String(message_id).trim().includes('-') ? stringToRange(message_id, 0, chat_messages.length - 1) : Number(message_id);

    if (typeof messages_number === 'number') {
        if (chat_messages[messages_number] === undefined)
            return toastr.error(`Message ID provided for /presenceForceAllPresent doesn't exist within the chat`, Presence.extensionName);

        chat_messages[messages_number].present = members;

        saveChatDebounced();
        await addPresenceTrackerToMessages(true);
        return;
    }

    for (let mes_id = messages_number.start; mes_id <= messages_number.end; mes_id++)
        chat_messages[mes_id].present = members;

    saveChatDebounced();
    await addPresenceTrackerToMessages(true);
};

async function commandForceNonePresent(namedArgs, message_id) {
    if (!isActive()) return;

    const {chat} = context();

    /** @type {ChatMessageExtended[]} */
    const chat_messages = chat;

    if (message_id === undefined || message_id === '') {
        for(const message of chat_messages) message.present = [];

        saveChatDebounced();
        await addPresenceTrackerToMessages(true);
        return;
    }

    const messages_number = String(message_id).trim().includes('-') ? stringToRange(message_id, 0, chat.length - 1) : Number(message_id);

    if (typeof messages_number === 'number') {
        if (chat_messages[messages_number] === undefined)
            return toastr.error(`Message ID provided for /presenceForceNonePresent doesn't exist within the chat`);

        chat_messages[messages_number].present = [];

        saveChatDebounced();
        await addPresenceTrackerToMessages(true);
        return;
    }

    for (let mes_id = messages_number.start; mes_id <= messages_number.end; mes_id++)
        chat_messages[mes_id].present = [];

    saveChatDebounced();
    await addPresenceTrackerToMessages(true);
};

// * MARK:Init Commands

export function initialize() {
    const {
        SlashCommand,
        SlashCommandParser,
        SlashCommandArgument,
        SlashCommandNamedArgument,
        ARGUMENT_TYPE,
    } = context();

    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'presenceForget',
            callback: async (args, value) => {
                if (!value) {
                    warn(`No message ID or ID range provided for /presenceForget`);
                    toastr.error(`No message ID or ID range provided for /presenceForget`, Presence.extensionName);
                    return;
                }
                await commandForget(args, value);
                return "";
            },
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'name',
                    description: 'Character name - or unique character identifier (avatar key)',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                    enumProvider: commonEnumProviders.characters('character'),
                }),
            ],
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: 'message index (starts with 0) or range - i.e.: 10 or 5-18',
                    typeList: [ARGUMENT_TYPE.NUMBER, ARGUMENT_TYPE.RANGE],
                    isRequired: true,
                    enumProvider: commonEnumProviders.messages(),
                }),
            ],
            helpString: `
            <div>
                Removes messages of specified index or range from the memory of a character.
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <pre><code>/presenceForget name=John 0-9</code></pre>
                    </li>
                </ul>
            </div>`,
        })
    );

    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'presenceForgetAll',
            callback: async (args, value) => {
                if (!value) {
                    warn(`No character name provided for /presenceForgetAll command`);
                    return;
                }
                value = String(value).trim();
                await commandForgetAll(args, value);
                return '';
            },
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: 'Character name - or unique character identifier (avatar key)',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                    enumProvider: commonEnumProviders.characters('all'),
                }),
            ],
            helpString: `
            <div>
                Wipes the memory of a character.
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <pre><code>/presenceForgetAll John</code></pre>
                    </li>
                </ul>
            </div>`,
        })
    );

    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'presenceRemember',
            callback: async (args, value) => {
                if (!value) {
                    warn(`No message ID or ID range provided for /presenceRemember`);
                    toastr.error(`No message ID or ID range provided for /presenceRemember`, Presence.extensionName);
                    return;
                }
                await commandRemember(args, value);
                return '';
            },
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'name',
                    description: 'Character name - or unique character identifier (avatar key)',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                    enumProvider: commonEnumProviders.characters('character'),
                }),
            ],
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: 'message index (starts with 0) or range - i.e.: 10 or 5-18',
                    typeList: [ARGUMENT_TYPE.NUMBER, ARGUMENT_TYPE.RANGE],
                    isRequired: true,
                    enumProvider: commonEnumProviders.messages(),
                }),
            ],
            helpString: `
            <div>
                Adds messages of specified index or range to the memory of a character.
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <pre><code>/presenceRemember name=John 0-9</code></pre>
                    </li>
                </ul>
            </div>`,
        })
    );

    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'presenceRememberAll',
            callback: async (args, value) => {
                if (!value) {
                    warn(`No character name provided for /presenceRememberAll command`);
                    return;
                }
                value = String(value).trim();
                await commandRememberAll(args, value);
                return '';
            },
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: 'name',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                    enumProvider: commonEnumProviders.characters('all'),
                }),
            ],
            helpString: `
            <div>
                Adds all messages to the memory of a character.
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <pre><code>/presenceRememberAll John</code></pre>
                    </li>
                </ul>
            </div>`,
        })
    );

    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'presenceReplace',
            callback: async (/** @type {object} */args, value) => {
                await commandReplace(args, value);
                return '';
            },
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'name',
                    description: 'Character name - or unique character identifier (avatar key) of the character to be replaced',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                    enumProvider: commonEnumProviders.characters('character'),
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'replace',
                    description: 'Character name - or unique character identifier (avatar key) of the replacement',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                    enumProvider: commonEnumProviders.characters('character'),
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'forget',
                    description: 'Make the original character forget the messages - true by default',
                    typeList: [ARGUMENT_TYPE.BOOLEAN],
                    isRequired: false,
                    enumProvider: commonEnumProviders.boolean(),
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'forceName',
                    description: 'Skip checking if <code>name</code> is a valid character identifier - Used to move presence history from a character that no longer exists',
                    typeList: [ARGUMENT_TYPE.BOOLEAN],
                    isRequired: false,
                    enumProvider: commonEnumProviders.boolean(),
                }),
            ],
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: 'Message index or range (10-34) - If not provided, all messages will be processed',
                    typeList: [ARGUMENT_TYPE.NUMBER, ARGUMENT_TYPE.RANGE],
                    isRequired: false,
                    enumProvider: commonEnumProviders.messages(),
                }),
            ],
            helpString: `
            <div>
                Transfers the messages from the memory of a character to another. Set <code>forget=false</code> to keep the original messages in the first character's memory.
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <pre><code>/presenceReplace name=Alice replace=Bob</code></pre>
                    </li>
                    <li>
                        <pre><code>/presenceReplace name=Alice replace=Bob forget=false</code></pre>
                    </li>
                    <li>
                        <pre><code>/presenceReplace name=Alice replace=Bob forget=false 10-50</code></pre>
                    </li>
                </ul>
            </div>`,
        })
    );

    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'presenceCopy',
            callback: async (/** @type {object} */args) => {
                await commandCopy(args);
                return '';
            },
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'source_index',
                    description: 'ID of the massage with the Tracker you want to copy',
                    typeList: [ARGUMENT_TYPE.NUMBER],
                    isRequired: true,
                    enumProvider: commonEnumProviders.messages(),
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'target_index',
                    description: 'ID of the message where you will paste the copied Tracker',
                    typeList: [ARGUMENT_TYPE.NUMBER],
                    isRequired: true,
                    enumProvider: commonEnumProviders.messages(),
                }),
            ],
            helpString: `
            <div>
                Copy the Tracker of a message and paste it on another one - it uses message indexes. The original tracker is not replaced/deleted.
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <pre><code>/presenceCopy source_index=2 target_index=80</code></pre>
                    </li>
                </ul>
            </div>`,
        })
    );

    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'presenceLockHiddenMessages',
            callback: async (/** @type {object} */args, /** @type {string} */value) => {
                await commandLockHiddenMessages(args, value);
                return '';
            },
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'name',
                    description: 'Character or Persona name - Filter messages by group member or persona',
                    typeList: [ARGUMENT_TYPE.STRING],
                    defaultValue: '',
                    isRequired: false,
                    enumProvider: commonEnumProviders.characters('all'),
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'unlock',
                    description: 'If <code>true</code> it will unlock messages instead - <code>false</code> by default',
                    typeList: [ARGUMENT_TYPE.BOOLEAN],
                    defaultValue: 'false',
                    isRequired: false,
                    enumProvider: commonEnumProviders.boolean(),
                }),
            ],
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: 'Message index or range (10-34) - If not provided, all messages will be processed',
                    typeList: [ARGUMENT_TYPE.NUMBER, ARGUMENT_TYPE.RANGE],
                    defaultValue: '',
                    isRequired: false,
                    enumProvider: commonEnumProviders.messages(),
                }),
            ],
            helpString: `
            <div>
                Lock hidden messages in the chat. Locked messages won't be unhidden by the extension in future generations unless the user unlocks them manually, or using this command with the parameter unlock set to <code>false</code>.
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <pre><code>/presenceLockHiddenMessages</code><small>- To lock all</small></pre>
                    </li>
                    <li>
                        <pre><code>/presenceLockHiddenMessages name="Ada"</code><small>- To filter by name</small></pre>
                    </li>
                    <li>
                        <pre><code>/presenceLockHiddenMessages 10-34</code><small>- To filter by a message range</small></pre>
                    </li>
                    <li>
                        <pre><code>/presenceLockHiddenMessages unlock=true 10-34</code><small>- To unlock messages and allow the extension to unhide them</small></pre>
                    </li>
                </ul>
            </div>`,
        })
    );

    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'presenceForceAllPresent',
            callback: async (args, value) => {
                await commandForceAllPresent(args, value);
                return '';
            },
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: 'message index (starts with 0) or range - i.e.: 10 or 5-18',
                    typeList: [ARGUMENT_TYPE.NUMBER, ARGUMENT_TYPE.RANGE],
                    isRequired: false,
                    enumProvider: commonEnumProviders.messages(),
                }),
            ],
            helpString: `
            <div>
                Makes all characters remember EVERYTHING, IRREVERSIBLY, index or range optional.
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <pre><code>/presenceForceAllPresent 0-9</code></pre>
                    </li>
                </ul>
            </div>`,
        })
    );

    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'presenceForceNonePresent',
            callback: async (args, value) => {
                await commandForceNonePresent(args, value);
                return '';
            },
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: 'message index (starts with 0) or range - i.e.: 10 or 5-18',
                    typeList: [ARGUMENT_TYPE.NUMBER, ARGUMENT_TYPE.RANGE],
                    isRequired: false,
                    enumProvider: commonEnumProviders.messages(),
                }),
            ],
            helpString: `
            <div>
                Makes all characters forget EVERYTHING, IRREVERSIBLY, index or range optional.
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <pre><code>/presenceForceNonePresent 0-9</code></pre>
                    </li>
                </ul>
            </div>`,
        })
    );

    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'presenceUpdateChatTrackers',
            callback: async function () {
                await addPresenceTrackerToMessages(false);
                return '';
            },
            helpString: `
            <div>
                Updates the UI of presence trackers on all messages that are missing them.
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <pre><code>/presenceUpdateChatTrackers</code></pre>
                    </li>
                </ul>
            </div>
            `,
        })
    );
}
