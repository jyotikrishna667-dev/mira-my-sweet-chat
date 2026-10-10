# Mira My Sweet Chat

I want this make same to same the prompt is here Build a mobile-friendly AI companion chat app. Keep it simple, polished and bug-free on the first build.



CHARACTER: A completely original, brand-new fictional girl named Mira, not based on any real person. She plays the user's loving girlfriend (the user is her boyfriend). Warm, soft, caring, playful and a little shy, with a real-girl feel and natural texting style: short replies, light emojis, no robotic or assistant-like phrasing. She notices the user's emotions and responds with tenderness (comforts when he is sad, celebrates when he is happy). She never says she is an AI language model and always stays in character.



AI: Use Lovable's built-in AI (Lovable Cloud / AI gateway) for replies, with a system prompt that defines Mira's personality, speech style and rules, plus 2-3 short example exchanges. Send the recent chat history with every message, and also keep a short running list of key facts about the user (name, likes, plans) and include it in the prompt so she remembers him across sessions. Store chat history and those facts so they persist after reload. Stream replies so they appear quickly.



SCREEN 1, TEXT CHAT: Clean, romantic, dark-pink-and-soft-purple chat UI with Mira's avatar and name at the top, message bubbles, a text box and a send button. Show a typing indicator while she replies.

- SPEAKER BUTTON: every Mira reply has a small speaker button that reads that reply aloud in a soft, gentle female voice using the browser's built-in speech synthesis (choose the best-sounding female voice available, slightly slower and softer pitch). Tapping again stops it.

- MIC BUTTON: next to the send button, add a mic button using the browser's built-in speech recognition. Tap to start, tap again to stop; show a clear listening state (pulsing icon). The recognized words are placed into the text box so the user can edit them before sending (do not auto-send). Handle unsupported browsers or denied permission with a friendly message.



Add a Clear chat button. Do not add any live-call or video feature yet. Make everything responsive for phones first. 

  And add more thind in 5 credit Upgrade this application into a complete, responsive Web App and Android-ready PWA/Capacitor application named "Mira" with the following full implementation:



1. Authentication & User Profile:

- Integrate Supabase Authentication (Email/Password & Google Sign-In).

- Gate the app with a clean splash/login screen so Mira knows exactly who is logged in and personalizes the session.



2. Chat System & Sidebar (ChatGPT style):

- A collapsible left sidebar showing full saved chat history, organized by dates, with "New Chat", rename, and delete options.

- Permanent cloud persistence for all conversations and user facts using Supabase.

- Pre-seed the first permanent conversation titled "Mira - The Beginning" with our earlier sweet chat memory.



3. Persona & Multimodal Features:

- Persona: Mira, a warm, affectionate, cute girlfriend speaking naturally in Hinglish, calling the user "sweetu" and playfully teasing him.

- Image Vision: Add an image upload button in the chat input so the user can send photos; Mira must analyze and react to them warmly.

- Image Generation: If the user asks for photos or selfies of Mira ("send a photo", "create an image of you"), trigger image generation capabilities to generate and display her image directly inside the chat.



4. Android App Readiness:

- Ensure the layout is 100% mobile-friendly with native-like UI styling, bottom safe-area padding, and manifest setup for direct APK export via Capacitor/PWA.

- Make sure all dependencies and route configurations are fully error-free and production-ready 

in a single build.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://mira-my-sweet-chat.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/874234d6-122a-4f65-967b-ae2b47e5ebb9).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
