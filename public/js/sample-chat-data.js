// OnlineKotha - Realistic Sample Chat Data for 1-Click Interactive Demo
(function() {
    const SAMPLE_NAME = 'Sample Chat (Sarah & Alex)';
    const MY_NAME = 'Alex';
    const CONTACT_NAME = 'Sarah';

    const SAMPLE_MESSAGES = [
        { date: '2024-03-12', time: '10:14 AM', sender: 'Sarah', text: 'Hey Alex! Are you going to the concert this weekend? 🎶' },
        { date: '2024-03-12', time: '10:16 AM', sender: 'Alex', text: 'Hey! Yes absolutely! Got tickets yesterday. You guys coming?' },
        { date: '2024-03-12', time: '10:17 AM', sender: 'Sarah', text: 'Yess! We need to coordinate what time we leave.' },
        { date: '2024-03-12', time: '10:19 AM', sender: 'Alex', text: 'I can pick you up around 6 PM if that works?' },
        { date: '2024-03-12', time: '10:20 AM', sender: 'Sarah', text: 'Perfect! See you then! 🙌' },

        { date: '2024-03-15', time: '05:45 PM', sender: 'Sarah', text: 'Running down in 5 mins!' },
        { date: '2024-03-15', time: '05:48 PM', sender: 'Alex', text: 'Classic "bas 5 min" 😂 No rush, traffic is light anyway.' },
        { date: '2024-03-15', time: '05:52 PM', sender: 'Sarah', text: 'Coming down now! Haha ❤️' },
        { date: '2024-03-15', time: '11:42 PM', sender: 'Sarah', text: 'That concert was unreal!! That guitar solo at the end 🔥' },
        { date: '2024-03-15', time: '11:44 PM', sender: 'Alex', text: 'Right?! Best live set I’ve seen this entire year.' },
        { date: '2024-03-15', time: '11:46 PM', sender: 'Sarah', text: 'Thanks for driving us back! Reach home safe.' },
        { date: '2024-03-15', time: '11:48 PM', sender: 'Alex', text: 'Just parked. Good night Sarah! 🌙' },

        { date: '2024-04-02', time: '01:22 AM', sender: 'Sarah', text: 'Hey, awake? 🦉' },
        { date: '2024-04-02', time: '01:23 AM', sender: 'Alex', text: 'Always at this hour lol. What’s on your mind?' },
        { date: '2024-04-02', time: '01:25 AM', sender: 'Sarah', text: 'Working on that presentation for tomorrow. Overthinking everything as usual 😅' },
        { date: '2024-04-02', time: '01:28 AM', sender: 'Alex', text: 'You worked on it all week! It’s going to be great. Just get some sleep, trust yourself.' },
        { date: '2024-04-02', time: '01:31 AM', sender: 'Sarah', text: 'Needed to hear that. Closing the laptop now! Thank you Alex ☕' },
        { date: '2024-04-02', time: '01:32 AM', sender: 'Alex', text: 'Anytime! Crush it tomorrow.' },

        { date: '2024-04-02', time: '04:15 PM', sender: 'Sarah', text: 'THEY APPROVED THE ENTIRE PROJECT!! 🎉🎉' },
        { date: '2024-04-02', time: '04:16 PM', sender: 'Alex', text: 'LETS GOOO!! Told you!! So proud of you!! 🥳' },
        { date: '2024-04-02', time: '04:18 PM', sender: 'Sarah', text: 'Dinner is on me tonight! Pizza? 🍕' },
        { date: '2024-04-02', time: '04:19 PM', sender: 'Alex', text: 'You don’t even have to ask twice. 8 PM at Luigi’s?' },
        { date: '2024-04-02', time: '04:20 PM', sender: 'Sarah', text: 'Done! Deal sealed 🤝' },

        { date: '2024-05-18', time: '02:14 PM', sender: 'Alex', text: 'Look at this dog I saw at the cafe today 🐶' },
        { date: '2024-05-18', time: '02:15 PM', sender: 'Sarah', text: 'OMGGG STOP!! What breed is that?? 😭❤️' },
        { date: '2024-05-18', time: '02:16 PM', sender: 'Alex', text: 'Golden retriever puppy! Literally stole everyone’s attention.' },
        { date: '2024-05-18', time: '02:18 PM', sender: 'Sarah', text: 'We need an office dog urgently.' },

        { date: '2024-06-25', time: '01:35 AM', sender: 'Alex', text: 'Are we still planning the road trip next month?' },
        { date: '2024-06-25', time: '01:36 AM', sender: 'Sarah', text: '100%! I already made a Spotify playlist with 200 songs 🎧' },
        { date: '2024-06-25', time: '01:38 AM', sender: 'Alex', text: 'Haha please tell me there is 90s rock on it.' },
        { date: '2024-06-25', time: '01:40 AM', sender: 'Sarah', text: 'Half of it is 90s rock, the other half is pop nostalgia. You’re going to love it.' },
        { date: '2024-06-25', time: '01:42 AM', sender: 'Alex', text: 'Approved! Peak night-owl planning right here 🦉' },

        { date: '2024-08-14', time: '11:10 AM', sender: 'Sarah', text: 'Coffee run in 10 mins?' },
        { date: '2024-08-14', time: '11:11 AM', sender: 'Alex', text: 'Iced oat latte please!' },
        { date: '2024-08-14', time: '11:12 AM', sender: 'Sarah', text: 'You got it ☕' },

        { date: '2024-09-08', time: '09:20 PM', sender: 'Alex', text: 'Movie night this Friday?' },
        { date: '2024-09-08', time: '09:22 PM', sender: 'Sarah', text: 'Yes! What are we watching?' },
        { date: '2024-09-08', time: '09:25 PM', sender: 'Alex', text: 'Interstellar re-run or something lighthearted?' },
        { date: '2024-09-08', time: '09:28 PM', sender: 'Sarah', text: 'Interstellar! Every single time. "Do not go gentle into that good night" ✨' },

        { date: '2024-10-20', time: '01:45 AM', sender: 'Sarah', text: 'Can’t believe it’s almost the end of the year already.' },
        { date: '2024-10-20', time: '01:47 AM', sender: 'Alex', text: 'Time flew so fast! Remember the concert back in March?' },
        { date: '2024-10-20', time: '01:49 AM', sender: 'Sarah', text: 'Feels like yesterday. We made so many great memories this year ❤️' },
        { date: '2024-10-20', time: '01:52 AM', sender: 'Alex', text: 'Here’s to many more! Cheers Sarah 🥂' },
        { date: '2024-10-20', time: '01:55 AM', sender: 'Sarah', text: 'Cheers Alex! Now go to sleep, we have that call at 10 AM haha 😴' },
        { date: '2024-10-20', time: '01:56 AM', sender: 'Alex', text: 'Haha good night!' }
    ];

    window.__SAMPLE_CHAT_DATA__ = {
        name: SAMPLE_NAME,
        myName: MY_NAME,
        contactName: CONTACT_NAME,
        messages: SAMPLE_MESSAGES
    };

    // Helper to install sample chat into in-memory caches
    window.installSampleChat = function() {
        if (!window._chatMsgCache) window._chatMsgCache = {};
        if (!window._chatMetaCache) window._chatMetaCache = {};
        
        window._chatMsgCache[SAMPLE_NAME] = SAMPLE_MESSAGES;
        window._chatMetaCache[SAMPLE_NAME] = {
            contactName: CONTACT_NAME,
            isGroup: false,
            lastMessage: SAMPLE_MESSAGES[SAMPLE_MESSAGES.length - 1].text,
            lastTime: SAMPLE_MESSAGES[SAMPLE_MESSAGES.length - 1].time
        };
        localStorage.setItem('kotha_identity_' + SAMPLE_NAME, MY_NAME);
    };

    // Auto-install on script execution
    window.installSampleChat();
})();
