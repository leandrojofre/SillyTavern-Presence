import {characters, chat, chat_metadata, eventSource, event_types, getCurrentChatId, saveChatDebounced, saveSettingsDebounced} from "../../../../script.js";
import {groups, is_group_generating, selected_group} from "../../../../scripts/group-chats.js";
import {hideChatMessageRange} from "../../../chats.js";
import {extension_settings} from "../../../extensions.js";
import * as eventListeners from "./src/js/eventListeners.js";
import * as slashCommands from "./src/js/slashCommands.js";

const extensionName = "Presence";
const extensionNameLong = `SillyTavern-${extensionName}`;
const extensionFolderPath = `scripts/extensions/third-party/${extensionNameLong}`;
const context = SillyTavern.getContext();
const extensionSettings = extension_settings[extensionName];
const defaultSettings = {
	enabled: true,
	location: "top",
	debugMode: false,
	seeLast: true,
	includeMuted: false,
    universalTrackerOn: false
};

// * Debug Methods

export function log(...msg) {
    if (extensionSettings.debugMode) console.log("[" + extensionName + "]", ...msg)
}

export function warn(...msg) {
    console.warn("[" + extensionName + " Warning]", ...msg)
}

export function debug(...msg) {
	if (extensionSettings.debugMode) console.debug("[" + extensionName + " debug]", ...msg);
}

// * Extension Methods

/** Destroys an element and all data associated with it
    @param {String|HTMLElement|JQuery<any>} element
*/
function destroyElement(element) {
    const elem = $(element);

    elem.find('*').each(function() {
        const child = $(this);

        // Destroy even listeners
        child.off();

        // Clean any ghost data
        $.cleanData([child[0]]);

        // Destroy elements
        child.remove();
    });

    const leftoversCount = elem.children().length;

    if (leftoversCount) {
        elem.empty();
    }

	elem.remove();
}

export function isActive() {
	return selected_group != null && extensionSettings.enabled;
}

export async function getCurrentParticipants() {
	const group = groups.find((g) => g.id == selected_group);

	var active = [...group.members];

    if (extensionSettings.universalTrackerOn) active.push('presence_universal_tracker');

	if (!extensionSettings.includeMuted)
		active = active.filter(char => !group.disabled_members.includes(char));

	if (!chat_metadata.ignore_presence) chat_metadata.ignore_presence = [];

	chat_metadata.ignore_presence.forEach(char => {
		if (active.includes(char)) active.splice(active.indexOf(char), 1);
	});

	return { members: group.members, present: active };
}

export async function onNewMessage(mesId) {
	if (!isActive()) return;

	const mes = chat[mesId];

	mes.present = [...(await getCurrentParticipants()).present];

	if(extensionSettings.seeLast && !mes.is_user) {
		const prevMes = chat[mesId - 1];

		if(!prevMes.present) prevMes.present = [];

		if(!prevMes.present.includes(mes.original_avatar)){
			prevMes.present.push(mes.original_avatar);
		}
	}

	await saveChatDebounced();
}

export async function addPresenceTrackerToMessages(refresh) {
	if (refresh) {
		let trackers = $("#chat .mes_presence_tracker");
		let messages = trackers.closest(".mes");

        messages.removeAttr("has_presence_tracker");

        destroyElement(trackers);
	}

	let selector = "#chat .mes:not(.smallSysMes,[has_presence_tracker=true])";

	if (refresh) {
        destroyElement("#chat .mes_presence_tracker");
	}

    const elements = $(selector).toArray();

    for (const element of elements) {
        const mesId = $(element).attr("mesid");
        const mes = chat[mesId];

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
}

export async function onChatChanged() {
	$("#show_more_messages").off("mouseup touchend", addPresenceTrackerToMessages);

	if (!isActive()) {
		return;
	}

	await migrateOldTrackingData();

	addPresenceTrackerToMessages(true);

	$("#rm_group_members .group_member").each((index, element) => {
		updatePresenceTrackingButton($(element));
	});

	$("#show_more_messages").on("mouseup touchend", addPresenceTrackerToMessages);
}

export async function onGenerationAfterCommands(type, config, dryRun) {
	if (!isActive() && !is_group_generating) return;

	eventSource.once(event_types.GROUP_MEMBER_DRAFTED, draftHandler);
	eventSource.once(event_types.GENERATION_STOPPED, stopHandler);

	async function draftHandler(...args) {
        eventSource.removeListener(event_types.GENERATION_STOPPED, stopHandler);
		onGroupMemberDrafted(type, args[0]);
		return;
	}

	async function stopHandler() {
		eventSource.removeListener(event_types.GROUP_MEMBER_DRAFTED, draftHandler);
	}
}

export async function toggleVisibilityAllMessages(state = true) {
	await hideChatMessageRange(0, chat.length - 1, state);
}

async function updateMessagePresence(mesId, member, isPresent) {
	const mes = chat[mesId];
	if (!mes.present) mes.present = [];

	if (isPresent) {
		mes.present.push(member);
        mes.present = [...new Set(mes.present)];
	} else {
		mes.present = mes.present.filter((m) => m != member);
	}
	saveChatDebounced();
}

async function onGroupMemberDrafted(type, charId) {
	if (!isActive()) return;

	const char = characters[charId].avatar;
	const lastMessage = await chat[chat.length - 1];
	const isUserContinue = (type == "continue" && lastMessage.is_user);

	if (
		type == "impersonate" ||
		isUserContinue ||
		chat_metadata.ignore_presence?.includes(char)
	) {
        await toggleVisibilityAllMessages(true);
	} else {
		await toggleVisibilityAllMessages(false);

		const messages = chat
            .map((m, i) => ({ id: i, present: m.present ?? [] }))
            .filter((m) => m.present.includes(char) || m.present.includes("presence_universal_tracker"));

		for (const message of messages) {
			hideChatMessageRange(message.id, message.id, true);
		}

        if (extensionSettings.seeLast) {
            const lastMessageID = chat.length - 1;
            hideChatMessageRange(lastMessageID, lastMessageID, true);
        }
	}
}

async function togglePresenceTracking(e) {
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
}

async function migrateOldTrackingData() {
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

        await saveChatDebounced();
		delete extension_settings[extensionName][getCurrentChatId()];
	}
}

// * Initialize Extension

function initExtensionSettings() {

	if (!context.extensionSettings[extensionName]) {
	    context.extensionSettings[extensionName] = structuredClone(defaultSettings);
	}

	for (const key of Object.keys(defaultSettings)) {
	    if (context.extensionSettings[extensionName][key] === undefined) {
		   context.extensionSettings[extensionName][key] = defaultSettings[key];
	    }
	}
}

async function updatePresenceTrackingButton(member) {
	const target = member.find(".ignore_presence_toggle");
	const charId = member.data("chid");

	if (!chat_metadata?.ignore_presence?.includes(characters[charId].avatar)) {
		target.removeClass("active");
	} else {
		target.addClass("active");
	}
}

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

	initExtensionSettings();

    eventListeners.startListeners();
    slashCommands.registerSlashCommands();

	const settingsHtml = $(await $.get(`${extensionFolderPath}/html/settings.html`));

	settingsHtml.find("#presence_enable").prop("checked", extensionSettings.enabled);
	settingsHtml.find("#presence_enable").on("change", (e) => {
		extensionSettings.enabled = $(e.target).prop("checked");
		saveSettingsDebounced();
	});

	settingsHtml.find("#presence_location").val(extensionSettings.location);
	settingsHtml.find("#presence_location").on("change", (e) => {
		extensionSettings.location = $(e.target).val();
		saveSettingsDebounced();
		addPresenceTrackerToMessages(true);
	});

	settingsHtml.find("#presence_seeLast").on("input", function(e) {
        extensionSettings.seeLast = Boolean($(e.target).prop("checked"));
    });
	settingsHtml.find("#presence_seeLast").on("change", (e) => {
		extensionSettings.seeLast = $(e.target).prop("checked");
		saveSettingsDebounced();
	});

	settingsHtml.find("#presence_includeMuted").prop("checked", extensionSettings.includeMuted);
	settingsHtml.find("#presence_includeMuted").on("change", (e) => {
		extensionSettings.includeMuted = $(e.target).prop("checked");
		saveSettingsDebounced();
	});

	settingsHtml.find("#presence_debug").prop("checked", extensionSettings.debugMode);
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
		extensionSettings.universalTrackerOn = $(e.target).prop("checked");
		saveSettingsDebounced();
	});
});
