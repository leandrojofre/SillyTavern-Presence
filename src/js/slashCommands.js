import { addPresenceTrackerToMessages, debug, getCurrentParticipants, isActive, log, warn } from "../../index.js";
import { characters, chat, saveChatDebounced } from "../../../../../../script.js";
import { SlashCommand } from "../../../../../slash-commands/SlashCommand.js";
import { ARGUMENT_TYPE, SlashCommandArgument, SlashCommandNamedArgument } from "../../../../../slash-commands/SlashCommandArgument.js";
import { commonEnumProviders } from "../../../../../slash-commands/SlashCommandCommonEnumsProvider.js";
import { SlashCommandParser } from "../../../../../slash-commands/SlashCommandParser.js";
import { stringToRange } from "../../../../../utils.js";

async function commandForget(namedArgs, message_id) {
    if (!isActive()) return;

    const charName = String(namedArgs.name).trim();
    const messages_number = String(message_id).trim().includes("-") ? stringToRange(message_id, 0, chat.length - 1) : Number(message_id);

    log("/presenceForgetAll name='" + charName + "' " + message_id);

    if (charName.length == 0) return;
    if (messages_number == null)
        // @ts-ignore
        return toastr.error("WARN: Id range provided for /presenceRemember is invalid");

    const char = characters.find((character) => character.name == charName)?.avatar;

    if (char === undefined)
        // @ts-ignore
        return toastr.error("WARN: Character name provided for /presenceRemember doesn't exist within the character list");

    const chat_messages = chat;

    if (typeof messages_number === "number") {
        if (isNaN(messages_number))
            // @ts-ignore
            return toastr.error("WARN: message id provided for /presenceRemember is not a number");
        if (chat_messages[messages_number] === undefined)
            // @ts-ignore
            return toastr.error("WARN: message id provided for /presenceRemember doesn't exist within the chat");

        if (!chat_messages[messages_number].present)
            chat_messages[messages_number].present = [];

        chat_messages[messages_number].present = chat_messages[messages_number].present.filter((group_member) => group_member != char);

        log("Removed message with id=" + messages_number + " from the memory of " + charName);
        saveChatDebounced();
        await addPresenceTrackerToMessages(true);
        return;
    }

    for (let mes_id = messages_number.start; mes_id <= messages_number.end; mes_id++) {
        debug(mes_id);
        if (!chat_messages[mes_id].present) chat_messages[mes_id].present = [];
        chat_messages[mes_id].present = chat_messages[mes_id].present.filter((group_member) => group_member != char);
    }

    log("Removed all messages in the range=" + messages_number.start + "-" + messages_number.end + " from the memory of " + charName);

    saveChatDebounced();
    await addPresenceTrackerToMessages(true);
};

async function commandForgetAll(namedArgs, charName) {
    if (!isActive()) return;
    if (charName.length == 0) return;

    const char = characters.find((c) => c.name == charName).avatar;

    const messages = chat;
    const charMessages = chat.map((m, i) => ({ id: i, present: m.present ?? [] })).filter((m) => m.present.includes(char));

    for (const charMes of charMessages) {
        debug(charMes);
        messages[charMes.id].present = charMes.present.filter((m) => m != char);
    }

    log("Wiped the memory of", charName);

    saveChatDebounced();
    await addPresenceTrackerToMessages(true);
};

async function commandRemember(namedArgs, message_id) {
    if (!isActive()) return;

    const charName = String(namedArgs.name).trim();
    const messages_number = String(message_id).trim().includes("-") ? stringToRange(message_id, 0, chat.length - 1) : Number(message_id);

    log("/presenceForgetAll name='" + charName + "' " + message_id);

    if (charName.length == 0) return;
    if (messages_number == null)
        // @ts-ignore
        return toastr.error("WARN: Id range provided for /presenceRemember is invalid");

    const char = characters.find((character) => character.name == charName)?.avatar;

    if (char === undefined)
        // @ts-ignore
        return toastr.error("WARN: Character name provided for /presenceRemember doesn't exist within the character list");

    const chat_messages = chat;

    if (typeof messages_number === "number") {
        if (isNaN(messages_number))
            // @ts-ignore
            return toastr.error("WARN: message id provided for /presenceRemember is not a number");
        if (chat_messages[messages_number] === undefined)
            // @ts-ignore
            return toastr.error("WARN: message id provided for /presenceRemember doesn't exist within the chat");

        if (!chat_messages[messages_number].present)
            chat_messages[messages_number].present = [];

        chat_messages[messages_number].present.push(char);

        log("Added message with id=" + messages_number + " to the memory of " + charName);
        saveChatDebounced();
        await addPresenceTrackerToMessages(true);
        return;
    }

    for (let mes_id = messages_number.start; mes_id <= messages_number.end; mes_id++) {
        debug(mes_id);
        if (!chat_messages[mes_id].present) chat_messages[mes_id].present = [];
        chat_messages[mes_id].present.push(char);
    }

    log("Added all messages in the range=" + messages_number.start + "-" + messages_number.end + " to the memory of " + charName);

    saveChatDebounced();
    await addPresenceTrackerToMessages(true);
};

async function commandRememberAll(namedArgs, charName) {
    if (!isActive()) return;
    if (charName.length == 0) return;

    const char = characters.find((c) => c.name == charName).avatar;

    const messages = chat;
    const charMessages = chat.map((m, i) => ({ id: i, present: m.present ?? [] })).filter((m) => !m.present.includes(char));

    for (const charMes of charMessages) {
        debug(charMes);
        if (!messages[charMes.id].present) messages[charMes.id].present = [];
        messages[charMes.id].present.push(char);
    }

    log("Added all messages to the memory of ", charName);

    saveChatDebounced();
    await addPresenceTrackerToMessages(true);
};

async function commandReplace({ name = "", replace = "" } = {}) {
    if (!isActive()) return;

    const characterName = String(name).trim();
    const replaceName = String(replace).trim();

    // @ts-ignore
    if (characterName.length === 0 || replaceName.length === 0) return toastr.warning(t`Character name or replace not valid`);

    const sanitize = (str) => str.replace(/(\.\w+)$/i, "");
    const character = characters.find((character) => character.name === characterName)?.avatar;
    const replacer = characters.find((character) => character.name === replaceName)?.avatar;

    if (!character || !replacer) {
        // @ts-ignore
        toastr.error("Character or replacer not found - check the console for more details");
        return warn("Character or replacer not found - ", "name=" + character, "replace=" + replacer);
    }

    log("/presenceReplace name='" + character + "' replace='" + replacer + "'", {name: name, replace: replace});

    for (const mess of chat) {
        if (!mess.present) mess.present = [];

        mess.present = mess.present.map((ch_name) => {
            if (sanitize(ch_name) === sanitize(character)) return replacer;
            return ch_name;
        });
    }

    log("Moved all messages in the memory of " + characterName + " into the memory of " + replaceName);

    saveChatDebounced();
    await addPresenceTrackerToMessages(true);
};

async function commandCopy({ source_index = "", target_index = "" } = {}) {
    if (!isActive()) return;

    const sourceIndex = Number(source_index.trim());
    const targetIndex = Number(target_index.trim());

    // @ts-ignore
    if (isNaN(sourceIndex)) return toastr.warning(t`source_index is not valid`);
    // @ts-ignore
    if (isNaN(targetIndex)) return toastr.warning(t`target_index is not valid`);
    if (sourceIndex === targetIndex) return;

    const sourceMess = chat[sourceIndex];
    const targetMess = chat[targetIndex];

    // @ts-ignore
    if (!chat[sourceIndex]) return toastr.warning(t`Source mess=#${sourceIndex} was not found`);
    // @ts-ignore
    if (!chat[targetIndex]) return toastr.warning(t`Target mess=#${targetIndex} was not found`);

    targetMess.present = [...new Set([
        ...targetMess.present ?? [],
        ...sourceMess.present ?? []
    ])];

    log("/presenceCopy source_index='" + sourceIndex + "' target_index='" + targetIndex + "'", {source_index: source_index, target_index: target_index});

    log("Copied the tracker of mess=#" + sourceIndex + " into mess=#" + targetIndex);

    saveChatDebounced();
    await addPresenceTrackerToMessages(true);
};

async function commandForceAllPresent(namedArgs, message_id) {
    if (!isActive()) return;

    const members = (await getCurrentParticipants()).members;

    if (message_id === undefined || message_id === "") {
        for(const message of chat) message.present = members;

        saveChatDebounced();
        await addPresenceTrackerToMessages(true);
        return;
    }

    const messages_number = String(message_id).trim().includes("-") ? stringToRange(message_id, 0, chat.length - 1) : Number(message_id);

    if (typeof messages_number === "number") {
        if (chat[messages_number] === undefined)
            // @ts-ignore
            return toastr.error("WARN: message id provided for /presenceForceAllPresent doesn't exist within the chat");

        chat[messages_number].present = members;

        saveChatDebounced();
        await addPresenceTrackerToMessages(true);
        return;
    }

    for (let mes_id = messages_number.start; mes_id <= messages_number.end; mes_id++)
        chat[mes_id].present = members;

    saveChatDebounced();
    await addPresenceTrackerToMessages(true);
};

async function commandForceNonePresent(namedArgs, message_id) {
    if (!isActive()) return;

    if (message_id === undefined || message_id === "") {
        for(const message of chat) message.present = [];

        saveChatDebounced();
        await addPresenceTrackerToMessages(true);
        return;
    }

    const messages_number = String(message_id).trim().includes("-") ? stringToRange(message_id, 0, chat.length - 1) : Number(message_id);

    if (typeof messages_number === "number") {
        if (chat[messages_number] === undefined)
            // @ts-ignore
            return toastr.error("WARN: message id provided for /presenceForceNonePresent doesn't exist within the chat");

        chat[messages_number].present = [];

        saveChatDebounced();
        await addPresenceTrackerToMessages(true);
        return;
    }

    for (let mes_id = messages_number.start; mes_id <= messages_number.end; mes_id++)
        chat[mes_id].present = [];

    saveChatDebounced();
    await addPresenceTrackerToMessages(true);
};

export function registerSlashCommands() {
    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: "presenceForget",
            callback: async (args, value) => {
                if (!value) {
                    warn("WARN: No message id or id range provided for /presenceForget");
                    // @ts-ignore
                    toastr.error("WARN: No message id or id range provided for /presenceForget");
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
            name: "presenceForgetAll",
            callback: async (args, value) => {
                if (!value) {
                    warn("WARN: No character name provided for /presenceForgetAll command");
                    return;
                }
                value = String(value).trim();
                await commandForgetAll(args, value);
                return "";
            },
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: "Character name - or unique character identifier (avatar key)",
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                    enumProvider: commonEnumProviders.characters("all"),
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
            name: "presenceRemember",
            callback: async (args, value) => {
                if (!value) {
                    warn("WARN: No message id or id range provided for /presenceRemember");
                    // @ts-ignore
                    toastr.error("WARN: No message id or id range provided for /presenceRemember");
                    return;
                }
                await commandRemember(args, value);
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
            name: "presenceRememberAll",
            callback: async (args, value) => {
                if (!value) {
                    warn("WARN: No character name provided for /presenceRememberAll command");
                    return;
                }
                value = String(value).trim();
                await commandRememberAll(args, value);
                return "";
            },
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: "name",
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                    enumProvider: commonEnumProviders.characters("all"),
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
            name: "presenceReplace",
            callback: async (args) => {
                // @ts-ignore
                await commandReplace(args);
                return "";
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
            ],
            helpString: `
            <div>
                Transfers the messages from the memory of a character (forgets EVERYTHING) to another.
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <pre><code>/presenceReplace name=Alice replace=Bob</code></pre>
                    </li>
                </ul>
            </div>`,
        })
    );

    // SlashCommandParser.addCommandObject(
    // 	SlashCommand.fromProps({
    // 		name: "presenceClone",
    // 		callback: async (args) => {
                // @ts-ignore
    // 			await commandClone(args);
    // 			return "";
    // 		},
    //         namedArgumentList: [
    //             SlashCommandNamedArgument.fromProps({
    //                 name: 'name',
    //                 description: 'Character name - or unique character identifier (avatar key) with the memories to be cloned',
    //                 typeList: [ARGUMENT_TYPE.STRING],
    //                 isRequired: true,
    //                 enumProvider: commonEnumProviders.characters('character'),
    //             }),
    //             SlashCommandNamedArgument.fromProps({
    //                 name: 'clone',
    //                 description: 'Character name - or unique character identifier (avatar key) of the one receiving the memmories',
    //                 typeList: [ARGUMENT_TYPE.STRING],
    //                 isRequired: true,
    //                 enumProvider: commonEnumProviders.characters('character'),
    //             }),
    //         ],
    // 		helpString: `
    //         <div>
    //             Clones the messages from the memory of a character (forgets EVERYTHING) to another.
    //         </div>
    //         <div>
    //             <strong>Example:</strong>
    //             <ul>
    //                 <li>
    //                     <pre><code>/presenceClone name=Alice clone=Bob</code></pre>
    //                 </li>
    //             </ul>
    //         </div>`,
    // 	})
    // );

    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: "presenceCopy",
            callback: async (args) => {
                // @ts-ignore
                await commandCopy(args);
                return "";
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
                Copy the Tracker of a message and paste it on another one - message indexes.
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
            name: "presenceForceAllPresent",
            callback: async (args, value) => {
                await commandForceAllPresent(args, value);
                return "";
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
            name: "presenceForceNonePresent",
            callback: async (args, value) => {
                await commandForceNonePresent(args, value);
                return "";
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
}
