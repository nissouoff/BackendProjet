# ShopLaunch Backend - Node.js + Firebase

Backend API pour ShopLaunch utilisant Node.js avec Firebase.

## Déploiement sur Render

Ce backend est conçu pour être déployé sur [Render](https://render.com).

### Déployer sur Render

1. Forkez ce dépôt vers votre compte GitHub
2. Créez un nouveau Web Service sur Render
3. Connectez votre repository GitHub
4. Configurez le service:
   - **Root Directory:** `backend-nood`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Ajoutez les variables d'environnement requises (voir ci-dessous)

### Variables d'environnement

Variables requises sur Render:

| Variable | Description | Exemple |
|----------|-------------|---------|
| `FIREBASE_API_KEY` | Clé API Firebase | `AIza...` |
| `FIREBASE_PROJECT_ID` | ID du projet Firebase | `your-project-id` |
| `FIREBASE_PRIVATE_KEY` | Clé privée Firebase (avec newlines échappés) | `-----BEGIN...` |
| `FIREBASE_CLIENT_EMAIL` | Email du service Firebase | `firebase-adminsdk@...` |
| `FIREBASE_STORAGE_BUCKET` | Bucket de stockage Firebase | `your-project.appspot.com` |
| `PORT` | Port du serveur (défini automatiquement par Render) | `10000` |

### Obtenir les credentials Firebase

1. Allez sur [Firebase Console](https://console.firebase.google.com)
2. Sélectionnez votre projet
3. Allez dans Paramètres du projet > Comptes de service
4. Cliquez sur "Générer une nouvelle clé privée"
5. Copiez les valeurs dans vos variables d'environnement Render

**Important:** Quand vous copiez `FIREBASE_PRIVATE_KEY`, assurez-vous de remplacer les newlines par `\n`.

## Installation locale

```bash
# Installer les dépendances
cd backend-nood
npm install

# Copier les variables d'environnement
cp .env.example .env

# Modifier .env avec vos credentials Firebase

# Démarrer le serveur de développement
npm run dev

# Ou démarrer le serveur de production
npm start
```

## Endpoints API

### Auth
- `POST /api/auth/register` - Inscription
- `POST /api/auth/login` - Connexion
- `GET /api/auth/user` - Utilisateur connecté
- `DELETE /api/auth/user/delete` - Supprimer le compte

### Landings
- `GET /api/landings` - Liste des landing pages
- `POST /api/landings` - Créer une landing
- `GET /api/landings/:id` - Détails d'une landing
- `PUT /api/landings/:id` - Modifier une landing
- `DELETE /api/landings/:id` - Supprimer une landing
- `POST /api/landings/:id/publish` - Publier
- `POST /api/landings/:id/unpublish` - Dépublier

### Shop Public
- `GET /api/shop/:slug` - Voir une boutique
- `POST /api/shop/:slug/view` - Tracker une vue
- `POST /api/shop/:slug/review` - Ajouter un avis

### Orders
- `GET /api/orders` - Liste des commandes
- `POST /api/shop/:slug/order` - Passer une commande
- `PUT /api/orders/:id/status` - Modifier statut
- `GET /api/wilayas` - Liste des wilayas d'Algérie

### Upload
- `POST /api/upload` - Uploader une image

## Règles Realtime Database (Firebase)

```json
{
  "rules": {
    "users": {
      "$uid": {
        ".read": "$uid === auth.uid",
        ".write": "$uid === auth.uid"
      }
    },
    "landings": {
      "$id": {
        ".read": "data.child('isPublished').val() === true || auth !== null",
        ".write": "auth !== null"
      }
    },
    "orders": {
      "$id": {
        ".read": "auth !== null",
        ".write": "auth !== null"
      }
    },
    "reviews": {
      ".read": true,
      ".write": true
    }
  }
}
```

## Tech Stack

- Node.js
- Express.js
- Firebase Admin SDK
- Firebase Realtime Database

## Licence

ISC
