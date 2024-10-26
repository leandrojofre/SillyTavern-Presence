import { chat, chat_metadata, getCurrentChatId, characters, saveChatDebounced, saveSettingsDebounced, eventSource, event_types } from "../../../../script.js";
import { groups, selected_group } from "../../../../scripts/group-chats.js";
import { hideChatMessageRange } from "../../../chats.js";
import { extension_settings } from "../../../extensions.js";
import { commonEnumProviders } from "../../../slash-commands/SlashCommandCommonEnumsProvider.js";
import { SlashCommand } from "../../../slash-commands/SlashCommand.js";
import { ARGUMENT_TYPE, SlashCommandArgument } from "../../../slash-commands/SlashCommandArgument.js";
import { SlashCommandParser } from "../../../slash-commands/SlashCommandParser.js";

const extensionName = "Presence";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const extensionSettings = extension_settings[extensionName];
const defaultSettings = {};

let debugMode = false;

const log = (...msg) => console.log("[" + extensionName + "]", ...msg);
const warn = (...msg) => console.warn("[" + extensionName + "] Warning", ...msg);
const debug = (...msg) => {
	if (debugMode) {
		console.log("[" + extensionName + " debug]", ...msg);
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

const isGroupChat = () => {
	return selected_group != null;
};

const onNewMessage = async (mesId) => {
	if (!isGroupChat()) return;
	const mes = await getMessage(mesId);
	mes.present = (await getCurrentParticipants()).present;
	await saveChatDebounced();
	debug("Present members added to last message");
};

const addPresenceTrackerToMessages = async (refresh) => {
	let selector = "#chat .mes:not(.smallSysMes";
	if (!refresh) selector += ",[has_presence_tracker=true]";
	selector += ")";

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
		$(".mes_block > .ch_name > .flex1", element).append(presenceTracker);
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

	if (!isGroupChat()) {
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
	if (!isGroupChat()) return;

	eventSource.once(event_types.GROUP_MEMBER_DRAFTED, draftHandler);
	eventSource.once(event_types.GENERATION_STOPPED, stopHandler);

	async function draftHandler(...args) {
		log("GROUP_MEMBER_DRAFTED", args);
		eventSource.removeListener(event_types.GENERATION_STOPPED, stopHandler);
		onGroupMemeberDrafted(type, args[0]);
		return;
	}

	async function stopHandler() {
		eventSource.removeListener(event_types.GROUP_MEMBER_DRAFTED, draftHandler);
	}
};

const onGroupMemeberDrafted = async (type, charId) => {
	if (!isGroupChat()) return;

	const char = characters[charId].avatar;

	if (type == "impersonate" || chat_metadata.ignore_presence?.includes(char)) {
		debug("Impersonation detected");
		//reveal all history for impersonation
		hideChatMessageRange(0, chat.length - 1, true);
	} else {
		//handle NPC draft
		//hide all messages
		hideChatMessageRange(0, chat.length - 1, false);

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
	if (!isGroupChat()) return;
	if (charName.length == 0) return;

	const char = characters.find((c) => c.name == charName).avatar;

	const messages = chat;
	const charMessages = chat.map((m, i) => ({ id: i, present: m.present ?? [] })).filter((m) => m.present.includes(char));

	for (const charMes of charMessages) {
		log(charMes);
		messages[charMes.id].present = charMes.present.filter((m) => m != char);
	}

	log("Wiped the memory of", charName);

	saveChatDebounced();
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

	if (!chat_metadata.ignore_presence.includes(characters[charId].avatar)) {
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
		log(newData);
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
eventSource.on(event_types.MESSAGE_RECEIVED, async (...args) => {
	log("MESSAGE_RECEIVED", args);
	onNewMessage(...args);
	return;
});
eventSource.on(event_types.MESSAGE_SENT, async (...args) => {
	log("MESSAGE_SENT", args);
	onNewMessage(...args);
	return;
});

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
});
