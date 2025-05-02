const express = require("express");
const app = express();
const http = require("http").Server(app);
const io = require("socket.io")(http);
const fileUpload = require("express-fileupload");

// Configuration
const PORT = process.env.PORT || 3000;
const MAX_MESSAGES_HISTORY = 50;

// Middleware
app.use(express.static(__dirname + "/public"));
app.use(
  fileUpload({
    limits: { fileSize: 5 * 1024 * 1024 }, // limite 5MB
    safeFileNames: true,
  })
);

// État de l'application
const users = [];
const messages = [];
const typingUsers = [];

// Gestion des connexions Socket.IO
io.on("connection", (socket) => {
  let loggedUser;

  // Login utilisateur
  socket.on("user-login", (user, callback) => {
    // Vérification du nom d'utilisateur
    if (users.some((u) => u.username === user.username)) {
      callback(false);
      return;
    }

    // Ajout de l'utilisateur
    loggedUser = user;
    users.push(loggedUser);

    // Envoi de l'historique des messages
    messages.forEach((message) => {
      socket.emit("chat-message", message);
    });

    // Notification de connexion
    io.emit("user-login", loggedUser);
    io.emit("service-message", {
      text: `${loggedUser.username} a rejoint le chat`,
      type: "login",
    });

    // Envoi de la liste des utilisateurs
    users.forEach((user) => {
      socket.emit("user-login", user);
    });

    callback(true);
  });

  // Messages
  socket.on("chat-message", (message) => {
    if (!loggedUser) return;

    message.username = loggedUser.username;
    message.timestamp = new Date().toISOString();

    // Gestion des types de messages
    switch (message.type) {
      case "private":
        handlePrivateMessage(socket, message);
        break;
      case "image":
        handleImageMessage(socket, message);
        break;
      default:
        handlePublicMessage(socket, message);
    }

    // Limitation de l'historique
    if (messages.length > MAX_MESSAGES_HISTORY) {
      messages.shift();
    }
  });

  // Gestion de la frappe
  socket.on("start-typing", () => {
    if (!loggedUser) return;

    const typingUser = typingUsers.find(
      (u) => u.username === loggedUser.username
    );
    if (!typingUser) {
      typingUsers.push(loggedUser);
      io.emit("update-typing", typingUsers);
    }
  });

  socket.on("stop-typing", () => {
    if (!loggedUser) return;

    const index = typingUsers.findIndex(
      (u) => u.username === loggedUser.username
    );
    if (index !== -1) {
      typingUsers.splice(index, 1);
      io.emit("update-typing", typingUsers);
    }
  });

  // Déconnexion
  socket.on("disconnect", () => {
    if (!loggedUser) return;

    // Retrait de l'utilisateur
    const index = users.findIndex((u) => u.username === loggedUser.username);
    if (index !== -1) {
      users.splice(index, 1);
    }

    // Notification de déconnexion
    io.emit("user-logout", loggedUser);
    io.emit("service-message", {
      text: `${loggedUser.username} a quitté le chat`,
      type: "logout",
    });

    // Retrait des indicateurs de frappe
    const typingIndex = typingUsers.findIndex(
      (u) => u.username === loggedUser.username
    );
    if (typingIndex !== -1) {
      typingUsers.splice(typingIndex, 1);
      io.emit("update-typing", typingUsers);
    }
  });
});

// Fonctions utilitaires
function handlePublicMessage(socket, message) {
  messages.push(message);
  io.emit("chat-message", message);
}

function handlePrivateMessage(socket, message) {
  const recipientName = message.text.split(" ")[0].substring(1);
  const recipient = users.find((u) => u.username === recipientName);

  if (recipient) {
    message.isPrivate = true;
    messages.push(message);
    socket.emit("chat-message", message);
    socket.to(recipient.socketId).emit("chat-message", message);
  }
}

function handleImageMessage(socket, message) {
  messages.push(message);
  io.emit("chat-message", message);
}

// Démarrage du serveur
http.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});

// Gestion des erreurs
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});
