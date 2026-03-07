

## Project: Desktop Messaging & Video Calling App (Telegram-like)

---

# 1. Project Overview

Build a **cross-platform desktop messaging and video calling application** similar to **Telegram**.

The application must support:

* Real-time messaging
* File sharing
* Video calling
* Voice calling
* Group chats
* Online presence
* Read receipts
* End-to-end encryption
* Desktop notifications

The system must be **scalable, secure, and modular**.

---

# 2. Technology Stack

## Desktop Client

* **Electron**
* **React**
* **TypeScript**
* **Vite**

## Backend

* **Node.js**
* **Express.js**

## Realtime Communication

* **Socket.io**
* **WebRTC**

## Database

* **Firebase Firestore**

## Authentication

* **Firebase Authentication**
* **Google OAuth**

## File Storage

* **Firebase Storage**

## Notifications

* Electron desktop notifications

---

# 3. High Level Architecture

System Architecture:

Client Layer

```
Electron Desktop App
    ├── React UI
    ├── WebRTC Engine
    ├── Socket Client
    └── Firebase SDK
```

Backend Layer

```
Node.js Server
    ├── Express API
    ├── Socket.io Signaling Server
    └── WebRTC Signaling
```

Database Layer

```
Firebase
    ├── Firestore
    ├── Firebase Auth
    └── Firebase Storage
```

Communication Flow

Messaging

```
Client A → Socket.io → Server → Socket.io → Client B
```

Video Call

```
Client A → WebRTC → Client B
Signaling handled via Socket.io
```

---

# 4. Project Folder Structure

```
project-root

desktop-client
    electron
        main.ts
        preload.ts
    src
        components
        pages
        hooks
        context
        services
        utils
        store
        styles
    package.json

backend-server
    src
        controllers
        routes
        services
        sockets
        middleware
        utils
        config
    server.js
    package.json

shared
    types
    constants
```

---

# 5. Core Modules

## Authentication Module

Use **Firebase Authentication**.

Features:

* Google OAuth login
* Session persistence
* Logout
* Secure token verification

User data stored in Firestore.

Firestore collection:

```
users
    userId
        name
        email
        avatar
        createdAt
        lastSeen
        onlineStatus
```

---

# 6. Messaging System

Messaging must support:

* Real-time delivery
* Message history
* Read receipts
* Attachments

Socket Events

Client → Server

```
send_message
typing
message_read
join_room
leave_room
```

Server → Client

```
new_message
user_typing
message_delivered
message_read
```

Firestore Structure

```
chats
    chatId
        type: private | group
        members[]
        createdAt

messages
    messageId
        chatId
        senderId
        content
        type: text | file | image
        timestamp
        readBy[]
```

---

# 7. File Sharing

Files must be uploaded to **Firebase Storage**.

Process

```
Client → Upload File → Firebase Storage
Client → Send file URL via message
Receiver → Download file
```

Supported types:

* images
* videos
* documents
* audio

---

# 8. Video Calling System

Video calls must use **WebRTC peer-to-peer connection**.

Socket.io is used for **signaling only**.

Signaling events

```
call_user
incoming_call
accept_call
reject_call
offer
answer
ice_candidate
end_call
```

Call Flow

```
User A starts call
↓
Server notifies User B
↓
User B accepts
↓
Exchange WebRTC offer/answer
↓
ICE candidates exchange
↓
Peer-to-peer video stream
```

---

# 9. Voice Calls

Voice calls reuse the **same WebRTC pipeline** but disable video tracks.

Media configuration

```
audio: true
video: false
```

---

# 10. Group Chats

Group chat must support:

* multiple users
* group admin
* invite system
* leave group

Firestore structure

```
groups
    groupId
        name
        avatar
        members[]
        admins[]
        createdAt
```

---

# 11. Online Presence System

Presence managed via Socket.io.

Events

```
user_online
user_offline
heartbeat
```

User status updated in Firestore:

```
online
offline
lastSeen
```

---

# 12. Read Receipts

When a message is opened:

```
client → message_read event
server → update Firestore
server → notify sender
```

---

# 13. End-to-End Encryption

Messages must be encrypted on the client before sending.

Encryption standard:

```
AES-256
```

Encryption flow:

```
message → encrypt → send
receive → decrypt → display
```

Encryption keys stored securely per chat.

---

# 14. Desktop Notifications

Use Electron notification API.

Trigger notifications when:

* new message received
* incoming call
* missed call
* file received

Notification format:

```
Title: Sender Name
Body: Message preview
Icon: Sender avatar
```

---

# 15. UI Requirements

Pages required:

```
Login Page
Chat List Page
Chat Window
Group Chat
Settings Page
Call Screen
Incoming Call Modal
User Profile
```

Components

```
MessageBubble
ChatSidebar
UserAvatar
TypingIndicator
CallControls
VideoStream
```

---

# 16. Security Requirements

Implement:

* JWT validation
* Firebase security rules
* Input validation
* Rate limiting
* CORS protection

---

# 17. Performance Optimization

Implement:

* message pagination
* lazy loading
* websocket reconnection
* media stream optimization

---

# 18. Logging & Monitoring

Implement logging for:

```
socket connections
call events
authentication
errors
```

Use structured logging.

---

# 19. Deployment

Backend deploy options:

* Render
* Railway
* Fly.io

Electron build targets:

```
Windows
MacOS
Linux
```

---

# 20. Development Rules for AI Agent

The AI agent must follow these rules:

1. Use **TypeScript everywhere**.
2. Write modular and reusable code.
3. Follow **clean architecture principles**.
4. Add proper error handling.
5. Use environment variables for secrets.
6. Write clear comments.
7. Maintain separation between UI, logic, and networking.
8. Implement reconnection logic for WebSockets.
9. Optimize WebRTC streams.
10. Ensure code is production-ready.

---

# 21. Required Libraries

Frontend

```
react
electron
socket.io-client
firebase
zustand
react-router
simple-peer
crypto-js
```

Backend

```
express
socket.io
cors
dotenv
firebase-admin
uuid
```

---

# 22. Final Goal

Deliver a **fully functional desktop messaging platform** with:

* secure messaging
* real-time communication
* peer-to-peer video calls
* scalable architecture
* production-ready code
* Telegram-like user experience

