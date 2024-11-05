import { characters, chat, chat_metadata, eventSource, event_types, getCurrentChatId, saveChatDebounced, saveSettingsDebounced } from "../../../../script.js";
import { groups, is_group_generating, selected_group } from "../../../../scripts/group-chats.js";
import { hideChatMessageRange } from "../../../chats.js";
import { extension_settings } from "../../../extensions.js";
import { SlashCommand } from "../../../slash-commands/SlashCommand.js";
import { ARGUMENT_TYPE, SlashCommandArgument } from "../../../slash-commands/SlashCommandArgument.js";
import { commonEnumProviders } from "../../../slash-commands/SlashCommandCommonEnumsProvider.js";
import { SlashCommandParser } from "../../../slash-commands/SlashCommandParser.js";

const extensionName = "Presence";

const extensionNameLong = `SillyTavern-${extensionName}`;
const extensionFolderPath = `scripts/extensions/third-party/${extensionNameLong}`;
const extensionSettings = extension_settings[extensionName];
const defaultSettings = {
	enabled: true,
	location: "top",
	debugMode: false,
	seeLast: true,
	includeMuted: false,
};


const log = (...msg) => console.log("[" + extensionName + "]", ...msg);
const warn = (...msg) => console.warn("[" + extensionName + " Warning]", ...msg);
const debug = (...msg) => {
	if (extensionSettings.debugMode) {
		console.log("[" + extensionName + " debug]", ...msg);
	}
};

const initSettings = async () => {
	if (!extensionSettings || extensionSettings == {}) {
		extensionSettings[extensionName] = defaultSettings;
		saveSettingsDebounced();
	} else if (extensionSettings.enabled == undefined) {
		extensionSettings[extensionName] = { ...defaultSettings, ...extensionSettings };
		saveSettingsDebounced();
	}
};

const getMessage = async (mesId) => {
	return chat[mesId];
};

const getCurrentParticipants = async () => {
	const group = groups.find((g) => g.id == selected_group);
	var active = group.members.filter((m) => !group.disabled_members.includes(m));
	return { members: group.members, present: active };
};

const isActive = () => {
	return selected_group != null && extensionSettings.enabled;
};

const onNewMessage = async (mesId) => {
	if (!isActive()) return;
	const mes = await getMessage(mesId);
	mes.present = (await getCurrentParticipants()).present;
	debug("seeLast", extensionSettings.seeLast);
	debug("is_user", mes.is_user);
	debug("original_avatar", mes.original_avatar);
	if(extensionSettings.seeLast && !mes.is_user) {
		const prevMes = await getMessage(mesId - 1);
		debug(prevMes);
		if(!prevMes.present){
			prevMes.present = [];
		}
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

	$(selector).each(async (index, element) => {
		const mesId = $(element).attr("mesid");
		const mes = await getMessage(mesId);
		const mesPresence = mes.present ?? [];
		const members = (await getCurrentParticipants()).members;

		const trackerMembers = members.concat(mesPresence.filter((m) => !members.includes(m))).sort();

		const presenceTracker = $('<div class="mes_presence_tracker"></div>');

		trackerMembers.forEach((member) => {
			const isPresent = mesPresence.includes(member);
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
		element.setAttribute("has_presence_tracker", true);
	});
};

const updateMessagePresence = async (mesId, member, isPresent) => {
	const mes = await getMessage(mesId);
	if (!mes.present) mes.present = [];

	if (isPresent) {
		mes.present.push(member);
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

	if (type == "impersonate" || chat_metadata.ignore_presence?.includes(char)) {
		debug("Impersonation detected");
		//reveal all history for impersonation
        	toggleVisibilityAllMessages(true);
	} else {
		//handle NPC draft
		//hide all messages
		toggleVisibilityAllMessages(false);

		const messages = chat.map((m, i) => ({ id: i, present: m.present ?? [] })).filter((m) => m.present.includes(char));

		//unhide messages they've seen
		for (const message of messages) {
			debug("Unhiding", message);
			hideChatMessageRange(message.id, message.id, true);
		}

		const lastMessage = chat.length - 1;
		hideChatMessageRange(lastMessage, lastMessage, true);

		debug("done");
	}
};

const commandForget = async (namedArgs, charName) => {
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
	addPresenceTrackerToMessages(true);
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
	addPresenceTrackerToMessages(true);
};

const togglePresenceTracking = async (e) => {
	const target = $(e.target).closest(".group_member");
	const charId = target.attr("chid");
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
	const charId = member.attr("chid");

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
				warn("WARN: No character name provided for /presenceForget command");
				return;
			}
			value = value.trim();
			await commandForget(args, value);
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
		helpString: "Wipes the memory of a character. Usage /presenceForget <name>",
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
			value = value.trim();
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
	settingsHtml.find("#presence_seeLast").prop("checked", extensionSettings.seeLast);
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
		debug("[includeMuted: value]", extensionSettings.includeMuted);
		saveSettingsDebounced();
	});

	settingsHtml.find("#presence_debug").on("change", (e) => {
		extensionSettings.debugMode = $(e.target).prop("checked");
		saveSettingsDebounced();
	});

	$("#extensions_settings").append(settingsHtml);
});
