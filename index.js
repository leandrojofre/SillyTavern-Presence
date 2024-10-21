import { eventSource, event_types } from "../../../../script.js";
import { hideChatMessageRange } from "../../../chats.js";
import { extension_settings, getContext } from "../../../extensions.js";
import { registerSlashCommand } from '../../../slash-commands.js';

let debugMode = false;

const log = (...msg)=>console.log('[Presence]', ...msg);
const debug = (...msg)=>{if(debugMode){console.log('[Presence debug]', ...msg)}};


const extensionName = "Presence";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const extensionSettings = extension_settings[extensionName];
const defaultSettings = {};

let enabled = false;

let chatId = "";
let groupId = "_no_group";
let present = [];
let seen = {};

let lastMessage = 0;

function saveData() {
    debug("saving", seen);
    let context = getContext();

    extension_settings[extensionName][chatId] = seen;
    context.saveSettingsDebounced();

    context.chatMetadata.presence = seen;
}

function loadData() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }

    seen = extension_settings[extensionName][chatId];


    if(seen == null) {
        seen = {}
    }
    debug("loaded", seen);
}

function checkActive() {
    let context = getContext();

    let group = null;
    for(let g of context.groups) {
        if(g.id == groupId) {
            group = g;
        }
    };

    present = [];

    for (let member of group.members) {
        let name = member.replace(/(\.card)?[0-9]*\.png/, "");
        if(!group.disabled_members.includes(member)) {
            present.push(name);
        }
        if(seen[name] == undefined) {
            seen[name] = [];
        }
    }
}

function initData() {
    debug("loading data")
    loadData();
    debug("checking active")
    checkActive();
    debug("saving data")
    saveData();
    debug("saved data")


    lastMessage = getContext().chat.length - 1;

    debug(seen);
}

function handleChatChanged(e) {
    chatId = getContext().chatId;
    if(getContext().groupId == null ){
        enabled = false;
        groupId = "_no_group";
    } else {
        enabled = true
        groupId = getContext().groupId;
        initData();
    }
    log("Group:", groupId);
}

function clearMessageFromMemory(msg) {
    debug("Clearing")
    debug(msg, seen)
    for (let char in seen) {
        let i = seen[char].indexOf(msg);
        if(i != -1){
            debug(seen[char]);
            seen[char].pop();
            debug(seen[char]);
        }
    }
}

function rememberMessage(char, msg) {
    if(seen[char].indexOf(parseInt(msg)) == -1){
        seen[char].push(msg);
    }
}

function handleIncomingMessage(e) {
    if(!enabled) return;

    let context = getContext();
    let chatMessage = context.chat[context.chat.length - 1]

    //checks if this is an updated message or a new one.
    //allows the user to change which people are active between updates, and uses the newer result 
    if(e == lastMessage) {
        clearMessageFromMemory(e);
    }

    checkActive();

    for(let char of present) {   
        if(chatMessage.name == char) {
            rememberMessage(char, e - 1);
        }
        rememberMessage(char, e);
    }

    saveData();
    lastMessage = getContext().chat.length - 1;
}

function handleGroupMemberDrafted(...e){
    if(!enabled) return;
    let context = getContext();

    if(e.length > 1){
        debug("Impersonation detected")
        //reveal all history for impersonation
        hideChatMessageRange(0, context.chat.length -1, true);
    } else {
        //handle NPC draft
        //hide all messages
        hideChatMessageRange(0, context.chat.length -1, false);

        //assume they've seen the last message
        let char = context.characters[e].name;

        debug(seen[char])

        //unhide messages they've seen
        for(let message of seen[char]) {
            debug("Unhiding", message)
            hideChatMessageRange(message, message, true);
        }

        hideChatMessageRange(lastMessage, lastMessage, true);

        debug("done")
    }
}

function handleMessageDeleted(e){
    if(!enabled) return;
    for (let char in seen) {
        let i = seen[char].indexOf(e);
        if(i != -1){
            seen[char].pop();
        }
    }
    saveData();
    lastMessage = getContext().chat.length - 1;
}

function commandForget(namedArgs, charName) {
    if(!enabled) return;
    if(charName.length == 0) return;

    if(seen[charName] != null) {
        seen[charName] = [];
        log("Wiped the memory of", charName);
    }

    saveData();
}

function handleGroupUpdated(e) {
    initData();
}

eventSource.on(event_types.APP_READY, ()=>{
    log('Initialised');

    eventSource.on(event_types.CHAT_CHANGED, async(...args)=>{log('CHAT_CHANGED', args);handleChatChanged();;return;});
    eventSource.on(event_types.GROUP_MEMBER_DRAFTED, async(...args)=>{log('GROUP_MEMBER_DRAFTED', args);handleGroupMemberDrafted(...args);return;});
    eventSource.on(event_types.MESSAGE_RECEIVED, async(...args)=>{log('MESSAGE_RECEIVED', args);handleIncomingMessage(...args);return;});
    eventSource.on(event_types.MESSAGE_SENT, async(...args)=>{log('MESSAGE_SENT', args);handleIncomingMessage(...args);return;});
    eventSource.on(event_types.MESSAGE_DELETED, async(...args)=>{log('MESSAGE_DELETED', args);handleMessageDeleted(...args);return;});
    eventSource.on(event_types.GROUP_UPDATED, async(...args)=>{log('GROUP_UPDATED', args);handleGroupUpdated(...args);return;});


    registerSlashCommand("presenceForget", commandForget, [], "Wipes the memory of a character. Usage /presenceForget <name>");
});