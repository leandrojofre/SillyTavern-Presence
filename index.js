import {characters, chat, chat_metadata, eventSource, event_types, getCurrentChatId, saveChatDebounced, saveSettingsDebounced} from "../../../../script.js";
import {groups, is_group_generating, selected_group} from "../../../../scripts/group-chats.js";
import {hideChatMessageRange} from "../../../chats.js";
import {extension_settings} from "../../../extensions.js";
import {SlashCommand} from "../../../slash-commands/SlashCommand.js";
import {ARGUMENT_TYPE, SlashCommandArgument, SlashCommandNamedArgument} from "../../../slash-commands/SlashCommandArgument.js";
import {commonEnumProviders} from "../../../slash-commands/SlashCommandCommonEnumsProvider.js";
import {SlashCommandParser} from "../../../slash-commands/SlashCommandParser.js";
import { stringToRange } from "../../../utils.js";

const extensionName = "Presence";

const extensionNameLong = `SillyTavern-${extensionName}`;
const extensionFolderPath = `scripts/extensions/third-party/${extensionNameLong}`;
const context = SillyTavern.getContext();
const defaultSettings = {
	enabled: true,
	location: "top",
	debugMode: false,
	seeLast: true,
	includeMuted: false,
    universalTrackerOn: false
};
const extensionSettings = extension_settings[extensionName];


const log = (...msg) => console.log("[" + extensionName + "]", ...msg);
const warn = (...msg) => console.warn("[" + extensionName + " Warning]", ...msg);
const debug = (...msg) => {
	if (extensionSettings.debugMode) {
		console.debug("[" + extensionName + " debug]", ...msg);
	}
};


// * Initialize Extension

function initSettings() {

	if (!context.extensionSettings[extensionName]) {
	    context.extensionSettings[extensionName] = structuredClone(defaultSettings);
	}

	for (const key of Object.keys(defaultSettings)) {
	    if (context.extensionSettings[extensionName][key] === undefined) {
		   context.extensionSettings[extensionName][key] = defaultSettings[key];
	    }
	}

    debug(extensionSettings);
};

const getMessage = async (mesId) => {
	return chat[mesId];
};

const getCurrentParticipants = async () => {
	const group = groups.find((g) => g.id == selected_group);

	var active = [...group.members];

    if (extensionSettings.universalTrackerOn) active.push('presence_universal_tracker');

	debug("includeMuted", extensionSettings.includeMuted);
	debug("active", active);
	debug("chat_metadata.ignore_presence", chat_metadata.ignore_presence);

	if (!extensionSettings.includeMuted)
		active = active.filter(char => !group.disabled_members.includes(char));

	if (!chat_metadata.ignore_presence) chat_metadata.ignore_presence = [];

	chat_metadata.ignore_presence.forEach(char => {
		if (active.includes(char)) active.splice(active.indexOf(char), 1);
	});

	return { members: group.members, present: active };
};

const isActive = () => {
	return selected_group != null && extensionSettings.enabled;
};

const onNewMessage = async (mesId) => {
	if (!isActive()) return;

	const mes = await getMessage(mesId);

	mes.present = [...(await getCurrentParticipants()).present];

	debug("seeLast", extensionSettings.seeLast);
	debug("is_user", mes.is_user);
	debug("original_avatar", mes.original_avatar);
	debug("present", mes.present);

	if(extensionSettings.seeLast && !mes.is_user) {
		const prevMes = await getMessage(mesId - 1);

		debug("prevMes", prevMes);

		if(!prevMes.present) prevMes.present = [];

		if(!prevMes.present.includes(mes.original_avatar)){
			prevMes.present.push(mes.original_avatar);
			debug(prevMes.present);
		}
	}

	await saveChatDebounced();

	debug("Present members added to last message");
};

const addPresenceTrackerToMessages = async (refresh) => {
	if (refresh) {
		let trackers = $("#chat .mes_presence_tracker");
		let messages = trackers.closest(".mes");
		trackers.remove();
		messages.removeAttr("has_presence_tracker");
	}
	let selector = "#chat .mes:not(.smallSysMes,[has_presence_tracker=true])";

	if (refresh) {
		$("#chat .mes_presence_tracker").remove();
	}

    const elements = $(selector).toArray();

    for (const element of elements) {
        const mesId = $(element).attr("mesid");
        const mes = await getMessage(mesId);

        if (mes.present == undefined)
            mes.present = [];
        else mes.present = [...new Set(mes.present)];

        const mesPresence = mes.present;
        const members = (await getCurrentParticipants()).members;
        const trackerMembers = members.concat(mesPresence.filter((m) => !members.includes(m))).sort();
        const presenceTracker = $('<div class="mes_presence_tracker"></div>');

        if (!presenceTracker.first().hasClass('universal')) {
            const universalTracker = $('<div class="presence_icon universal"><div class="fa-solid fa-universal-access interactable" title="Universal Tracker"></div></div>');

            universalTracker.on("click", (e) => {
                const target = $(e.target).closest(".presence_icon");
                if (target.hasClass("present")) {
                    target.removeClass("present");
                    updateMessagePresence(mesId, "presence_universal_tracker", false);
                } else {
                    target.addClass("present");
                    updateMessagePresence(mesId, "presence_universal_tracker", true);
                }
            });

            presenceTracker.prepend(universalTracker);
        }

        trackerMembers.forEach((member) => {
            const isPresent = mesPresence.includes(member);

            if (member === "presence_universal_tracker") {
                if (isPresent) presenceTracker.find('.universal').addClass("present");
                return;
            }

            const memberIcon = $('<div class="presence_icon' + (isPresent ? " present" : "") + '"><img src="/thumbnail?type=avatar&amp;file=' + member + '"></div>');

            memberIcon.on("click", (e) => {
                const target = $(e.target).closest(".presence_icon");
                if (target.hasClass("present")) {
                    target.removeClass("present");
                    updateMessagePresence(mesId, member, false);
                } else {
                    target.addClass("present");
                    updateMessagePresence(mesId, member, true);
                }
            });

            presenceTracker.append(memberIcon);
        });

        if (element.hasAttribute("has_presence_tracker")) return;
        if (extensionSettings.location == "top") $(".mes_block > .ch_name > .flex1", element).append(presenceTracker);
        else if (extensionSettings.location == "bottom") $(".mes_block", element).append(presenceTracker);
        element.setAttribute("has_presence_tracker", "true");
    };
};

const updateMessagePresence = async (mesId, member, isPresent) => {
	const mes = await getMessage(mesId);
	if (!mes.present) mes.present = [];

	if (isPresent) {
		mes.present.push(member);
        mes.present = [...new Set(mes.present)];
	} else {
		mes.present = mes.present.filter((m) => m != member);
	}
	saveChatDebounced();
};

const onChatChanged = async () => {
	$(document).off("mouseup touchend", "#show_more_messages", addPresenceTrackerToMessages);

	if (!isActive()) {
		return;
	}

	await migrateOldTrackingData();

	addPresenceTrackerToMessages(true);

	$("#rm_group_members .group_member").each((index, element) => {
		updatePresenceTrackingButton($(element));
	});

	$(document).on("mouseup touchend", "#show_more_messages", addPresenceTrackerToMessages);
};

const onGenerationAfterCommands = async (type, config, dryRun) => {
	if (!isActive() && !is_group_generating) return;

	eventSource.once(event_types.GROUP_MEMBER_DRAFTED, draftHandler);
	eventSource.once(event_types.GENERATION_STOPPED, stopHandler);

	async function draftHandler(...args) {
		debug("GROUP_MEMBER_DRAFTED", args);
		eventSource.removeListener(event_types.GENERATION_STOPPED, stopHandler);
		onGroupMemberDrafted(type, args[0]);
		return;
	}

	async function stopHandler() {
		eventSource.removeListener(event_types.GROUP_MEMBER_DRAFTED, draftHandler);
	}
};

const toggleVisibilityAllMessages = async (state = true) => {
	hideChatMessageRange(0, chat.length - 1, state);
}

const onGroupMemberDrafted = async (type, charId) => {
	if (!isActive()) return;

	const char = characters[charId].avatar;
	const lastMessage = await getMessage(chat.length - 1);
	const isUserContinue = (type == "continue" && lastMessage.is_user);

	if (
		type == "impersonate" ||
		isUserContinue ||
		chat_metadata.ignore_presence?.includes(char)
	) {
		debug("Impersonation detected");
		//reveal all history for impersonation
        toggleVisibilityAllMessages(true);
	} else {
		//handle NPC draft
		//hide all messages
		toggleVisibilityAllMessages(false);

		const messages = chat.map((m, i) => ({ id: i, present: m.present ?? [] })).filter((m) => m.present.includes(char) || m.present.includes("presence_universal_tracker"));

		//unhide messages they've seen
		for (const message of messages) {
			debug("Unhiding", message);
			hideChatMessageRange(message.id, message.id, true);
		}

        if (extensionSettings.seeLast) {
            const lastMessageID = chat.length - 1;
            hideChatMessageRange(lastMessageID, lastMessageID, true);
        }

		debug("done");
	}
};

const commandForget = async (namedArgs, message_id) => {
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

const commandForgetAll = async (namedArgs, charName) => {
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

const commandRemember = async (namedArgs, message_id) => {
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

const commandRememberAll = async (namedArgs, charName) => {
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

const commandReplace = async ({ name = "", replace = "" } = {}) => {
    if (!isActive()) return;

    const characterName = String(name).trim();
    const replaceName = String(replace).trim();

	// @ts-ignore
	if (characterName.length === 0 || replaceName.length === 0) return toastr.warning(t`Character name or replace not valid`);

    const findCharacter = characters.find((character) => character.name === characterName)?.avatar;
    const findReplace = characters.find((character) => character.name === replaceName)?.avatar;
    const character = findCharacter;
    const replacer = findReplace;

    if (!character || !replacer) {
        // @ts-ignore
        toastr.error("Character or replacer not found - check the console for more details");
        return log("Character or replacer not found - ", "name=" + character, "replace=" + replacer);
    }

    log("/presenceReplace name='" + findCharacter + "' replace='" + findReplace + "'", {name: name, replace: replace});

    for (const mess of chat) {
        if (!mess.present) mess.present = [];

        mess.present = mess.present.map((ch_name) => {
            const sanitize = (str) => str.replace(/(\.\w+)$/i, "");
            if (sanitize(ch_name) === sanitize(character)) return replacer;
            return ch_name;
        });
    }

	log("Moved all messages in the memory of " + characterName + " into the memory of " + replaceName);

	saveChatDebounced();
	await addPresenceTrackerToMessages(true);
};

const commandCopy = async ({ source_index = "", target_index = "" } = {}) => {
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

const commandForceAllPresent = async (namedArgs, message_id) => {
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

const commandForceNonePresent = async (namedArgs, message_id) => {
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

const togglePresenceTracking = async (e) => {
	const target = $(e.target).closest(".group_member");
	const charId = target.data("chid");
	const charAvatar = characters[charId].avatar;

	const ignorePresence = chat_metadata.ignore_presence ?? [];

	if (!ignorePresence.includes(charAvatar)) {
		if (!chat_metadata.ignore_presence) chat_metadata.ignore_presence = [];
		chat_metadata.ignore_presence.push(charAvatar);
	} else {
		chat_metadata.ignore_presence = ignorePresence.filter((c) => c != charAvatar);
	}

	saveChatDebounced();
	updatePresenceTrackingButton(target);
};

const updatePresenceTrackingButton = async (member) => {
	const target = member.find(".ignore_presence_toggle");
	const charId = member.data("chid");

	if (!chat_metadata?.ignore_presence?.includes(characters[charId].avatar)) {
		target.removeClass("active");
	} else {
		target.addClass("active");
	}
};

const migrateOldTrackingData = async () => {
	if (extension_settings[extensionName] && extension_settings[extensionName][getCurrentChatId()]) {
		var oldData = extension_settings[extensionName][getCurrentChatId()];
		var oldDataKeys = Object.keys(oldData);
		var context = SillyTavern.getContext();
		var characters = context.characters;
		var charMap = {};
		characters.forEach((char) => {
			var name = char.name.replace(/(\.card)?[0-9]*\.png/, "");
			if (oldDataKeys.includes(name)) charMap[name] = char.avatar;
		});
		var newData = {};
		oldDataKeys.forEach((name) => {
			oldData[name].forEach((mesId) => {
				if (!newData[mesId]) newData[mesId] = [];
				newData[mesId].push(charMap[name]);
			});
		});

		const messages = chat;

		Object.keys(newData).forEach((mesId) => {
			if (messages[mesId]) messages[mesId].present = newData[mesId];
		});

		log("Migrated old tracking data");
		debug(newData);
		await saveChatDebounced();
		delete extension_settings[extensionName][getCurrentChatId()];
	}
};

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
	onGenerationAfterCommands(...args);
	return;
});

const messageReceived = async (...args) => {
	log("MESSAGE_RECEIVED", args);
	onNewMessage(...args);
	toggleVisibilityAllMessages(true);
	return;
};

eventSource.on(event_types.MESSAGE_RECEIVED, messageReceived);
eventSource.makeFirst(event_types.MESSAGE_RECEIVED, messageReceived);

const messageSent = async (...args) => {
	log("MESSAGE_SENT", args);
	onNewMessage(...args);
	return;
};

eventSource.on(event_types.MESSAGE_SENT, messageSent);
eventSource.makeLast(event_types.MESSAGE_SENT, messageSent);

const generationStopped = async (...args) => {
	log("GENERATION_STOPPED", args);
	toggleVisibilityAllMessages(true);
	return;
};

eventSource.on(event_types.GENERATION_STOPPED, generationStopped);
eventSource.makeFirst(event_types.GENERATION_STOPPED, generationStopped);

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
		helpString: "Removes some messages from the memory of a character. Usage /presenceForget <name> <mes_index, mes_range>",
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
				description: "name",
				typeList: [ARGUMENT_TYPE.STRING],
				isRequired: true,
				enumProvider: commonEnumProviders.characters("all"),
			}),
		],
		helpString: "Wipes the memory of a character. Usage /presenceForgetAll <name>",
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
		helpString: "Adds some messages to the memory of a character. Usage /presenceRemember <name> <mes_index, mes_range>",
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
		helpString: "Adds all messages to the memory of a character. Usage /presenceRememberAll <name>",
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
		helpString: "Transfer the messages from the memory of a character to another. Usage /presenceReplace <name> <replace>",
	})
);

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
		helpString: "Copy the Tracker of a message and paste it on another one. Usage /presenceCopy <source_index> <target_index>",
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
		helpString: "Makes all characters remember EVERYTHING. Usage /presenceForceAllPresent WARN: THIS IS PERMANENT",
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
		helpString: "Makes all characters forget EVERYTHING. Usage /presenceForceNonePresent WARN: THIS IS PERMANENT",
	})
);

jQuery(async () => {
	const groupMemberTemplateIcons = $(".group_member_icon");
	const ignorePresenceButton = $(`<div title="Ignore Presence" class="ignore_presence_toggle fa-solid fa-eye-slash right_menu_button fa-lg interactable" tabindex="0"></div>`);

	groupMemberTemplateIcons.before(ignorePresenceButton);

	$("#rm_group_members").on("click", ".ignore_presence_toggle", togglePresenceTracking);

	const groupMemberList = document.getElementById("rm_group_members");
	const observer = new MutationObserver((mutationList, observer) => {
		for (const mutation of mutationList) {
			if (mutation.type === "childList" && mutation.addedNodes.length > 0 && chat_metadata.ignore_presence) {
				mutation.addedNodes.forEach((node) => {
					updatePresenceTrackingButton($(node));
				});
			}
		}
	});
	observer.observe(groupMemberList, { childList: true, subtree: true });

	// Add Settings Panel
	await initSettings();
	const settingsHtml = $(await $.get(`${extensionFolderPath}/html/settings.html`));

	settingsHtml.find("#presence_enable").prop("checked", extensionSettings.enabled);
	settingsHtml.find("#presence_location").val(extensionSettings.location);
	settingsHtml.find("#presence_seeLast").on("input", function(e) {
        extensionSettings.seeLast = Boolean($(e.target).prop("checked"));
    });
	settingsHtml.find("#presence_includeMuted").prop("checked", extensionSettings.includeMuted);
	settingsHtml.find("#presence_debug").prop("checked", extensionSettings.debugMode);

	settingsHtml.find("#presence_enable").on("change", (e) => {
		extensionSettings.enabled = $(e.target).prop("checked");
		saveSettingsDebounced();
	});

	settingsHtml.find("#presence_location").on("change", (e) => {
		extensionSettings.location = $(e.target).val();
		saveSettingsDebounced();
		addPresenceTrackerToMessages(true);
	});

	settingsHtml.find("#presence_seeLast").on("change", (e) => {
		extensionSettings.seeLast = $(e.target).prop("checked");
		saveSettingsDebounced();
	});

	settingsHtml.find("#presence_includeMuted").on("change", (e) => {
		extensionSettings.includeMuted = $(e.target).prop("checked");
		saveSettingsDebounced();
	});

	settingsHtml.find("#presence_debug").on("change", (e) => {
		extensionSettings.debugMode = $(e.target).prop("checked");
		saveSettingsDebounced();
	});

	$("#extensions_settings").append(settingsHtml);

    const universalTrackerAlwaysOn = `
        <label class="checkbox_label whitespacenowrap" title="Set the universal tracker to active for new messages" style="margin-top: 7px">
            <input id="presence_universal_tracer_on" type="checkbox"/>
            <span data-i18n="Universal Tracker">Universal Tracker</span>
        </label>
    `;

    $('#GroupFavDelOkBack .flex1').append(universalTrackerAlwaysOn);
	$('#presence_universal_tracer_on').prop("checked", extensionSettings.universalTrackerOn);
    $('#presence_universal_tracer_on').on("change", (e) => {
        debug("universalTrackerOn", $(e.target).prop("checked"));
		extensionSettings.universalTrackerOn = $(e.target).prop("checked");
		saveSettingsDebounced();
	});
});
