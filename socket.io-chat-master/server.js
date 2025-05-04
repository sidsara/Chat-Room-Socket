// Importation des modules nécessaires
const express = require("express");
const app = express();
const http = require("http").Server(app); // Création du serveur HTTP
const io = require("socket.io")(http); // Intégration de Socket.IO au serveur HTTP
const fileUpload = require("express-fileupload"); // Middleware pour gérer les fichiers uploadés

// Configuration des constantes
const PORT = process.env.PORT || 3000; // Port du serveur
const MAX_MESSAGES_HISTORY = 50; // Nombre maximum de messages conservés en mémoire

// Middleware pour servir les fichiers statiques (HTML, CSS, JS) depuis le dossier "public"
app.use(express.static(__dirname + "/public"));

// État de l'application en mémoire
const users = []; // Liste des utilisateurs connectés
const messages = []; // Historique des messages
const typingUsers = []; // Liste des utilisateurs qui sont en train d’écrire

//Quand un client se connecte, cette callback est exécutée.
io.on("connection", (socket) => {
  let loggedUser; // Stocke l'utilisateur connecté à ce socket

  // Événement de connexion d'un utilisateur
  socket.on("user-login", (user, callback) => {
    // Vérifie si le nom d'utilisateur est déjà pris
    if (users.some((u) => u.username === user.username)) {
      callback(false); // Refuse la connexion
      return;
    }

    // Accepte l'utilisateur et l’ajoute à la liste
    loggedUser = user;
    users.push(loggedUser);

    // Envoie l’historique des messages à l’utilisateur connecté
    messages.forEach((message) => {
      socket.emit("chat-message", message);
    });

    // Notifie tous les autres utilisateurs de la nouvelle connexion
    io.emit("user-login", loggedUser);
    io.emit("service-message", {
      text: `${loggedUser.username} a rejoint le chat`,
      type: "login",
    });

    // Envoie la liste des utilisateurs déjà connectés au nouvel utilisateur
    users.forEach((user) => {
      socket.emit("user-login", user);
    });

    callback(true); // Connexion acceptée
  });

  // Événement lorsqu'un utilisateur envoie un message
  socket.on("chat-message", (message) => {
    if (!loggedUser) return;

    // Ajoute des métadonnées au message
    message.username = loggedUser.username;
    message.timestamp = new Date().toISOString();

    handlePublicMessage(socket, message);

    // Supprime les anciens messages si la limite est dépassée
    if (messages.length > MAX_MESSAGES_HISTORY) {
      messages.shift();
    }
  });

  // Événement déclenché lorsque l'utilisateur commence à écrire
  socket.on("start-typing", () => {
    if (!loggedUser) return;

    const typingUser = typingUsers.find(
      (u) => u.username === loggedUser.username
    );

    if (!typingUser) {
      typingUsers.push(loggedUser);
      io.emit("update-typing", typingUsers); // Notifie les autres
    }
  });

  // Événement déclenché lorsque l'utilisateur arrête d’écrire
  socket.on("stop-typing", () => {
    if (!loggedUser) return;

    const index = typingUsers.findIndex(
      (u) => u.username === loggedUser.username
    );

    if (index !== -1) {
      typingUsers.splice(index, 1);
      io.emit("update-typing", typingUsers); // Met à jour la liste
    }
  });

  // Événement déclenché lors de la déconnexion d’un utilisateur
  socket.on("disconnect", () => {
    if (!loggedUser) return;

    // Supprime l'utilisateur de la liste
    const index = users.findIndex((u) => u.username === loggedUser.username);
    if (index !== -1) {
      users.splice(index, 1);
    }

    // Notifie les autres utilisateurs
    io.emit("user-logout", loggedUser);
    io.emit("service-message", {
      text: `${loggedUser.username} a quitté le chat`,
      type: "logout",
    });

    // Supprime l’utilisateur de la liste des "typing"
    const typingIndex = typingUsers.findIndex(
      (u) => u.username === loggedUser.username
    );
    if (typingIndex !== -1) {
      typingUsers.splice(typingIndex, 1);
      io.emit("update-typing", typingUsers);
    }
  });
});

// Fonction pour gérer les messages publics
function handlePublicMessage(socket, message) {
  messages.push(message);
  io.emit("chat-message", message);
}

// Démarrage du serveur HTTP
http.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});

// Gestion des erreurs non interceptées
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});
