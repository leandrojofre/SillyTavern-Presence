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

Each message will have a little icon for each character who was 'present' for that message.  
![little icons to show who is present](images/small-icons.png)  
  
You can control who is 'present' (i.e. who remembers things) by enabling or disabling automatic replies from that character.  
Characters remember two things:   
	- 1 messages they were present for   
	- 2 the message directly before the one they are replying to, this is only short in short term memory while they are "typing" but moves to long term memory when their message actually gets sent.  
  
You can also change who was present for a message after it is recieved, hover over the little icons that show who was present and they will expand and show an icon for everyone whether they were there or not. Just click an icon to change whether that character was present.  
![big icons you can click to toggle](images/large-icons.png)  

#### The all seeing narrator
If you have a character who should see everything (such as a narrator) then can head to the character management panel where you'll find a new button next to each character.  
![an extra button next to each character in the shape of an eye with a slash through it](images/char-panel.png)  
Click this button and it lights up, that will indicate that this character can see EVERYTHING.


### Commands
Currently there is only one command.  
	/presenceforget "Character name"  
This command COMPLETELY and IRREVERSIBLY wipes the memory of the given character.  



## Problems / TODO

### Impersonations
Due to the way SillyTavern handles events, there is no way to tell if a message is being generated on behalf of the user (i.e. using the impersonate button).  
SillyTavern uses a random character to generate the message for the user, and so the impersonation will be limited to information in that character's memory.  

The work around is to change a few lines of code in SillyTavern/Public/group-chats.js  

Change   

	await eventSource.emit(event_types.GROUP_MEMBER_DRAFTED, chId);  
To  

	if(type == 'impersonate') {  
		await eventSource.emit(event_types.GROUP_MEMBER_DRAFTED, chId, 'impersonate');  
	} else {  
		await eventSource.emit(event_types.GROUP_MEMBER_DRAFTED, chId);  
	}  
Approx line 880
