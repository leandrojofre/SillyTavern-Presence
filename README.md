## Installation
Use ST's inbuilt extension installer with this URL:  
https://github.com/lackyas/SillyTavern-Presence



## Usage
Just start chatting!  
It really is that simple!  
  
Okay, but really here's how it works.  
SillyTavern has two kinds of chats and this plugin works differently for both:  
  
### Individual chats
If you're talking one on one with a character then this plugin will do nothing, nudda.  
It simple disables itself if you are not in a group chat.  
  
### Group chats
In a group chat this plugin will restrict each character's memory to what they were there for.  
This is done by hiding all messages that they don't remember.  
  
You can control who is 'present' (i.e. who remebers things) by enabling or disabling automatic replies from that character.  
Characters remember two things:   
	- 1 messages they were present for   
	- 2 the message directly before the one they are replying to, this is only short in short term memory while they are "typing" but moves to long term memory when their message actually gets sent.  
  
### Commands
Currently there is only one command.  
	/presenceforget "Character name"  
This command COMPLETELY and IRREVERSIBLY wipes the memory of the given character.  



## Problems / TODO
### Starting a group chat
When you start a group chat there's a message from each person in the group. However because these weren't sent by the characters through the usual system, they are not picked up by any characters. No one remembers these.  

### Branching chats
Character memory is tied to the chatID and does not transfer over to new branches because they have new chatIDs.  
This is currently an intentional work around to stop characters remembering messages from the original chat chain after the branch point.  
There are better ways to do this but they would involve changing how data is saved.  

### Deleting messages
Due to the way SillyTavern handles events, there is no way to tell what message was being deleted.
As such this plugin always assumes it was the MOST RECENT message that was deleted, and it updates characters' memories accordingly

### Impersonations
Due to the way SillyTavern handles events, there is no way to tell if a message is being generated on behalf of the user (i.e. using the impersonate button).  
SillyTavern uses a random character to generate the message for the user, and so the impersonation will be limited to information in that character's memory.  

The work around is to change a few lines of code in SillyTavern/Public/script.js  

Change   

	await eventSource.emit(event_types.GROUP_MEMBER_DRAFTED, chId);  
To  

	if(type == 'impersonate') {  
		await eventSource.emit(event_types.GROUP_MEMBER_DRAFTED, chId, 'impersonate');  
	} else {  
		await eventSource.emit(event_types.GROUP_MEMBER_DRAFTED, chId);  
	}  
Approx line 880
